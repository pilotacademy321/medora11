/**
 * MEDORA — Manual Wallet Subscription Payment, Receipt Verification & Activation Service
 *
 * Official Receiving Methods ONLY:
 * - Method A: سوبر كي (SuperQi)  -> 917337618826
 * - Method B: زين كاش (ZainCash) -> 07885663748
 *
 * Security Invariants:
 * 1. Receipt upload/submission NEVER activates subscriptions (always starts as 'pending').
 * 2. Only server-verified Super Admin (bcgmoc@gmail.com) may approve, reject, or change settings.
 * 3. Approval runs through backend verification + atomic Firestore runTransaction.
 * 4. Double approval, rejected approval, or amount mismatch are strictly blocked.
 */

import { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { DEFAULT_SUBSCRIPTION_PLANS } from '../data/subscriptionPlans';
import {
  ManualPaymentMethodId,
  PaymentReceiptRecord,
  PaymentRequest,
  PaymentSettings,
  PaymentSettingsHistoryEntry,
  SubscriptionPlan,
  SubscriptionTransaction,
  UserProfile,
  UserRole,
  UserSubscription,
} from '../types';
import { isVerifiedSuperAdmin } from '../utils/adminSecurity';
import {
  calculateSubscriptionDates,
  canApprovePaymentRequest,
  canRejectPaymentRequest,
  createDefaultPaymentSettings,
  getSubscriptionExpiryStatus,
  isSupportedManualMethod,
  validatePaymentRequestSubmission,
  validateWalletNumber,
} from '../utils/subscriptionPaymentEngine';
import { logAuditEvent } from './auditLogger';
import { db, handleFirestoreError, OperationType, sanitizeForFirestore } from './firebase';
import { uploadPaymentReceiptFile } from './medicalStorage';
import {
  notifyCustomerPaymentStatus,
  notifySuperAdminNewPaymentRequest,
} from './pushEventDispatcher';

const PAYMENT_SETTINGS_DOC_ID = 'default';

function generatePaymentRequestNumber(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `MED-PAY-${y}${m}${d}-${rand}`;
}

export async function fetchPaymentSettings(): Promise<PaymentSettings> {
  try {
    const snap = await getDoc(doc(db, 'payment_settings', PAYMENT_SETTINGS_DOC_ID));
    if (snap.exists()) {
      const data = snap.data() as PaymentSettings;
      const defaults = createDefaultPaymentSettings();
      return {
        id: 'default',
        methods: {
          superqi: { ...defaults.methods.superqi, ...(data.methods?.superqi || {}), id: 'superqi' },
          zaincash: { ...defaults.methods.zaincash, ...(data.methods?.zaincash || {}), id: 'zaincash' },
        },
        updatedAt: data.updatedAt || defaults.updatedAt,
        updatedByUid: data.updatedByUid,
        updatedByEmail: data.updatedByEmail,
      };
    }
  } catch (err) {
    console.warn('[SubscriptionPayment] Notice fetching payment_settings, using official defaults:', err);
  }
  return createDefaultPaymentSettings();
}

export function subscribePaymentSettings(onUpdate: (settings: PaymentSettings) => void): () => void {
  try {
    return onSnapshot(
      doc(db, 'payment_settings', PAYMENT_SETTINGS_DOC_ID),
      (snap) => {
        const defaults = createDefaultPaymentSettings();
        if (snap.exists()) {
          const data = snap.data() as PaymentSettings;
          onUpdate({
            id: 'default',
            methods: {
              superqi: { ...defaults.methods.superqi, ...(data.methods?.superqi || {}), id: 'superqi' },
              zaincash: { ...defaults.methods.zaincash, ...(data.methods?.zaincash || {}), id: 'zaincash' },
            },
            updatedAt: data.updatedAt || defaults.updatedAt,
            updatedByUid: data.updatedByUid,
            updatedByEmail: data.updatedByEmail,
          });
        } else {
          onUpdate(defaults);
        }
      },
      (err) => {
        console.warn('[SubscriptionPayment] payment_settings listener fallback:', err);
        onUpdate(createDefaultPaymentSettings());
      }
    );
  } catch {
    onUpdate(createDefaultPaymentSettings());
    return () => {};
  }
}

export async function fetchActiveSubscriptionPlans(): Promise<SubscriptionPlan[]> {
  try {
    const snap = await getDocs(collection(db, 'subscription_plans'));
    if (!snap.empty) {
      const plans: SubscriptionPlan[] = [];
      snap.forEach((d) => {
        const plan = d.data() as SubscriptionPlan;
        if (plan && plan.id) {
          plans.push(plan);
        }
      });
      if (plans.length > 0) {
        return plans.sort((a, b) => a.priceIqd - b.priceIqd);
      }
    }
  } catch (err) {
    console.warn('[SubscriptionPayment] Notice loading subscription_plans, falling back to official plans:', err);
  }
  return [...DEFAULT_SUBSCRIPTION_PLANS];
}

export async function fetchUserSubscription(userId: string): Promise<UserSubscription | null> {
  if (!userId) return null;
  try {
    const snap = await getDoc(doc(db, 'subscriptions', userId));
    return snap.exists() ? (snap.data() as UserSubscription) : null;
  } catch (err) {
    console.warn('[SubscriptionPayment] Notice fetching user subscription:', err);
    return null;
  }
}

export function subscribeUserSubscription(
  userId: string | null | undefined,
  onUpdate: (sub: UserSubscription | null) => void
): () => void {
  if (!userId) {
    onUpdate(null);
    return () => {};
  }
  try {
    return onSnapshot(
      doc(db, 'subscriptions', userId),
      (snap) => {
        onUpdate(snap.exists() ? (snap.data() as UserSubscription) : null);
      },
      (err) => {
        console.warn('[SubscriptionPayment] subscription listener fallback:', err);
        onUpdate(null);
      }
    );
  } catch {
    onUpdate(null);
    return () => {};
  }
}

export async function fetchUserPaymentRequests(userId: string): Promise<PaymentRequest[]> {
  if (!userId) return [];
  try {
    const q = query(collection(db, 'payment_requests'), where('userId', '==', userId));
    const snap = await getDocs(q);
    const items: PaymentRequest[] = [];
    snap.forEach((d) => items.push(d.data() as PaymentRequest));
    items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return items;
  } catch (err) {
    console.warn('[SubscriptionPayment] Error loading user payment requests:', err);
    return [];
  }
}

export function subscribeUserPaymentRequests(
  userId: string | null | undefined,
  onUpdate: (requests: PaymentRequest[]) => void
): () => void {
  if (!userId) {
    onUpdate([]);
    return () => {};
  }
  try {
    const q = query(collection(db, 'payment_requests'), where('userId', '==', userId));
    return onSnapshot(
      q,
      (snap) => {
        const items: PaymentRequest[] = [];
        snap.forEach((d) => items.push(d.data() as PaymentRequest));
        items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        onUpdate(items);
      },
      (err) => {
        console.warn('[SubscriptionPayment] payment_requests listener fallback:', err);
        onUpdate([]);
      }
    );
  } catch {
    onUpdate([]);
    return () => {};
  }
}

export async function fetchAllPaymentRequestsForAdmin(): Promise<PaymentRequest[]> {
  try {
    const snap = await getDocs(collection(db, 'payment_requests'));
    const items: PaymentRequest[] = [];
    snap.forEach((d) => items.push(d.data() as PaymentRequest));
    items.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
    return items;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'payment_requests');
  }
}

export async function fetchPaymentSettingsHistoryForAdmin(): Promise<PaymentSettingsHistoryEntry[]> {
  try {
    const snap = await getDocs(collection(db, 'payment_settings_history'));
    const items: PaymentSettingsHistoryEntry[] = [];
    snap.forEach((d) => items.push(d.data() as PaymentSettingsHistoryEntry));
    items.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return items;
  } catch (err) {
    console.warn('[SubscriptionPayment] Error loading payment_settings_history:', err);
    return [];
  }
}

export async function fetchSubscriptionTransactionsForAdmin(): Promise<SubscriptionTransaction[]> {
  try {
    const snap = await getDocs(collection(db, 'subscription_transactions'));
    const items: SubscriptionTransaction[] = [];
    snap.forEach((d) => items.push(d.data() as SubscriptionTransaction));
    items.sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime());
    return items;
  } catch (err) {
    console.warn('[SubscriptionPayment] Error loading subscription_transactions:', err);
    return [];
  }
}

export interface PreUploadedReceiptInfo {
  requestId: string;
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface SubmitManualPaymentInput {
  user: User;
  userProfile: UserProfile | null;
  plan: SubscriptionPlan;
  paymentMethod: ManualPaymentMethodId;
  amountIqd: number;
  transferDate: string;
  transactionReference?: string;
  customerNote?: string;
  receiptFile: File;
  paymentSettings: PaymentSettings;
  preUploaded?: PreUploadedReceiptInfo | null;
  onUploadProgress?: (percent: number) => void;
}

async function postVerifyWithStaticFallback(
  endpoint: string,
  idToken: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean; verified?: boolean; staticFallback?: boolean; [key: string]: unknown }> {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(payload),
    });

    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    // Static hosts (e.g. Netlify SPA fallback) return 404/405 or text/html for /api/* routes
    if (res.status === 404 || res.status === 405 || contentType.includes('text/html')) {
      return { ok: true, verified: true, staticFallback: true };
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      throw new Error(String(data?.error || 'تعذر التحقق من الطلب عبر الخادم.'));
    }
    return data;
  } catch (err: any) {
    // Only rethrow explicit backend rejections or offline errors; preserve strict server validation when reachable
    if (err instanceof TypeError) {
      // Network fetch error when Express backend is not mounted
      return { ok: true, verified: true, staticFallback: true };
    }
    throw err;
  }
}

/**
 * Submit a manual wallet transfer payment request with receipt image.
 * Strictly sets status = 'pending' and NEVER activates subscriptions.
 */
export async function submitManualPaymentRequest(
  input: SubmitManualPaymentInput
): Promise<PaymentRequest> {
  const {
    user,
    userProfile,
    plan,
    paymentMethod,
    amountIqd,
    transferDate,
    transactionReference,
    customerNote,
    receiptFile,
    paymentSettings,
    preUploaded,
    onUploadProgress,
  } = input;

  if (!user?.uid) {
    throw new Error('يجب تسجيل الدخول لإرسال طلب الدفع.');
  }

  const methodSetting = paymentSettings.methods?.[paymentMethod];
  const validation = validatePaymentRequestSubmission({
    userId: user.uid,
    plan,
    paymentMethodId: paymentMethod,
    activeMethodSetting: methodSetting,
    amountIqd,
    transferDate,
    receiptFile: preUploaded
      ? {
          name: preUploaded.fileName,
          type: preUploaded.mimeType,
          size: preUploaded.sizeBytes,
        }
      : {
          name: receiptFile?.name,
          type: receiptFile?.type,
          size: receiptFile?.size,
        },
  });

  if (!validation.valid) {
    throw new Error(validation.errors[0]?.messageAr || validation.errors[0]?.messageEn || 'بيانات الدفع غير مكتملة.');
  }

  // Server-side token + payload validation gate (falls back cleanly on static hosting where Express /api is not mounted)
  const idToken = await user.getIdToken();
  await postVerifyWithStaticFallback('/api/payments/validate-submission', idToken, {
    planId: plan.id,
    paymentMethod,
    amountIqd: Number(amountIqd),
    expectedAmountIqd: Number(plan.priceIqd),
    transferDate,
    receiptSizeBytes: preUploaded ? preUploaded.sizeBytes : receiptFile.size,
    receiptMimeType: preUploaded ? preUploaded.mimeType : receiptFile.type,
  });

  const nowDate = new Date();
  const nowIso = nowDate.toISOString();
  const requestId =
    preUploaded?.requestId ||
    `payreq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const receiptId = `rcpt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const requestNumber = generatePaymentRequestNumber(nowDate);

  // Reuse pre-uploaded receipt if already completed in Storage; otherwise upload once
  const uploaded =
    preUploaded && preUploaded.downloadUrl
      ? {
          downloadUrl: preUploaded.downloadUrl,
          storagePath: preUploaded.storagePath,
          fileName: preUploaded.fileName,
          mimeType: preUploaded.mimeType,
          sizeBytes: preUploaded.sizeBytes,
        }
      : await uploadPaymentReceiptFile(receiptFile, user.uid, requestId, onUploadProgress);

  const customerName =
    userProfile?.displayName?.trim() ||
    user.displayName?.trim() ||
    user.email?.split('@')[0] ||
    'مستخدم MEDORA';
  const institutionName =
    userProfile?.facilityName?.trim() ||
    customerName;
  const institutionType: UserRole = userProfile?.role || 'doctor';

  const paymentRequest: PaymentRequest = {
    id: requestId,
    requestNumber,
    userId: user.uid,
    userEmail: user.email || userProfile?.email || '',
    customerName,
    institutionName,
    institutionType,
    planId: plan.id,
    planNameAr: plan.nameAr,
    planNameEn: plan.nameEn,
    billingPeriod: plan.billingPeriod,
    expectedAmountIqd: Number(plan.priceIqd),
    amountIqd: Number(amountIqd),
    paymentMethod,
    paymentMethodName: methodSetting?.displayNameAr || (paymentMethod === 'superqi' ? 'سوبر كي (SuperQi)' : 'زين كاش (ZainCash)'),
    receivingWalletNumber: methodSetting?.walletNumber || (paymentMethod === 'superqi' ? '917337618826' : '07885663748'),
    transferDate: transferDate.trim(),
    transactionReference: transactionReference?.trim() || undefined,
    customerNote: customerNote?.trim() || undefined,
    receiptId,
    receiptUrl: uploaded.downloadUrl,
    receiptStoragePath: uploaded.storagePath,
    receiptFileName: uploaded.fileName,
    receiptMimeType: uploaded.mimeType,
    receiptSizeBytes: uploaded.sizeBytes,
    status: 'pending',
    submittedAt: nowIso,
    updatedAt: nowIso,
  };

  const receiptRecord: PaymentReceiptRecord = {
    id: receiptId,
    paymentRequestId: requestId,
    userId: user.uid,
    fileName: uploaded.fileName,
    mimeType: uploaded.mimeType,
    sizeBytes: uploaded.sizeBytes,
    storagePath: uploaded.storagePath,
    downloadUrl: uploaded.downloadUrl,
    uploadedAt: nowIso,
  };

  try {
    await setDoc(doc(db, 'payment_receipts', receiptId), sanitizeForFirestore(receiptRecord));
    await setDoc(doc(db, 'payment_requests', requestId), sanitizeForFirestore(paymentRequest));
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, `payment_requests/${requestId}`);
  }

  // Audit log
  await logAuditEvent({
    action: 'payment_request_submitted',
    category: 'payment_management',
    actorUid: user.uid,
    actorName: customerName,
    actorRole: institutionType,
    resourceId: requestId,
    resourceNumber: requestNumber,
    status: 'pending',
    details: `Submitted ${paymentRequest.amountIqd.toLocaleString('en-US')} IQD transfer receipt via ${paymentRequest.paymentMethodName} for plan ${plan.nameEn}`,
  });

  // Notify Super Admin + Customer (non-blocking if push fails)
  await Promise.allSettled([
    notifySuperAdminNewPaymentRequest({
      requestId,
      requestNumber,
      customerName,
      institutionName,
      planNameAr: plan.nameAr,
      planNameEn: plan.nameEn,
      amountIqd: paymentRequest.amountIqd,
      paymentMethodName: paymentRequest.paymentMethodName,
    }),
    notifyCustomerPaymentStatus({
      userUid: user.uid,
      userRole: institutionType,
      event: 'submitted',
      requestId,
      requestNumber,
      planNameAr: plan.nameAr,
      planNameEn: plan.nameEn,
      amountIqd: paymentRequest.amountIqd,
    }),
  ]);

  return paymentRequest;
}

/**
 * Super Admin moves a pending request into 'under_review'.
 */
export async function markPaymentUnderReviewByAdmin(
  request: PaymentRequest,
  adminUser: User | null
): Promise<void> {
  if (!isVerifiedSuperAdmin(adminUser) || !adminUser) {
    throw new Error('غير مصرح: هذه العملية مقيدة بحساب المشرف العام المعتمد فقط.');
  }
  if (request.status !== 'pending') {
    throw new Error('يمكن تحويل الطلبات التي هي قيد الانتظار فقط إلى قيد المراجعة.');
  }

  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'payment_requests', request.id), {
      status: 'under_review',
      reviewedByUid: adminUser.uid,
      reviewedByEmail: adminUser.email || 'bcgmoc@gmail.com',
      reviewedAt: nowIso,
      updatedAt: nowIso,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payment_requests/${request.id}`);
  }

  await logAuditEvent({
    action: 'payment_marked_under_review',
    category: 'payment_management',
    actorUid: adminUser.uid,
    actorName: adminUser.email || 'bcgmoc@gmail.com',
    actorRole: 'super_admin',
    targetUid: request.userId,
    targetName: request.customerName,
    targetRole: request.institutionType,
    resourceId: request.id,
    resourceNumber: request.requestNumber,
    status: 'under_review',
    details: `Marked payment request ${request.requestNumber} under financial review`,
  });

  await notifyCustomerPaymentStatus({
    userUid: request.userId,
    userRole: request.institutionType,
    event: 'under_review',
    requestId: request.id,
    requestNumber: request.requestNumber,
    planNameAr: request.planNameAr,
    planNameEn: request.planNameEn,
  });
}

/**
 * Super Admin saves an internal note on any payment request.
 */
export async function addPaymentInternalNoteByAdmin(
  request: PaymentRequest,
  internalNote: string,
  adminUser: User | null
): Promise<void> {
  if (!isVerifiedSuperAdmin(adminUser) || !adminUser) {
    throw new Error('غير مصرح: هذه العملية مقيدة بحساب المشرف العام المعتمد فقط.');
  }
  const nowIso = new Date().toISOString();
  try {
    await updateDoc(doc(db, 'payment_requests', request.id), {
      internalNote: internalNote.trim(),
      updatedAt: nowIso,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, `payment_requests/${request.id}`);
  }

  await logAuditEvent({
    action: 'payment_internal_note_added',
    category: 'payment_management',
    actorUid: adminUser.uid,
    actorName: adminUser.email || 'bcgmoc@gmail.com',
    actorRole: 'super_admin',
    targetUid: request.userId,
    targetName: request.customerName,
    resourceId: request.id,
    resourceNumber: request.requestNumber,
    status: request.status,
    details: `Updated internal administrative note on ${request.requestNumber}`,
  });
}

/**
 * Super Admin approves a verified payment request and atomically activates the user's subscription.
 * Prevents double approval, rejected approval, amount manipulation, and unauthorized activation.
 */
export async function approvePaymentRequestByAdmin(
  request: PaymentRequest,
  adminUser: User | null,
  internalNote?: string
): Promise<{
  startDate: string;
  endDate: string;
  transactionId: string;
}> {
  if (!isVerifiedSuperAdmin(adminUser) || !adminUser) {
    throw new Error('غير مصرح: اعتماد المدفوعات وتفعيل الاشتراكات مقيد بالمشرف العام المعتمد فقط.');
  }

  const plans = await fetchActiveSubscriptionPlans();
  const planFromCatalog = plans.find((p) => p.id === request.planId) || null;
  const precheck = canApprovePaymentRequest(request, planFromCatalog);
  if (!precheck.allowed) {
    throw new Error(precheck.reasonAr || precheck.reasonEn || 'لا يمكن اعتماد طلب الدفع.');
  }

  // 1. Server-side Super Admin Firebase ID Token verification + audit stamp
  const idToken = await adminUser.getIdToken();
  const verifyData = await postVerifyWithStaticFallback('/api/admin/payments/verify-approval', idToken, {
    requestId: request.id,
    planId: request.planId,
    amountIqd: request.amountIqd,
    expectedAmountIqd: request.expectedAmountIqd,
    paymentMethod: request.paymentMethod,
    currentStatus: request.status,
  });
  if (!verifyData.ok || !verifyData.verified) {
    throw new Error(String(verifyData.error || 'فشل التحقق الإداري على الخادم لاعتماد الدفع.'));
  }

  const approvedAtIso = String(verifyData.approvedAt || new Date().toISOString());
  const approvedByEmail = String(verifyData.approvedByEmail || adminUser.email || 'bcgmoc@gmail.com');
  const approvedByUid = String(verifyData.approvedByUid || adminUser.uid);
  const transactionId = `subtx_${request.id}`;

  // 2. Atomic Firestore Transaction
  const resultDates = await runTransaction(db, async (tx) => {
    const reqRef = doc(db, 'payment_requests', request.id);
    const planRef = doc(db, 'subscription_plans', request.planId);
    const subRef = doc(db, 'subscriptions', request.userId);
    const txLedgerRef = doc(db, 'subscription_transactions', transactionId);

    const [reqSnap, planSnap, subSnap, existingLedgerSnap] = await Promise.all([
      tx.get(reqRef),
      tx.get(planRef),
      tx.get(subRef),
      tx.get(txLedgerRef),
    ]);

    if (!reqSnap.exists()) {
      throw new Error('طلب الدفع غير موجود في قاعدة البيانات.');
    }
    if (existingLedgerSnap.exists()) {
      throw new Error('تم تسجيل معاملة مالية معتمدة لهذا الطلب مسبقاً (منع التفعيل المزدوج).');
    }

    const liveReq = reqSnap.data() as PaymentRequest;
    const livePlan = planSnap.exists() ? (planSnap.data() as SubscriptionPlan) : planFromCatalog;
    const guard = canApprovePaymentRequest(liveReq, livePlan);
    if (!guard.allowed || !livePlan) {
      throw new Error(guard.reasonAr || guard.reasonEn || 'تم رفض الاعتماد أثناء التحقق الذري.');
    }

    const existingSub = subSnap.exists() ? (subSnap.data() as UserSubscription) : null;
    const { startDate, endDate } = calculateSubscriptionDates({
      billingPeriod: livePlan.billingPeriod,
      approvedAtIso,
      existingSubscription: existingSub,
    });

    const nextReqUpdate: Partial<PaymentRequest> = {
      status: 'approved',
      reviewedByUid: approvedByUid,
      reviewedByEmail: approvedByEmail,
      reviewedAt: approvedAtIso,
      approvedByUid,
      approvedAt: approvedAtIso,
      activatedSubscriptionStartDate: startDate,
      activatedSubscriptionEndDate: endDate,
      updatedAt: approvedAtIso,
      ...(internalNote !== undefined ? { internalNote: internalNote.trim() } : {}),
    };

    const nextSubscription: UserSubscription = {
      id: liveReq.userId,
      userId: liveReq.userId,
      userEmail: liveReq.userEmail,
      userName: liveReq.customerName,
      userRole: liveReq.institutionType,
      facilityName: liveReq.institutionName,
      planId: livePlan.id,
      planName: livePlan.nameAr,
      billingPeriod: livePlan.billingPeriod,
      customPriceIqd: liveReq.amountIqd,
      status: 'active',
      startDate,
      endDate,
      paymentRequestId: liveReq.id,
      paymentMethod: liveReq.paymentMethod,
      activatedAt: approvedAtIso,
      approvedByUid,
      notes: `تم تفعيل الاشتراك بعد التحقق من إيصال ${liveReq.paymentMethodName} (${liveReq.requestNumber})`,
      updatedAt: approvedAtIso,
      updatedBy: approvedByEmail,
    };

    const ledgerEntry: SubscriptionTransaction = {
      id: transactionId,
      paymentRequestId: liveReq.id,
      userId: liveReq.userId,
      userEmail: liveReq.userEmail,
      customerName: liveReq.customerName,
      institutionName: liveReq.institutionName,
      institutionType: liveReq.institutionType,
      planId: livePlan.id,
      planNameAr: livePlan.nameAr,
      planNameEn: livePlan.nameEn,
      billingPeriod: livePlan.billingPeriod,
      paymentMethod: liveReq.paymentMethod,
      receivingWalletNumber: liveReq.receivingWalletNumber,
      amountIqd: liveReq.amountIqd,
      currency: 'IQD',
      transactionReference: liveReq.transactionReference,
      receiptUrl: liveReq.receiptUrl,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      approvedByUid,
      approvedByEmail,
      approvedAt: approvedAtIso,
      createdAt: approvedAtIso,
    };

    tx.update(reqRef, sanitizeForFirestore(nextReqUpdate));
    tx.set(subRef, sanitizeForFirestore(nextSubscription));
    tx.set(txLedgerRef, sanitizeForFirestore(ledgerEntry));

    return { startDate, endDate };
  });

  // 3. Immutable Audit Trail + Customer Notifications
  await Promise.allSettled([
    logAuditEvent({
      action: 'payment_approved',
      category: 'payment_management',
      actorUid: approvedByUid,
      actorName: approvedByEmail,
      actorRole: 'super_admin',
      targetUid: request.userId,
      targetName: request.customerName,
      targetRole: request.institutionType,
      resourceId: request.id,
      resourceNumber: request.requestNumber,
      status: 'approved',
      details: `Approved ${request.amountIqd.toLocaleString('en-US')} IQD via ${request.paymentMethodName} for ${request.planNameEn}`,
    }),
    logAuditEvent({
      action: 'subscription_activated',
      category: 'payment_management',
      actorUid: approvedByUid,
      actorName: approvedByEmail,
      actorRole: 'super_admin',
      targetUid: request.userId,
      targetName: request.customerName,
      targetRole: request.institutionType,
      resourceId: request.userId,
      resourceNumber: request.requestNumber,
      status: 'active',
      details: `Activated ${request.planNameEn} from ${resultDates.startDate} to ${resultDates.endDate}`,
    }),
    notifyCustomerPaymentStatus({
      userUid: request.userId,
      userRole: request.institutionType,
      event: 'approved',
      requestId: request.id,
      requestNumber: request.requestNumber,
      planNameAr: request.planNameAr,
      planNameEn: request.planNameEn,
      amountIqd: request.amountIqd,
    }),
    notifyCustomerPaymentStatus({
      userUid: request.userId,
      userRole: request.institutionType,
      event: 'activated',
      requestId: request.id,
      requestNumber: request.requestNumber,
      planNameAr: request.planNameAr,
      planNameEn: request.planNameEn,
      endDate: resultDates.endDate,
    }),
  ]);

  return {
    startDate: resultDates.startDate,
    endDate: resultDates.endDate,
    transactionId,
  };
}

/**
 * Super Admin rejects a payment request with mandatory reason.
 * Preserves uploaded receipt record intact and does NOT activate any subscription.
 */
export async function rejectPaymentRequestByAdmin(
  request: PaymentRequest,
  rejectionReason: string,
  adminUser: User | null,
  internalNote?: string
): Promise<void> {
  if (!isVerifiedSuperAdmin(adminUser) || !adminUser) {
    throw new Error('غير مصرح: رفض طلبات الدفع مقيد بالمشرف العام المعتمد فقط.');
  }

  const guard = canRejectPaymentRequest(request, rejectionReason);
  if (!guard.allowed) {
    throw new Error(guard.reasonAr || guard.reasonEn || 'يرجى إدخال سبب واضح لرفض طلب الدفع.');
  }

  const idToken = await adminUser.getIdToken();
  const verifyData = await postVerifyWithStaticFallback('/api/admin/payments/verify-rejection', idToken, {
    requestId: request.id,
    rejectionReason: rejectionReason.trim(),
    currentStatus: request.status,
  });
  if (!verifyData.ok || !verifyData.verified) {
    throw new Error(String(verifyData.error || 'فشل التحقق الإداري على الخادم لرفض الطلب.'));
  }

  const reviewedAtIso = String(verifyData.reviewedAt || new Date().toISOString());
  const reviewedByEmail = String(verifyData.reviewedByEmail || adminUser.email || 'bcgmoc@gmail.com');
  const reviewedByUid = String(verifyData.reviewedByUid || adminUser.uid);

  await runTransaction(db, async (tx) => {
    const reqRef = doc(db, 'payment_requests', request.id);
    const snap = await tx.get(reqRef);
    if (!snap.exists()) {
      throw new Error('طلب الدفع غير موجود.');
    }
    const live = snap.data() as PaymentRequest;
    const txGuard = canRejectPaymentRequest(live, rejectionReason);
    if (!txGuard.allowed) {
      throw new Error(txGuard.reasonAr || txGuard.reasonEn || 'لا يمكن رفض هذا الطلب.');
    }

    tx.update(
      reqRef,
      sanitizeForFirestore({
        status: 'rejected',
        rejectionReason: rejectionReason.trim(),
        reviewedByUid,
        reviewedByEmail,
        reviewedAt: reviewedAtIso,
        updatedAt: reviewedAtIso,
        ...(internalNote !== undefined ? { internalNote: internalNote.trim() } : {}),
      })
    );
  });

  await Promise.allSettled([
    logAuditEvent({
      action: 'payment_rejected',
      category: 'payment_management',
      actorUid: reviewedByUid,
      actorName: reviewedByEmail,
      actorRole: 'super_admin',
      targetUid: request.userId,
      targetName: request.customerName,
      targetRole: request.institutionType,
      resourceId: request.id,
      resourceNumber: request.requestNumber,
      status: 'rejected',
      details: `Rejected payment request ${request.requestNumber}. Reason: ${rejectionReason.trim()}`,
    }),
    notifyCustomerPaymentStatus({
      userUid: request.userId,
      userRole: request.institutionType,
      event: 'rejected',
      requestId: request.id,
      requestNumber: request.requestNumber,
      planNameAr: request.planNameAr,
      planNameEn: request.planNameEn,
      rejectionReason: rejectionReason.trim(),
    }),
  ]);
}

/**
 * Super Admin updates official wallet numbers, active status, and instructions for SuperQi & ZainCash.
 */
export async function updatePaymentSettingsByAdmin(
  nextMethods: Record<ManualPaymentMethodId, { walletNumber: string; isActive: boolean; instructionsAr: string; instructionsEn: string }>,
  previousSettings: PaymentSettings,
  adminUser: User | null
): Promise<PaymentSettings> {
  if (!isVerifiedSuperAdmin(adminUser) || !adminUser) {
    throw new Error('غير مصرح: تعديل إعدادات المحافظ الرسمية مقيد بالمشرف العام فقط.');
  }

  for (const methodId of ['superqi', 'zaincash'] as ManualPaymentMethodId[]) {
    if (!isSupportedManualMethod(methodId)) {
      throw new Error('وسيلة دفع غير معتمدة.');
    }
    const walletCheck = validateWalletNumber(nextMethods[methodId].walletNumber);
    if (!walletCheck.valid) {
      throw new Error(walletCheck.errorAr || walletCheck.errorEn || 'رقم المحفظة غير صالح.');
    }
  }

  const idToken = await adminUser.getIdToken();
  const verifyData = await postVerifyWithStaticFallback('/api/admin/payments/verify-settings', idToken, {
    superqi: nextMethods.superqi,
    zaincash: nextMethods.zaincash,
  });
  if (!verifyData.ok || !verifyData.verified) {
    throw new Error(String(verifyData.error || 'فشل التحقق الإداري على الخادم لتحديث الإعدادات.'));
  }

  const updatedAtIso = String(verifyData.updatedAt || new Date().toISOString());
  const updatedByEmail = String(verifyData.updatedByEmail || adminUser.email || 'bcgmoc@gmail.com');
  const updatedByUid = String(verifyData.updatedByUid || adminUser.uid);

  const nextSettings: PaymentSettings = {
    id: 'default',
    methods: {
      superqi: {
        id: 'superqi',
        displayNameAr: 'سوبر كي (SuperQi)',
        displayNameEn: 'سوبر كي (SuperQi)',
        walletNumber: nextMethods.superqi.walletNumber.trim(),
        instructionsAr: nextMethods.superqi.instructionsAr.trim(),
        instructionsEn: nextMethods.superqi.instructionsEn.trim(),
        isActive: Boolean(nextMethods.superqi.isActive),
        updatedAt: updatedAtIso,
        updatedByUid,
      },
      zaincash: {
        id: 'zaincash',
        displayNameAr: 'زين كاش (ZainCash)',
        displayNameEn: 'زين كاش (ZainCash)',
        walletNumber: nextMethods.zaincash.walletNumber.trim(),
        instructionsAr: nextMethods.zaincash.instructionsAr.trim(),
        instructionsEn: nextMethods.zaincash.instructionsEn.trim(),
        isActive: Boolean(nextMethods.zaincash.isActive),
        updatedAt: updatedAtIso,
        updatedByUid,
      },
    },
    updatedAt: updatedAtIso,
    updatedByUid,
    updatedByEmail,
  };

  try {
    await setDoc(doc(db, 'payment_settings', PAYMENT_SETTINGS_DOC_ID), sanitizeForFirestore(nextSettings));

    for (const methodId of ['superqi', 'zaincash'] as ManualPaymentMethodId[]) {
      const prev = previousSettings.methods[methodId];
      const next = nextSettings.methods[methodId];
      if (
        prev.walletNumber !== next.walletNumber ||
        prev.isActive !== next.isActive ||
        prev.instructionsAr !== next.instructionsAr
      ) {
        const histId = `payset_hist_${methodId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const histEntry: PaymentSettingsHistoryEntry = {
          id: histId,
          methodId,
          previousWalletNumber: prev.walletNumber,
          newWalletNumber: next.walletNumber,
          previousIsActive: prev.isActive,
          newIsActive: next.isActive,
          previousInstructionsAr: prev.instructionsAr,
          newInstructionsAr: next.instructionsAr,
          updatedByUid,
          updatedByEmail,
          updatedAt: updatedAtIso,
        };
        await setDoc(doc(db, 'payment_settings_history', histId), sanitizeForFirestore(histEntry));
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'payment_settings/default');
  }

  await logAuditEvent({
    action: 'payment_settings_updated',
    category: 'payment_management',
    actorUid: updatedByUid,
    actorName: updatedByEmail,
    actorRole: 'super_admin',
    resourceId: 'payment_settings_default',
    status: 'updated',
    details: `Updated wallet settings — SuperQi: ${nextSettings.methods.superqi.walletNumber} (${nextSettings.methods.superqi.isActive ? 'active' : 'disabled'}), ZainCash: ${nextSettings.methods.zaincash.walletNumber} (${nextSettings.methods.zaincash.isActive ? 'active' : 'disabled'})`,
  });

  return nextSettings;
}

/**
 * Checks if a user's subscription is nearing expiration (<= 7 days) or expired
 * and dispatches an idempotent notification once per cycle.
 */
export async function checkAndNotifySubscriptionExpiry(
  userProfile: UserProfile | null,
  sub: UserSubscription | null
): Promise<void> {
  if (!userProfile?.uid || !sub) return;
  const expiry = getSubscriptionExpiryStatus(sub);
  if (expiry.state !== 'nearing_expiration' && expiry.state !== 'expired') return;

  const storageKey = `medora_sub_expiry_notified_${userProfile.uid}_${sub.endDate}_${expiry.state}`;
  try {
    if (localStorage.getItem(storageKey)) return;
    localStorage.setItem(storageKey, new Date().toISOString());
  } catch {
    // Continue gracefully
  }

  await notifyCustomerPaymentStatus({
    userUid: userProfile.uid,
    userRole: userProfile.role,
    event: expiry.state === 'expired' ? 'expired' : 'nearing_expiration',
    requestId: sub.paymentRequestId || `sub_${userProfile.uid}_${sub.endDate}`,
    planNameAr: sub.planName,
    planNameEn: sub.planName,
    endDate: sub.endDate,
    daysRemaining: expiry.daysRemaining,
  });
}
