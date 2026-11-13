import {
  ManualPaymentMethodId,
  PaymentMethodSetting,
  PaymentRequest,
  PaymentSettings,
  SubscriptionPlan,
  UserRole,
  UserSubscription,
} from '../types';

export const ACTIVE_PAYMENT_METHOD_IDS: readonly ManualPaymentMethodId[] = ['superqi', 'zaincash'] as const;

export const MAX_RECEIPT_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB strict maximum
export const ALLOWED_RECEIPT_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
]);
export const ALLOWED_RECEIPT_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.pdf'];

export const DEFAULT_PAYMENT_METHODS: Record<ManualPaymentMethodId, PaymentMethodSetting> = {
  superqi: {
    id: 'superqi',
    displayNameAr: 'سوبر كي (SuperQi)',
    displayNameEn: 'سوبر كي (SuperQi)',
    walletNumber: '917337618826',
    instructionsAr:
      'افتح تطبيق سوبر كي (SuperQi)، اختر التحويل إلى رقم المحفظة أدناه، حوّل المبلغ المطلوب بالضبط بالدينار العراقي، ثم التقط لقطة شاشة لإيصال التحويل وارفعها في النموذج.',
    instructionsEn:
      'Open your SuperQi app, transfer the exact subscription amount in IQD to the receiving wallet number below, then capture a screenshot of the receipt and upload it below.',
    isActive: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  zaincash: {
    id: 'zaincash',
    displayNameAr: 'زين كاش (ZainCash)',
    displayNameEn: 'زين كاش (ZainCash)',
    walletNumber: '07885663748',
    instructionsAr:
      'افتح تطبيق زين كاش (ZainCash)، اختر تحويل أموال إلى رقم المحفظة أدناه، حوّل المبلغ المطلوب بالضبط بالدينار العراقي، ثم احفظ صورة إيصال التحويل وارفعها لإتمام الطلب.',
    instructionsEn:
      'Open your ZainCash app, send the exact subscription amount in IQD to the receiving wallet number below, then upload a clear image of the transfer receipt below.',
    isActive: true,
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
};

export function createDefaultPaymentSettings(): PaymentSettings {
  return {
    id: 'default',
    methods: {
      superqi: { ...DEFAULT_PAYMENT_METHODS.superqi },
      zaincash: { ...DEFAULT_PAYMENT_METHODS.zaincash },
    },
    updatedAt: new Date().toISOString(),
  };
}

export function isSupportedManualMethod(methodId: unknown): methodId is ManualPaymentMethodId {
  return methodId === 'superqi' || methodId === 'zaincash';
}

export function validateWalletNumber(walletNumber: string): { valid: boolean; errorAr?: string; errorEn?: string } {
  const cleaned = String(walletNumber || '').trim();
  if (!/^\d{7,16}$/.test(cleaned)) {
    return {
      valid: false,
      errorAr: 'رقم المحفظة غير صالح. يجب أن يتكون من 7 إلى 16 رقماً فقط بدون مسافات أو أحرف.',
      errorEn: 'Invalid wallet number. Must contain 7 to 16 digits only.',
    };
  }
  return { valid: true };
}

export function getActivePaymentMethods(settings?: PaymentSettings | null): PaymentMethodSetting[] {
  const source = settings?.methods || DEFAULT_PAYMENT_METHODS;
  return ACTIVE_PAYMENT_METHOD_IDS
    .map((id) => source[id] || DEFAULT_PAYMENT_METHODS[id])
    .filter((method) => Boolean(method && method.isActive && isSupportedManualMethod(method.id)));
}

export function validateReceiptFileMeta(file: {
  name?: string;
  type?: string;
  size?: number;
} | null | undefined): { valid: boolean; errorAr?: string; errorEn?: string } {
  if (!file) {
    return {
      valid: false,
      errorAr: 'يرجى إرفاق إيصال التحويل المالي (صورة أو ملف PDF).',
      errorEn: 'Please attach the payment receipt (image or PDF).',
    };
  }

  const size = Number(file.size || 0);
  if (!Number.isFinite(size) || size <= 0) {
    return {
      valid: false,
      errorAr: 'ملف الإيصال فارغ أو تالف.',
      errorEn: 'Receipt file is empty or corrupted.',
    };
  }

  if (size > MAX_RECEIPT_SIZE_BYTES) {
    return {
      valid: false,
      errorAr: 'حجم ملف الإيصال يتجاوز الحد الأقصى المسموح به (5 ميغابايت).',
      errorEn: 'Receipt file size exceeds the 5 MB maximum limit.',
    };
  }

  const fileName = String(file.name || '').trim().toLowerCase();
  const mime = String(file.type || '').trim().toLowerCase();
  const hasAllowedExt = ALLOWED_RECEIPT_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  const hasAllowedMime = ALLOWED_RECEIPT_MIME_TYPES.has(mime);

  // Explicitly reject SVG or non-supported executable/script files
  if (mime === 'image/svg+xml' || fileName.endsWith('.svg')) {
    return {
      valid: false,
      errorAr: 'صيغة SVG غير مدعومة لإيصالات الدفع. يرجى رفع ملف PDF أو صورة (JPG, PNG, WEBP).',
      errorEn: 'SVG files are not allowed. Please upload PDF, JPG, PNG, or WEBP.',
    };
  }

  if (!hasAllowedMime && !hasAllowedExt) {
    return {
      valid: false,
      errorAr: 'صيغة الملف غير مدعومة. الصيغ المسموحة: PDF, JPG, JPEG, PNG, WEBP, HEIC.',
      errorEn: 'Unsupported file format. Only PDF, JPG, JPEG, PNG, WEBP, or HEIC receipts are allowed.',
    };
  }

  const isAllowedDeclaredMime =
    !mime ||
    mime === 'application/octet-stream' ||
    mime.startsWith('image/') ||
    mime === 'application/pdf';

  if (!isAllowedDeclaredMime) {
    return {
      valid: false,
      errorAr: 'يجب أن يكون الإيصال المرفق صورة صالحة (JPG, PNG, WEBP, HEIC) أو ملف PDF.',
      errorEn: 'Uploaded receipt must be a valid image (JPG, PNG, WEBP, HEIC) or PDF file.',
    };
  }

  return { valid: true };
}

export interface PaymentSubmissionValidationInput {
  userId?: string | null;
  plan?: SubscriptionPlan | null;
  paymentMethodId?: string | null;
  activeMethodSetting?: PaymentMethodSetting | null;
  amountIqd: number;
  transferDate: string;
  receiptFile?: { name?: string; type?: string; size?: number } | null;
  now?: Date;
}

export interface ValidationIssue {
  field: string;
  messageAr: string;
  messageEn: string;
}

export function validatePaymentRequestSubmission(input: PaymentSubmissionValidationInput): {
  valid: boolean;
  errors: ValidationIssue[];
} {
  const errors: ValidationIssue[] = [];

  if (!input.userId || !String(input.userId).trim()) {
    errors.push({
      field: 'auth',
      messageAr: 'يجب تسجيل الدخول بحساب معتمد قبل إرسال طلب الدفع.',
      messageEn: 'Authentication is required before submitting a payment request.',
    });
  }

  if (!input.plan || input.plan.isActive === false) {
    errors.push({
      field: 'planId',
      messageAr: 'باقة الاشتراك المختارة غير صالحة أو غير مفعلة حالياً.',
      error: undefined as never,
      messageEn: 'Selected subscription plan is invalid or inactive.',
    } as ValidationIssue);
  }

  if (!isSupportedManualMethod(input.paymentMethodId)) {
    errors.push({
      field: 'paymentMethod',
      messageAr: 'وسيلة الدفع غير معتمدة. الوسائل المتاحة فقط: سوبر كي (SuperQi) أو زين كاش (ZainCash).',
      messageEn: 'Unsupported payment method. Only SuperQi and ZainCash are allowed.',
    });
  } else if (input.activeMethodSetting && !input.activeMethodSetting.isActive) {
    errors.push({
      field: 'paymentMethod',
      messageAr: 'وسيلة الدفع المختارة معطلة حالياً من قبل الإدارة.',
      messageEn: 'The selected payment method is currently disabled.',
    });
  }

  const submittedAmount = Number(input.amountIqd);
  const expectedAmount = Number(input.plan?.priceIqd ?? 0);
  if (!Number.isFinite(submittedAmount) || submittedAmount <= 0) {
    errors.push({
      field: 'amountIqd',
      messageAr: 'يرجى إدخال مبلغ تحويل صحيح أكبر من صفر.',
      messageEn: 'Please enter a valid positive transfer amount.',
    });
  } else if (input.plan && submittedAmount !== expectedAmount) {
    errors.push({
      field: 'amountIqd',
      messageAr: `المبلغ المدخل (${submittedAmount.toLocaleString()} د.ع) لا يطابق سعر الباقة المطلوب (${expectedAmount.toLocaleString()} د.ع).`,
      messageEn: `Submitted amount (${submittedAmount.toLocaleString()} IQD) does not match plan price (${expectedAmount.toLocaleString()} IQD).`,
    });
  }

  const dateStr = String(input.transferDate || '').trim();
  const parsedDate = dateStr ? new Date(`${dateStr}T00:00:00Z`) : null;
  if (!dateStr || !parsedDate || isNaN(parsedDate.getTime())) {
    errors.push({
      field: 'transferDate',
      messageAr: 'يرجى إدخال تاريخ تحويل صحيح.',
      messageEn: 'Please provide a valid transfer date.',
    });
  } else {
    const now = input.now || new Date();
    const maxFutureMs = now.getTime() + 48 * 60 * 60 * 1000; // Allow small timezone buffer up to +2 days
    if (parsedDate.getTime() > maxFutureMs) {
      errors.push({
        field: 'transferDate',
        messageAr: 'لا يمكن أن يكون تاريخ التحويل في المستقبل.',
        messageEn: 'Transfer date cannot be in the future.',
      });
    }
  }

  const receiptCheck = validateReceiptFileMeta(input.receiptFile);
  if (!receiptCheck.valid) {
    errors.push({
      field: 'receiptFile',
      messageAr: receiptCheck.errorAr || 'إيصال الدفع غير صالح.',
      messageEn: receiptCheck.errorEn || 'Invalid receipt image.',
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function getPlanDurationLabel(
  period: SubscriptionPlan['billingPeriod'],
  language: 'ar' | 'en'
): string {
  switch (period) {
    case 'monthly':
      return language === 'ar' ? 'شهر واحد (30 يوماً)' : 'Monthly (1 Month)';
    case 'quarterly':
      return language === 'ar' ? 'ربع سنوي (3 أشهر)' : 'Quarterly (3 Months)';
    case 'yearly':
      return language === 'ar' ? 'سنة كاملة (12 شهراً)' : 'Yearly (12 Months)';
    case 'custom':
    default:
      return language === 'ar' ? 'مدة مخصصة (30 يوماً)' : 'Custom Term (30 Days)';
  }
}

export function calculateSubscriptionDates(params: {
  billingPeriod: SubscriptionPlan['billingPeriod'];
  approvedAtIso?: string;
  existingSubscription?: Pick<UserSubscription, 'status' | 'endDate' | 'startDate'> | null;
  customDays?: number;
}): { startDate: string; endDate: string } {
  const approvalDate = params.approvedAtIso ? new Date(params.approvedAtIso) : new Date();
  const baseStart = isNaN(approvalDate.getTime()) ? new Date() : approvalDate;

  let anchorDate = new Date(baseStart);
  let effectiveStartDate = new Date(baseStart);

  // If renewing while current subscription is still active in the future, extend from its endDate
  if (params.existingSubscription && params.existingSubscription.status === 'active' && params.existingSubscription.endDate) {
    const existingEnd = new Date(params.existingSubscription.endDate);
    if (!isNaN(existingEnd.getTime()) && existingEnd.getTime() > baseStart.getTime()) {
      anchorDate = new Date(existingEnd);
      const existingStart = params.existingSubscription.startDate ? new Date(params.existingSubscription.startDate) : null;
      if (existingStart && !isNaN(existingStart.getTime())) {
        effectiveStartDate = existingStart;
      }
    }
  }

  const end = new Date(anchorDate);
  switch (params.billingPeriod) {
    case 'monthly':
      end.setUTCMonth(end.getUTCMonth() + 1);
      break;
    case 'quarterly':
      end.setUTCMonth(end.getUTCMonth() + 3);
      break;
    case 'yearly':
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      break;
    case 'custom':
    default:
      end.setUTCDate(end.getUTCDate() + Math.max(1, params.customDays || 30));
      break;
  }

  return {
    startDate: effectiveStartDate.toISOString().split('T')[0],
    endDate: end.toISOString().split('T')[0],
  };
}

export function canApprovePaymentRequest(
  request: Partial<PaymentRequest> | null | undefined,
  plan: SubscriptionPlan | null | undefined
): { allowed: boolean; reasonAr?: string; reasonEn?: string } {
  if (!request || !request.id || !request.userId) {
    return {
      allowed: false,
      reasonAr: 'طلب الدفع غير موجود أو يفتقر إلى معرّف المستخدم.',
      reasonEn: 'Payment request is missing or lacks owner userId.',
    };
  }

  if (request.status === 'approved') {
    return {
      allowed: false,
      reasonAr: 'تم اعتماد وتفعيل هذا الطلب مسبقاً. لا يمكن إعادة الاعتماد.',
      reasonEn: 'This payment request has already been approved (double approval blocked).',
    };
  }

  if (request.status === 'rejected') {
    return {
      allowed: false,
      reasonAr: 'هذا الطلب مرفوض مسبقاً. لا يمكن اعتماد طلب مرفوض.',
      reasonEn: 'Cannot approve a rejected payment request.',
    };
  }

  if (request.status !== 'pending' && request.status !== 'under_review') {
    return {
      allowed: false,
      reasonAr: 'حالة الطلب الحالية لا تسمح بالاعتماد.',
      reasonEn: 'Invalid payment request status for approval.',
    };
  }

  if (!isSupportedManualMethod(request.paymentMethod)) {
    return {
      allowed: false,
      reasonAr: 'وسيلة الدفع المسجلة غير معتمدة.',
      reasonEn: 'Unsupported payment method on request.',
    };
  }

  if (!plan || plan.id !== request.planId) {
    return {
      allowed: false,
      reasonAr: 'لم يتم العثور على باقة الاشتراك المرتبطة بالطلب.',
      reasonEn: 'Associated subscription plan could not be verified.',
    };
  }

  const submittedAmount = Number(request.amountIqd || 0);
  const expectedAmount = Number(request.expectedAmountIqd ?? plan.priceIqd);
  if (!Number.isFinite(submittedAmount) || submittedAmount <= 0 || submittedAmount !== plan.priceIqd || submittedAmount !== expectedAmount) {
    return {
      allowed: false,
      reasonAr: 'عدم تطابق مبلغ التحويل مع قيمة الباقة المطلوبة يمنع الاعتماد التلقائي.',
      reasonEn: 'Payment amount mismatch detected; approval blocked.',
    };
  }

  return { allowed: true };
}

export function canRejectPaymentRequest(
  request: Partial<PaymentRequest> | null | undefined,
  rejectionReason: string
): { allowed: boolean; reasonAr?: string; reasonEn?: string } {
  if (!request || !request.id) {
    return {
      allowed: false,
      reasonAr: 'طلب الدفع غير موجود.',
      reasonEn: 'Payment request not found.',
    };
  }

  if (request.status === 'approved') {
    return {
      allowed: false,
      reasonAr: 'لا يمكن رفض طلب تم اعتماده وتفعيله مسبقاً.',
      reasonEn: 'Cannot reject an already approved payment request.',
    };
  }

  if (request.status === 'rejected') {
    return {
      allowed: false,
      reasonAr: 'هذا الطلب مرفوض بالفعل.',
      reasonEn: 'This payment request is already rejected.',
    };
  }

  if (!String(rejectionReason || '').trim() || String(rejectionReason).trim().length < 3) {
    return {
      allowed: false,
      reasonAr: 'يجب إدخال سبب واضح للرفض (3 أحرف على الأقل).',
      reasonEn: 'A clear rejection reason (at least 3 characters) is required.',
    };
  }

  return { allowed: true };
}

export interface FinancialSummaryReport {
  confirmedRevenueIqd: number;
  approvedCount: number;
  pendingCount: number;
  pendingAmountIqd: number;
  underReviewCount: number;
  rejectedCount: number;
  rejectedAmountIqd: number;
  activeSubscriptionsCount: number;
  revenueByMethod: Record<ManualPaymentMethodId, { count: number; totalIqd: number }>;
  revenueByPlan: Array<{ planId: string; planNameAr: string; planNameEn: string; count: number; totalIqd: number }>;
}

/**
 * Financial reporting engine.
 * CRITICAL INVARIANT: Confirmed revenue sums ONLY approved & verified payments.
 * Pending, under_review, and rejected requests are strictly excluded from revenue totals.
 */
export function computeFinancialSummary(
  requests: PaymentRequest[],
  subscriptions: UserSubscription[] = []
): FinancialSummaryReport {
  let confirmedRevenueIqd = 0;
  let approvedCount = 0;
  let pendingCount = 0;
  let pendingAmountIqd = 0;
  let underReviewCount = 0;
  let rejectedCount = 0;
  let rejectedAmountIqd = 0;

  const revenueByMethod: Record<ManualPaymentMethodId, { count: number; totalIqd: number }> = {
    superqi: { count: 0, totalIqd: 0 },
    zaincash: { count: 0, totalIqd: 0 },
  };

  const planMap = new Map<
    string,
    { planId: string; planNameAr: string; planNameEn: string; count: number; totalIqd: number }
  >();

  for (const req of requests) {
    const amount = Number(req.amountIqd || 0);
    if (req.status === 'approved') {
      confirmedRevenueIqd += amount;
      approvedCount += 1;

      if (isSupportedManualMethod(req.paymentMethod)) {
        revenueByMethod[req.paymentMethod].count += 1;
        revenueByMethod[req.paymentMethod].totalIqd += amount;
      }

      const existingPlanAgg = planMap.get(req.planId) || {
        planId: req.planId,
        planNameAr: req.planNameAr || req.planId,
        planNameEn: req.planNameEn || req.planId,
        count: 0,
        totalIqd: 0,
      };
      existingPlanAgg.count += 1;
      existingPlanAgg.totalIqd += amount;
      planMap.set(req.planId, existingPlanAgg);
    } else if (req.status === 'pending') {
      pendingCount += 1;
      pendingAmountIqd += amount;
    } else if (req.status === 'under_review') {
      underReviewCount += 1;
      pendingAmountIqd += amount;
    } else if (req.status === 'rejected') {
      rejectedCount += 1;
      rejectedAmountIqd += amount;
    }
  }

  const revenueByPlan = Array.from(planMap.values()).sort((a, b) => b.totalIqd - a.totalIqd);
  const activeSubscriptionsCount = subscriptions.filter((s) => s.status === 'active').length;

  return {
    confirmedRevenueIqd,
    approvedCount,
    pendingCount,
    pendingAmountIqd,
    underReviewCount,
    rejectedCount,
    rejectedAmountIqd,
    activeSubscriptionsCount,
    revenueByMethod,
    revenueByPlan,
  };
}

export type SubscriptionExpiryState =
  | 'none'
  | 'pending'
  | 'active'
  | 'nearing_expiration'
  | 'expired'
  | 'cancelled';

export function getSubscriptionExpiryStatus(
  sub: Pick<UserSubscription, 'status' | 'endDate'> | null | undefined,
  now: Date = new Date()
): { state: SubscriptionExpiryState; daysRemaining: number | null } {
  if (!sub) return { state: 'none', daysRemaining: null };
  if (sub.status === 'cancelled') return { state: 'cancelled', daysRemaining: null };
  if (sub.status === 'pending') return { state: 'pending', daysRemaining: null };

  const endMs = sub.endDate ? new Date(`${sub.endDate}T23:59:59Z`).getTime() : NaN;
  if (isNaN(endMs)) {
    return { state: sub.status === 'active' ? 'active' : 'expired', daysRemaining: null };
  }

  const diffDays = Math.ceil((endMs - now.getTime()) / (24 * 60 * 60 * 1000));
  if (sub.status === 'expired' || diffDays < 0) {
    return { state: 'expired', daysRemaining: diffDays };
  }
  if (diffDays <= 7) {
    return { state: 'nearing_expiration', daysRemaining: diffDays };
  }
  return { state: 'active', daysRemaining: diffDays };
}

export function formatIqd(amount: number, language: 'ar' | 'en'): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return language === 'ar'
    ? `${safe.toLocaleString('en-US')} د.ع`
    : `${safe.toLocaleString('en-US')} IQD`;
}

export function formatRoleLabel(role: UserRole | string, language: 'ar' | 'en'): string {
  const labels: Record<string, { ar: string; en: string }> = {
    doctor: { ar: 'طبيب / عيادة', en: 'Doctor / Clinic' },
    radiology_center: { ar: 'مركز أشعة وسونار', en: 'Radiology Center' },
    laboratory: { ar: 'مختبر تحليلات', en: 'Laboratory' },
    pharmacy: { ar: 'صيدلية', en: 'Pharmacy' },
    wholesaler: { ar: 'مذخر أدوية / مكتب علمي', en: 'Medical Wholesaler' },
    secretary: { ar: 'سكرتارية طبية', en: 'Medical Secretary' },
    patient: { ar: 'مريض', en: 'Patient' },
    super_admin: { ar: 'مشرف عام', en: 'Super Admin' },
  };
  const entry = labels[role];
  if (!entry) return String(role);
  return language === 'ar' ? entry.ar : entry.en;
}
