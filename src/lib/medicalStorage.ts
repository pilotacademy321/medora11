import { storage, auth } from './firebase';
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
  UploadTaskSnapshot,
} from 'firebase/storage';
import { validateReceiptFileMeta } from '../utils/subscriptionPaymentEngine';
import {
  UploadProgressInfo,
  UploadStatus,
  UploadValidationPolicy,
  RECEIPT_UPLOAD_POLICY,
  MEDICAL_DOC_UPLOAD_POLICY,
  CHAT_UPLOAD_POLICY,
  RADIOLOGY_UPLOAD_POLICY,
  validateUploadFile,
  inferMimeTypeFromFileName,
  formatBytesCompact,
  createFileFingerprint,
  globalUploadGuard,
  maybeOptimizeImageForUpload,
  executeResumableUploadWithRetry,
} from '../utils/uploadEngine';

export type { UploadProgressInfo, UploadStatus, UploadValidationPolicy };
export {
  formatBytesCompact,
  RECEIPT_UPLOAD_POLICY,
  MEDICAL_DOC_UPLOAD_POLICY,
  CHAT_UPLOAD_POLICY,
  RADIOLOGY_UPLOAD_POLICY,
  validateUploadFile,
};

export interface StoredMedicalFile {
  id: string;
  name: string;
  size: number;
  sizeFormatted: string;
  modality: string;
  storagePath: string;
  downloadUrl: string;
  mimeType: string;
  uploadedAt: string;
  uploadedBy: string;
  patientName?: string;
  bookingId?: string;
  isDicom: boolean;
}

export interface UploadOptions {
  centerId: string;
  modality: string;
  patientName?: string;
  bookingId?: string;
  uploadedByUid: string;
  onProgress?: (percent: number, snapshot: UploadTaskSnapshot) => void;
  onDetailedProgress?: (info: UploadProgressInfo, snapshot?: UploadTaskSnapshot) => void;
  onCancelHandle?: (cancel: () => void) => void;
}

export type MedicalDocumentCategory =
  | 'patient_records'
  | 'lab_results'
  | 'prescriptions'
  | 'doctor_attachments'
  | 'facility_logos';

export interface StoredMedicalDocumentResult {
  id: string;
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  sizeFormatted: string;
  category: MedicalDocumentCategory;
  uploadedAt: string;
}

// 100 MB standard limit for multi-slice DICOM & radiological studies
export const MAX_MEDICAL_FILE_SIZE_BYTES = 100 * 1024 * 1024;

// Allowed medical file extensions (including Siemens .ima and compressed PACS .zip)
export const ALLOWED_EXTENSIONS = [
  '.dcm',
  '.dicom',
  '.ima',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.heic',
  '.heif',
  '.pdf',
  '.zip',
];

export function formatMedicalFileSize(bytes: number): string {
  return formatBytesCompact(bytes);
}

export function isDicomFile(fileName: string, mimeType?: string): boolean {
  const lowerName = (fileName || '').toLowerCase();
  const lowerMime = (mimeType || '').toLowerCase();
  return (
    lowerName.endsWith('.dcm') ||
    lowerName.endsWith('.dicom') ||
    lowerName.endsWith('.ima') ||
    lowerMime === 'application/dicom' ||
    lowerMime === 'image/dicom'
  );
}

export async function verifyDicomMagicBytes(file: File): Promise<boolean> {
  if (file.size < 132) return false;
  try {
    const slice = file.slice(128, 132);
    const buffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    return bytes[0] === 0x44 && bytes[1] === 0x49 && bytes[2] === 0x43 && bytes[3] === 0x4d;
  } catch {
    return false;
  }
}

export function validateRadiologyFile(file: File): { isValid: boolean; error?: string; isDicom: boolean } {
  if (!file) {
    return { isValid: false, error: 'الملف غير صالح أو غير موجود.', isDicom: false };
  }

  const check = validateUploadFile(file, RADIOLOGY_UPLOAD_POLICY);
  if (!check.valid) {
    return {
      isValid: false,
      isDicom: false,
      error: check.errorAr || check.errorEn,
    };
  }

  return { isValid: true, isDicom: isDicomFile(file.name, check.inferredMime) };
}

export function getDicomViewerLaunchUrl(downloadUrl: string): string {
  return downloadUrl || '';
}

function assertSignedInUid(expectedUid?: string): string {
  const currentUid = auth.currentUser?.uid;
  if (!currentUid) {
    throw new Error('يجب تسجيل الدخول أولاً قبل رفع الملفات إلى التخزين السحابي.');
  }
  if (expectedUid && expectedUid !== currentUid) {
    // Prefer the verified Firebase Auth UID so Storage rules match request.auth.uid
    return currentUid;
  }
  return currentUid;
}

/**
 * Uploads a DICOM scan or medical image directly to Firebase Cloud Storage
 * with real progress telemetry, stall recovery, and deduplication.
 */
export async function uploadMedicalScanFile(
  file: File,
  options: UploadOptions
): Promise<StoredMedicalFile> {
  const effectiveUid = assertSignedInUid(options.uploadedByUid);
  const validation = validateRadiologyFile(file);
  if (!validation.isValid) {
    throw new Error(validation.error);
  }

  const isDicom = validation.isDicom;
  const inferredMime = inferMimeTypeFromFileName(file.name, file.type);
  const timestamp = Date.now();
  const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeBookingId = options.bookingId ? options.bookingId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'general';
  const safeCenterId = (options.centerId || effectiveUid).replace(/[^a-zA-Z0-9_-]/g, '_');

  const storagePath = `radiology_scans/${safeCenterId}/${safeBookingId}/${timestamp}_${sanitizedName}`;
  const storageRef = ref(storage, storagePath);

  const customMetadata = {
    customMetadata: {
      centerId: safeCenterId,
      modality: options.modality,
      patientName: options.patientName || '',
      bookingId: options.bookingId || '',
      uploadedBy: effectiveUid,
      originalName: file.name,
      uploadedAt: new Date().toISOString(),
      isDicom: String(isDicom),
    },
    contentType: isDicom ? 'application/dicom' : inferredMime,
  };

  const fingerprint = createFileFingerprint(file, `radiology:${safeCenterId}:${safeBookingId}`);

  return globalUploadGuard.run(fingerprint, async () => {
    const { downloadUrl } = await executeResumableUploadWithRetry<UploadTaskSnapshot>({
      totalBytesFallback: file.size,
      maxRetries: 2,
      stallTimeoutMs: 30000,
      onCancelHandle: options.onCancelHandle,
      createTask: () => uploadBytesResumable(storageRef, file, customMetadata),
      getDownloadUrl: (snap) => getDownloadURL(snap.ref),
      onProgress: (info, snapshot) => {
        options.onDetailedProgress?.(info, snapshot);
        if (options.onProgress && snapshot) {
          options.onProgress(info.percent, snapshot);
        }
      },
    });

    return {
      id: `scan_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
      name: file.name,
      size: file.size,
      sizeFormatted: formatMedicalFileSize(file.size),
      modality: options.modality,
      storagePath,
      downloadUrl,
      mimeType: customMetadata.contentType,
      uploadedAt: new Date().toISOString(),
      uploadedBy: effectiveUid,
      patientName: options.patientName,
      bookingId: options.bookingId,
      isDicom,
    };
  });
}

/**
 * Upload an attachment for private doctor-patient or inter-portal messaging.
 * Max 25MB; supports images, PDF, DICOM, audio.
 */
export async function uploadChatAttachmentFile(
  file: File,
  conversationId: string,
  uploadedByUid: string,
  options?: {
    onProgress?: (info: UploadProgressInfo) => void;
    onCancelHandle?: (cancel: () => void) => void;
  }
): Promise<{
  url: string;
  name: string;
  sizeFormatted: string;
  sizeBytes: number;
  mimeType: string;
  storagePath: string;
}> {
  const effectiveUid = assertSignedInUid(uploadedByUid);
  const check = validateUploadFile(file, CHAT_UPLOAD_POLICY);
  if (!check.valid) {
    throw new Error(check.errorAr || check.errorEn || 'الملف المرفق غير صالح.');
  }

  // Only optimize very large camera photos (>2.5MB); preserve PDFs, DICOM, audio, and crisp documents untouched
  const preparedFile =
    check.inferredMime.startsWith('image/') && check.inferredMime !== 'image/dicom'
      ? await maybeOptimizeImageForUpload(file, { thresholdBytes: 2.5 * 1024 * 1024 })
      : file;

  const finalMime = inferMimeTypeFromFileName(preparedFile.name, preparedFile.type);
  const timestamp = Date.now();
  const sanitizedName = preparedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeConvId = conversationId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const storagePath = `chat_attachments/${safeConvId}/${timestamp}_${sanitizedName}`;
  const storageRef = ref(storage, storagePath);

  const customMetadata = {
    customMetadata: {
      conversationId: safeConvId,
      uploadedBy: effectiveUid,
      originalName: preparedFile.name,
      uploadedAt: new Date().toISOString(),
    },
    contentType: finalMime,
  };

  const fingerprint = createFileFingerprint(file, `chat:${safeConvId}`);

  return globalUploadGuard.run(fingerprint, async () => {
    const { downloadUrl } = await executeResumableUploadWithRetry<UploadTaskSnapshot>({
      totalBytesFallback: preparedFile.size,
      maxRetries: 2,
      stallTimeoutMs: 25000,
      onCancelHandle: options?.onCancelHandle,
      createTask: () => uploadBytesResumable(storageRef, preparedFile, customMetadata),
      getDownloadUrl: (snap) => getDownloadURL(snap.ref),
      onProgress: (info) => options?.onProgress?.(info),
    });

    return {
      url: downloadUrl,
      name: file.name,
      sizeFormatted: formatMedicalFileSize(preparedFile.size),
      sizeBytes: preparedFile.size,
      mimeType: finalMime,
      storagePath,
    };
  });
}

/**
 * Upload a subscription manual transfer receipt (image or PDF) to Firebase Cloud Storage.
 * Strictly validates PDF/JPG/JPEG/PNG/WEBP/HEIC MIME types and max 5 MB size.
 * Displays real bytesTransferred progress and retries transient interruptions without losing form data.
 */
export async function uploadPaymentReceiptFile(
  file: File,
  userId: string,
  requestId: string,
  onProgress?: (percent: number, info?: UploadProgressInfo) => void,
  options?: {
    onCancelHandle?: (cancel: () => void) => void;
    optimizeLargePhoto?: boolean;
  }
): Promise<{
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}> {
  const effectiveUid = assertSignedInUid(userId);
  const validation = validateReceiptFileMeta({
    name: file?.name,
    type: file?.type,
    size: file?.size,
  });
  if (!validation.valid) {
    throw new Error(validation.errorAr || validation.errorEn || 'ملف الإيصال غير صالح.');
  }

  // Conditionally optimize only oversized camera photos (>1.8MB) so receipt text stays sharp; never alter PDFs
  const preparedFile =
    options?.optimizeLargePhoto !== false
      ? await maybeOptimizeImageForUpload(file, {
          thresholdBytes: 1.8 * 1024 * 1024,
          maxDimension: 2048,
          quality: 0.88,
        })
      : file;

  const inferredMime = inferMimeTypeFromFileName(preparedFile.name, preparedFile.type);
  const timestamp = Date.now();
  const sanitizedName = preparedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeUserId = effectiveUid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeRequestId = requestId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const storagePath = `payment_receipts/${safeUserId}/${safeRequestId}/${timestamp}_${sanitizedName}`;
  const storageRef = ref(storage, storagePath);

  const fingerprint = createFileFingerprint(file, `receipt:${safeUserId}:${safeRequestId}`);

  return globalUploadGuard.run(fingerprint, async () => {
    const { downloadUrl } = await executeResumableUploadWithRetry<UploadTaskSnapshot>({
      totalBytesFallback: preparedFile.size,
      maxRetries: 2,
      stallTimeoutMs: 25000,
      onCancelHandle: options?.onCancelHandle,
      createTask: () =>
        uploadBytesResumable(storageRef, preparedFile, {
          contentType: inferredMime,
          customMetadata: {
            userId: safeUserId,
            paymentRequestId: safeRequestId,
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
          },
        }),
      getDownloadUrl: (snap) => getDownloadURL(snap.ref),
      onProgress: (info) => {
        onProgress?.(info.percent, info);
      },
    });

    return {
      downloadUrl,
      storagePath,
      fileName: file.name,
      mimeType: inferredMime,
      sizeBytes: preparedFile.size,
    };
  });
}

/**
 * Unified upload helper for patient medical records, laboratory result PDFs/images,
 * doctor attachments, prescriptions, and clinic/pharmacy/wholesaler logos.
 */
export async function uploadMedicalDocumentFile(
  file: File,
  options: {
    userId: string;
    category: MedicalDocumentCategory;
    recordId?: string;
    onProgress?: (info: UploadProgressInfo) => void;
    onCancelHandle?: (cancel: () => void) => void;
  }
): Promise<StoredMedicalDocumentResult> {
  const effectiveUid = assertSignedInUid(options.userId);
  const policy =
    options.category === 'facility_logos'
      ? {
          ...RECEIPT_UPLOAD_POLICY,
          allowPdf: false,
          allowedMimeTypes: new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']),
          allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'],
          labelAr: 'شعار أو صورة (JPG, PNG, WEBP)',
          labelEn: 'Logo or photo (JPG, PNG, WEBP)',
        }
      : MEDICAL_DOC_UPLOAD_POLICY;

  const check = validateUploadFile(file, policy);
  if (!check.valid) {
    throw new Error(check.errorAr || check.errorEn || 'الملف غير صالح.');
  }

  // Keep medical PDFs and normal-size reports untouched; only gently resize large camera uploads
  const preparedFile =
    options.category === 'facility_logos'
      ? await maybeOptimizeImageForUpload(file, { thresholdBytes: 250 * 1024, maxDimension: 1024, quality: 0.85 })
      : await maybeOptimizeImageForUpload(file, { thresholdBytes: 2.5 * 1024 * 1024, maxDimension: 2200, quality: 0.88 });

  const inferredMime = inferMimeTypeFromFileName(preparedFile.name, preparedFile.type);
  const timestamp = Date.now();
  const sanitizedName = preparedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeUserId = effectiveUid.replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeCategory = options.category.replace(/[^a-zA-Z0-9_-]/g, '_');

  const storagePath =
    options.category === 'facility_logos'
      ? `public_assets/logo_${safeUserId}_${timestamp}_${sanitizedName}`
      : `medical_files/${safeUserId}/${safeCategory}/${timestamp}_${sanitizedName}`;

  const storageRef = ref(storage, storagePath);
  const fingerprint = createFileFingerprint(file, `${safeCategory}:${safeUserId}:${options.recordId || ''}`);

  return globalUploadGuard.run(fingerprint, async () => {
    const { downloadUrl } = await executeResumableUploadWithRetry<UploadTaskSnapshot>({
      totalBytesFallback: preparedFile.size,
      maxRetries: 2,
      stallTimeoutMs: 25000,
      onCancelHandle: options.onCancelHandle,
      createTask: () =>
        uploadBytesResumable(storageRef, preparedFile, {
          contentType: inferredMime,
          customMetadata: {
            userId: safeUserId,
            category: safeCategory,
            recordId: options.recordId || '',
            originalName: file.name,
            uploadedAt: new Date().toISOString(),
          },
        }),
      getDownloadUrl: (snap) => getDownloadURL(snap.ref),
      onProgress: (info) => options.onProgress?.(info),
    });

    return {
      id: `doc_${timestamp}_${Math.random().toString(36).substring(2, 7)}`,
      downloadUrl,
      storagePath,
      fileName: file.name,
      mimeType: inferredMime,
      sizeBytes: preparedFile.size,
      sizeFormatted: formatMedicalFileSize(preparedFile.size),
      category: options.category,
      uploadedAt: new Date().toISOString(),
    };
  });
}
