import React, { useEffect, useMemo, useState } from 'react';
import { Lock, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { ClinicAuditLog } from '../../types';
import { isPortalActive } from '../../config/portalsConfig';
import { AuditCategory, SystemAuditLogEntry } from '../../lib/auditLogger';
import { AdminThemeMode, getAdminPalette } from './adminTheme';

interface SuperAdminAuditLogsViewProps {
  language: 'ar' | 'en';
  theme: AdminThemeMode;
  systemAuditLogs: SystemAuditLogEntry[];
  clinicAuditLogs: ClinicAuditLog[];
  loading: boolean;
  refreshing: boolean;
  onLoadAuditLogs: () => Promise<void>;
  onRefresh: () => void;
}

export const SuperAdminAuditLogsView: React.FC<SuperAdminAuditLogsViewProps> = ({
  language,
  theme,
  systemAuditLogs,
  clinicAuditLogs,
  loading,
  refreshing,
  onLoadAuditLogs,
  onRefresh,
}) => {
  const p = getAdminPalette(theme);
  const [categoryFilter, setCategoryFilter] = useState<'all' | AuditCategory | 'clinic_frontdesk'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    onLoadAuditLogs().catch(() => {});
  }, [onLoadAuditLogs]);

  const getCategoryMeta = (cat: string) => {
    const map: Record<string, { ar: string; en: string }> = {
      accreditation: { ar: 'اعتماد الكوادر', en: 'Accreditation' },
      payment_management: { ar: 'المدفوعات والاشتراكات', en: 'Payments & Subs' },
      prescriptions: { ar: 'الوصفات والصرف', en: 'Prescriptions' },
      diagnostic_orders: { ar: 'إحالات الفحص', en: 'Diagnostic Orders' },
      lab_diagnostics: { ar: 'المختبرات', en: 'Lab Diagnostics' },
      radiology: { ar: 'الأشعة', en: 'Radiology' },
      wholesale_b2b: { ar: 'المذاخر B2B', en: 'Wholesale B2B' },
      messaging_oversight: { ar: 'المراسلات الإدارية', en: 'Messaging' },
      profiles: { ar: 'الملفات', en: 'Profiles' },
      medical_records: { ar: 'السجلات الطبية', en: 'Medical Records' },
      clinic_frontdesk: { ar: 'استقبال العيادة', en: 'Clinic Front-Desk' },
    };
    const found = map[cat];
    return found ? (language === 'ar' ? found.ar : found.en) : cat;
  };

  const getActionLabel = (action: string) => {
    const map: Record<string, { ar: string; en: string }> = {
      accreditation_approved: { ar: 'اعتماد حساب', en: 'Account Approved' },
      accreditation_rejected: { ar: 'رفض اعتماد حساب', en: 'Account Rejected' },
      accreditation_completion_requested: { ar: 'طلب استكمال بيانات', en: 'Completion Requested' },
      accreditation_suspended: { ar: 'تعليق حساب', en: 'Account Suspended' },
      subscription_created: { ar: 'إنشاء اشتراك', en: 'Subscription Created' },
      subscription_renewed: { ar: 'تجديد اشتراك', en: 'Subscription Renewed' },
      subscription_price_updated: { ar: 'تعديل سعر اشتراك', en: 'Subscription Price Updated' },
      subscription_status_updated: { ar: 'تغيير حالة اشتراك', en: 'Subscription Status Changed' },
      subscription_plan_saved: { ar: 'حفظ باقة اشتراك', en: 'Plan Saved' },
      payment_approved: { ar: 'اعتماد دفعة مالية', en: 'Payment Approved' },
      payment_rejected: { ar: 'رفض طلب دفع', en: 'Payment Rejected' },
      payment_marked_under_review: { ar: 'مراجعة إيصال', en: 'Receipt Under Review' },
      subscription_activated: { ar: 'تفعيل اشتراك', en: 'Subscription Activated' },
      payment_settings_updated: { ar: 'تحديث إعدادات المحافظ', en: 'Wallet Settings Updated' },
      prescription_created: { ar: 'إصدار وصفة', en: 'Prescription Created' },
      prescription_dispensed: { ar: 'صرف دواء', en: 'Medicine Dispensed' },
      lab_order_completed: { ar: 'إتمام نتيجة مختبر', en: 'Lab Result Completed' },
      super_admin_conversation_viewed: { ar: 'معاينة محادثة', en: 'Conversation Viewed' },
      super_admin_support_message_sent: { ar: 'إرسال رسالة إدارية', en: 'Admin Message Sent' },
    };
    const found = map[action];
    return found ? (language === 'ar' ? found.ar : found.en) : action;
  };

  const unifiedRows = useMemo(() => {
    const sysRows = systemAuditLogs.map((l) => ({
      id: l.id,
      actorName: l.actorName,
      actorRole: l.actorRole,
      action: getActionLabel(l.action),
      category: l.category,
      categoryLabel: getCategoryMeta(l.category),
      timestamp: l.timestamp,
      details: l.details,
      targetName: l.targetName,
      status: l.status,
    }));

    const clinicRows = clinicAuditLogs.map((c) => ({
      id: `clinic_${c.id}`,
      actorName: c.actorName,
      actorRole: c.actorRole,
      action: c.action,
      category: 'clinic_frontdesk',
      categoryLabel: getCategoryMeta('clinic_frontdesk'),
      timestamp: c.timestamp,
      details: c.details,
      targetName: c.doctorName,
      status: 'logged',
    }));

    return [...sysRows, ...clinicRows]
      .filter((row) => {
        if (categoryFilter !== 'all' && row.category !== categoryFilter) return false;
        if (statusFilter !== 'all' && row.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const hay = [row.actorName, row.action, row.categoryLabel, row.details, row.targetName || '']
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        }
        return true;
      })
      .sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  }, [systemAuditLogs, clinicAuditLogs, categoryFilter, statusFilter, searchQuery, language]);

  const categories = [
    { id: 'all', ar: 'جميع الأقسام', en: 'All Sections' },
    { id: 'accreditation', ar: 'اعتماد الكوادر', en: 'Accreditation' },
    { id: 'payment_management', ar: 'المدفوعات والاشتراكات', en: 'Payments & Subs' },
    { id: 'prescriptions', ar: 'الوصفات', en: 'Prescriptions' },
    { id: 'lab_diagnostics', ar: 'المختبر', en: 'Laboratory' },
    { id: 'radiology', ar: 'الأشعة', en: 'Radiology', hidden: !isPortalActive('radiology') },
    { id: 'wholesale_b2b', ar: 'المذاخر', en: 'Wholesale', hidden: !isPortalActive('wholesaler') },
    { id: 'messaging_oversight', ar: 'المراسلات', en: 'Messaging' },
    { id: 'clinic_frontdesk', ar: 'العيادات', en: 'Clinics' },
  ].filter((c) => !c.hidden);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className={`rounded-2xl p-5 sm:p-6 border space-y-4 ${p.cardBg} ${p.cardBorder}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck size={20} className="text-[#C8A24A]" />
              <h2 className={`text-lg font-black ${p.textPrimary}`}>
                {language === 'ar' ? 'سجل الرقابة الإدارية غير القابل للتعديل' : 'Immutable Administrative Audit Trail'}
              </h2>
            </div>
            <p className={`text-xs mt-1 ${p.textMuted}`}>
              {language === 'ar'
                ? 'توثيق مركزي لجميع قرارات الاعتماد، الرفض، طلبات الاستكمال، الاشتراكات، والمدفوعات'
                : 'Central tamper-proof ledger of accreditation, subscription, payment, and clinical actions'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border flex items-center gap-1.5 ${p.accentGoldBadge}`}>
              <Lock size={12} />
              <span>{language === 'ar' ? 'سجل للقراءة فقط (محمي)' : 'Read-Only Protected'}</span>
            </span>
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${p.secondaryBtn}`}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              <span>{language === 'ar' ? 'تحديث' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryFilter(cat.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                categoryFilter === cat.id
                  ? 'bg-[#0B1F3A] text-white border border-[#C8A24A]/40'
                  : `${p.cardMutedBg} ${p.textSecondary} hover:opacity-80`
              }`}
            >
              {language === 'ar' ? cat.ar : cat.en}
            </button>
          ))}
        </div>

        {/* Search & Result Filter */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
          <div className="sm:col-span-8 relative">
            <Search size={15} className={`absolute top-1/2 -translate-y-1/2 start-3.5 ${p.textMuted}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === 'ar'
                  ? 'بحث باسم المنفّذ، نوع الإجراء، التفاصيل، أو الجهة المستهدفة...'
                  : 'Search actor, action, target, or details...'
              }
              className={`w-full ps-10 pe-4 py-2.5 rounded-xl border text-xs ${p.inputBg}`}
            />
          </div>

          <div className="sm:col-span-4">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={`w-full px-3 py-2.5 rounded-xl border text-xs ${p.inputBg}`}
            >
              <option value="all">{language === 'ar' ? 'جميع النتائج' : 'All Outcomes'}</option>
              <option value="approved">{language === 'ar' ? 'معتمد / موافق (approved)' : 'Approved'}</option>
              <option value="rejected">{language === 'ar' ? 'مرفوض (rejected)' : 'Rejected'}</option>
              <option value="incomplete">{language === 'ar' ? 'طلب استكمال (incomplete)' : 'Incomplete'}</option>
              <option value="active">{language === 'ar' ? 'مفعّل / نشط (active)' : 'Active'}</option>
              <option value="completed">{language === 'ar' ? 'مكتمل (completed)' : 'Completed'}</option>
            </select>
          </div>
        </div>
      </div>

      {/* Audit Table */}
      <div className={`rounded-2xl border overflow-hidden ${p.cardBg} ${p.cardBorder}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead>
              <tr className={`border-b font-bold uppercase tracking-wider ${p.tableHeaderBg}`}>
                <th className="py-3.5 px-4">{language === 'ar' ? 'المسؤول المنفّذ' : 'Executing Admin / Actor'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'نوع الإجراء' : 'Action Type'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'القسم / التصنيف' : 'Section'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'التاريخ والوقت' : 'Timestamp'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'تفاصيل مختصرة' : 'Details'}</th>
                <th className="py-3.5 px-4">{language === 'ar' ? 'نتيجة التنفيذ' : 'Result'}</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${p.tableDivider}`}>
              {unifiedRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`py-14 text-center ${p.textMuted}`}>
                    {loading
                      ? language === 'ar'
                        ? 'جارٍ تحميل سجل الرقابة...'
                        : 'Loading audit logs...'
                      : language === 'ar'
                      ? 'لا توجد سجلات تطابق معايير البحث الحالية.'
                      : 'No audit events match current filters.'}
                  </td>
                </tr>
              ) : (
                unifiedRows.map((row) => (
                  <tr key={row.id} className={`transition-colors ${p.tableRowHover}`}>
                    <td className="py-3 px-4">
                      <div className={`font-bold ${p.textPrimary}`}>{row.actorName}</div>
                      <span className={`text-[10px] font-mono uppercase ${p.textMuted}`}>{row.actorRole}</span>
                    </td>

                    <td className={`py-3 px-3 font-extrabold whitespace-nowrap ${p.textPrimary}`}>
                      {row.action}
                    </td>

                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${p.accentGoldBadge}`}>
                        {row.categoryLabel}
                      </span>
                    </td>

                    <td className={`py-3 px-3 font-mono tabular-nums whitespace-nowrap ${p.textMuted}`}>
                      {row.timestamp
                        ? new Date(row.timestamp).toLocaleString(language === 'ar' ? 'ar-IQ' : 'en-US')
                        : '—'}
                    </td>

                    <td className={`py-3 px-3 max-w-md ${p.textSecondary}`}>
                      <p className="line-clamp-2 leading-relaxed">{row.details}</p>
                      {row.targetName && (
                        <span className={`text-[10px] font-bold ${p.textMuted}`}>
                          {language === 'ar' ? `المعني: ${row.targetName}` : `Target: ${row.targetName}`}
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold border ${
                          row.status === 'approved' || row.status === 'active' || row.status === 'completed' || row.status === 'dispensed'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                            : row.status === 'rejected' || row.status === 'cancelled' || row.status === 'suspended'
                            ? 'bg-rose-500/10 text-rose-500 border-rose-500/30'
                            : 'bg-[#0284C7]/10 text-[#0284C7] border-[#0284C7]/30'
                        }`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
