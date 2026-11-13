import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileImage,
  FileText,
  Info,
  Loader2,
  Receipt,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  fetchActiveSubscriptionPlans,
  PreUploadedReceiptInfo,
  submitManualPaymentRequest,
  subscribePaymentSettings,
  subscribeUserPaymentRequests,
  subscribeUserSubscription,
} from '../lib/subscriptionPaymentService';
import {
  formatBytesCompact,
  uploadPaymentReceiptFile,
  UploadProgressInfo,
  UploadStatus,
} from '../lib/medicalStorage';
import {
  ManualPaymentMethodId,
  PaymentRequest,
  PaymentSettings,
  SubscriptionPlan,
  UserSubscription,
} from '../types';
import {
  createDefaultPaymentSettings,
  formatIqd,
  getActivePaymentMethods,
  getPlanDurationLabel,
  getSubscriptionExpiryStatus,
  validatePaymentRequestSubmission,
  validateReceiptFileMeta,
} from '../utils/subscriptionPaymentEngine';

interface SubscriptionCheckoutPanelProps {
  initialPlanId?: string;
  onSubmitted?: (request: PaymentRequest) => void;
  compact?: boolean;
}

export const SubscriptionCheckoutPanel: React.FC<SubscriptionCheckoutPanelProps> = ({
  initialPlanId,
  onSubmitted,
  compact = false,
}) => {
  const { user, userProfile } = useAuth();
  const { language, isRTL } = useLanguage();

  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [paymentSettings, setPaymentSettings] = useState<PaymentSettings>(createDefaultPaymentSettings);
  const [userSubscription, setUserSubscription] = useState<UserSubscription | null>(null);
  const [userRequests, setUserRequests] = useState<PaymentRequest[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [selectedPlanId, setSelectedPlanId] = useState<string>(initialPlanId || '');
  const [selectedMethod, setSelectedMethod] = useState<ManualPaymentMethodId>('superqi');
  const [amountIqd, setAmountIqd] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>(() => new Date().toISOString().split('T')[0]);
  const [transactionReference, setTransactionReference] = useState<string>('');
  const [customerNote, setCustomerNote] = useState<string>('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [preUploadedReceipt, setPreUploadedReceipt] = useState<PreUploadedReceiptInfo | null>(null);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadTelemetry, setUploadTelemetry] = useState<UploadProgressInfo | null>(null);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const uploadCancelRef = useRef<(() => void) | null>(null);
  const activeUploadKeyRef = useRef<string | null>(null);

  const [copiedWalletId, setCopiedWalletId] = useState<ManualPaymentMethodId | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedRequest, setSubmittedRequest] = useState<PaymentRequest | null>(null);
  const [lightboxRequest, setLightboxRequest] = useState<PaymentRequest | null>(null);

  useEffect(() => {
    let active = true;
    setLoadingData(true);

    fetchActiveSubscriptionPlans()
      .then((loadedPlans) => {
        if (!active) return;
        const activePlans = loadedPlans.filter((p) => p.isActive !== false);
        setPlans(activePlans);

        const roleMatch = activePlans.find(
          (p) =>
            (initialPlanId && p.id === initialPlanId) ||
            (!initialPlanId && userProfile?.role && p.targetRole === userProfile.role)
        );
        const chosen = roleMatch || activePlans[0];
        if (chosen) {
          setSelectedPlanId((prev) => prev || chosen.id);
        }
      })
      .finally(() => {
        if (active) setLoadingData(false);
      });

    const unsubSettings = subscribePaymentSettings((settings) => {
      if (!active) return;
      setPaymentSettings(settings);
      const activeMethods = getActivePaymentMethods(settings);
      if (activeMethods.length > 0) {
        setSelectedMethod((prev) =>
          activeMethods.some((m) => m.id === prev) ? prev : activeMethods[0].id
        );
      }
    });

    const unsubSub = subscribeUserSubscription(user?.uid, (sub) => {
      if (active) setUserSubscription(sub);
    });

    const unsubReqs = subscribeUserPaymentRequests(user?.uid, (reqs) => {
      if (active) setUserRequests(reqs);
    });

    return () => {
      active = false;
      unsubSettings();
      unsubSub();
      unsubReqs();
    };
  }, [user?.uid, userProfile?.role, initialPlanId]);

  useEffect(() => {
    if (initialPlanId) {
      setSelectedPlanId(initialPlanId);
    }
  }, [initialPlanId]);

  const selectedPlan = useMemo(
    () => plans.find((p) => p.id === selectedPlanId) || plans[0] || null,
    [plans, selectedPlanId]
  );

  useEffect(() => {
    if (selectedPlan) {
      setAmountIqd(String(selectedPlan.priceIqd));
    }
  }, [selectedPlan]);

  useEffect(() => {
    if (!receiptFile) {
      setReceiptPreviewUrl(null);
      return;
    }
    const objUrl = URL.createObjectURL(receiptFile);
    setReceiptPreviewUrl(objUrl);
    return () => URL.revokeObjectURL(objUrl);
  }, [receiptFile]);

  const activeMethods = useMemo(
    () => getActivePaymentMethods(paymentSettings),
    [paymentSettings]
  );

  const selectedMethodInfo = useMemo(
    () => activeMethods.find((m) => m.id === selectedMethod) || activeMethods[0] || null,
    [activeMethods, selectedMethod]
  );

  const expiryStatus = useMemo(
    () => getSubscriptionExpiryStatus(userSubscription),
    [userSubscription]
  );

  const hasPendingPaymentRequest = useMemo(
    () => userRequests.some((r) => r.status === 'pending' || r.status === 'under_review'),
    [userRequests]
  );

  const handleCopyWallet = async (methodId: ManualPaymentMethodId, walletNumber: string) => {
    try {
      await navigator.clipboard.writeText(walletNumber);
      setCopiedWalletId(methodId);
      setTimeout(() => setCopiedWalletId(null), 2200);
    } catch {
      setErrorMessage(
        language === 'ar'
          ? `يرجى نسخ رقم المحفظة يدوياً: ${walletNumber}`
          : `Please copy the wallet number manually: ${walletNumber}`
      );
    }
  };

  const startImmediateReceiptUpload = async (file: File) => {
    if (!user?.uid) {
      setUploadStatus('failed');
      setUploadErrorMessage(
        language === 'ar'
          ? 'يجب تسجيل الدخول أولاً قبل رفع ملف الإيصال.'
          : 'Please sign in before uploading a receipt.'
      );
      return;
    }

    const uploadKey = `${user.uid}:${file.name}:${file.size}:${file.lastModified}`;
    if (activeUploadKeyRef.current === uploadKey && uploadStatus === 'uploading') {
      return; // Prevent duplicate concurrent uploads for the exact same selection
    }
    if (preUploadedReceipt && uploadStatus === 'completed' && activeUploadKeyRef.current === uploadKey) {
      return; // Already uploaded successfully
    }

    // Cancel any previous incomplete upload task cleanly
    if (uploadCancelRef.current) {
      try {
        uploadCancelRef.current();
      } catch {}
      uploadCancelRef.current = null;
    }

    const pendingRequestId = `payreq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    activeUploadKeyRef.current = uploadKey;
    setPreUploadedReceipt(null);
    setUploadErrorMessage(null);
    setErrorMessage(null);
    setUploadStatus('preparing');
    setUploadTelemetry({
      status: 'preparing',
      percent: 0,
      bytesTransferred: 0,
      totalBytes: file.size,
      bytesPerSecond: 0,
      speedFormatted: '0 KB/s',
      etaSeconds: null,
      elapsedMs: 0,
      attempt: 1,
    });

    try {
      const uploaded = await uploadPaymentReceiptFile(
        file,
        user.uid,
        pendingRequestId,
        (_pct, info) => {
          if (activeUploadKeyRef.current !== uploadKey) return;
          if (info) {
            setUploadTelemetry(info);
            setUploadStatus(info.status);
          }
        },
        {
          onCancelHandle: (cancelFn) => {
            uploadCancelRef.current = cancelFn;
          },
        }
      );

      if (activeUploadKeyRef.current !== uploadKey) return;
      uploadCancelRef.current = null;
      setPreUploadedReceipt({
        requestId: pendingRequestId,
        downloadUrl: uploaded.downloadUrl,
        storagePath: uploaded.storagePath,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
      });
      setUploadStatus('completed');
    } catch (err: any) {
      if (activeUploadKeyRef.current !== uploadKey) return;
      uploadCancelRef.current = null;
      const errMsg =
        err?.message ||
        (language === 'ar'
          ? 'فشل رفع الإيصال إلى التخزين السحابي. يمكنك إعادة المحاولة دون فقدان بياناتك.'
          : 'Failed to upload receipt. You can retry without losing form data.');
      const isCanceled = String(err?.code || '').toLowerCase() === 'storage/canceled';
      setUploadStatus(isCanceled ? 'canceled' : 'failed');
      setUploadErrorMessage(errMsg);
    }
  };

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMessage(null);
    setUploadErrorMessage(null);
    const file = e.target.files?.[0] || null;
    if (!file) {
      return;
    }
    const check = validateReceiptFileMeta({
      name: file.name,
      type: file.type,
      size: file.size,
    });
    if (!check.valid) {
      setErrorMessage(language === 'ar' ? check.errorAr || 'ملف غير صالح' : check.errorEn || 'Invalid receipt file');
      e.target.value = '';
      return;
    }
    setReceiptFile(file);
    void startImmediateReceiptUpload(file);
  };

  const handleClearReceipt = () => {
    if (uploadCancelRef.current) {
      try {
        uploadCancelRef.current();
      } catch {}
      uploadCancelRef.current = null;
    }
    activeUploadKeyRef.current = null;
    setReceiptFile(null);
    setPreUploadedReceipt(null);
    setUploadStatus('idle');
    setUploadTelemetry(null);
    setUploadErrorMessage(null);
  };

  const handleRetryReceiptUpload = () => {
    if (!receiptFile) return;
    setUploadErrorMessage(null);
    void startImmediateReceiptUpload(receiptFile);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setErrorMessage(null);
    setSubmittedRequest(null);

    if (!user) {
      setErrorMessage(
        language === 'ar'
          ? 'يجب تسجيل الدخول أولاً لإرسال طلب الدفع.'
          : 'Please sign in before submitting a payment request.'
      );
      return;
    }
    if (!selectedPlan || !selectedMethodInfo) {
      setErrorMessage(
        language === 'ar'
          ? 'يرجى اختيار الباقة ووسيلة الدفع المتاحة.'
          : 'Please select a subscription plan and active payment method.'
      );
      return;
    }

    if (uploadStatus === 'preparing' || uploadStatus === 'uploading') {
      setErrorMessage(
        language === 'ar'
          ? 'يرجى الانتظار بضع ثوانٍ حتى يكتمل رفع الإيصال (100%) قبل إرسال الطلب.'
          : 'Please wait until receipt upload finishes (100%) before submitting.'
      );
      return;
    }

    const numericAmount = Number(amountIqd);
    const preCheck = validatePaymentRequestSubmission({
      userId: user.uid,
      plan: selectedPlan,
      paymentMethodId: selectedMethodInfo.id,
      activeMethodSetting: selectedMethodInfo,
      amountIqd: numericAmount,
      transferDate,
      receiptFile: receiptFile
        ? { name: receiptFile.name, type: receiptFile.type, size: receiptFile.size }
        : null,
    });

    if (!preCheck.valid) {
      const firstErr = preCheck.errors[0];
      setErrorMessage(language === 'ar' ? firstErr.messageAr : firstErr.messageEn);
      return;
    }
    if (!receiptFile) return;

    if (!preUploadedReceipt?.downloadUrl) {
      setErrorMessage(
        language === 'ar'
          ? 'لم يكتمل رفع الإيصال إلى التخزين السحابي بعد. اضغط "إعادة محاولة الرفع" لحفظ الإيصال أولاً دون فقدان بيانات النموذج.'
          : 'Receipt is not uploaded yet. Click Retry Upload without losing your form details.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const created = await submitManualPaymentRequest({
        user,
        userProfile,
        plan: selectedPlan,
        paymentMethod: selectedMethodInfo.id,
        amountIqd: numericAmount,
        transferDate,
        transactionReference,
        customerNote,
        receiptFile,
        paymentSettings,
        preUploaded: preUploadedReceipt,
      });

      setSubmittedRequest(created);
      setTransactionReference('');
      setCustomerNote('');
      handleClearReceipt();
      if (onSubmitted) onSubmitted(created);
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          (language === 'ar'
            ? 'تعذر توثيق طلب الدفع، يرجى التحقق من الاتصال والمحاولة مجدداً دون الحاجة لإعادة رفع الإيصال.'
            : 'Failed to submit payment request. Your uploaded receipt and form fields were preserved.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handlePrefillResubmit = (req: PaymentRequest) => {
    setSelectedPlanId(req.planId);
    setSelectedMethod(req.paymentMethod);
    setAmountIqd(String(req.expectedAmountIqd || req.amountIqd));
    setTransferDate(new Date().toISOString().split('T')[0]);
    setTransactionReference('');
    setCustomerNote('');
    setSubmittedRequest(null);
    setErrorMessage(null);
  };

  const renderSubscriptionStatusBanner = () => {
    const state = expiryStatus.state;
    const isPendingView = state === 'pending' || (state === 'none' && hasPendingPaymentRequest);

    if (isPendingView) {
      return (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs space-y-1">
            <div className="font-black text-amber-950">
              {language === 'ar'
                ? 'الحالة الحالية: طلب اشتراك قيد المراجعة والتحقق المالي'
                : 'Current Status: Payment Request Pending Verification'}
            </div>
            <p className="text-amber-800 leading-relaxed">
              {language === 'ar'
                ? 'يتم تفعيل الاشتراك حصراً بعد مطابقة إيصال التحويل مع المحفظة من قبل المشرف العام لمنصة MEDORA.'
                : 'Subscription activation occurs only after MEDORA Super Admin verifies your wallet transfer receipt.'}
            </p>
          </div>
        </div>
      );
    }

    if (state === 'active' || state === 'nearing_expiration') {
      const nearing = state === 'nearing_expiration';
      return (
        <div
          className={`p-4 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            nearing ? 'bg-amber-50 border-amber-300' : 'bg-emerald-50 border-emerald-200'
          }`}
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              className={`w-5 h-5 shrink-0 mt-0.5 ${nearing ? 'text-amber-700' : 'text-emerald-700'}`}
            />
            <div className="text-xs space-y-0.5">
              <div className="font-black text-slate-900 flex items-center gap-2 flex-wrap">
                <span>
                  {language === 'ar'
                    ? `الاشتراك الحالي: ${userSubscription?.planName || 'مفعل'}`
                    : `Current Plan: ${userSubscription?.planName || 'Active'}`}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    nearing ? 'bg-amber-200 text-amber-950' : 'bg-emerald-200 text-emerald-950'
                  }`}
                >
                  {nearing
                    ? language === 'ar'
                      ? `ينتهي خلال ${expiryStatus.daysRemaining ?? 0} أيام`
                      : `Expiring in ${expiryStatus.daysRemaining ?? 0}d`
                    : language === 'ar'
                    ? 'نشط ومفعل'
                    : 'Active'}
                </span>
              </div>
              <div className="text-slate-600">
                {language === 'ar'
                  ? `من ${userSubscription?.startDate} إلى ${userSubscription?.endDate}`
                  : `Valid ${userSubscription?.startDate} to ${userSubscription?.endDate}`}
              </div>
            </div>
          </div>
          {expiryStatus.daysRemaining !== null && (
            <div className="text-xs font-mono font-bold text-slate-800 bg-white/80 px-3 py-1.5 rounded-xl border border-slate-200 shrink-0">
              {language === 'ar'
                ? `${expiryStatus.daysRemaining} يوم متبقي`
                : `${expiryStatus.daysRemaining} days left`}
            </div>
          )}
        </div>
      );
    }

    if (state === 'expired') {
      return (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <div className="font-black text-rose-950">
              {language === 'ar'
                ? `انتهت صلاحية الاشتراك (${userSubscription?.endDate || '—'})`
                : `Subscription Expired (${userSubscription?.endDate || '—'})`}
            </div>
            <p className="text-rose-800">
              {language === 'ar'
                ? 'يرجى اختيار الباقة وتحويل الرسوم عبر سوبر كي أو زين كاش ورفع الإيصال لإعادة التفعيل.'
                : 'Select a plan below and upload a transfer receipt via SuperQi or ZainCash to renew.'}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-start gap-3">
        <Info className="w-5 h-5 text-[#003366] shrink-0 mt-0.5" />
        <div className="text-xs space-y-0.5">
          <div className="font-black text-slate-900">
            {language === 'ar'
              ? 'حالة الاشتراك: لا يوجد اشتراك مفعل حالياً'
              : 'Subscription Status: No Active Subscription'}
          </div>
          <p className="text-slate-600">
            {language === 'ar'
              ? 'اختر الباقة المناسبة لعيادتك أو مركزك الصحي، وحوّل المبلغ إلى إحدى المحفظتين الرسميتين أدناه.'
              : 'Choose a subscription plan below and transfer the exact IQD amount to one of MEDORA’s official wallets.'}
          </p>
        </div>
      </div>
    );
  };

  if (loadingData) {
    return (
      <div className="py-12 flex flex-col items-center justify-center gap-3 text-slate-500">
        <RefreshCw className="w-7 h-7 animate-spin text-[#003366]" />
        <span className="text-xs font-bold">
          {language === 'ar' ? 'جاري تحميل باقات الاشتراك ووسائل الدفع...' : 'Loading subscription plans & payment methods...'}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* 1. Current Subscription Status */}
      {renderSubscriptionStatusBanner()}

      {/* 2. Plan Selector */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#003366]" />
            <span>{language === 'ar' ? '1. اختر باقة الاشتراك في MEDORA' : '1. Select MEDORA Subscription Plan'}</span>
          </h4>
          <span className="text-[11px] font-bold text-slate-500">
            {language === 'ar' ? 'الأسعار الرسمية بالدينار العراقي' : 'Official IQD Pricing'}
          </span>
        </div>

        <div className={`grid grid-cols-1 ${compact ? 'sm:grid-cols-2' : 'md:grid-cols-2 lg:grid-cols-3'} gap-3`}>
          {plans.map((plan) => {
            const isSelected = selectedPlan?.id === plan.id;
            const features = language === 'ar' ? plan.featuresAr : plan.featuresEn;
            return (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setSelectedPlanId(plan.id);
                  setErrorMessage(null);
                }}
                className={`text-start p-4 rounded-2xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'border-[#003366] bg-blue-50/50 shadow-sm ring-1 ring-[#003366]'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
                }`}
              >
                <div className="space-y-2 w-full">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-black text-sm text-slate-900">
                        {language === 'ar' ? plan.nameAr : plan.nameEn}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {getPlanDurationLabel(plan.billingPeriod, language)}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-[#003366] text-white flex items-center justify-center shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline gap-1.5 pt-1">
                    <span className="text-xl font-black text-[#003366] font-mono">
                      {plan.priceIqd.toLocaleString('en-US')}
                    </span>
                    <span className="text-xs font-bold text-slate-600">
                      {language === 'ar' ? 'د.ع' : 'IQD'}
                    </span>
                  </div>

                  {features && features.length > 0 && (
                    <ul className="space-y-1 pt-2 border-t border-slate-200/70">
                      {features.slice(0, 3).map((feat, idx) => (
                        <li key={idx} className="text-[11px] text-slate-600 flex items-start gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{feat}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Plan Summary & Total Amount Due */}
      {selectedPlan && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-[#003366] text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-sky-300">
              {language === 'ar' ? 'ملخص الباقة المختارة' : 'Selected Plan Summary'}
            </span>
            <h5 className="text-base sm:text-lg font-black">
              {language === 'ar' ? selectedPlan.nameAr : selectedPlan.nameEn}
            </h5>
            <p className="text-xs text-slate-300">
              {getPlanDurationLabel(selectedPlan.billingPeriod, language)} —{' '}
              {language === 'ar' ? selectedPlan.descriptionAr : selectedPlan.descriptionEn}
            </p>
          </div>
          <div className="bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-end shrink-0">
            <span className="text-[11px] text-sky-200 block font-bold">
              {language === 'ar' ? 'المبلغ الإجمالي المستحق' : 'Total Amount Due'}
            </span>
            <span className="text-2xl font-black font-mono text-white">
              {formatIqd(selectedPlan.priceIqd, language)}
            </span>
          </div>
        </div>
      )}

      {/* 3. Official Receiving Payment Methods (SuperQi & ZainCash ONLY) */}
      <div className="space-y-3">
        <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-[#003366]" />
          <span>
            {language === 'ar'
              ? '2. اختر محفظة التحويل الرسمية وانسخ الرقم'
              : '2. Select Official Receiving Wallet'}
          </span>
        </h4>

        {activeMethods.length === 0 ? (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-bold">
            {language === 'ar'
              ? 'وسائل الدفع متوقفة مؤقتاً من قبل الإدارة. يرجى المحاولة لاحقاً.'
              : 'Payment methods are temporarily unavailable. Please try again later.'}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeMethods.map((method) => {
              const isSelected = selectedMethodInfo?.id === method.id;
              const isCopied = copiedWalletId === method.id;
              return (
                <div
                  key={method.id}
                  onClick={() => {
                    setSelectedMethod(method.id);
                    setErrorMessage(null);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter' || ev.key === ' ') {
                      ev.preventDefault();
                      setSelectedMethod(method.id);
                    }
                  }}
                  className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-3 ${
                    isSelected
                      ? 'border-[#003366] bg-blue-50/40 shadow-sm ring-1 ring-[#003366]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-white font-black text-xs ${
                          method.id === 'superqi' ? 'bg-indigo-600' : 'bg-emerald-600'
                        }`}
                      >
                        {method.id === 'superqi' ? 'SQ' : 'ZC'}
                      </span>
                      <div>
                        <div className="font-black text-sm text-slate-900">
                          {language === 'ar' ? method.displayNameAr : method.displayNameEn}
                        </div>
                        <span className="text-[10px] font-bold text-emerald-700">
                          {language === 'ar' ? 'محفظة رسمية مفعلة' : 'Active Official Wallet'}
                        </span>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-[#003366] text-white flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>

                  {/* Receiving Wallet Number Box */}
                  <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-slate-400 block">
                        {language === 'ar' ? 'رقم المحفظة المستلمة' : 'Receiving Wallet Number'}
                      </span>
                      <span className="font-mono font-black text-base text-slate-900 tracking-wider" dir="ltr">
                        {method.walletNumber}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        handleCopyWallet(method.id, method.walletNumber);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 hover:bg-[#003366] hover:text-white text-slate-800'
                      }`}
                    >
                      {isCopied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>
                        {isCopied
                          ? language === 'ar'
                            ? 'تم النسخ'
                            : 'Copied'
                          : language === 'ar'
                          ? 'نسخ الرقم'
                          : 'Copy'}
                      </span>
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    {language === 'ar' ? method.instructionsAr : method.instructionsEn}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Payment Request Submission Form */}
      <form onSubmit={handleSubmit} className="p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[#003366]" />
            <span>
              {language === 'ar'
                ? '3. تقديم طلب تأكيد التحويل ورفع الإيصال'
                : '3. Submit Transfer Details & Receipt Image'}
            </span>
          </h4>
          <span className="text-[11px] font-bold text-slate-500">
            {language === 'ar' ? 'الحد الأقصى 5 MB (صور فقط)' : 'Max 5 MB (Image only)'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {language === 'ar' ? 'المبلغ المحوّل (د.ع) *' : 'Transfer Amount (IQD) *'}
            </label>
            <input
              type="number"
              required
              min={1}
              value={amountIqd}
              onChange={(e) => setAmountIqd(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-sm font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#003366]"
              dir="ltr"
            />
            {selectedPlan && (
              <span className="text-[10px] text-slate-500 mt-1 block">
                {language === 'ar'
                  ? `المبلغ المطلوب للباقة: ${selectedPlan.priceIqd.toLocaleString('en-US')} د.ع`
                  : `Required plan amount: ${selectedPlan.priceIqd.toLocaleString('en-US')} IQD`}
              </span>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {language === 'ar' ? 'تاريخ التحويل *' : 'Transfer Date *'}
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="date"
                required
                value={transferDate}
                max={new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0]}
                onChange={(e) => setTransferDate(e.target.value)}
                className="w-full ps-9 pe-3 py-2.5 rounded-xl bg-white border border-slate-300 text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#003366]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {language === 'ar' ? 'رقم مرجع العملية (اختياري)' : 'Transaction Reference Number (Optional)'}
            </label>
            <input
              type="text"
              value={transactionReference}
              onChange={(e) => setTransactionReference(e.target.value)}
              placeholder={language === 'ar' ? 'مثال: رقم الإشعار أو العملية في التطبيق' : 'e.g. App reference / TX ID'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#003366]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              {language === 'ar' ? 'ملاحظة العميل (اختياري)' : 'Customer Note (Optional)'}
            </label>
            <input
              type="text"
              value={customerNote}
              onChange={(e) => setCustomerNote(e.target.value)}
              placeholder={language === 'ar' ? 'أي تفاصيل إضافية حول التحويل...' : 'Optional transfer note...'}
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#003366]"
            />
          </div>
        </div>

        {/* Receipt Upload Input */}
        <div className="space-y-2.5">
          <label className="block text-xs font-bold text-slate-700">
            {language === 'ar'
              ? 'ملف إيصال التحويل المالي (PDF, JPG, JPEG, PNG, WEBP, HEIC — بحد أقصى 5 MB) *'
              : 'Payment Receipt File (PDF, JPG, JPEG, PNG, WEBP, HEIC — Max 5 MB) *'}
          </label>

          <label
            className={`flex flex-col items-center justify-center p-5 rounded-2xl border-2 border-dashed transition-colors cursor-pointer text-center gap-2 ${
              uploadStatus === 'completed'
                ? 'border-emerald-400 bg-emerald-50/40'
                : uploadStatus === 'failed'
                ? 'border-rose-300 bg-rose-50/40'
                : 'border-slate-300 hover:border-[#003366] bg-white'
            }`}
          >
            <Upload className="w-6 h-6 text-[#003366]" />
            <div className="text-xs font-bold text-slate-800">
              {receiptFile
                ? receiptFile.name
                : language === 'ar'
                ? 'اضغط لاختيار ملف أو لقطة شاشة إيصال التحويل (يبدأ الرفع تلقائياً)'
                : 'Click to choose transfer receipt file or screenshot (uploads immediately)'}
            </div>
            <div className="text-[11px] text-slate-500">
              {receiptFile
                ? `${formatBytesCompact(receiptFile.size)}`
                : language === 'ar'
                ? 'الحجم الأقصى 5 ميغابايت · يبدأ الرفع فور اختيار الملف'
                : 'Maximum size 5 MB · Upload begins automatically on selection'}
            </div>
            <input
              type="file"
              accept=".pdf,application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
              onChange={handleReceiptChange}
              disabled={uploadStatus === 'preparing' || uploadStatus === 'uploading'}
              className="sr-only"
            />
          </label>

          {receiptFile && (
            <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2.5">
              <div className="flex items-center gap-3">
                {receiptFile.type === 'application/pdf' || receiptFile.name.toLowerCase().endsWith('.pdf') ? (
                  <div className="w-14 h-14 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 flex flex-col items-center justify-center shrink-0">
                    <FileText className="w-6 h-6" />
                    <span className="text-[9px] font-black mt-0.5">PDF</span>
                  </div>
                ) : receiptPreviewUrl ? (
                  <img
                    src={receiptPreviewUrl}
                    alt="Receipt preview"
                    className="w-14 h-14 object-cover rounded-xl border border-slate-200 shrink-0"
                  />
                ) : null}

                <div className="flex-1 min-w-0 text-xs space-y-0.5">
                  <div className="font-bold text-slate-900 truncate">{receiptFile.name}</div>
                  <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                    <span>{formatBytesCompact(receiptFile.size)}</span>
                    {uploadStatus === 'completed' && (
                      <span className="text-emerald-700 font-bold inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {language === 'ar' ? 'تم الرفع بنجاح (100%)' : 'Uploaded (100%)'}
                      </span>
                    )}
                    {(uploadStatus === 'preparing' || uploadStatus === 'uploading') && (
                      <span className="text-[#003366] font-bold inline-flex items-center gap-1">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {language === 'ar' ? 'جارٍ الرفع إلى التخزين السحابي...' : 'Uploading to cloud storage...'}
                      </span>
                    )}
                    {(uploadStatus === 'failed' || uploadStatus === 'canceled') && (
                      <span className="text-rose-700 font-bold inline-flex items-center gap-1">
                        <XCircle className="w-3.5 h-3.5" />
                        {language === 'ar' ? 'تعذر إتمام الرفع' : 'Upload failed'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {(uploadStatus === 'preparing' || uploadStatus === 'uploading') && (
                    <button
                      type="button"
                      onClick={() => uploadCancelRef.current?.()}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                    >
                      {language === 'ar' ? 'إلغاء' : 'Cancel'}
                    </button>
                  )}
                  {(uploadStatus === 'failed' || uploadStatus === 'canceled') && (
                    <button
                      type="button"
                      onClick={handleRetryReceiptUpload}
                      className="px-2.5 py-1.5 rounded-lg bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'إعادة المحاولة' : 'Retry'}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleClearReceipt}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold cursor-pointer"
                  >
                    {language === 'ar' ? 'إزالة' : 'Remove'}
                  </button>
                </div>
              </div>

              {(uploadStatus === 'preparing' || uploadStatus === 'uploading' || uploadStatus === 'completed') &&
                uploadTelemetry && (
                  <div className="space-y-1.5 pt-1">
                    <div className="flex flex-wrap items-center justify-between text-[11px] font-bold text-slate-700 gap-2">
                      <span>
                        {uploadStatus === 'completed'
                          ? language === 'ar'
                            ? 'اكتمل رفع الإيصال وهو جاهز لإرسال طلب الدفع'
                            : 'Receipt uploaded and ready for submission'
                          : language === 'ar'
                          ? `${formatBytesCompact(uploadTelemetry.bytesTransferred)} من ${formatBytesCompact(uploadTelemetry.totalBytes)}`
                          : `${formatBytesCompact(uploadTelemetry.bytesTransferred)} / ${formatBytesCompact(uploadTelemetry.totalBytes)}`}
                      </span>
                      <div className="flex items-center gap-2 font-mono">
                        {uploadTelemetry.bytesPerSecond > 0 && uploadStatus === 'uploading' && (
                          <span className="text-sky-700">{uploadTelemetry.speedFormatted}</span>
                        )}
                        <span className={uploadStatus === 'completed' ? 'text-emerald-700' : 'text-[#003366]'}>
                          {uploadTelemetry.percent}%
                        </span>
                      </div>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-150 ${
                          uploadStatus === 'completed' ? 'bg-emerald-600' : 'bg-[#003366]'
                        }`}
                        style={{ width: `${uploadTelemetry.percent}%` }}
                      />
                    </div>
                  </div>
                )}

              {uploadErrorMessage && (
                <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{uploadErrorMessage}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Security Notice */}
        <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-950 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
          <span>
            {language === 'ar'
              ? 'ملاحظة أمنية: رفع الإيصال يُنشئ طلب دفع بحالة (قيد الانتظار). لا يتم تفعيل الاشتراك إلا بعد تحقق المشرف العام من استلام المبلغ الفعلي.'
              : 'Security notice: Submitting a receipt creates a PENDING payment request. Subscriptions are activated only after Super Admin verification.'}
          </span>
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-800 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {submittedRequest && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
            <div className="font-black flex items-center gap-2 text-emerald-800">
              <CheckCircle2 className="w-4 h-4" />
              <span>
                {language === 'ar'
                  ? `تم إرسال طلب الدفع بنجاح (${submittedRequest.requestNumber})`
                  : `Payment Request Submitted (${submittedRequest.requestNumber})`}
              </span>
            </div>
            <p className="text-emerald-800">
              {language === 'ar'
                ? 'حالة الطلب الآن (قيد الانتظار). تم إشعار المشرف العام للمراجعة، وسيتم إشعارك فور اعتماد وتفعيل الاشتراك.'
                : 'Status is now PENDING. The Super Admin has been notified to review your receipt and activate your subscription.'}
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={
            submitting ||
            activeMethods.length === 0 ||
            uploadStatus === 'preparing' ||
            uploadStatus === 'uploading' ||
            !preUploadedReceipt?.downloadUrl
          }
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#002244] to-[#003366] hover:from-[#00172e] hover:to-[#002244] text-white font-black text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>{language === 'ar' ? 'جارٍ تسجيل الطلب...' : 'Submitting Request...'}</span>
            </>
          ) : uploadStatus === 'preparing' || uploadStatus === 'uploading' ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                {language === 'ar'
                  ? `جارٍ رفع الإيصال (${uploadTelemetry?.percent ?? 0}%)...`
                  : `Uploading Receipt (${uploadTelemetry?.percent ?? 0}%)...`}
              </span>
            </>
          ) : (
            <>
              <ShieldCheck className="w-4 h-4" />
              <span>
                {language === 'ar'
                  ? `إرسال طلب الدفع والإيصال (${selectedPlan ? formatIqd(selectedPlan.priceIqd, language) : ''})`
                  : `Submit Payment Request & Receipt`}
              </span>
            </>
          )}
        </button>
      </form>

      {/* 5. Customer Payment Request History */}
      {userRequests.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#003366]" />
            <span>
              {language === 'ar' ? 'سجل طلبات الدفع السابقة' : 'Your Payment Request History'} ({userRequests.length})
            </span>
          </h4>

          <div className="space-y-2.5">
            {userRequests.map((req) => {
              const badge =
                req.status === 'approved'
                  ? { labelAr: 'معتمد ومفعل', labelEn: 'Approved', cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
                  : req.status === 'rejected'
                  ? { labelAr: 'مرفوض', labelEn: 'Rejected', cls: 'bg-rose-100 text-rose-800 border-rose-200' }
                  : req.status === 'under_review'
                  ? { labelAr: 'قيد المراجعة', labelEn: 'Under Review', cls: 'bg-sky-100 text-sky-800 border-sky-200' }
                  : { labelAr: 'قيد الانتظار', labelEn: 'Pending', cls: 'bg-amber-100 text-amber-800 border-amber-200' };

              return (
                <div key={req.id} className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black text-[#003366]">{req.requestNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${badge.cls}`}>
                        {language === 'ar' ? badge.labelAr : badge.labelEn}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-black text-slate-900">
                      {formatIqd(req.amountIqd, language)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span>
                      {language === 'ar' ? req.planNameAr : req.planNameEn} · {req.paymentMethodName}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {language === 'ar' ? `تاريخ التحويل: ${req.transferDate}` : `Transfer: ${req.transferDate}`}
                    </span>
                  </div>

                  {req.status === 'rejected' && req.rejectionReason && (
                    <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-[11px] text-rose-900">
                      <span className="font-black">
                        {language === 'ar' ? 'سبب الرفض: ' : 'Rejection Reason: '}
                      </span>
                      <span>{req.rejectionReason}</span>
                    </div>
                  )}

                  {req.status === 'approved' && req.activatedSubscriptionEndDate && (
                    <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900">
                      {language === 'ar'
                        ? `تم التفعيل من ${req.activatedSubscriptionStartDate} إلى ${req.activatedSubscriptionEndDate}`
                        : `Activated from ${req.activatedSubscriptionStartDate} to ${req.activatedSubscriptionEndDate}`}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {req.receiptUrl && (
                      <button
                        type="button"
                        onClick={() => setLightboxRequest(req)}
                        className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'عرض الإيصال' : 'View Receipt'}</span>
                      </button>
                    )}

                    {req.status === 'rejected' && (
                      <button
                        type="button"
                        onClick={() => handlePrefillResubmit(req)}
                        className="px-2.5 py-1 rounded-lg bg-[#003366] hover:bg-[#002244] text-white text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'تقديم طلب جديد' : 'Submit New Request'}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Receipt Viewer Lightbox Modal (Images & PDFs) */}
      {lightboxRequest && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold min-w-0">
                <FileImage className="w-4 h-4 text-sky-300 shrink-0" />
                <span className="truncate">{lightboxRequest.requestNumber}</span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxRequest.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold inline-flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'فتح' : 'Open'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxRequest(null)}
                  className="p-1 rounded-full hover:bg-white/15 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 bg-slate-100 flex items-center justify-center max-h-[70vh] overflow-auto">
              {lightboxRequest.receiptMimeType === 'application/pdf' ||
              lightboxRequest.receiptFileName?.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  title={lightboxRequest.receiptFileName || 'Receipt PDF'}
                  src={lightboxRequest.receiptUrl}
                  className="w-full h-[60vh] rounded-xl bg-white border border-slate-200"
                />
              ) : (
                <img
                  src={lightboxRequest.receiptUrl}
                  alt={lightboxRequest.receiptFileName}
                  className="max-w-full max-h-[60vh] rounded-xl shadow-md object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
