import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  FlaskConical,
  RefreshCw,
  Scan,
  ShieldCheck,
  Stethoscope,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { Appointment, UserProfile, UserSubscription } from '../../types';
import { isPortalActive } from '../../config/portalsConfig';
import {
  AnalyticsPeriod,
  computeAnalyticsByPeriod,
} from '../../utils/superAdminDashboardEngine';
import { AdminThemeMode, getAdminPalette } from './adminTheme';

interface SuperAdminAnalyticsViewProps {
  language: 'ar' | 'en';
  theme: AdminThemeMode;
  usersList: UserProfile[];
  appointments: Appointment[];
  userSubscriptions: UserSubscription[];
  loading: boolean;
  refreshing: boolean;
  onLoadAnalyticsData: () => Promise<void>;
  onRefresh: () => void;
}

export const SuperAdminAnalyticsView: React.FC<SuperAdminAnalyticsViewProps> = ({
  language,
  theme,
  usersList,
  appointments,
  userSubscriptions,
  loading,
  refreshing,
  onLoadAnalyticsData,
  onRefresh,
}) => {
  const p = getAdminPalette(theme);
  const [period, setPeriod] = useState<AnalyticsPeriod>('monthly');

  useEffect(() => {
    onLoadAnalyticsData().catch(() => {});
  }, [onLoadAnalyticsData]);

  const report = useMemo(
    () =>
      computeAnalyticsByPeriod({
        users: usersList,
        appointments,
        subscriptions: userSubscriptions,
        period,
      }),
    [usersList, appointments, userSubscriptions, period]
  );

  const maxBucketVal = useMemo(() => {
    let max = 1;
    for (const b of report.chartBuckets) {
      if (b.registrations > max) max = b.registrations;
      if (b.appointments > max) max = b.appointments;
    }
    return max;
  }, [report.chartBuckets]);

  const periodOptions: Array<{ id: AnalyticsPeriod; ar: string; en: string }> = [
    { id: 'daily', ar: 'اليومي (24 ساعة)', en: 'Daily (24h)' },
    { id: 'weekly', ar: 'الأسبوعي (7 أيام)', en: 'Weekly (7d)' },
    { id: 'monthly', ar: 'الشهري (30 يوماً)', en: 'Monthly (30d)' },
    { id: 'all', ar: 'السجل الكامل', en: 'All Time' },
  ];

  const totalAccountsDenom = Math.max(1, report.activeAccounts + report.suspendedOrPendingAccounts);
  const totalApptsDenom = Math.max(1, report.totalAppointments);
  const totalSubsDenom = Math.max(1, report.activeSubscriptions + report.expiredSubscriptions);

  return (
    <div className="space-y-6">
      {/* Header & Date-Range Filter */}
      <div className={`rounded-2xl p-5 sm:p-6 border flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${p.cardBg} ${p.cardBorder}`}>
        <div>
          <h2 className={`text-lg font-black flex items-center gap-2 ${p.textPrimary}`}>
            <Activity size={20} className="text-[#0284C7]" />
            <span>{language === 'ar' ? 'المؤشرات التشغيلية والإحصائيات الحية' : 'Live Platform Metrics & Operations'}</span>
          </h2>
          <p className={`text-xs mt-1 ${p.textMuted}`}>
            {language === 'ar'
              ? 'أرقام حقيقية مستخرجة مباشرة من سجلات Cloud Firestore بدون بيانات افتراضية'
              : 'Live operational counts aggregated directly from Cloud Firestore records'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className={`inline-flex p-1 rounded-xl border ${p.cardMutedBg} ${p.cardBorder}`}>
            {periodOptions.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setPeriod(opt.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  period === opt.id
                    ? 'bg-[#0B1F3A] text-white'
                    : `${p.textSecondary} hover:opacity-80`
                }`}
              >
                {language === 'ar' ? opt.ar : opt.en}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${p.secondaryBtn}`}
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            <span>{language === 'ar' ? 'تحديث' : 'Sync'}</span>
          </button>
        </div>
      </div>

      {/* Primary Entities KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <div className="flex items-center justify-between mb-2">
            <User size={18} className="text-[#0284C7]" />
            <span className={`text-[11px] font-bold ${p.textMuted}`}>{language === 'ar' ? 'المرضى' : 'Patients'}</span>
          </div>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>
            {loading ? '—' : report.totalPatients}
          </div>
        </div>

        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <div className="flex items-center justify-between mb-2">
            <Stethoscope size={18} className="text-emerald-500" />
            <span className={`text-[11px] font-bold ${p.textMuted}`}>{language === 'ar' ? 'الأطباء' : 'Doctors'}</span>
          </div>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>
            {loading ? '—' : report.totalDoctors}
          </div>
        </div>

        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <div className="flex items-center justify-between mb-2">
            <FlaskConical size={18} className="text-[#C8A24A]" />
            <span className={`text-[11px] font-bold ${p.textMuted}`}>{language === 'ar' ? 'المختبرات' : 'Labs'}</span>
          </div>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>
            {loading ? '—' : report.totalLaboratories}
          </div>
        </div>

        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <div className="flex items-center justify-between mb-2">
            <Building2 size={18} className="text-[#0284C7]" />
            <span className={`text-[11px] font-bold ${p.textMuted}`}>
              {language === 'ar' ? 'المؤسسات المسجلة' : 'Institutions'}
            </span>
          </div>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>
            {loading ? '—' : report.totalInstitutions}
          </div>
        </div>

        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <div className="flex items-center justify-between mb-2">
            <ShieldCheck size={18} className="text-emerald-500" />
            <span className={`text-[11px] font-bold ${p.textMuted}`}>
              {language === 'ar' ? 'الحسابات النشطة' : 'Active Accounts'}
            </span>
          </div>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>
            {loading ? '—' : report.activeAccounts}
          </div>
        </div>

        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <div className="flex items-center justify-between mb-2">
            <Clock size={18} className="text-amber-500" />
            <span className={`text-[11px] font-bold ${p.textMuted}`}>
              {language === 'ar' ? 'طلبات التسجيل' : 'Reg. Requests'}
            </span>
          </div>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>
            {loading ? '—' : report.pendingRegistrationsCount}
          </div>
        </div>
      </div>

      {/* Appointments & Subscriptions Operational Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className={`rounded-2xl p-5 border space-y-3 ${p.cardBg} ${p.cardBorder}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-extrabold ${p.textMuted}`}>
              {language === 'ar' ? 'حالة الحسابات' : 'Account Status'}
            </span>
            <Users size={16} className="text-[#0284C7]" />
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>{report.activeAccounts}</div>
              <span className="text-[11px] text-emerald-500 font-bold">
                {language === 'ar' ? 'حساب نشط ومعتمد' : 'Active & Approved'}
              </span>
            </div>
            <div className="text-end">
              <div className="text-xl font-black tabular-nums text-amber-500">
                {report.suspendedOrPendingAccounts}
              </div>
              <span className={`text-[11px] font-bold ${p.textMuted}`}>
                {language === 'ar' ? 'معلق / قيد المراجعة' : 'Suspended / Pending'}
              </span>
            </div>
          </div>
          <div className={`h-2 rounded-full overflow-hidden ${p.cardMutedBg}`}>
            <div
              className="h-full bg-emerald-500 rounded-full transition-all"
              style={{ width: `${Math.round((report.activeAccounts / totalAccountsDenom) * 100)}%` }}
            />
          </div>
        </div>

        <div className={`rounded-2xl p-5 border space-y-3 ${p.cardBg} ${p.cardBorder}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-extrabold ${p.textMuted}`}>
              {language === 'ar' ? 'المواعيد الطبية في الفترة' : 'Appointments in Period'}
            </span>
            <Calendar size={16} className="text-[#C8A24A]" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div>
              <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>{report.totalAppointments}</div>
              <span className={`text-[11px] font-bold ${p.textMuted}`}>
                {language === 'ar' ? 'إجمالي المواعيد' : 'Total'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <div className="text-center">
                <div className="font-black text-emerald-500 tabular-nums flex items-center gap-1">
                  <CheckCircle2 size={13} />
                  <span>{report.completedAppointments}</span>
                </div>
                <span className={`text-[10px] ${p.textMuted}`}>{language === 'ar' ? 'مكتمل' : 'Done'}</span>
              </div>
              <div className="text-center">
                <div className="font-black text-rose-500 tabular-nums flex items-center gap-1">
                  <XCircle size={13} />
                  <span>{report.cancelledAppointments}</span>
                </div>
                <span className={`text-[10px] ${p.textMuted}`}>{language === 'ar' ? 'ملغى' : 'Cancelled'}</span>
              </div>
            </div>
          </div>
          <div className={`h-2 rounded-full overflow-hidden flex ${p.cardMutedBg}`}>
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.round((report.completedAppointments / totalApptsDenom) * 100)}%` }}
            />
            <div
              className="h-full bg-rose-500"
              style={{ width: `${Math.round((report.cancelledAppointments / totalApptsDenom) * 100)}%` }}
            />
          </div>
        </div>

        <div className={`rounded-2xl p-5 border space-y-3 ${p.cardBg} ${p.cardBorder}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-extrabold ${p.textMuted}`}>
              {language === 'ar' ? 'الاشتراكات النشطة والمنتهية' : 'Active vs Expired Subscriptions'}
            </span>
            <CreditCard size={16} className="text-emerald-500" />
          </div>
          <div className="flex items-baseline justify-between">
            <div>
              <div className="text-2xl font-black tabular-nums text-emerald-500">{report.activeSubscriptions}</div>
              <span className={`text-[11px] font-bold ${p.textMuted}`}>
                {language === 'ar' ? 'اشتراك نشط' : 'Active'}
              </span>
            </div>
            <div className="text-end">
              <div className="text-xl font-black tabular-nums text-rose-500">{report.expiredSubscriptions}</div>
              <span className={`text-[11px] font-bold ${p.textMuted}`}>
                {language === 'ar' ? 'منتهي الصلاحية' : 'Expired'}
              </span>
            </div>
          </div>
          <div className={`h-2 rounded-full overflow-hidden flex ${p.cardMutedBg}`}>
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.round((report.activeSubscriptions / totalSubsDenom) * 100)}%` }}
            />
            <div
              className="h-full bg-rose-500"
              style={{ width: `${Math.round((report.expiredSubscriptions / totalSubsDenom) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Visual SVG Activity Chart & Network Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Bar Chart: Registrations & Appointments Activity */}
        <div className={`lg:col-span-8 rounded-2xl p-6 border space-y-5 ${p.cardBg} ${p.cardBorder}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className={`text-sm font-black ${p.textPrimary}`}>
                {language === 'ar' ? 'مؤشر النشاط الطبي والتسجيلات' : 'Registrations & Appointments Activity'}
              </h3>
              <p className={`text-xs ${p.textMuted}`}>
                {language === 'ar'
                  ? `التسجيلات في الفترة: ${report.registrationsInPeriod} | المواعيد في الفترة: ${report.appointmentsInPeriod}`
                  : `Registrations: ${report.registrationsInPeriod} | Appointments: ${report.appointmentsInPeriod}`}
              </p>
            </div>
            <div className="flex items-center gap-4 text-[11px] font-bold">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#0284C7] inline-block" />
                <span className={p.textSecondary}>{language === 'ar' ? 'الحجوزات' : 'Appointments'}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#C8A24A] inline-block" />
                <span className={p.textSecondary}>{language === 'ar' ? 'تسجيلات جديدة' : 'New Accounts'}</span>
              </span>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <div className="min-w-[420px]">
              <svg viewBox="0 0 640 220" className="w-full h-52">
                {[0, 0.25, 0.5, 0.75, 1].map((step) => {
                  const y = 180 - step * 145;
                  const val = Math.round(maxBucketVal * step);
                  return (
                    <g key={step}>
                      <line
                        x1="36"
                        x2="624"
                        y1={y}
                        y2={y}
                        stroke={theme === 'dark' ? '#1E3A5F' : '#E2E8F0'}
                        strokeDasharray="3 3"
                      />
                      <text
                        x="28"
                        y={y + 4}
                        textAnchor="end"
                        fontSize="10"
                        fill={theme === 'dark' ? '#94A3B8' : '#64748B'}
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {report.chartBuckets.map((bucket, idx) => {
                  const count = report.chartBuckets.length || 1;
                  const groupWidth = (624 - 44) / count;
                  const centerX = 44 + groupWidth * idx + groupWidth / 2;
                  const barW = Math.min(24, groupWidth * 0.3);
                  const apptH = (bucket.appointments / maxBucketVal) * 145;
                  const regH = (bucket.registrations / maxBucketVal) * 145;

                  return (
                    <g key={idx}>
                      <rect
                        x={centerX - barW - 2}
                        y={180 - apptH}
                        width={barW}
                        height={Math.max(2, apptH)}
                        rx="4"
                        fill="#0284C7"
                      >
                        <title>{`${bucket.labelEn}: ${bucket.appointments} appointments`}</title>
                      </rect>
                      <rect
                        x={centerX + 2}
                        y={180 - regH}
                        width={barW}
                        height={Math.max(2, regH)}
                        rx="4"
                        fill="#C8A24A"
                      >
                        <title>{`${bucket.labelEn}: ${bucket.registrations} registrations`}</title>
                      </rect>
                      <text
                        x={centerX}
                        y="202"
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="700"
                        fill={theme === 'dark' ? '#CBD5E1' : '#334E68'}
                      >
                        {language === 'ar' ? bucket.labelAr : bucket.labelEn}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Network Composition Distribution */}
        <div className={`lg:col-span-4 rounded-2xl p-6 border space-y-4 ${p.cardBg} ${p.cardBorder}`}>
          <h3 className={`text-sm font-black ${p.textPrimary}`}>
            {language === 'ar' ? 'توزيع الفئات الطبية' : 'Provider Composition'}
          </h3>

          {[
            { labelAr: 'الأطباء والعيادات', labelEn: 'Doctors & Clinics', val: report.totalDoctors, color: 'bg-[#0284C7]' },
            { labelAr: 'المختبرات السريرية', labelEn: 'Laboratories', val: report.totalLaboratories, color: 'bg-[#C8A24A]' },
            { labelAr: 'الصيدليات الأهلية', labelEn: 'Pharmacies', val: report.totalPharmacies, color: 'bg-emerald-500' },
            ...(isPortalActive('radiology')
              ? [{ labelAr: 'مراكز الأشعة', labelEn: 'Radiology Centers', val: report.totalRadiology, color: 'bg-amber-500' }]
              : []),
            { labelAr: 'السكرتارية الطبية', labelEn: 'Secretaries', val: report.totalSecretaries, color: 'bg-indigo-500' },
            { labelAr: 'المرضى', labelEn: 'Patients', val: report.totalPatients, color: 'bg-sky-500' },
          ].map((row) => {
            const totalAll = Math.max(
              1,
              report.totalDoctors +
                report.totalLaboratories +
                report.totalPharmacies +
                report.totalRadiology +
                report.totalSecretaries +
                report.totalPatients
            );
            const pct = Math.round((row.val / totalAll) * 100);
            return (
              <div key={row.labelEn} className="space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className={`font-bold ${p.textSecondary}`}>
                    {language === 'ar' ? row.labelAr : row.labelEn}
                  </span>
                  <span className={`font-black tabular-nums ${p.textPrimary}`}>
                    {row.val} <span className={`text-[10px] font-normal ${p.textMuted}`}>({pct}%)</span>
                  </span>
                </div>
                <div className={`h-2 rounded-full overflow-hidden ${p.cardMutedBg}`}>
                  <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}

          {isPortalActive('radiology') && (
            <div className={`pt-2 border-t text-[11px] flex items-center gap-1.5 ${p.cardBorder} ${p.textMuted}`}>
              <Scan size={13} />
              <span>{language === 'ar' ? 'بوابة الأشعة مضمنة في الإحصائيات' : 'Radiology center metrics active'}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
