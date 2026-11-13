import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  Eye,
  FileImage,
  FileText,
  History,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import {
  addPaymentInternalNoteByAdmin,
  approvePaymentRequestByAdmin,
  fetchAllPaymentRequestsForAdmin,
  fetchPaymentSettings,
  fetchPaymentSettingsHistoryForAdmin,
  fetchSubscriptionTransactionsForAdmin,
  markPaymentUnderReviewByAdmin,
  rejectPaymentRequestByAdmin,
  updatePaymentSettingsByAdmin,
} from '../lib/subscriptionPaymentService';
import {
  ManualPaymentMethodId,
  PaymentRequest,
  PaymentSettings,
  PaymentSettingsHistoryEntry,
  SubscriptionTransaction,
  UserSubscription,
} from '../types';
import { isVerifiedSuperAdmin } from '../utils/adminSecurity';
import {
  computeFinancialSummary,
  createDefaultPaymentSettings,
  formatIqd,
  formatRoleLabel,
  validateWalletNumber,
} from '../utils/subscriptionPaymentEngine';

interface MedoraPaymentManagementProps {
  subscriptions?: UserSubscription[];
  onSubscriptionsUpdated?: () => void;
}

type PaymentAdminSection = 'pending' | 'approved' | 'rejected' | 'reports' | 'settings';

export const MedoraPaymentManagement: React.FC<MedoraPaymentManagementProps> = ({
  subscriptions = [],
  onSubscriptionsUpdated,
}) => {
  const { user, isAdmin } = useAuth();
  const { language, isRTL } = useLanguage();

  const [section, setSection] = useState<PaymentAdminSection>('pending');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [requests, setRequests] = useState<PaymentRequest[]>([]);
  const [transactions, setTransactions] = useState<SubscriptionTransaction[]>([]);
  const [settings, setSettings] = useState<PaymentSettings>(createDefaultPaymentSettings);
  const [settingsHistory, setSettingsHistory] = useState<PaymentSettingsHistoryEntry[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [methodFilter, setMethodFilter] = useState<'all' | ManualPaymentMethodId>('all');

  // Action Modals
  const [receiptModalReq, setReceiptModalReq] = useState<PaymentRequest | null>(null);
  const [approveConfirmReq, setApproveConfirmReq] = useState<PaymentRequest | null>(null);
  const [approveConfirmedCheckbox, setApproveConfirmedCheckbox] = useState(false);
  const [approveInternalNote, setApproveInternalNote] = useState('');

  const [rejectModalReq, setRejectModalReq] = useState<PaymentRequest | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [rejectInternalNote, setRejectInternalNote] = useState('');
  const [rejectConfirmStep, setRejectConfirmStep] = useState(false);

  const [noteModalReq, setNoteModalReq] = useState<PaymentRequest | null>(null);
  const [noteInput, setNoteInput] = useState('');

  // Settings form state
  const [settingsForm, setSettingsForm] = useState<{
    superqi: { walletNumber: string; isActive: boolean; instructionsAr: string; instructionsEn: string };
    zaincash: { walletNumber: string; isActive: boolean; instructionsAr: string; instructionsEn: string };
  }>(() => {
    const def = createDefaultPaymentSettings();
    return {
      superqi: {
        walletNumber: def.methods.superqi.walletNumber,
        isActive: def.methods.superqi.isActive,
        instructionsAr: def.methods.superqi.instructionsAr,
        instructionsEn: def.methods.superqi.instructionsEn,
      },
      zaincash: {
        walletNumber: def.methods.zaincash.walletNumber,
        isActive: def.methods.zaincash.isActive,
        instructionsAr: def.methods.zaincash.instructionsAr,
        instructionsEn: def.methods.zaincash.instructionsEn,
      },
    };
  });

  const [busyId, setBusyId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showNotice = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAllPaymentData = useCallback(async () => {
    try {
      const [reqs, txList, paySettings, hist] = await Promise.all([
        fetchAllPaymentRequestsForAdmin(),
        fetchSubscriptionTransactionsForAdmin(),
        fetchPaymentSettings(),
        fetchPaymentSettingsHistoryForAdmin(),
      ]);
      setRequests(reqs);
      setTransactions(txList);
      setSettings(paySettings);
      setSettingsHistory(hist);
      setSettingsForm({
        superqi: {
          walletNumber: paySettings.methods.superqi.walletNumber,
          isActive: paySettings.methods.superqi.isActive,
          instructionsAr: paySettings.methods.superqi.instructionsAr,
          instructionsEn: paySettings.methods.superqi.instructionsEn,
        },
        zaincash: {
          walletNumber: paySettings.methods.zaincash.walletNumber,
          isActive: paySettings.methods.zaincash.isActive,
          instructionsAr: paySettings.methods.zaincash.instructionsAr,
          instructionsEn: paySettings.methods.zaincash.instructionsEn,
        },
      });
    } catch (err: any) {
      console.error('[MedoraPaymentManagement] Failed loading data:', err);
      showNotice(err?.message || 'تعذر تحميل بيانات المدفوعات', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin && isVerifiedSuperAdmin(user)) {
      loadAllPaymentData();
    } else {
      setLoading(false);
    }
  }, [isAdmin, user, loadAllPaymentData]);

  const financialSummary = useMemo(
    () => computeFinancialSummary(requests, subscriptions),
    [requests, subscriptions]
  );

  const pendingRequests = useMemo(
    () => requests.filter((r) => r.status === 'pending' || r.status === 'under_review'),
    [requests]
  );
  const approvedRequests = useMemo(
    () => requests.filter((r) => r.status === 'approved'),
    [requests]
  );
  const rejectedRequests = useMemo(
    () => requests.filter((r) => r.status === 'rejected'),
    [requests]
  );

  const visibleRequests = useMemo(() => {
    const base =
      section === 'pending'
        ? pendingRequests
        : section === 'approved'
        ? approvedRequests
        : section === 'rejected'
        ? rejectedRequests
        : [];

    return base.filter((r) => {
      if (methodFilter !== 'all' && r.paymentMethod !== methodFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const fields = [
          r.requestNumber,
          r.customerName,
          r.institutionName,
          r.userEmail,
          r.planNameAr,
          r.planNameEn,
          r.transactionReference || '',
        ];
        return fields.some((f) => f.toLowerCase().includes(q));
      }
      return true;
    });
  }, [section, pendingRequests, approvedRequests, rejectedRequests, methodFilter, searchQuery]);

  if (!isAdmin || !isVerifiedSuperAdmin(user)) {
    return (
      <div className="bg-white rounded-3xl p-8 border border-rose-200 text-center space-y-3">
        <ShieldAlert className="w-12 h-12 text-rose-600 mx-auto" />
        <h3 className="text-lg font-black text-slate-900">MEDORA PAYMENT MANAGEMENT</h3>
        <p className="text-xs text-slate-600 max-w-md mx-auto">
          {language === 'ar'
            ? 'الوصول إلى لوحة الإدارة المالية مقيد حصراً بالمشرف العام المعتمد (bcgmoc@gmail.com).'
            : 'Financial payment management is restricted exclusively to the verified Super Admin (bcgmoc@gmail.com).'}
        </p>
      </div>
    );
  }

  const handleMarkUnderReview = async (req: PaymentRequest) => {
    setBusyId(req.id);
    try {
      await markPaymentUnderReviewByAdmin(req, user);
      showNotice(
        language === 'ar'
          ? `تم تحويل الطلب ${req.requestNumber} إلى قيد المراجعة وإشعار العميل`
          : `Moved ${req.requestNumber} to Under Review`
      );
      await loadAllPaymentData();
    } catch (err: any) {
      showNotice(err?.message || 'فشل تحديث الحالة', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveInternalNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteModalReq) return;
    setBusyId(noteModalReq.id);
    try {
      await addPaymentInternalNoteByAdmin(noteModalReq, noteInput, user);
      showNotice(language === 'ar' ? 'تم حفظ الملاحظة الداخلية بنجاح' : 'Internal note saved');
      setNoteModalReq(null);
      await loadAllPaymentData();
    } catch (err: any) {
      showNotice(err?.message || 'فشل حفظ الملاحظة', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleExecuteApprove = async () => {
    if (!approveConfirmReq || !approveConfirmedCheckbox) return;
    setBusyId(approveConfirmReq.id);
    try {
      const result = await approvePaymentRequestByAdmin(
        approveConfirmReq,
        user,
        approveInternalNote.trim() ? approveInternalNote : undefined
      );
      showNotice(
        language === 'ar'
          ? `تم اعتماد الدفع وتفعيل اشتراك ${approveConfirmReq.customerName} حتى ${result.endDate}`
          : `Approved payment & activated subscription through ${result.endDate}`
      );
      setApproveConfirmReq(null);
      setApproveConfirmedCheckbox(false);
      setApproveInternalNote('');
      await loadAllPaymentData();
      if (onSubscriptionsUpdated) onSubscriptionsUpdated();
    } catch (err: any) {
      showNotice(err?.message || 'تعذر اعتماد الدفع', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleExecuteReject = async () => {
    if (!rejectModalReq) return;
    if (rejectionReasonInput.trim().length < 3) {
      showNotice(
        language === 'ar' ? 'يرجى كتابة سبب واضح للرفض (3 أحرف على الأقل).' : 'Please enter a rejection reason (min 3 chars).',
        'error'
      );
      return;
    }
    setBusyId(rejectModalReq.id);
    try {
      await rejectPaymentRequestByAdmin(
        rejectModalReq,
        rejectionReasonInput,
        user,
        rejectInternalNote.trim() ? rejectInternalNote : undefined
      );
      showNotice(
        language === 'ar'
          ? `تم رفض الطلب ${rejectModalReq.requestNumber} وإشعار العميل بسبب الرفض`
          : `Rejected ${rejectModalReq.requestNumber} and notified customer`
      );
      setRejectModalReq(null);
      setRejectionReasonInput('');
      setRejectInternalNote('');
      setRejectConfirmStep(false);
      await loadAllPaymentData();
    } catch (err: any) {
      showNotice(err?.message || 'تعذر رفض الطلب', 'error');
    } finally {
      setBusyId(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const superqiCheck = validateWalletNumber(settingsForm.superqi.walletNumber);
    if (!superqiCheck.valid) {
      showNotice(superqiCheck.errorAr || 'رقم محفظة SuperQi غير صالح', 'error');
      return;
    }
    const zainCheck = validateWalletNumber(settingsForm.zaincash.walletNumber);
    if (!zainCheck.valid) {
      showNotice(zainCheck.errorAr || 'رقم محفظة ZainCash غير صالح', 'error');
      return;
    }

    setSavingSettings(true);
    try {
      await updatePaymentSettingsByAdmin(settingsForm, settings, user);
      showNotice(
        language === 'ar'
          ? 'تم تحديث إعدادات المحافظ الرسمية وتوثيق سجل التعديل بنجاح'
          : 'Official payment wallet settings updated and audited'
      );
      await loadAllPaymentData();
    } catch (err: any) {
      showNotice(err?.message || 'تعذر حفظ إعدادات الدفع', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  const renderStatusBadge = (status: PaymentRequest['status']) => {
    switch (status) {
      case 'approved':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
            {language === 'ar' ? 'معتمد ومفعل' : 'Approved'}
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
            {language === 'ar' ? 'مرفوض' : 'Rejected'}
          </span>
        );
      case 'under_review':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-200">
            {language === 'ar' ? 'قيد المراجعة' : 'Under Review'}
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
            {language === 'ar' ? 'قيد الانتظار' : 'Pending'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" dir={isRTL ? 'rtl' : 'ltr'}>
      {/* Toast Feedback */}
      {toast && (
        <div
          className={`p-4 rounded-2xl border text-xs font-bold flex items-center gap-2.5 shadow-md ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{toast.text}</span>
        </div>
      )}

      {/* Header Banner: MEDORA PAYMENT MANAGEMENT */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-[#002244] to-[#003366] text-white p-6 sm:p-7 shadow-xl border border-slate-700/60">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-black tracking-wide">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>MEDORA PAYMENT MANAGEMENT</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black tracking-tight">
              {language === 'ar'
                ? 'إدارة المدفوعات وتوثيق إيصالات الاشتراك'
                : 'MEDORA Financial & Receipt Verification Hub'}
            </h3>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              {language === 'ar'
                ? 'تدقيق تحويلات سوبر كي (SuperQi) وزين كاش (ZainCash)، اعتماد الإيصالات وتفعيل الاشتراكات ذرياً، ومراقبة الإيرادات الفعلية.'
                : 'Audit SuperQi and ZainCash manual wallet transfers, execute atomic subscription activations, and review confirmed MEDORA revenue.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setRefreshing(true);
              loadAllPaymentData();
            }}
            disabled={refreshing}
            className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-bold text-white flex items-center gap-2 self-start md:self-auto cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            <span>{language === 'ar' ? 'تحديث السجلات' : 'Refresh Ledger'}</span>
          </button>
        </div>

        {/* Summary Metrics Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mt-6">
          <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15">
            <span className="text-[10px] font-bold text-amber-300 block">
              {language === 'ar' ? 'طلبات بانتظار المراجعة' : 'Pending Review'}
            </span>
            <span className="text-xl font-black font-mono mt-0.5 block">
              {financialSummary.pendingCount + financialSummary.underReviewCount}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15">
            <span className="text-[10px] font-bold text-emerald-300 block">
              {language === 'ar' ? 'الإيرادات المؤكدة (المعتمدة فقط)' : 'Confirmed Revenue'}
            </span>
            <span className="text-lg font-black font-mono mt-0.5 block">
              {formatIqd(financialSummary.confirmedRevenueIqd, language)}
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15">
            <span className="text-[10px] font-bold text-sky-300 block">
              {language === 'ar' ? 'المدفوعات المعتمدة' : 'Approved Payments'}
            </span>
            <span className="text-xl font-black font-mono mt-0.5 block">{financialSummary.approvedCount}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15">
            <span className="text-[10px] font-bold text-rose-300 block">
              {language === 'ar' ? 'المدفوعات المرفوضة' : 'Rejected Payments'}
            </span>
            <span className="text-xl font-black font-mono mt-0.5 block">{financialSummary.rejectedCount}</span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/10 border border-white/15 col-span-2 lg:col-span-1">
            <span className="text-[10px] font-bold text-emerald-200 block">
              {language === 'ar' ? 'الاشتراكات النشطة' : 'Active Subscriptions'}
            </span>
            <span className="text-xl font-black font-mono mt-0.5 block">
              {financialSummary.activeSubscriptionsCount}
            </span>
          </div>
        </div>
      </div>

      {/* 5 Section Tabs (A - E) */}
      <div className="bg-white rounded-2xl p-2 border border-slate-200 shadow-xs flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setSection('pending')}
          className={`flex-1 min-w-[140px] py-2.5 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            section === 'pending' ? 'bg-[#003366] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>{language === 'ar' ? 'أ. الطلبات المعلقة' : 'A. Pending Requests'}</span>
          {pendingRequests.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-black">
              {pendingRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setSection('approved')}
          className={`flex-1 min-w-[140px] py-2.5 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            section === 'approved' ? 'bg-emerald-700 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>{language === 'ar' ? 'ب. المدفوعات المعتمدة' : 'B. Approved Payments'}</span>
          <span className="text-[10px] opacity-80">({approvedRequests.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSection('rejected')}
          className={`flex-1 min-w-[140px] py-2.5 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            section === 'rejected' ? 'bg-rose-700 text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <XCircle className="w-4 h-4" />
          <span>{language === 'ar' ? 'ج. المدفوعات المرفوضة' : 'C. Rejected Payments'}</span>
          <span className="text-[10px] opacity-80">({rejectedRequests.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setSection('reports')}
          className={`flex-1 min-w-[140px] py-2.5 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            section === 'reports' ? 'bg-[#003366] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <BarChart3 className="w-4 h-4" />
          <span>{language === 'ar' ? 'د. التقارير المالية' : 'D. Financial Reports'}</span>
        </button>

        <button
          type="button"
          onClick={() => setSection('settings')}
          className={`flex-1 min-w-[140px] py-2.5 px-3.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            section === 'settings' ? 'bg-[#003366] text-white shadow-xs' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>{language === 'ar' ? 'هـ. إعدادات الدفع' : 'E. Payment Settings'}</span>
        </button>
      </div>

      {/* Sections A, B, C: Payment Requests Management */}
      {(section === 'pending' || section === 'approved' || section === 'rejected') && (
        <div className="space-y-4">
          {/* Search & Method Filter */}
          <div className="bg-white rounded-2xl p-4 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'بحث برقم الطلب، اسم العميل، المؤسسة، الباقة أو رقم المرجع...'
                    : 'Search by request #, customer, institution, plan, or reference...'
                }
                className="w-full ps-9 pe-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-hidden focus:ring-2 focus:ring-[#003366]"
              />
            </div>

            <div className="flex items-center gap-1.5 text-xs font-bold">
              {(['all', 'superqi', 'zaincash'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethodFilter(m)}
                  className={`px-3 py-2 rounded-xl border cursor-pointer transition-colors ${
                    methodFilter === m
                      ? 'bg-[#003366] text-white border-[#003366]'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {m === 'all'
                    ? language === 'ar'
                      ? 'جميع الوسائل'
                      : 'All Methods'
                    : m === 'superqi'
                    ? 'سوبر كي (SuperQi)'
                    : 'زين كاش (ZainCash)'}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#003366] mx-auto mb-2" />
              <span className="text-xs font-bold text-slate-600">
                {language === 'ar' ? 'جاري تحميل طلبات الدفع...' : 'Loading payment requests...'}
              </span>
            </div>
          ) : visibleRequests.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 border border-slate-200 text-center space-y-2">
              <Wallet className="w-10 h-10 text-slate-300 mx-auto" />
              <h4 className="text-sm font-black text-slate-800">
                {language === 'ar' ? 'لا توجد طلبات في هذا القسم حالياً' : 'No payment requests in this section'}
              </h4>
            </div>
          ) : (
            <div className="space-y-4">
              {visibleRequests.map((req) => (
                <div
                  key={req.id}
                  className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4"
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                    {/* Request Details */}
                    <div className="flex-1 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-slate-100 text-[#003366]">
                          {req.requestNumber}
                        </span>
                        {renderStatusBadge(req.status)}
                        <span className="px-2.5 py-0.5 rounded-lg text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                          {req.paymentMethodName}
                        </span>
                        <span className="font-mono text-sm font-black text-emerald-700 ms-auto">
                          {formatIqd(req.amountIqd, language)}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold">
                            {language === 'ar' ? 'العميل' : 'Customer Name'}
                          </span>
                          <span className="font-bold text-slate-900">{req.customerName}</span>
                          <span className="block text-[10px] text-slate-500">{req.userEmail}</span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold">
                            {language === 'ar' ? 'المؤسسة / النوع' : 'Institution & Type'}
                          </span>
                          <span className="font-bold text-slate-900">{req.institutionName}</span>
                          <span className="block text-[10px] text-[#003366] font-bold">
                            {formatRoleLabel(req.institutionType, language)}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold">
                            {language === 'ar' ? 'باقة الاشتراك' : 'Subscription Plan'}
                          </span>
                          <span className="font-bold text-slate-900">
                            {language === 'ar' ? req.planNameAr : req.planNameEn}
                          </span>
                          <span className="block text-[10px] text-slate-500">
                            {language === 'ar'
                              ? `المتوقع: ${formatIqd(req.expectedAmountIqd, language)}`
                              : `Expected: ${formatIqd(req.expectedAmountIqd, language)}`}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold">
                            {language === 'ar' ? 'تاريخ التحويل' : 'Transfer Date'}
                          </span>
                          <span className="font-mono font-bold text-slate-800">{req.transferDate}</span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold">
                            {language === 'ar' ? 'رقم المرجع / المحفظة' : 'Reference / Wallet'}
                          </span>
                          <span className="font-mono font-bold text-slate-800">
                            {req.transactionReference || '—'}
                          </span>
                          <span className="block text-[10px] text-slate-500 font-mono">
                            → {req.receivingWalletNumber}
                          </span>
                        </div>

                        <div>
                          <span className="text-slate-400 block text-[10px] font-bold">
                            {language === 'ar' ? 'تاريخ التقديم' : 'Submitted At'}
                          </span>
                          <span className="font-mono text-slate-700">
                            {new Date(req.submittedAt).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {req.customerNote && (
                        <div className="text-xs bg-blue-50/70 border border-blue-200 rounded-xl p-2.5 text-blue-950">
                          <span className="font-black">
                            {language === 'ar' ? 'ملاحظة العميل: ' : 'Customer Note: '}
                          </span>
                          <span>{req.customerNote}</span>
                        </div>
                      )}

                      {req.internalNote && (
                        <div className="text-xs bg-amber-50/80 border border-amber-200 rounded-xl p-2.5 text-amber-950">
                          <span className="font-black">
                            {language === 'ar' ? 'ملاحظة إدارية داخلية: ' : 'Internal Admin Note: '}
                          </span>
                          <span>{req.internalNote}</span>
                        </div>
                      )}

                      {req.status === 'rejected' && req.rejectionReason && (
                        <div className="text-xs bg-rose-50 border border-rose-200 rounded-xl p-2.5 text-rose-950">
                          <span className="font-black">
                            {language === 'ar' ? 'سبب الرفض: ' : 'Rejection Reason: '}
                          </span>
                          <span>{req.rejectionReason}</span>
                        </div>
                      )}

                      {req.status === 'approved' && req.activatedSubscriptionEndDate && (
                        <div className="text-xs bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-emerald-950">
                          <span className="font-black">
                            {language === 'ar' ? 'فترة التفعيل: ' : 'Activated Period: '}
                          </span>
                          <span className="font-mono">
                            {req.activatedSubscriptionStartDate} → {req.activatedSubscriptionEndDate}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Receipt Thumbnail Preview */}
                    <div className="w-full lg:w-44 shrink-0 flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => setReceiptModalReq(req)}
                        className="group relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 h-32 w-full cursor-pointer"
                      >
                        {req.receiptUrl ? (
                          <img
                            src={req.receiptUrl}
                            alt={req.receiptFileName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <FileImage className="w-8 h-8" />
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-slate-900/75 text-white py-1 px-2 text-[10px] font-bold flex items-center justify-center gap-1">
                          <Eye className="w-3 h-3" />
                          <span>{language === 'ar' ? 'معاينة الإيصال' : 'View Receipt'}</span>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Action Buttons Bar */}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptModalReq(req)}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'عرض الإيصال' : 'View Receipt'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNoteModalReq(req);
                        setNoteInput(req.internalNote || '');
                      }}
                      className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      <span>{language === 'ar' ? 'ملاحظة داخلية' : 'Internal Note'}</span>
                    </button>

                    {req.status === 'pending' && (
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => handleMarkUnderReview(req)}
                        className="px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-900 border border-sky-200 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>{language === 'ar' ? 'قيد المراجعة' : 'Mark Under Review'}</span>
                      </button>
                    )}

                    {(req.status === 'pending' || req.status === 'under_review') && (
                      <>
                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => {
                            setApproveConfirmReq(req);
                            setApproveConfirmedCheckbox(false);
                            setApproveInternalNote(req.internalNote || '');
                          }}
                          className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50 ms-auto"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'اعتماد الدفع وتفعيل الاشتراك' : 'Approve Payment'}</span>
                        </button>

                        <button
                          type="button"
                          disabled={busyId === req.id}
                          onClick={() => {
                            setRejectModalReq(req);
                            setRejectionReasonInput('');
                            setRejectInternalNote(req.internalNote || '');
                            setRejectConfirmStep(false);
                          }}
                          className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold inline-flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{language === 'ar' ? 'رفض الطلب' : 'Reject Payment'}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section D: Financial Reports */}
      {section === 'reports' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-3xl p-5 border border-emerald-200 shadow-xs space-y-1">
              <span className="text-xs font-bold text-emerald-700 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4" />
                <span>{language === 'ar' ? 'إجمالي الإيرادات المؤكدة' : 'Total Confirmed Revenue'}</span>
              </span>
              <div className="text-2xl font-black font-mono text-slate-900">
                {formatIqd(financialSummary.confirmedRevenueIqd, language)}
              </div>
              <span className="text-[11px] text-slate-500 block">
                {language === 'ar'
                  ? 'يشمل حصراً المدفوعات المعتمدة والموثقة ولا يحسب الطلبات المعلقة أو المرفوضة.'
                  : 'Includes strictly verified & approved payments only.'}
              </span>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-amber-200 shadow-xs space-y-1">
              <span className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                <span>{language === 'ar' ? 'طلبات قيد الانتظار / المراجعة' : 'Pending Verification Total'}</span>
              </span>
              <div className="text-2xl font-black font-mono text-slate-900">
                {formatIqd(financialSummary.pendingAmountIqd, language)}
              </div>
              <span className="text-[11px] text-slate-500 block">
                {language === 'ar'
                  ? `${financialSummary.pendingCount + financialSummary.underReviewCount} طلب غير محتسب بالإيرادات`
                  : `${financialSummary.pendingCount + financialSummary.underReviewCount} unverified requests excluded from revenue`}
              </span>
            </div>

            <div className="bg-white rounded-3xl p-5 border border-rose-200 shadow-xs space-y-1">
              <span className="text-xs font-bold text-rose-700 flex items-center gap-1.5">
                <XCircle className="w-4 h-4" />
                <span>{language === 'ar' ? 'المدفوعات المرفوضة' : 'Rejected Requests Total'}</span>
              </span>
              <div className="text-2xl font-black font-mono text-slate-900">
                {formatIqd(financialSummary.rejectedAmountIqd, language)}
              </div>
              <span className="text-[11px] text-slate-500 block">
                {language === 'ar'
                  ? `${financialSummary.rejectedCount} طلب مرفوض`
                  : `${financialSummary.rejectedCount} rejected requests`}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Revenue by Method */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#003366]" />
                <span>{language === 'ar' ? 'توزيع الإيرادات حسب وسيلة الدفع' : 'Revenue by Payment Method'}</span>
              </h4>
              <div className="space-y-2.5">
                {(['superqi', 'zaincash'] as ManualPaymentMethodId[]).map((mId) => {
                  const row = financialSummary.revenueByMethod[mId];
                  const label = mId === 'superqi' ? 'سوبر كي (SuperQi)' : 'زين كاش (ZainCash)';
                  return (
                    <div key={mId} className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-xs text-slate-900">{label}</div>
                        <div className="text-[11px] text-slate-500">
                          {language === 'ar' ? `${row.count} عملية معتمدة` : `${row.count} approved transactions`}
                        </div>
                      </div>
                      <div className="font-mono font-black text-sm text-[#003366]">
                        {formatIqd(row.totalIqd, language)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Revenue by Plan */}
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
              <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#003366]" />
                <span>{language === 'ar' ? 'الإيرادات حسب باقة الاشتراك' : 'Revenue by Subscription Plan'}</span>
              </h4>
              {financialSummary.revenueByPlan.length === 0 ? (
                <p className="text-xs text-slate-500 py-6 text-center">
                  {language === 'ar' ? 'لا توجد دفعات معتمدة حتى الآن.' : 'No approved payments recorded yet.'}
                </p>
              ) : (
                <div className="space-y-2">
                  {financialSummary.revenueByPlan.map((p) => (
                    <div key={p.planId} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-xs text-slate-900">
                          {language === 'ar' ? p.planNameAr : p.planNameEn}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {language === 'ar' ? `${p.count} اشتراك مفعل` : `${p.count} activations`}
                        </div>
                      </div>
                      <div className="font-mono font-black text-sm text-emerald-700">
                        {formatIqd(p.totalIqd, language)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Verified Activation Ledger */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#003366]" />
              <span>
                {language === 'ar' ? 'سجل التفعيلات المالية الموثقة (MEDORA Ledger)' : 'Verified Subscription Activation History'}
              </span>
            </h4>
            {transactions.length === 0 ? (
              <p className="text-xs text-slate-500 py-6 text-center">
                {language === 'ar' ? 'لم يتم تسجيل أي معاملة تفعيل بعد.' : 'No activation transactions yet.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2 px-3 text-start">{language === 'ar' ? 'المؤسسة / العميل' : 'Institution / Customer'}</th>
                      <th className="py-2 px-3 text-start">{language === 'ar' ? 'الباقة' : 'Plan'}</th>
                      <th className="py-2 px-3 text-start">{language === 'ar' ? 'الوسيلة' : 'Method'}</th>
                      <th className="py-2 px-3 text-start">{language === 'ar' ? 'المبلغ' : 'Amount'}</th>
                      <th className="py-2 px-3 text-start">{language === 'ar' ? 'صلاحية الاشتراك' : 'Subscription Period'}</th>
                      <th className="py-2 px-3 text-start">{language === 'ar' ? 'تاريخ الاعتماد' : 'Approved At'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{tx.institutionName}</div>
                          <div className="text-[10px] text-slate-500">{tx.customerName}</div>
                        </td>
                        <td className="py-2.5 px-3 font-semibold">{language === 'ar' ? tx.planNameAr : tx.planNameEn}</td>
                        <td className="py-2.5 px-3 font-bold text-indigo-700">
                          {tx.paymentMethod === 'superqi' ? 'SuperQi' : 'ZainCash'}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-black text-emerald-700">
                          {formatIqd(tx.amountIqd, language)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-[11px]">
                          {tx.subscriptionStartDate} → {tx.subscriptionEndDate}
                        </td>
                        <td className="py-2.5 px-3 text-[11px] text-slate-500">
                          {new Date(tx.approvedAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Section E: Payment Settings */}
      {section === 'settings' && (
        <div className="space-y-5">
          <form onSubmit={handleSaveSettings} className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
              <div>
                <h4 className="text-base font-black text-slate-900">
                  {language === 'ar' ? 'إعدادات محافظ الاستلام الرسمية (MEDORA)' : 'Official Receiving Wallet Settings'}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  {language === 'ar'
                    ? 'يدير المشرف العام رقم المحفظة وحالة التفعيل وتعليمات التحويل لكل من سوبر كي وزين كاش فقط.'
                    : 'Manage wallet numbers, active status, and transfer instructions strictly for SuperQi and ZainCash.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {(['superqi', 'zaincash'] as ManualPaymentMethodId[]).map((mId) => {
                const label = mId === 'superqi' ? 'سوبر كي (SuperQi)' : 'زين كاش (ZainCash)';
                const entry = settingsForm[mId];
                return (
                  <div key={mId} className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-black text-sm text-slate-900">{label}</span>
                      <label className="inline-flex items-center gap-2 text-xs font-bold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={entry.isActive}
                          onChange={(e) =>
                            setSettingsForm((prev) => ({
                              ...prev,
                              [mId]: { ...prev[mId], isActive: e.target.checked },
                            }))
                          }
                          className="w-4 h-4 accent-[#003366]"
                        />
                        <span className={entry.isActive ? 'text-emerald-700' : 'text-slate-500'}>
                          {entry.isActive
                            ? language === 'ar'
                              ? 'مفعلة'
                              : 'Active'
                            : language === 'ar'
                            ? 'معطلة'
                            : 'Disabled'}
                        </span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {language === 'ar' ? 'رقم المحفظة المستلمة (أرقام فقط) *' : 'Receiving Wallet Number *'}
                      </label>
                      <input
                        type="text"
                        required
                        value={entry.walletNumber}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            [mId]: { ...prev[mId], walletNumber: e.target.value.trim() },
                          }))
                        }
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 font-mono text-sm font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#003366]"
                        dir="ltr"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {language === 'ar' ? 'تعليمات التحويل (بالعربية)' : 'Transfer Instructions (Arabic)'}
                      </label>
                      <textarea
                        rows={3}
                        value={entry.instructionsAr}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            [mId]: { ...prev[mId], instructionsAr: e.target.value },
                          }))
                        }
                        className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#003366]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {language === 'ar' ? 'تعليمات التحويل (بالإنجليزية)' : 'Transfer Instructions (English)'}
                      </label>
                      <textarea
                        rows={2}
                        value={entry.instructionsEn}
                        onChange={(e) =>
                          setSettingsForm((prev) => ({
                            ...prev,
                            [mId]: { ...prev[mId], instructionsEn: e.target.value },
                          }))
                        }
                        className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-[#003366]"
                        dir="ltr"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingSettings}
                className="px-6 py-2.5 rounded-xl bg-[#003366] hover:bg-[#002244] text-white font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                <span>{language === 'ar' ? 'حفظ وتوثيق إعدادات الدفع' : 'Save & Audit Payment Settings'}</span>
              </button>
            </div>
          </form>

          {/* Settings Modification History */}
          <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
            <h4 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-[#003366]" />
              <span>{language === 'ar' ? 'سجل تعديلات إعدادات الدفع' : 'Payment Settings Modification History'}</span>
            </h4>
            {settingsHistory.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">
                {language === 'ar' ? 'لا توجد تعديلات مسجلة بعد.' : 'No modifications logged yet.'}
              </p>
            ) : (
              <div className="space-y-2">
                {settingsHistory.map((h) => (
                  <div key={h.id} className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-black text-[#003366] uppercase">{h.methodId}</span>
                      <span className="mx-2 text-slate-400">·</span>
                      <span className="font-mono">
                        {h.previousWalletNumber} → <strong>{h.newWalletNumber}</strong>
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {h.updatedByEmail} · {new Date(h.updatedAt).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL 1: Receipt Viewer Lightbox (Images & PDFs) */}
      {receiptModalReq && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-2">
              <div className="text-xs font-bold flex items-center gap-2 min-w-0">
                <FileImage className="w-4 h-4 text-sky-300 shrink-0" />
                <span className="truncate">
                  {receiptModalReq.requestNumber} — {receiptModalReq.customerName} (
                  {formatIqd(receiptModalReq.amountIqd, language)})
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={receiptModalReq.receiptUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold inline-flex items-center gap-1"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{language === 'ar' ? 'فتح / تحميل' : 'Open / Download'}</span>
                </a>
                <button
                  type="button"
                  onClick={() => setReceiptModalReq(null)}
                  className="p-1 rounded-full hover:bg-white/15 text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-5 bg-slate-100 flex items-center justify-center max-h-[65vh] overflow-auto">
              {receiptModalReq.receiptMimeType === 'application/pdf' ||
              receiptModalReq.receiptFileName?.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  title={receiptModalReq.receiptFileName || 'Payment Receipt PDF'}
                  src={receiptModalReq.receiptUrl}
                  className="w-full h-[55vh] rounded-xl bg-white border border-slate-200 shadow-sm"
                />
              ) : (
                <img
                  src={receiptModalReq.receiptUrl}
                  alt={receiptModalReq.receiptFileName}
                  className="max-w-full max-h-[55vh] rounded-xl shadow-md object-contain"
                />
              )}
            </div>
            <div className="p-4 bg-white border-t border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2 text-slate-600">
              <span>
                {receiptModalReq.paymentMethodName} · {receiptModalReq.transferDate}
              </span>
              <span className="font-mono">
                {receiptModalReq.transactionReference || receiptModalReq.receiptFileName}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: Approve Payment Confirmation */}
      {approveConfirmReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-emerald-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900">
                  {language === 'ar' ? 'تأكيد اعتماد الدفع وتفعيل الاشتراك' : 'Confirm Payment Approval & Activation'}
                </h4>
                <span className="text-xs font-mono text-emerald-700 font-bold">
                  {approveConfirmReq.requestNumber}
                </span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div>
                <strong>{language === 'ar' ? 'العميل / المؤسسة: ' : 'Customer: '}</strong>
                {approveConfirmReq.customerName} ({approveConfirmReq.institutionName})
              </div>
              <div>
                <strong>{language === 'ar' ? 'الباقة: ' : 'Plan: '}</strong>
                {language === 'ar' ? approveConfirmReq.planNameAr : approveConfirmReq.planNameEn}
              </div>
              <div>
                <strong>{language === 'ar' ? 'المبلغ المحوّل: ' : 'Amount: '}</strong>
                {formatIqd(approveConfirmReq.amountIqd, language)} ({approveConfirmReq.paymentMethodName})
              </div>
            </div>

            <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 cursor-pointer">
              <input
                type="checkbox"
                checked={approveConfirmedCheckbox}
                onChange={(e) => setApproveConfirmedCheckbox(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-emerald-600"
              />
              <span className="font-bold leading-relaxed">
                {language === 'ar'
                  ? 'أؤكد أنني قمت بمراجعة صورة الإيصال والتحقق يدوياً من استلام المبلغ الفعلي في المحفظة الرسمية.'
                  : 'I confirm that I have inspected the receipt and manually verified actual funds arrival in the official wallet.'}
              </span>
            </label>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'ar' ? 'ملاحظة إدارية داخلية (اختياري)' : 'Internal Note (Optional)'}
              </label>
              <input
                type="text"
                value={approveInternalNote}
                onChange={(e) => setApproveInternalNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={busyId === approveConfirmReq.id}
                onClick={() => setApproveConfirmReq(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={!approveConfirmedCheckbox || busyId === approveConfirmReq.id}
                onClick={handleExecuteApprove}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {busyId === approveConfirmReq.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>{language === 'ar' ? 'تأكيد الاعتماد والتفعيل' : 'Approve & Activate'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: Reject Payment with Required Reason & Confirmation */}
      {rejectModalReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-rose-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <XCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900">
                  {language === 'ar' ? 'رفض طلب الدفع' : 'Reject Payment Request'}
                </h4>
                <span className="text-xs font-mono text-rose-700 font-bold">{rejectModalReq.requestNumber}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'ar' ? 'سبب الرفض (إلزامي — سيظهر للعميل) *' : 'Rejection Reason (Required — Shown to Customer) *'}
              </label>
              <textarea
                rows={3}
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                placeholder={
                  language === 'ar'
                    ? 'مثال: صورة الإيصال غير واضحة / لم يظهر المبلغ في المحفظة...'
                    : 'e.g. Receipt image unclear or transfer not found...'
                }
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-hidden focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                {language === 'ar' ? 'ملاحظة داخلية (اختياري)' : 'Internal Admin Note (Optional)'}
              </label>
              <input
                type="text"
                value={rejectInternalNote}
                onChange={(e) => setRejectInternalNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
              />
            </div>

            {rejectConfirmStep && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>
                  {language === 'ar'
                    ? 'تأكيد نهائي: سيتم إغلاق الطلب كمرفوض مع الاحتفاظ بصورة الإيصال في السجل وإشعار العميل.'
                    : 'Final confirmation: Request will be marked rejected, receipt preserved, and customer notified.'}
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={busyId === rejectModalReq.id}
                onClick={() => setRejectModalReq(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء' : 'Cancel'}
              </button>
              {!rejectConfirmStep ? (
                <button
                  type="button"
                  disabled={rejectionReasonInput.trim().length < 3}
                  onClick={() => setRejectConfirmStep(true)}
                  className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {language === 'ar' ? 'متابعة للرفض' : 'Continue to Reject'}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busyId === rejectModalReq.id}
                  onClick={handleExecuteReject}
                  className="px-5 py-2 rounded-xl bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {busyId === rejectModalReq.id && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{language === 'ar' ? 'تأكيد رفض الطلب' : 'Confirm Rejection'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Internal Note Editor */}
      {noteModalReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form onSubmit={handleSaveInternalNote} className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-base font-black text-slate-900">
                {language === 'ar' ? 'ملاحظة إدارية داخلية' : 'Internal Administrative Note'}
              </h4>
              <button
                type="button"
                onClick={() => setNoteModalReq(null)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-500 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              rows={3}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder={language === 'ar' ? 'اكتب ملاحظة للتدقيق المالي الداخلي...' : 'Enter internal audit note...'}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setNoteModalReq(null)}
                className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
              <button
                type="submit"
                disabled={busyId === noteModalReq.id}
                className="px-5 py-2 rounded-xl bg-[#003366] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {language === 'ar' ? 'حفظ الملاحظة' : 'Save Note'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
