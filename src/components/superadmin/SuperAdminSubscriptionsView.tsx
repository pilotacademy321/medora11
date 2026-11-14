import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  Edit3,
  Eye,
  History,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import {
  PaymentRequest,
  SubscriptionPlan,
  SubscriptionTransaction,
  UserProfile,
  UserRole,
  UserSubscription,
} from '../../types';
import { isRoleSuspended } from '../../config/portalsConfig';
import { db } from '../../lib/firebase';
import {
  calculateSubscriptionDates,
  formatIqd,
  formatRoleLabel,
} from '../../utils/subscriptionPaymentEngine';
import {
  ClassifiedSubscription,
  filterAndSortSubscriptions,
  SubscriptionFilterTab,
  summarizeSubscriptionsForHome,
} from '../../utils/superAdminDashboardEngine';
import { AdminThemeMode, getAdminPalette } from './adminTheme';

interface SuperAdminSubscriptionsViewProps {
  language: 'ar' | 'en';
  theme: AdminThemeMode;
  subscriptionPlans: SubscriptionPlan[];
  userSubscriptions: UserSubscription[];
  paymentRequests: PaymentRequest[];
  loading: boolean;
  refreshing: boolean;
  onLoadPlansAndPayments: () => Promise<void>;
  onRefresh: () => void;
  onOpenCreatePlan: () => void;
  onOpenEditPlan: (plan: SubscriptionPlan) => void;
  onTogglePlanActive: (plan: SubscriptionPlan) => void;
  onDeletePlan: (planId: string) => void;
  onPreviewPlanCheckout: (plan: SubscriptionPlan) => void;
  onOpenAssignModal: (preselectedUser?: UserProfile) => void;
  onOpenQuickEditPrice: (sub: UserSubscription) => void;
  onToggleSubStatus: (sub: UserSubscription, nextStatus: 'active' | 'pending' | 'expired' | 'cancelled') => Promise<void>;
  onRenewSubscription: (
    sub: UserSubscription,
    params: { billingPeriod: SubscriptionPlan['billingPeriod']; customPriceIqd: number; notes?: string }
  ) => Promise<void>;
  onDeleteSubscription: (subId: string) => void;
}

export const SuperAdminSubscriptionsView: React.FC<SuperAdminSubscriptionsViewProps> = ({
  language,
  theme,
  subscriptionPlans,
  userSubscriptions,
  paymentRequests,
  loading,
  refreshing,
  onLoadPlansAndPayments,
  onRefresh,
  onOpenCreatePlan,
  onOpenEditPlan,
  onTogglePlanActive,
  onDeletePlan,
  onPreviewPlanCheckout,
  onOpenAssignModal,
  onOpenQuickEditPrice,
  onToggleSubStatus,
  onRenewSubscription,
  onDeleteSubscription,
}) => {
  const p = getAdminPalette(theme);

  const [subTab, setSubTab] = useState<SubscriptionFilterTab>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'end_asc' | 'end_desc'>('end_asc');

  // Modals: Details, Renew, History
  const [detailsItem, setDetailsItem] = useState<ClassifiedSubscription | null>(null);
  const [renewItem, setRenewItem] = useState<ClassifiedSubscription | null>(null);
  const [renewPeriod, setRenewPeriod] = useState<SubscriptionPlan['billingPeriod']>('monthly');
  const [renewPriceIqd, setRenewPriceIqd] = useState<number>(25000);
  const [renewNotes, setRenewNotes] = useState('');
  const [renewingBusy, setRenewingBusy] = useState(false);

  const [historySub, setHistorySub] = useState<UserSubscription | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyTransactions, setHistoryTransactions] = useState<SubscriptionTransaction[]>([]);
  const [historyPaymentReqs, setHistoryPaymentReqs] = useState<PaymentRequest[]>([]);

  useEffect(() => {
    onLoadPlansAndPayments().catch(() => {});
  }, [onLoadPlansAndPayments]);

  const summary = useMemo(
    () => summarizeSubscriptionsForHome(userSubscriptions, paymentRequests),
    [userSubscriptions, paymentRequests]
  );

  const visibleSubscriptions = useMemo(
    () =>
      filterAndSortSubscriptions({
        subscriptions: userSubscriptions,
        paymentRequests,
        tab: subTab,
        roleFilter,
        searchQuery,
        sortOrder,
      }),
    [userSubscriptions, paymentRequests, subTab, roleFilter, searchQuery, sortOrder]
  );

  const openRenewModal = (item: ClassifiedSubscription) => {
    setRenewItem(item);
    setRenewPeriod(item.subscription.billingPeriod || 'monthly');
    setRenewPriceIqd(item.subscription.customPriceIqd || 25000);
    setRenewNotes('');
  };

  const handleConfirmRenew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewItem) return;
    setRenewingBusy(true);
    try {
      await onRenewSubscription(renewItem.subscription, {
        billingPeriod: renewPeriod,
        customPriceIqd: Number(renewPriceIqd),
        notes: renewNotes.trim() || undefined,
      });
      setRenewItem(null);
    } finally {
      setRenewingBusy(false);
    }
  };

  const openHistoryModal = async (sub: UserSubscription) => {
    setHistorySub(sub);
    setHistoryLoading(true);
    setHistoryTransactions([]);
    setHistoryPaymentReqs([]);
    try {
      const [txSnap, reqSnap] = await Promise.all([
        getDocs(query(collection(db, 'subscription_transactions'), where('userId', '==', sub.userId))),
        getDocs(query(collection(db, 'payment_requests'), where('userId', '==', sub.userId))),
      ]);
      const txs = txSnap.docs.map((d) => d.data() as SubscriptionTransaction);
      txs.sort((a, b) => new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime());
      const reqs = reqSnap.docs.map((d) => d.data() as PaymentRequest);
      reqs.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
      setHistoryTransactions(txs);
      setHistoryPaymentReqs(reqs);
    } catch {
      // Fallback to already-loaded paymentRequests for that user
      setHistoryPaymentReqs(paymentRequests.filter((r) => r.userId === sub.userId));
    } finally {
      setHistoryLoading(false);
    }
  };

  const getStateBadge = (item: ClassifiedSubscription) => {
    switch (item.computedState) {
      case 'active':
        return {
          ar: 'نشط',
          en: 'Active',
          cls: theme === 'dark' ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50' : 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'nearing_expiration':
        return {
          ar: `ينتهي خلال ${item.daysRemaining ?? 0} أيام`,
          en: `Expiring (${item.daysRemaining ?? 0}d)`,
          cls: theme === 'dark' ? 'bg-amber-950/60 text-amber-300 border-amber-700/50' : 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'expired':
        return {
          ar: 'منتهي الصلاحية',
          en: 'Expired',
          cls: theme === 'dark' ? 'bg-rose-950/60 text-rose-300 border-rose-700/50' : 'bg-rose-50 text-rose-800 border-rose-200',
        };
      case 'pending':
        return {
          ar: 'معلق / قيد التفعيل',
          en: 'Pending',
          cls: theme === 'dark' ? 'bg-sky-950/60 text-sky-300 border-sky-700/50' : 'bg-sky-50 text-sky-800 border-sky-200',
        };
      default:
        return {
          ar: 'ملغى',
          en: 'Cancelled',
          cls: theme === 'dark' ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200',
        };
    }
  };

  const formatPeriodLabel = (period?: SubscriptionPlan['billingPeriod']) => {
    if (period === 'yearly') return language === 'ar' ? 'سنوي' : 'Yearly';
    if (period === 'quarterly') return language === 'ar' ? 'ربع سنوي' : 'Quarterly';
    if (period === 'custom') return language === 'ar' ? 'مخصص' : 'Custom';
    return language === 'ar' ? 'شهري' : 'Monthly';
  };

  const previewRenewDates = renewItem
    ? calculateSubscriptionDates({
        billingPeriod: renewPeriod,
        existingSubscription: renewItem.subscription,
      })
    : null;

  return (
    <div className="space-y-6">
      {/* Header & KPI Bar */}
      <div className={`rounded-2xl p-5 sm:p-6 border space-y-5 ${p.cardBg} ${p.cardBorder}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className={`text-lg font-black flex items-center gap-2 ${p.textPrimary}`}>
              <Building2 size={20} className="text-[#C8A24A]" />
              <span>{language === 'ar' ? 'إدارة الاشتراكات والعيادات والباقات' : 'Subscriptions, Clinics & Plans'}</span>
            </h2>
            <p className={`text-xs mt-1 ${p.textMuted}`}>
              {language === 'ar'
                ? 'متابعة اشتراكات الأطباء والمختبرات والمنشآت، تواريخ الانتهاء الفعلية، التجديد، وتحديد أسعار الباقات بالدينار العراقي'
                : 'Monitor clinic subscriptions, real expiration dates, renewals, and dynamic IQD pricing tiers'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onOpenCreatePlan}
              className={`px-3.5 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer ${p.primaryBtn}`}
            >
              <Plus size={14} />
              <span>{language === 'ar' ? 'إضافة باقة' : 'New Plan'}</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenAssignModal()}
              className="px-3.5 py-2.5 rounded-xl bg-[#C8A24A] hover:bg-[#B89238] text-[#071426] font-black text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles size={14} />
              <span>{language === 'ar' ? 'تخصيص اشتراك' : 'Assign Subscription'}</span>
            </button>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className={`px-3 py-2.5 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer ${p.secondaryBtn}`}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className={`rounded-xl p-3.5 border ${p.cardMutedBg} ${p.cardBorder}`}>
            <span className={`text-[11px] font-bold block mb-1 ${p.textMuted}`}>
              {language === 'ar' ? 'جميع الاشتراكات' : 'All Records'}
            </span>
            <span className={`text-xl font-black tabular-nums ${p.textPrimary}`}>{userSubscriptions.length}</span>
          </div>
          <div className={`rounded-xl p-3.5 border ${p.cardMutedBg} ${p.cardBorder}`}>
            <span className="text-[11px] font-bold text-emerald-500 block mb-1">
              {language === 'ar' ? 'الاشتراكات النشطة' : 'Active'}
            </span>
            <span className={`text-xl font-black tabular-nums ${p.textPrimary}`}>{summary.activeCount}</span>
          </div>
          <div className={`rounded-xl p-3.5 border ${p.cardMutedBg} ${p.cardBorder}`}>
            <span className="text-[11px] font-bold text-amber-500 block mb-1">
              {language === 'ar' ? 'قريبة الانتهاء (≤ 7 أيام)' : 'Expiring ≤ 7d'}
            </span>
            <span className={`text-xl font-black tabular-nums ${p.textPrimary}`}>{summary.nearingExpirationCount}</span>
          </div>
          <div className={`rounded-xl p-3.5 border ${p.cardMutedBg} ${p.cardBorder}`}>
            <span className="text-[11px] font-bold text-rose-500 block mb-1">
              {language === 'ar' ? 'منتهية الصلاحية' : 'Expired'}
            </span>
            <span className={`text-xl font-black tabular-nums ${p.textPrimary}`}>{summary.expiredCount}</span>
          </div>
          <div className={`rounded-xl p-3.5 border ${p.cardMutedBg} ${p.cardBorder}`}>
            <span className="text-[11px] font-bold text-[#0284C7] block mb-1">
              {language === 'ar' ? 'تنتظر التجديد' : 'Awaiting Renewal'}
            </span>
            <span className={`text-xl font-black tabular-nums ${p.textPrimary}`}>{summary.awaitingRenewalCount}</span>
          </div>
        </div>
      </div>

      {/* SECTION 1: PROVIDER SUBSCRIPTIONS REGISTRY */}
      <div className={`rounded-2xl p-5 sm:p-6 border space-y-4 ${p.cardBg} ${p.cardBorder}`}>
        {/* Status Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {(
            [
              { id: 'all', ar: 'جميع الاشتراكات', en: 'All' },
              { id: 'active', ar: 'الاشتراكات النشطة', en: 'Active' },
              { id: 'nearing_expiration', ar: 'القريبة من الانتهاء', en: 'Expiring Soon' },
              { id: 'expired', ar: 'الاشتراكات المنتهية', en: 'Expired' },
              { id: 'pending', ar: 'المعلقة', en: 'Pending' },
              { id: 'awaiting_renewal', ar: 'تنتظر التجديد', en: 'Awaiting Renewal' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSubTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                subTab === t.id
                  ? 'bg-[#0B1F3A] text-white border border-[#C8A24A]/40'
                  : `${p.cardMutedBg} ${p.textSecondary} hover:opacity-80`
              }`}
            >
              {language === 'ar' ? t.ar : t.en}
            </button>
          ))}
        </div>

        {/* Search, Role Filter & Sort */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
          <div className="md:col-span-6 relative">
            <Search size={15} className={`absolute top-1/2 -translate-y-1/2 start-3.5 ${p.textMuted}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === 'ar'
                  ? 'بحث باسم الطبيب، العيادة، البريد، أو اسم الباقة...'
                  : 'Search doctor, clinic, email, or plan...'
              }
              className={`w-full ps-10 pe-4 py-2.5 rounded-xl border text-xs ${p.inputBg}`}
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className={`w-full px-3 py-2.5 rounded-xl border text-xs ${p.inputBg}`}
            >
              <option value="all">{language === 'ar' ? 'جميع أنواع الحسابات' : 'All Account Types'}</option>
              {(['doctor', 'laboratory', 'pharmacy', 'radiology_center', 'wholesaler'] as UserRole[])
                .filter((r) => !isRoleSuspended(r))
                .map((r) => (
                  <option key={r} value={r}>
                    {formatRoleLabel(r, language)}
                  </option>
                ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'end_asc' ? 'end_desc' : 'end_asc'))}
              className={`w-full px-3 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer ${p.secondaryBtn}`}
            >
              <ArrowUpDown size={14} />
              <span>
                {sortOrder === 'end_asc'
                  ? language === 'ar'
                    ? 'ترتيب: الأقرب انتهاءً'
                    : 'Sort: Earliest Expiry'
                  : language === 'ar'
                  ? 'ترتيب: الأبعد انتهاءً'
                  : 'Sort: Latest Expiry'}
              </span>
            </button>
          </div>
        </div>

        {/* Subscriptions Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead>
              <tr className={`border-b font-bold uppercase tracking-wider ${p.tableHeaderBg}`}>
                <th className="py-3.5 px-3">{language === 'ar' ? 'الطبيب / المؤسسة' : 'Provider / Clinic'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'نوع الحساب' : 'Role'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'الباقة والنوع' : 'Plan'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'تاريخ البداية' : 'Start Date'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'السعر' : 'Price'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'آخر تجديد' : 'Last Renewal'}</th>
                <th className="py-3.5 px-3 text-end">{language === 'ar' ? 'الإجراءات' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${p.tableDivider}`}>
              {visibleSubscriptions.length === 0 ? (
                <tr>
                  <td colSpan={9} className={`py-12 text-center ${p.textMuted}`}>
                    {loading
                      ? language === 'ar'
                        ? 'جارٍ تحميل سجلات الاشتراكات...'
                        : 'Loading subscriptions...'
                      : language === 'ar'
                      ? 'لا توجد اشتراكات مطابقة للفلتر المحدد.'
                      : 'No subscriptions match current filter.'}
                  </td>
                </tr>
              ) : (
                visibleSubscriptions.map((item) => {
                  const sub = item.subscription;
                  const badge = getStateBadge(item);
                  return (
                    <tr key={sub.id} className={`transition-colors ${p.tableRowHover}`}>
                      <td className="py-3 px-3">
                        <div className={`font-extrabold ${p.textPrimary}`}>{sub.userName}</div>
                        <div className={`text-[11px] ${p.textMuted}`}>{sub.facilityName || sub.userEmail}</div>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${p.accentGoldBadge}`}>
                          {formatRoleLabel(sub.userRole, language)}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className={`font-bold ${p.textPrimary}`}>{sub.planName}</div>
                        <span className={`text-[10px] ${p.textMuted}`}>{formatPeriodLabel(sub.billingPeriod)}</span>
                      </td>

                      <td className={`py-3 px-3 font-mono tabular-nums whitespace-nowrap ${p.textSecondary}`}>
                        {sub.startDate ? String(sub.startDate).split('T')[0] : '—'}
                      </td>

                      <td className={`py-3 px-3 font-mono tabular-nums whitespace-nowrap font-bold ${p.textPrimary}`}>
                        {sub.endDate ? String(sub.endDate).split('T')[0] : '—'}
                      </td>

                      <td className="py-3 px-3 font-mono tabular-nums whitespace-nowrap">
                        <span className={`font-black ${p.textPrimary}`}>{formatIqd(sub.customPriceIqd, language)}</span>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border ${badge.cls}`}>
                          {language === 'ar' ? badge.ar : badge.en}
                        </span>
                        {item.hasPendingRenewalPayment && (
                          <span className="block text-[10px] text-[#0284C7] font-bold mt-0.5">
                            {language === 'ar' ? '+ طلب دفع جديد' : '+ Pending receipt'}
                          </span>
                        )}
                      </td>

                      <td className={`py-3 px-3 font-mono tabular-nums whitespace-nowrap text-[11px] ${p.textMuted}`}>
                        {item.lastRenewalDate
                          ? new Date(item.lastRenewalDate).toLocaleDateString(language === 'ar' ? 'ar-IQ' : 'en-US')
                          : '—'}
                      </td>

                      <td className="py-3 px-3">
                        <div className="flex items-center justify-end gap-1 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setDetailsItem(item)}
                            className={`p-1.5 rounded-lg cursor-pointer ${p.secondaryBtn}`}
                            title={language === 'ar' ? 'عرض التفاصيل' : 'View Details'}
                          >
                            <Eye size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => openRenewModal(item)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] cursor-pointer"
                          >
                            {language === 'ar' ? 'تجديد' : 'Renew'}
                          </button>

                          <button
                            type="button"
                            onClick={() => openHistoryModal(sub)}
                            className={`p-1.5 rounded-lg cursor-pointer ${p.secondaryBtn}`}
                            title={language === 'ar' ? 'السجل السابق' : 'Previous History'}
                          >
                            <History size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => onOpenQuickEditPrice(sub)}
                            className={`p-1.5 rounded-lg cursor-pointer ${p.secondaryBtn}`}
                            title={language === 'ar' ? 'تعديل السعر' : 'Edit Price'}
                          >
                            <Edit3 size={13} />
                          </button>

                          <button
                            type="button"
                            onClick={() => onDeleteSubscription(sub.id)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 cursor-pointer"
                            title={language === 'ar' ? 'حذف السجل' : 'Delete'}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: SUBSCRIPTION PLANS & IQD PRICING */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className={`text-base font-black flex items-center gap-2 ${p.textPrimary}`}>
            <DollarSign size={18} className="text-[#C8A24A]" />
            <span>{language === 'ar' ? 'باقات الاشتراك الرسمية وأسعارها بالدينار العراقي' : 'Official Subscription Plans & IQD Pricing'}</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {subscriptionPlans.map((plan) => (
            <div
              key={plan.id}
              className={`rounded-2xl p-5 border flex flex-col justify-between transition-all ${
                plan.isPopular ? 'border-[#C8A24A]' : p.cardBorder
              } ${p.cardBg} ${plan.isActive === false ? 'opacity-70' : ''}`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <span className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${p.accentGoldBadge}`}>
                    {plan.targetRole === 'all'
                      ? language === 'ar'
                        ? 'كافة المنشآت'
                        : 'All Roles'
                      : formatRoleLabel(plan.targetRole, language)}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-lg ${
                      plan.isActive !== false
                        ? 'bg-emerald-500/15 text-emerald-500'
                        : 'bg-slate-500/15 text-slate-400'
                    }`}
                  >
                    {plan.isActive !== false
                      ? language === 'ar'
                        ? 'مفعلة'
                        : 'Active'
                      : language === 'ar'
                      ? 'معطلة'
                      : 'Disabled'}
                  </span>
                </div>

                <h4 className={`text-base font-black mb-1 ${p.textPrimary}`}>
                  {language === 'ar' ? plan.nameAr : plan.nameEn}
                </h4>
                <p className={`text-xs mb-4 leading-relaxed ${p.textMuted}`}>
                  {language === 'ar' ? plan.descriptionAr : plan.descriptionEn || plan.descriptionAr}
                </p>

                <div className={`p-3.5 rounded-xl border mb-4 ${p.cardMutedBg} ${p.cardBorder}`}>
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-2xl font-black font-mono tabular-nums ${p.textPrimary}`}>
                      {plan.priceIqd.toLocaleString()}
                    </span>
                    <span className={`text-xs font-bold ${p.textSecondary}`}>
                      {language === 'ar' ? 'د.ع' : 'IQD'}
                    </span>
                    <span className={`text-[11px] ${p.textMuted}`}>
                      / {formatPeriodLabel(plan.billingPeriod)}
                    </span>
                  </div>
                </div>

                <ul className={`text-xs space-y-1.5 mb-5 ${p.textSecondary}`}>
                  {(plan.featuresAr || []).map((feat, idx) => (
                    <li key={idx} className="flex items-start gap-2">
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className={`pt-3 border-t flex items-center justify-between gap-2 ${p.cardBorder}`}>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onOpenEditPlan(plan)}
                    className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 cursor-pointer ${p.secondaryBtn}`}
                  >
                    <Edit3 size={12} />
                    <span>{language === 'ar' ? 'تعديل' : 'Edit'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreviewPlanCheckout(plan)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-500 font-bold text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <CreditCard size={12} />
                    <span>{language === 'ar' ? 'معاينة الدفع' : 'Checkout'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onTogglePlanActive(plan)}
                    className={`p-1.5 rounded-lg cursor-pointer ${p.secondaryBtn}`}
                    title={language === 'ar' ? 'تبديل التفعيل' : 'Toggle Active'}
                  >
                    {plan.isActive !== false ? <XCircle size={14} /> : <CheckCircle2 size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeletePlan(plan.id)}
                    className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 cursor-pointer"
                    title={language === 'ar' ? 'حذف الباقة' : 'Delete Plan'}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL: SUBSCRIPTION DETAILS */}
      {detailsItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`rounded-3xl max-w-lg w-full p-6 shadow-2xl border space-y-4 ${p.modalBg}`}>
            <div className={`flex items-center justify-between pb-3 border-b ${p.cardBorder}`}>
              <div>
                <h3 className={`text-base font-black ${p.textPrimary}`}>{detailsItem.subscription.userName}</h3>
                <p className={`text-xs ${p.textMuted}`}>
                  {detailsItem.subscription.facilityName || detailsItem.subscription.userEmail}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsItem(null)}
                className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${p.secondaryBtn}`}
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className={`p-3 rounded-xl border ${p.cardMutedBg} ${p.cardBorder}`}>
                <span className={`block mb-0.5 ${p.textMuted}`}>{language === 'ar' ? 'الباقة' : 'Plan'}</span>
                <strong className={p.textPrimary}>{detailsItem.subscription.planName}</strong>
              </div>
              <div className={`p-3 rounded-xl border ${p.cardMutedBg} ${p.cardBorder}`}>
                <span className={`block mb-0.5 ${p.textMuted}`}>{language === 'ar' ? 'السعر المتفق عليه' : 'Price'}</span>
                <strong className={`font-mono ${p.textPrimary}`}>
                  {formatIqd(detailsItem.subscription.customPriceIqd, language)}
                </strong>
              </div>
              <div className={`p-3 rounded-xl border ${p.cardMutedBg} ${p.cardBorder}`}>
                <span className={`block mb-0.5 ${p.textMuted}`}>{language === 'ar' ? 'تاريخ البداية' : 'Start Date'}</span>
                <strong className={`font-mono tabular-nums ${p.textPrimary}`}>
                  {String(detailsItem.subscription.startDate || '').split('T')[0] || '—'}
                </strong>
              </div>
              <div className={`p-3 rounded-xl border ${p.cardMutedBg} ${p.cardBorder}`}>
                <span className={`block mb-0.5 ${p.textMuted}`}>{language === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}</span>
                <strong className={`font-mono tabular-nums ${p.textPrimary}`}>
                  {String(detailsItem.subscription.endDate || '').split('T')[0] || '—'}
                </strong>
              </div>
            </div>

            {detailsItem.subscription.notes && (
              <div className={`p-3 rounded-xl border text-xs ${p.cardMutedBg} ${p.cardBorder}`}>
                <span className={`block font-bold mb-1 ${p.textMuted}`}>
                  {language === 'ar' ? 'ملاحظات الاشتراك:' : 'Notes:'}
                </span>
                <p className={p.textSecondary}>{detailsItem.subscription.notes}</p>
              </div>
            )}

            <div className={`flex flex-wrap items-center justify-between gap-2 pt-3 border-t ${p.cardBorder}`}>
              <div className="flex items-center gap-1.5">
                {detailsItem.subscription.status !== 'active' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onToggleSubStatus(detailsItem.subscription, 'active');
                      setDetailsItem(null);
                    }}
                    className="px-3 py-2 rounded-xl bg-emerald-600 text-white font-bold text-xs cursor-pointer"
                  >
                    {language === 'ar' ? 'تفعيل فوري' : 'Activate'}
                  </button>
                )}
                {detailsItem.subscription.status === 'active' && (
                  <button
                    type="button"
                    onClick={async () => {
                      await onToggleSubStatus(detailsItem.subscription, 'expired');
                      setDetailsItem(null);
                    }}
                    className="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-500 font-bold text-xs cursor-pointer"
                  >
                    {language === 'ar' ? 'تعليم كمنتهي' : 'Mark Expired'}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const target = detailsItem;
                    setDetailsItem(null);
                    openRenewModal(target);
                  }}
                  className="px-4 py-2 rounded-xl bg-[#C8A24A] text-[#071426] font-black text-xs cursor-pointer"
                >
                  {language === 'ar' ? 'تجديد الاشتراك' : 'Renew'}
                </button>
                <button
                  type="button"
                  onClick={() => setDetailsItem(null)}
                  className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer ${p.secondaryBtn}`}
                >
                  {language === 'ar' ? 'إغلاق' : 'Close'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: RENEW SUBSCRIPTION */}
      {renewItem && previewRenewDates && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`rounded-3xl max-w-md w-full p-6 shadow-2xl border space-y-4 ${p.modalBg}`}>
            <div className={`flex items-center justify-between pb-3 border-b ${p.cardBorder}`}>
              <div>
                <h3 className={`text-base font-black ${p.textPrimary}`}>
                  {language === 'ar' ? 'تجديد الاشتراك' : 'Renew Subscription'}
                </h3>
                <p className={`text-xs ${p.textMuted}`}>{renewItem.subscription.userName}</p>
              </div>
              <button
                type="button"
                onClick={() => setRenewItem(null)}
                className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${p.secondaryBtn}`}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmRenew} className="space-y-4 text-xs">
              <div>
                <label className={`block font-bold mb-1 ${p.textSecondary}`}>
                  {language === 'ar' ? 'مدة التجديد' : 'Renewal Term'}
                </label>
                <select
                  value={renewPeriod}
                  onChange={(e) => setRenewPeriod(e.target.value as any)}
                  className={`w-full px-3 py-2.5 rounded-xl border ${p.inputBg}`}
                >
                  <option value="monthly">{language === 'ar' ? 'شهر واحد (تجديد شهري)' : '1 Month'}</option>
                  <option value="quarterly">{language === 'ar' ? '3 أشهر (ربع سنوي)' : '3 Months'}</option>
                  <option value="yearly">{language === 'ar' ? 'سنة كاملة (12 شهراً)' : '1 Year'}</option>
                  <option value="custom">{language === 'ar' ? '30 يوماً (مخصص)' : '30 Days'}</option>
                </select>
              </div>

              <div>
                <label className={`block font-bold mb-1 ${p.textSecondary}`}>
                  {language === 'ar' ? 'قيمة التجديد (د.ع)' : 'Renewal Price (IQD)'}
                </label>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={renewPriceIqd}
                  onChange={(e) => setRenewPriceIqd(Math.max(0, Number(e.target.value)))}
                  className={`w-full px-3 py-2.5 rounded-xl border font-mono font-bold ${p.inputBg}`}
                />
              </div>

              <div className={`p-3 rounded-xl border space-y-1 ${p.cardMutedBg} ${p.cardBorder}`}>
                <div className="flex items-center gap-1.5 font-bold text-emerald-500">
                  <Calendar size={13} />
                  <span>{language === 'ar' ? 'التواريخ الجديدة بعد التجديد:' : 'Updated Validity Dates:'}</span>
                </div>
                <div className={`font-mono tabular-nums ${p.textPrimary}`}>
                  {previewRenewDates.startDate} → {previewRenewDates.endDate}
                </div>
              </div>

              <div>
                <label className={`block font-bold mb-1 ${p.textSecondary}`}>
                  {language === 'ar' ? 'ملاحظات إدارية للتجديد' : 'Administrative Note'}
                </label>
                <input
                  type="text"
                  value={renewNotes}
                  onChange={(e) => setRenewNotes(e.target.value)}
                  placeholder={language === 'ar' ? 'مثال: تجديد سنوي مع مراجعة الوصل...' : 'Optional renewal note'}
                  className={`w-full px-3 py-2 rounded-xl border ${p.inputBg}`}
                />
              </div>

              <div className={`flex items-center justify-end gap-2 pt-2 border-t ${p.cardBorder}`}>
                <button
                  type="button"
                  onClick={() => setRenewItem(null)}
                  className={`px-4 py-2 rounded-xl font-bold ${p.secondaryBtn}`}
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={renewingBusy}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50"
                >
                  {renewingBusy
                    ? language === 'ar'
                      ? 'جارٍ التجديد...'
                      : 'Renewing...'
                    : language === 'ar'
                    ? 'تأكيد التجديد'
                    : 'Confirm Renewal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PREVIOUS SUBSCRIPTION & PAYMENT HISTORY */}
      {historySub && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`rounded-3xl max-w-2xl w-full p-6 shadow-2xl border space-y-4 max-h-[88vh] overflow-y-auto ${p.modalBg}`}>
            <div className={`flex items-center justify-between pb-3 border-b ${p.cardBorder}`}>
              <div>
                <h3 className={`text-base font-black ${p.textPrimary}`}>
                  {language === 'ar' ? `السجل المالي السابق: ${historySub.userName}` : `Subscription History: ${historySub.userName}`}
                </h3>
                <p className={`text-xs ${p.textMuted}`}>{historySub.facilityName || historySub.userEmail}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistorySub(null)}
                className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${p.secondaryBtn}`}
              >
                ✕
              </button>
            </div>

            {historyLoading ? (
              <div className="py-10 text-center text-xs">
                <RefreshCw size={22} className="animate-spin mx-auto mb-2 text-[#0284C7]" />
                <span className={p.textMuted}>{language === 'ar' ? 'جارٍ تحميل السجل...' : 'Loading history...'}</span>
              </div>
            ) : (
              <div className="space-y-5 text-xs">
                <div>
                  <h4 className={`font-extrabold mb-2 ${p.textPrimary}`}>
                    {language === 'ar' ? 'سجل المعاملات المعتمدة (subscription_transactions)' : 'Verified Transactions'}
                  </h4>
                  {historyTransactions.length === 0 ? (
                    <p className={p.textMuted}>
                      {language === 'ar' ? 'لا توجد معاملات مالية سابقة لهذا الحساب.' : 'No verified transactions recorded.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {historyTransactions.map((tx) => (
                        <div key={tx.id} className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${p.cardMutedBg} ${p.cardBorder}`}>
                          <div>
                            <div className={`font-bold ${p.textPrimary}`}>{tx.planNameAr}</div>
                            <div className={`text-[11px] font-mono ${p.textMuted}`}>
                              {tx.subscriptionStartDate} → {tx.subscriptionEndDate} ({tx.paymentMethod})
                            </div>
                          </div>
                          <div className="text-end">
                            <div className="font-black text-emerald-500 font-mono tabular-nums">
                              {formatIqd(tx.amountIqd, language)}
                            </div>
                            <div className={`text-[10px] font-mono ${p.textMuted}`}>
                              {new Date(tx.approvedAt).toLocaleDateString(language === 'ar' ? 'ar-IQ' : 'en-US')}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className={`font-extrabold mb-2 ${p.textPrimary}`}>
                    {language === 'ar' ? 'طلبات الدفع المقدمة' : 'Submitted Payment Requests'}
                  </h4>
                  {historyPaymentReqs.length === 0 ? (
                    <p className={p.textMuted}>
                      {language === 'ar' ? 'لا توجد طلبات دفع مسجلة.' : 'No payment requests recorded.'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {historyPaymentReqs.map((r) => (
                        <div key={r.id} className={`p-3 rounded-xl border flex items-center justify-between gap-2 ${p.cardMutedBg} ${p.cardBorder}`}>
                          <div>
                            <div className={`font-mono font-bold ${p.textPrimary}`}>{r.requestNumber}</div>
                            <div className={`text-[11px] ${p.textMuted}`}>
                              {r.planNameAr} • {r.paymentMethodName}
                            </div>
                          </div>
                          <div className="text-end">
                            <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${p.accentGoldBadge}`}>
                              {r.status}
                            </span>
                            <div className={`text-[11px] font-mono tabular-nums mt-1 ${p.textSecondary}`}>
                              {formatIqd(r.amountIqd, language)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className={`flex justify-end pt-3 border-t ${p.cardBorder}`}>
              <button
                type="button"
                onClick={() => setHistorySub(null)}
                className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer ${p.secondaryBtn}`}
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
