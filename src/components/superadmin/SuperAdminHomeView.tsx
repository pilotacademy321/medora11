import React from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  CreditCard,
  Inbox,
  MailCheck,
  MessageSquare,
  Sparkles,
  Users,
} from 'lucide-react';
import { formatRoleLabel } from '../../utils/subscriptionPaymentEngine';
import {
  HomeMessagesSummary,
  HomeSubscriptionsSummary,
  SuperAdminSectionId,
} from '../../utils/superAdminDashboardEngine';
import { AdminThemeMode, getAdminPalette } from './adminTheme';

interface SuperAdminHomeViewProps {
  language: 'ar' | 'en';
  isRTL: boolean;
  theme: AdminThemeMode;
  loading: boolean;
  messagesSummary: HomeMessagesSummary;
  subscriptionsSummary: HomeSubscriptionsSummary;
  onNavigate: (section: SuperAdminSectionId) => void;
}

export const SuperAdminHomeView: React.FC<SuperAdminHomeViewProps> = ({
  language,
  isRTL,
  theme,
  loading,
  messagesSummary,
  subscriptionsSummary,
  onNavigate,
}) => {
  const p = getAdminPalette(theme);
  const ArrowIcon = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div className="space-y-6">
      {/* Executive Welcome Title Banner */}
      <div
        className={`rounded-2xl p-6 sm:p-7 border transition-colors ${
          theme === 'dark'
            ? 'bg-gradient-to-br from-[#0B1F3A] via-[#0F2A4D] to-[#09182E] border-[#1E3A5F] text-white'
            : 'bg-gradient-to-br from-[#0B1F3A] via-[#102B50] to-[#081930] border-[#0B1F3A] text-white'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-[#C8A24A]/15 border border-[#C8A24A]/40 text-[#E5C168] text-[11px] font-bold">
              <Sparkles size={13} />
              <span>{language === 'ar' ? 'لوحة القيادة التنفيذية' : 'Executive Command Center'}</span>
            </span>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              MEDORA — {language === 'ar' ? 'مركز الإدارة العليا' : 'Super Admin Center'}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              {language === 'ar'
                ? 'نظرة تنفيذية مباشرة على المراسلات الإدارية الواردة وحالة الاشتراكات وطلبات التجديد في كافة عيادات ومختبرات المنصة.'
                : 'Direct executive overview of incoming administrative conversations, live clinic subscriptions, and renewal requests.'}
            </p>
          </div>
        </div>
      </div>

      {/* Two Side-by-Side Primary Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {/* SECTION 1: ADMINISTRATIVE MESSAGING CARD */}
        <section
          className={`rounded-2xl border p-6 flex flex-col justify-between transition-colors ${p.cardBg} ${p.cardBorder}`}
        >
          <div className="space-y-5">
            {/* Card Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] text-[#E5C168] border border-[#C8A24A]/40 flex items-center justify-center shrink-0">
                  <MessageSquare size={22} />
                </div>
                <div>
                  <h2 className={`text-lg font-black ${p.textPrimary}`}>
                    {language === 'ar' ? 'المراسلات الإدارية' : 'Administrative Messaging'}
                  </h2>
                  <p className={`text-xs ${p.textMuted} mt-0.5`}>
                    {language === 'ar'
                      ? 'تواصل مباشر مع الأطباء، المختبرات، الصيدليات، والمرضى'
                      : 'Direct threads across doctors, labs, pharmacies, and patients'}
                  </p>
                </div>
              </div>
            </div>

            {/* Key Message Counters */}
            <div className="grid grid-cols-2 gap-3">
              <div className={`rounded-xl p-4 border ${p.cardMutedBg} ${p.cardBorder}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-xs font-bold ${p.textMuted}`}>
                    {language === 'ar' ? 'الرسائل الجديدة (24 ساعة)' : 'New Messages (24h)'}
                  </span>
                  <Inbox size={15} className="text-[#0284C7]" />
                </div>
                <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>
                  {loading ? '—' : messagesSummary.newMessagesCount}
                </div>
              </div>

              <div className={`rounded-xl p-4 border ${p.cardMutedBg} ${p.cardBorder}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className={`text-xs font-bold ${p.textMuted}`}>
                    {language === 'ar' ? 'الرسائل غير المقروءة' : 'Unread Messages'}
                  </span>
                  <MailCheck size={15} className="text-[#C8A24A]" />
                </div>
                <div className={`text-2xl font-black tabular-nums ${messagesSummary.unreadMessagesCount > 0 ? 'text-[#C8A24A]' : p.textPrimary}`}>
                  {loading ? '—' : messagesSummary.unreadMessagesCount}
                </div>
              </div>
            </div>

            {/* Latest Incoming Messages List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className={`text-xs font-extrabold uppercase tracking-wide ${p.textMuted}`}>
                  {language === 'ar' ? 'آخر الرسائل الواردة' : 'Latest Incoming Messages'}
                </h3>
                <span className={`text-[11px] font-semibold tabular-nums ${p.textMuted}`}>
                  {language === 'ar'
                    ? `${messagesSummary.totalConversations} محادثة نشطة`
                    : `${messagesSummary.totalConversations} active threads`}
                </span>
              </div>

              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((idx) => (
                    <div
                      key={idx}
                      className={`h-16 rounded-xl border animate-pulse ${p.cardMutedBg} ${p.cardBorder}`}
                    />
                  ))}
                </div>
              ) : messagesSummary.latestMessages.length === 0 ? (
                <div className={`rounded-xl border p-6 text-center ${p.cardMutedBg} ${p.cardBorder}`}>
                  <MessageSquare size={24} className={`mx-auto mb-2 opacity-40 ${p.textMuted}`} />
                  <p className={`text-xs font-bold ${p.textSecondary}`}>
                    {language === 'ar' ? 'لا توجد رسائل واردة حالياً.' : 'No incoming messages yet.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {messagesSummary.latestMessages.slice(0, 3).map((msg) => (
                    <div
                      key={msg.id}
                      onClick={() => onNavigate('messages')}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${p.cardMutedBg} ${p.cardBorder} ${p.tableRowHover}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs font-extrabold truncate ${p.textPrimary}`}>
                            {msg.senderName}
                          </span>
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${p.accentGoldBadge}`}>
                            {formatRoleLabel(msg.senderRole, language)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {msg.unreadCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[#C8A24A] text-[#071426] text-[10px] font-black tabular-nums">
                              {msg.unreadCount}
                            </span>
                          )}
                          <span className={`text-[10px] font-mono tabular-nums ${p.textMuted}`}>
                            {msg.timestamp
                              ? new Date(msg.timestamp).toLocaleString(language === 'ar' ? 'ar-IQ' : 'en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '—'}
                          </span>
                        </div>
                      </div>
                      <p className={`text-xs truncate ${p.textSecondary}`}>{msg.lastMessageText}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className={`pt-5 mt-5 border-t ${p.cardBorder}`}>
            <button
              type="button"
              onClick={() => onNavigate('messages')}
              className={`w-full py-3 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-colors cursor-pointer ${p.primaryBtn}`}
            >
              <span>{language === 'ar' ? 'فتح المراسلات الإدارية' : 'Open Administrative Messaging'}</span>
              <ArrowIcon size={16} />
            </button>
          </div>
        </section>

        {/* SECTION 2: SUBSCRIPTIONS & CLINICS CARD */}
        <section
          className={`rounded-2xl border p-6 flex flex-col justify-between transition-colors ${p.cardBg} ${p.cardBorder}`}
        >
          <div className="space-y-5">
            {/* Card Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[#0284C7]/15 text-[#0284C7] border border-[#0284C7]/30 flex items-center justify-center shrink-0">
                  <CreditCard size={22} />
                </div>
                <div>
                  <h2 className={`text-lg font-black ${p.textPrimary}`}>
                    {language === 'ar' ? 'الاشتراكات والعيادات' : 'Subscriptions & Clinics'}
                  </h2>
                  <p className={`text-xs ${p.textMuted} mt-0.5`}>
                    {language === 'ar'
                      ? 'متابعة حالة اشتراكات العيادات والمختبرات وتنبيهات التجديد'
                      : 'Track active clinic memberships, expirations, and renewal requests'}
                  </p>
                </div>
              </div>
            </div>

            {/* 4 Key Real Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div
                className={`rounded-xl p-4 border ${
                  theme === 'dark'
                    ? 'bg-emerald-950/35 border-emerald-800/50'
                    : 'bg-emerald-50/70 border-emerald-200'
                }`}
              >
                <span
                  className={`text-xs font-bold block mb-1 ${
                    theme === 'dark' ? 'text-emerald-300' : 'text-emerald-800'
                  }`}
                >
                  {language === 'ar' ? 'الاشتراكات النشطة' : 'Active Subscriptions'}
                </span>
                <div
                  className={`text-2xl font-black tabular-nums ${
                    theme === 'dark' ? 'text-emerald-200' : 'text-emerald-950'
                  }`}
                >
                  {loading ? '—' : subscriptionsSummary.activeCount}
                </div>
              </div>

              <div
                className={`rounded-xl p-4 border ${
                  theme === 'dark'
                    ? 'bg-rose-950/35 border-rose-800/50'
                    : 'bg-rose-50/70 border-rose-200'
                }`}
              >
                <span
                  className={`text-xs font-bold block mb-1 ${
                    theme === 'dark' ? 'text-rose-300' : 'text-rose-800'
                  }`}
                >
                  {language === 'ar' ? 'الاشتراكات المنتهية' : 'Expired Subscriptions'}
                </span>
                <div
                  className={`text-2xl font-black tabular-nums ${
                    theme === 'dark' ? 'text-rose-200' : 'text-rose-950'
                  }`}
                >
                  {loading ? '—' : subscriptionsSummary.expiredCount}
                </div>
              </div>

              <div
                className={`rounded-xl p-4 border ${
                  theme === 'dark'
                    ? 'bg-amber-950/35 border-amber-800/50'
                    : 'bg-amber-50/70 border-amber-200'
                }`}
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span
                    className={`text-xs font-bold ${
                      theme === 'dark' ? 'text-amber-300' : 'text-amber-800'
                    }`}
                  >
                    {language === 'ar' ? 'القريبة من الانتهاء (≤ 7 أيام)' : 'Expiring Soon (≤ 7d)'}
                  </span>
                  <Clock size={14} className="text-amber-500 shrink-0" />
                </div>
                <div
                  className={`text-2xl font-black tabular-nums ${
                    theme === 'dark' ? 'text-amber-200' : 'text-amber-950'
                  }`}
                >
                  {loading ? '—' : subscriptionsSummary.nearingExpirationCount}
                </div>
              </div>

              <div className={`rounded-xl p-4 border ${p.cardMutedBg} ${p.cardBorder}`}>
                <div className="flex items-center justify-between gap-1 mb-1">
                  <span className={`text-xs font-bold ${p.textMuted}`}>
                    {language === 'ar' ? 'طلبات الاشتراك الجديدة' : 'New Subscription Requests'}
                  </span>
                  <Users size={14} className="text-[#0284C7] shrink-0" />
                </div>
                <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>
                  {loading ? '—' : subscriptionsSummary.newPaymentRequestsCount}
                </div>
              </div>
            </div>

            {/* Renewal Alert Strip */}
            <div
              className={`rounded-xl p-4 border flex items-center justify-between gap-3 ${p.cardMutedBg} ${p.cardBorder}`}
            >
              <div className="space-y-0.5">
                <span className={`text-xs font-extrabold block ${p.textPrimary}`}>
                  {language === 'ar' ? 'حالات بانتظار التجديد والمتابعة' : 'Subscriptions Awaiting Renewal'}
                </span>
                <span className={`text-[11px] ${p.textMuted}`}>
                  {language === 'ar'
                    ? 'تشمل الاشتراكات المنتهية أو القريبة من الانتهاء وطلبات الدفع قيد المراجعة'
                    : 'Includes expired, nearing expiration, and pending renewal payment requests'}
                </span>
              </div>
              <span className="px-3 py-1.5 rounded-xl bg-[#C8A24A]/15 text-[#C8A24A] border border-[#C8A24A]/40 font-black text-base tabular-nums shrink-0">
                {loading ? '—' : subscriptionsSummary.awaitingRenewalCount}
              </span>
            </div>
          </div>

          <div className={`pt-5 mt-5 border-t ${p.cardBorder}`}>
            <button
              type="button"
              onClick={() => onNavigate('subscriptions')}
              className="w-full py-3 px-4 rounded-xl bg-[#C8A24A] hover:bg-[#B89238] text-[#071426] text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>{language === 'ar' ? 'فتح الاشتراكات والعيادات' : 'Open Subscriptions & Clinics'}</span>
              <ArrowIcon size={16} />
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
