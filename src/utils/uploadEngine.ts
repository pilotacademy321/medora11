/**
 * Unified, Resilient Upload Engine for MEDORA Platform
 * - Immediate resumable uploads via Firebase Storage
 * - Real bytesTransferred/totalBytes progress (0-100%, never faked)
 * - Real transfer speed & ETA telemetry
 * - Stall watchdog & bounded retry with exponential backoff
 * - Duplicate upload prevention & retry state preservation
 * - Smart optional image optimization (never compresses PDFs or DICOM files)
 */

export type UploadStatus = 'idle' | 'preparing' | 'uploading' | 'completed' | 'failed' | 'canceled';

export interface UploadProgressInfo {
  status: UploadStatus;
  percent: number;
  bytesTransferred: number;
  totalBytes: number;
  bytesPerSecond: number;
  speedFormatted: string;
  etaSeconds: number | null;
  elapsedMs: number;
  attempt: number;
}

export interface UploadValidationPolicy {
  maxSizeBytes: number;
  allowedMimeTypes: ReadonlySet<string>;
  allowedExtensions: readonly string[];
  allowPdf?: boolean;
  allowDicom?: boolean;
  allowZip?: boolean;
  allowAudio?: boolean;
  labelAr?: string;
  labelEn?: string;
}

export const DEFAULT_RECEIPT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
export const DEFAULT_MEDICAL_DOC_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const DEFAULT_CHAT_ATTACHMENT_MAX_BYTES = 25 * 1024 * 1024; // 25 MB
export const DEFAULT_RADIOLOGY_MAX_BYTES = 100 * 1024 * 1024; // 100 MB
export const DEFAULT_PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const RECEIPT_ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);
export const RECEIPT_ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.pdf'] as const;

export const MEDICAL_DOC_ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/dicom',
  'image/dicom',
]);
export const MEDICAL_DOC_ALLOWED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.heic',
  '.heif',
  '.pdf',
  '.dcm',
  '.dicom',
  '.ima',
] as const;

export const RADIOLOGY_ALLOWED_MIMES = new Set([
  ...MEDICAL_DOC_ALLOWED_MIMES,
  'application/zip',
  'application/x-zip-compressed',
  'application/octet-stream',
]);
export const RADIOLOGY_ALLOWED_EXTENSIONS = [
  ...MEDICAL_DOC_ALLOWED_EXTENSIONS,
  '.zip',
] as const;

export const CHAT_ALLOWED_MIMES = new Set([
  ...MEDICAL_DOC_ALLOWED_MIMES,
  'audio/mpeg',
  'audio/mp4',
  'audio/ogg',
  'audio/wav',
  'audio/webm',
]);
export const CHAT_ALLOWED_EXTENSIONS = [
  ...MEDICAL_DOC_ALLOWED_EXTENSIONS,
  '.mp3',
  '.m4a',
  '.ogg',
  '.wav',
  '.webm',
] as const;

export const RECEIPT_UPLOAD_POLICY: UploadValidationPolicy = {
  maxSizeBytes: DEFAULT_RECEIPT_MAX_BYTES,
  allowedMimeTypes: RECEIPT_ALLOWED_MIMES,
  allowedExtensions: RECEIPT_ALLOWED_EXTENSIONS,
  allowPdf: true,
  labelAr: 'إيصال الدفع (PDF, JPG, JPEG, PNG, WEBP, HEIC)',
  labelEn: 'Payment receipt (PDF, JPG, JPEG, PNG, WEBP, HEIC)',
};

export const MEDICAL_DOC_UPLOAD_POLICY: UploadValidationPolicy = {
  maxSizeBytes: DEFAULT_MEDICAL_DOC_MAX_BYTES,
  allowedMimeTypes: MEDICAL_DOC_ALLOWED_MIMES,
  allowedExtensions: MEDICAL_DOC_ALLOWED_EXTENSIONS,
  allowPdf: true,
  allowDicom: true,
  labelAr: 'المستند الطبي (PDF, JPG, JPEG, PNG, WEBP, DICOM)',
  labelEn: 'Medical document (PDF, JPG, JPEG, PNG, WEBP, DICOM)',
};

export const CHAT_UPLOAD_POLICY: UploadValidationPolicy = {
  maxSizeBytes: DEFAULT_CHAT_ATTACHMENT_MAX_BYTES,
  allowedMimeTypes: CHAT_ALLOWED_MIMES,
  allowedExtensions: CHAT_ALLOWED_EXTENSIONS,
  allowPdf: true,
  allowDicom: true,
  allowAudio: true,
  labelAr: 'مرفق المحادثة (PDF, JPG, PNG, DICOM, Audio)',
  labelEn: 'Chat attachment (PDF, JPG, PNG, DICOM, Audio)',
};

export const RADIOLOGY_UPLOAD_POLICY: UploadValidationPolicy = {
  maxSizeBytes: DEFAULT_RADIOLOGY_MAX_BYTES,
  allowedMimeTypes: RADIOLOGY_ALLOWED_MIMES,
  allowedExtensions: RADIOLOGY_ALLOWED_EXTENSIONS,
  allowPdf: true,
  allowDicom: true,
  allowZip: true,
  labelAr: 'ملفات الأشعة (DICOM, PDF, JPG, PNG, ZIP)',
  labelEn: 'Radiology study (DICOM, PDF, JPG, PNG, ZIP)',
};

const DANGEROUS_EXTENSIONS = ['.svg', '.html', '.htm', '.js', '.mjs', '.exe', '.bat', '.cmd', '.sh', '.php'];

export function formatBytesCompact(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  const val = bytes / Math.pow(k, idx);
  return `${val >= 100 || idx === 0 ? Math.round(val) : val.toFixed(1)} ${units[idx]}`;
}

export function formatTransferSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 KB/s';
  return `${formatBytesCompact(bytesPerSecond)}/s`;
}

export interface FileMetaLike {
  name?: string;
  type?: string;
  size?: number;
  lastModified?: number;
}

export function inferMimeTypeFromFileName(fileName: string, explicitMime?: string): string {
  const mime = String(explicitMime || '').trim().toLowerCase();
  if (mime && mime !== 'application/octet-stream') {
    if (mime === 'image/jpg') return 'image/jpeg';
    return mime;
  }
  const lower = String(fileName || '').trim().toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.heic')) return 'image/heic';
  if (lower.endsWith('.heif')) return 'image/heif';
  if (lower.endsWith('.dcm') || lower.endsWith('.dicom') || lower.endsWith('.ima')) return 'application/dicom';
  if (lower.endsWith('.zip')) return 'application/zip';
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.m4a')) return 'audio/mp4';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return mime || 'application/octet-stream';
}

export function validateUploadFile(
  file: FileMetaLike | null | undefined,
  policy: UploadValidationPolicy
): { valid: boolean; errorAr?: string; errorEn?: string; inferredMime: string } {
  if (!file) {
    return {
      valid: false,
      errorAr: 'لم يتم اختيار أي ملف للرفع.',
      errorEn: 'No file selected.',
      inferredMime: '',
    };
  }

  const fileName = String(file.name || '').trim();
  const lowerName = fileName.toLowerCase();
  const rawMime = String(file.type || '').trim().toLowerCase();
  const inferredMime = inferMimeTypeFromFileName(fileName, rawMime);

  const size = Number(file.size ?? 0);
  if (!Number.isFinite(size) || size <= 0) {
    return {
      valid: false,
      errorAr: 'الملف المحدد فارغ (0 بايت) أو غير صالح.',
      errorEn: 'The selected file is empty (0 bytes) or corrupted.',
      inferredMime,
    };
  }

  if (size > policy.maxSizeBytes) {
    const maxLabel = formatBytesCompact(policy.maxSizeBytes);
    const curLabel = formatBytesCompact(size);
    return {
      valid: false,
      errorAr: `حجم الملف (${curLabel}) يتجاوز الحد الأقصى المسموح به (${maxLabel}).`,
      errorEn: `File size (${curLabel}) exceeds maximum limit (${maxLabel}).`,
      inferredMime,
    };
  }

  if (
    rawMime === 'image/svg+xml' ||
    DANGEROUS_EXTENSIONS.some((ext) => lowerName.endsWith(ext))
  ) {
    return {
      valid: false,
      errorAr: 'صيغة هذا الملف غير مدعومة لأسباب أمنية. يرجى اختيار ملف PDF أو صورة (JPG, JPEG, PNG).',
      errorEn: 'Unsupported or unsafe file format. Please choose PDF, JPG, JPEG, or PNG.',
      inferredMime,
    };
  }

  const hasAllowedExt = policy.allowedExtensions.some((ext) => lowerName.endsWith(ext));
  const hasAllowedMime =
    policy.allowedMimeTypes.has(inferredMime) ||
    (rawMime ? policy.allowedMimeTypes.has(rawMime) : false);

  if (!hasAllowedExt && !hasAllowedMime) {
    return {
      valid: false,
      errorAr: `صيغة الملف غير مدعومة. الصيغ المقبولة: ${policy.labelAr || policy.allowedExtensions.join(', ')}.`,
      errorEn: `Unsupported file format. Accepted: ${policy.labelEn || policy.allowedExtensions.join(', ')}.`,
      inferredMime,
    };
  }

  // If MIME explicitly says something completely non-matching (e.g., application/pdf when allowPdf is false)
  if (!policy.allowPdf && inferredMime === 'application/pdf') {
    return {
      valid: false,
      errorAr: 'ملفات PDF غير مسموحة في هذا الحقل. يرجى رفع صورة صالحة.',
      errorEn: 'PDF files are not permitted for this field. Please upload an image.',
      inferredMime,
    };
  }

  return { valid: true, inferredMime };
}

/**
 * Pure telemetry computation: strictly based on bytesTransferred and totalBytes.
 * Never fabricates non-zero progress when 0 bytes are transferred.
 */
export function computeTransferTelemetry(params: {
  bytesTransferred: number;
  totalBytes: number;
  startedAtMs: number;
  nowMs?: number;
  attempt?: number;
  status?: UploadStatus;
}): UploadProgressInfo {
  const bytesTransferred = Math.max(0, Number(params.bytesTransferred || 0));
  const totalBytes = Math.max(0, Number(params.totalBytes || 0));
  const nowMs = params.nowMs ?? Date.now();
  const elapsedMs = Math.max(0, nowMs - params.startedAtMs);

  const percent =
    totalBytes > 0
      ? Math.min(100, Math.max(0, Math.round((bytesTransferred / totalBytes) * 100)))
      : 0;

  const elapsedSec = elapsedMs / 1000;
  const bytesPerSecond = elapsedSec > 0.15 && bytesTransferred > 0 ? bytesTransferred / elapsedSec : 0;
  const remainingBytes = Math.max(0, totalBytes - bytesTransferred);
  const etaSeconds =
    bytesPerSecond > 0 && remainingBytes > 0
      ? Math.ceil(remainingBytes / bytesPerSecond)
      : percent === 100
      ? 0
      : null;

  return {
    status: params.status || (percent >= 100 ? 'completed' : 'uploading'),
    percent,
    bytesTransferred,
    totalBytes,
    bytesPerSecond,
    speedFormatted: formatTransferSpeed(bytesPerSecond),
    etaSeconds,
    elapsedMs,
    attempt: params.attempt ?? 1,
  };
}

export function createFileFingerprint(file: FileMetaLike, scopeKey = ''): string {
  return [
    scopeKey.trim(),
    String(file.name || '').trim(),
    String(file.size ?? 0),
    String(file.lastModified ?? 0),
    String(file.type || '').trim(),
  ].join('::');
}

/**
 * Prevents duplicate concurrent uploads of the exact same file in the same scope.
 */
export class UploadDeduplicationGuard {
  private readonly inFlight = new Map<string, Promise<unknown>>();

  has(key: string): boolean {
    return this.inFlight.has(key);
  }

  run<T>(key: string, factory: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }
    const promise = factory().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.inFlight.clear();
  }
}

export const globalUploadGuard = new UploadDeduplicationGuard();

/**
 * Determines whether an image should be lightly optimized before upload.
 * NEVER compresses PDFs, DICOM studies, ZIP archives, or already reasonably sized files.
 */
export function shouldOptimizeImageForUpload(
  file: FileMetaLike,
  thresholdBytes = 1.5 * 1024 * 1024
): boolean {
  const mime = inferMimeTypeFromFileName(file.name || '', file.type);
  const size = Number(file.size || 0);
  if (size <= thresholdBytes) return false;
  return mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp';
}

/**
 * Optional client-side image optimization for oversized photos (>1.5MB),
 * keeping high resolution (up to 2048px) so receipt text / medical details remain sharp.
 * Strictly returns the original file untouched for PDFs, DICOMs, small files, or non-browser environments.
 */
export async function maybeOptimizeImageForUpload(
  file: File,
  options?: {
    enabled?: boolean;
    thresholdBytes?: number;
    maxDimension?: number;
    quality?: number;
  }
): Promise<File> {
  if (options?.enabled === false) return file;
  if (typeof document === 'undefined' || typeof Image === 'undefined') return file;

  const threshold = options?.thresholdBytes ?? 1.5 * 1024 * 1024;
  if (!shouldOptimizeImageForUpload(file, threshold)) {
    return file;
  }

  const maxDimension = options?.maxDimension ?? 2048;
  const quality = options?.quality ?? 0.86;

  return new Promise<File>((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        let { width, height } = img;
        if (width <= maxDimension && height <= maxDimension && file.size <= 2 * 1024 * 1024) {
          resolve(file);
          return;
        }
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const targetMime = file.type === 'image/png' ? 'image/jpeg' : file.type || 'image/jpeg';
        canvas.toBlob(
          (blob) => {
            if (!blob || blob.size >= file.size * 0.92) {
              resolve(file);
              return;
            }
            const nextName =
              targetMime === 'image/jpeg' && file.name.toLowerCase().endsWith('.png')
                ? file.name.replace(/\.png$/i, '.jpg')
                : file.name;
            resolve(
              new File([blob], nextName, {
                type: targetMime,
                lastModified: file.lastModified,
              })
            );
          },
          targetMime,
          quality
        );
      } catch {
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

export interface ClassifiedUploadError {
  code: string;
  retryable: boolean;
  messageAr: string;
  messageEn: string;
}

export function classifyStorageUploadError(error: unknown, isOnline = true): ClassifiedUploadError {
  const errObj = error as { code?: string; message?: string; serverResponse?: string } | null;
  const code = String(errObj?.code || '').toLowerCase();
  const msg = String(errObj?.message || error || '').toLowerCase();

  if (!isOnline || msg.includes('offline') || code.includes('network')) {
    return {
      code: 'offline',
      retryable: true,
      messageAr: 'تعذر الرفع لعدم توفر اتصال بالإنترنت. يرجى التحقق من الشبكة والمحاولة مجدداً.',
      messageEn: 'Upload failed because the device is offline. Check your connection and retry.',
    };
  }
  if (code === 'storage/canceled' || msg.includes('storage/canceled')) {
    return {
      code: 'storage/canceled',
      retryable: true,
      messageAr: 'تم إلغاء رفع الملف.',
      messageEn: 'File upload was canceled.',
    };
  }
  if (code === 'upload/stalled' || msg.includes('stalled') || msg.includes('timeout')) {
    return {
      code: 'upload/stalled',
      retryable: true,
      messageAr: 'توقف الاتصال أثناء الرفع عند 0% أو استغرق وقتاً طويلاً. يرجى التحقق من الشبكة والضغط على إعادة المحاولة.',
      messageEn: 'Upload stalled or timed out. Please check your network and retry.',
    };
  }
  if (code === 'storage/unauthorized' || code === 'storage/unauthenticated') {
    return {
      code,
      retryable: false,
      messageAr: 'تعذر الرفع: لا تتوفر صلاحيات الكتابة في التخزين السحابي (Storage Rules) أو انتهت جلسة الدخول.',
      messageEn: 'Upload denied: missing Firebase Storage permissions or expired authentication session.',
    };
  }
  if (code === 'storage/bucket-not-found' || code === 'storage/project-not-found') {
    return {
      code,
      retryable: false,
      messageAr: 'تعذر الرفع: حاوية التخزين السحابي غير مهيأة أو غير موجودة في مشروع Firebase.',
      messageEn: 'Storage bucket not found or misconfigured in Firebase project.',
    };
  }
  if (code === 'storage/quota-exceeded') {
    return {
      code,
      retryable: false,
      messageAr: 'تعذر الرفع: تم استنفاد سعة التخزين السحابي المخصصة لمشروع Firebase.',
      messageEn: 'Firebase Storage quota exceeded.',
    };
  }
  if (code === 'storage/retry-limit-exceeded') {
    return {
      code,
      retryable: true,
      messageAr: 'انقطع الاتصال بخدمة التخزين السحابي أثناء الرفع. يمكنك إعادة المحاولة دون فقدان بياناتك.',
      messageEn: 'Connection lost while uploading. You can retry without losing your form data.',
    };
  }
  if (msg.includes('cors') || msg.includes('preflight')) {
    return {
      code: 'upload/cors',
      retryable: true,
      messageAr: 'تم حظر طلب الرفع بسبب إعدادات النطاق أو CORS في حاوية التخزين السحابي.',
      messageEn: 'Upload blocked by CORS/bucket configuration.',
    };
  }

  return {
    code: code || 'upload/unknown',
    retryable: true,
    messageAr: errObj?.message || 'حدث خطأ أثناء رفع الملف إلى التخزين السحابي. يرجى إعادة المحاولة.',
    messageEn: errObj?.message || 'Failed to upload file to cloud storage. Please retry.',
  };
}

export interface StorageTaskLike<TSnapshot = { bytesTransferred: number; totalBytes: number; ref?: unknown }> {
  on: (
    event: 'state_changed',
    next: (snapshot: TSnapshot) => void,
    error: (err: unknown) => void,
    complete: () => void
  ) => unknown;
  cancel: () => boolean;
}

export interface ResumableUploadRunnerOptions<TSnapshot> {
  createTask: (attempt: number) => StorageTaskLike<TSnapshot>;
  getDownloadUrl: (snapshot: TSnapshot) => Promise<string>;
  totalBytesFallback: number;
  maxRetries?: number;
  stallTimeoutMs?: number;
  baseBackoffMs?: number;
  onProgress?: (info: UploadProgressInfo, snapshot?: TSnapshot) => void;
  onCancelHandle?: (cancelFn: () => void) => void;
  isOnline?: () => boolean;
}

/**
 * Executes a resumable upload with stall detection, bounded exponential retry,
 * and strict real-bytes progress telemetry.
 */
export async function executeResumableUploadWithRetry<
  TSnapshot extends { bytesTransferred: number; totalBytes: number }
>(
  options: ResumableUploadRunnerOptions<TSnapshot>
): Promise<{ downloadUrl: string; finalProgress: UploadProgressInfo; snapshot: TSnapshot }> {
  const maxRetries = Math.max(0, options.maxRetries ?? 2);
  const stallTimeoutMs = Math.max(3000, options.stallTimeoutMs ?? 25000);
  const baseBackoffMs = Math.max(100, options.baseBackoffMs ?? 1200);
  const checkOnline = options.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  let userCanceled = false;
  let activeTask: StorageTaskLike<TSnapshot> | null = null;

  if (options.onCancelHandle) {
    options.onCancelHandle(() => {
      userCanceled = true;
      try {
        activeTask?.cancel();
      } catch {}
    });
  }

  let lastError: ClassifiedUploadError | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    if (userCanceled) {
      const canceledErr = classifyStorageUploadError({ code: 'storage/canceled' }, checkOnline());
      const err = new Error(canceledErr.messageAr);
      (err as any).code = canceledErr.code;
      (err as any).retryable = false;
      throw err;
    }

    if (!checkOnline()) {
      const offlineErr = classifyStorageUploadError({ code: 'offline' }, false);
      const err = new Error(offlineErr.messageAr);
      (err as any).code = offlineErr.code;
      (err as any).retryable = true;
      throw err;
    }

    const startedAtMs = Date.now();
    options.onProgress?.(
      computeTransferTelemetry({
        bytesTransferred: 0,
        totalBytes: options.totalBytesFallback,
        startedAtMs,
        attempt,
        status: attempt === 1 ? 'preparing' : 'uploading',
      })
    );

    try {
      const result = await new Promise<{
        downloadUrl: string;
        finalProgress: UploadProgressInfo;
        snapshot: TSnapshot;
      }>((resolve, reject) => {
        const task = options.createTask(attempt);
        activeTask = task;

        let lastSnapshot: TSnapshot | null = null;
        let lastBytes = -1;
        let stalledTimer: ReturnType<typeof setTimeout> | null = null;
        let settled = false;

        const clearStallTimer = () => {
          if (stalledTimer !== null) {
            clearTimeout(stalledTimer);
            stalledTimer = null;
          }
        };

        const armStallTimer = () => {
          clearStallTimer();
          stalledTimer = setTimeout(() => {
            if (settled) return;
            settled = true;
            try {
              task.cancel();
            } catch {}
            reject({ code: 'upload/stalled', message: 'Upload stalled without progress' });
          }, stallTimeoutMs);
        };

        armStallTimer();

        task.on(
          'state_changed',
          (snapshot) => {
            if (settled) return;
            lastSnapshot = snapshot;
            const total = snapshot.totalBytes > 0 ? snapshot.totalBytes : options.totalBytesFallback;
            if (snapshot.bytesTransferred > lastBytes) {
              lastBytes = snapshot.bytesTransferred;
              armStallTimer();
            }
            const telemetry = computeTransferTelemetry({
              bytesTransferred: snapshot.bytesTransferred,
              totalBytes: total,
              startedAtMs,
              attempt,
              status: 'uploading',
            });
            options.onProgress?.(telemetry, snapshot);
          },
          (err) => {
            if (settled) return;
            settled = true;
            clearStallTimer();
            reject(err);
          },
          async () => {
            if (settled) return;
            settled = true;
            clearStallTimer();
            try {
              if (!lastSnapshot) {
                throw new Error('Missing final upload snapshot');
              }
              const downloadUrl = await options.getDownloadUrl(lastSnapshot);
              if (!downloadUrl) {
                throw new Error('Empty download URL returned');
              }
              const finalTotal =
                lastSnapshot.totalBytes > 0 ? lastSnapshot.totalBytes : options.totalBytesFallback;
              const finalProgress = computeTransferTelemetry({
                bytesTransferred: finalTotal,
                totalBytes: finalTotal,
                startedAtMs,
                attempt,
                status: 'completed',
              });
              options.onProgress?.(finalProgress, lastSnapshot);
              resolve({ downloadUrl, finalProgress, snapshot: lastSnapshot });
            } catch (urlErr) {
              reject(urlErr);
            }
          }
        );
      });

      return result;
    } catch (err) {
      if (userCanceled) {
        const canceledErr = classifyStorageUploadError({ code: 'storage/canceled' }, checkOnline());
        options.onProgress?.(
          computeTransferTelemetry({
            bytesTransferred: 0,
            totalBytes: options.totalBytesFallback,
            startedAtMs,
            attempt,
            status: 'canceled',
          })
        );
        const e = new Error(canceledErr.messageAr);
        (e as any).code = canceledErr.code;
        (e as any).retryable = false;
        throw e;
      }

      const classified = classifyStorageUploadError(err, checkOnline());
      lastError = classified;

      const canRetry = classified.retryable && attempt <= maxRetries;
      if (!canRetry) {
        options.onProgress?.(
          computeTransferTelemetry({
            bytesTransferred: 0,
            totalBytes: options.totalBytesFallback,
            startedAtMs,
            attempt,
            status: 'failed',
          })
        );
        const finalErr = new Error(classified.messageAr);
        (finalErr as any).code = classified.code;
        (finalErr as any).retryable = classified.retryable;
        (finalErr as any).messageEn = classified.messageEn;
        throw finalErr;
      }

      const delayMs = baseBackoffMs * Math.pow(2, attempt - 1);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  const fallbackErr = new Error(lastError?.messageAr || 'فشل رفع الملف.');
  (fallbackErr as any).code = lastError?.code || 'upload/failed';
  (fallbackErr as any).retryable = true;
  throw fallbackErr;
}
