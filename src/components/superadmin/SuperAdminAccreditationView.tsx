import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock,
  Eye,
  FileCheck2,
  FileText,
  Mail,
  MapPin,
  MessageSquarePlus,
  Phone,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { AccountStatus, UserProfile, UserRole } from '../../types';
import { isRoleSuspended } from '../../config/portalsConfig';
import { db } from '../../lib/firebase';
import { SystemAuditLogEntry } from '../../lib/auditLogger';
import { validateAccountForApproval } from '../../utils/superAdminDashboardEngine';
import { formatRoleLabel } from '../../utils/subscriptionPaymentEngine';
import { AdminThemeMode, getAdminPalette } from './adminTheme';

interface LinkedFacilityDetails {
  address?: string;
  specialty?: string;
  qualifications?: string;
  workingHours?: string;
  photoOrLogoUrl?: string;
  bio?: string;
}

interface SuperAdminAccreditationViewProps {
  language: 'ar' | 'en';
  theme: AdminThemeMode;
  usersList: UserProfile[];
  systemAuditLogs: SystemAuditLogEntry[];
  loading: boolean;
  refreshing: boolean;
  actionLoadingId: string | null;
  isPurgingPending: boolean;
  onRefresh: () => void;
  onApproveUser: (user: UserProfile) => Promise<void>;
  onRejectUser: (user: UserProfile, reason: string) => Promise<void>;
  onRequestCompletion: (user: UserProfile, note: string) => Promise<void>;
  onSuspendUser: (user: UserProfile) => Promise<void>;
  onRequestDeleteUser: (user: UserProfile) => void;
  onRequestPurgePending: () => void;
  onLoadAuditHistory?: () => Promise<void>;
}

export const SuperAdminAccreditationView: React.FC<SuperAdminAccreditationViewProps> = ({
  language,
  theme,
  usersList,
  systemAuditLogs,
  loading,
  refreshing,
  actionLoadingId,
  isPurgingPending,
  onRefresh,
  onApproveUser,
  onRejectUser,
  onRequestCompletion,
  onSuspendUser,
  onRequestDeleteUser,
  onRequestPurgePending,
  onLoadAuditHistory,
}) => {
  const p = getAdminPalette(theme);

  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AccountStatus>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [linkedDetails, setLinkedDetails] = useState<LinkedFacilityDetails | null>(null);
  const [loadingLinkedDetails, setLoadingLinkedDetails] = useState(false);

  // Action reason modals (Rejection & Request Info Completion)
  const [rejectTarget, setRejectTarget] = useState<UserProfile | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [completionTarget, setCompletionTarget] = useState<UserProfile | null>(null);
  const [completionNote, setCompletionNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (onLoadAuditHistory) {
      onLoadAuditHistory().catch(() => {});
    }
  }, [onLoadAuditHistory]);

  const metrics = useMemo(() => {
    const nonAdmin = usersList.filter((u) => u.role !== 'super_admin' && !isRoleSuspended(u.role));
    return {
      total: nonAdmin.length,
      pending: nonAdmin.filter((u) => u.status === 'pending').length,
      incomplete: nonAdmin.filter((u) => u.status === 'incomplete').length,
      approved: nonAdmin.filter((u) => u.status === 'approved').length,
      rejected: nonAdmin.filter((u) => u.status === 'rejected').length,
      suspended: nonAdmin.filter((u) => u.status === 'suspended').length,
    };
  }, [usersList]);

  const filteredUsers = useMemo(() => {
    return usersList.filter((u) => {
      if (u.role === 'super_admin') return false;
      if (isRoleSuspended(u.role)) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (statusFilter !== 'all' && u.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const hay = [
          u.displayName,
          u.email,
          u.licenseNumber || '',
          u.facilityName || '',
          u.governorate || '',
          u.phone || '',
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      }
      return true;
    });
  }, [usersList, roleFilter, statusFilter, searchQuery]);

  const openInspector = async (usr: UserProfile) => {
    setSelectedUser(usr);
    setLinkedDetails(null);
    setLocalError(null);
    setLoadingLinkedDetails(true);

    try {
      let colName: string | null = null;
      if (usr.role === 'doctor') colName = 'doctor_profiles';
      else if (usr.role === 'laboratory') colName = 'lab_profiles';
      else if (usr.role === 'pharmacy') colName = 'pharmacy_profiles';
      else if (usr.role === 'radiology_center') colName = 'radiology_profiles';
      else if (usr.role === 'wholesaler') colName = 'wholesaler_profiles';

      if (colName) {
        const snap = await getDoc(doc(db, colName, usr.uid));
        if (snap.exists()) {
          const data = snap.data() as Record<string, any>;
          setLinkedDetails({
            address: data.clinicAddress || data.address || undefined,
            specialty: data.specialty || undefined,
            qualifications: data.qualifications || undefined,
            workingHours: data.workingHours || undefined,
            photoOrLogoUrl: data.photoURL || data.logoUrl || undefined,
            bio: data.bio || undefined,
          });
        }
      }
    } catch {
      // Non-fatal: inspector still displays registration user doc fields
    } finally {
      setLoadingLinkedDetails(false);
    }
  };

  const userDecisionHistory = useMemo(() => {
    if (!selectedUser) return [];
    return systemAuditLogs
      .filter((l) => l.category === 'accreditation' && l.targetUid === selectedUser.uid)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [selectedUser, systemAuditLogs]);

  const getStatusMeta = (status: AccountStatus) => {
    switch (status) {
      case 'approved':
        return {
          labelAr: 'معتمد',
          labelEn: 'Approved',
          cls: theme === 'dark'
            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50'
            : 'bg-emerald-50 text-emerald-800 border-emerald-200',
        };
      case 'pending':
        return {
          labelAr: 'طلب جديد / قيد التدقيق',
          labelEn: 'Pending Review',
          cls: theme === 'dark'
            ? 'bg-amber-950/60 text-amber-300 border-amber-700/50'
            : 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'incomplete':
        return {
          labelAr: 'بانتظار استكمال البيانات',
          labelEn: 'Incomplete Info',
          cls: theme === 'dark'
            ? 'bg-sky-950/60 text-sky-300 border-sky-700/50'
            : 'bg-sky-50 text-sky-800 border-sky-200',
        };
      case 'rejected':
        return {
          labelAr: 'مرفوض',
          labelEn: 'Rejected',
          cls: theme === 'dark'
            ? 'bg-rose-950/60 text-rose-300 border-rose-700/50'
            : 'bg-rose-50 text-rose-800 border-rose-200',
        };
      case 'suspended':
      default:
        return {
          labelAr: 'معلق',
          labelEn: 'Suspended',
          cls: theme === 'dark'
            ? 'bg-red-950/60 text-red-300 border-red-700/50'
            : 'bg-red-50 text-red-800 border-red-200',
        };
    }
  };

  const handleTryApprove = async (usr: UserProfile) => {
    const check = validateAccountForApproval(usr);
    if (!check.allowed) {
      const missingText = (language === 'ar' ? check.missingFieldsAr : check.missingFieldsEn).join('، ');
      setLocalError(
        language === 'ar'
          ? `لا يمكن اعتماد الحساب قبل استكمال البيانات الأساسية المطلوبة: ${missingText}`
          : `Cannot approve account until required fields are provided: ${missingText}`
      );
      if (!selectedUser || selectedUser.uid !== usr.uid) {
        await openInspector(usr);
      }
      return;
    }
    setLocalError(null);
    await onApproveUser(usr);
    if (selectedUser?.uid === usr.uid) {
      setSelectedUser({ ...usr, status: 'approved' });
    }
  };

  const handleSubmitReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTarget) return;
    if (rejectReason.trim().length < 3) return;
    await onRejectUser(rejectTarget, rejectReason.trim());
    if (selectedUser?.uid === rejectTarget.uid) {
      setSelectedUser({ ...rejectTarget, status: 'rejected' });
    }
    setRejectTarget(null);
    setRejectReason('');
  };

  const handleSubmitCompletionRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completionTarget) return;
    if (completionNote.trim().length < 3) return;
    await onRequestCompletion(completionTarget, completionNote.trim());
    if (selectedUser?.uid === completionTarget.uid) {
      setSelectedUser({ ...completionTarget, status: 'incomplete' });
    }
    setCompletionTarget(null);
    setCompletionNote('');
  };

  const pendingOrIncompleteCount = metrics.pending + metrics.incomplete;

  return (
    <div className="space-y-6">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <span className={`text-xs font-bold block mb-1 ${p.textMuted}`}>
            {language === 'ar' ? 'إجمالي الكوادر والحسابات' : 'Total Accounts'}
          </span>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>{metrics.total}</div>
        </div>

        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <span className="text-xs font-bold text-amber-500 block mb-1">
            {language === 'ar' ? 'طلبات جديدة' : 'New / Pending'}
          </span>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>{metrics.pending}</div>
        </div>

        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <span className="text-xs font-bold text-[#0284C7] block mb-1">
            {language === 'ar' ? 'قيد الاستكمال' : 'Incomplete Info'}
          </span>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>{metrics.incomplete}</div>
        </div>

        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <span className="text-xs font-bold text-emerald-500 block mb-1">
            {language === 'ar' ? 'حسابات معتمدة' : 'Approved'}
          </span>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>{metrics.approved}</div>
        </div>

        <div className={`rounded-2xl p-4 border ${p.cardBg} ${p.cardBorder}`}>
          <span className="text-xs font-bold text-rose-500 block mb-1">
            {language === 'ar' ? 'مرفوض / معلق' : 'Rejected / Suspended'}
          </span>
          <div className={`text-2xl font-black tabular-nums ${p.textPrimary}`}>
            {metrics.rejected + metrics.suspended}
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className={`rounded-2xl p-5 border space-y-4 ${p.cardBg} ${p.cardBorder}`}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search size={16} className={`absolute top-1/2 -translate-y-1/2 start-3.5 ${p.textMuted}`} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === 'ar'
                  ? 'بحث بالاسم، المنشأة، رقم الترخيص، المحافظة، أو البريد...'
                  : 'Search by name, facility, license, governorate, email...'
              }
              className={`w-full ps-10 pe-4 py-2.5 rounded-xl border text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0284C7] ${p.inputBg}`}
            />
          </div>

          <div className="flex items-center gap-2">
            {pendingOrIncompleteCount > 0 && (
              <button
                type="button"
                onClick={onRequestPurgePending}
                disabled={isPurgingPending}
                className="px-3.5 py-2.5 rounded-xl bg-rose-600/10 hover:bg-rose-600/20 text-rose-600 border border-rose-500/30 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 size={13} />
                <span>
                  {language === 'ar'
                    ? `تطهير المعلقة (${pendingOrIncompleteCount})`
                    : `Purge Pending (${pendingOrIncompleteCount})`}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer ${p.secondaryBtn}`}
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
              <span>{language === 'ar' ? 'تحديث' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Role & Status Filters */}
        <div className={`flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-3 border-t ${p.cardBorder}`}>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`font-bold me-1 ${p.textMuted}`}>
              {language === 'ar' ? 'الفئة:' : 'Role:'}
            </span>
            {(['all', 'doctor', 'laboratory', 'radiology_center', 'pharmacy', 'wholesaler', 'secretary', 'patient'] as const)
              .filter((r) => r === 'all' || !isRoleSuspended(r))
              .map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRoleFilter(r)}
                  className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                    roleFilter === r
                      ? 'bg-[#0B1F3A] text-white border border-[#C8A24A]/40'
                      : `${p.cardMutedBg} ${p.textSecondary} hover:opacity-80`
                  }`}
                >
                  {r === 'all' ? (language === 'ar' ? 'الكل' : 'All') : formatRoleLabel(r, language)}
                </button>
              ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className={`font-bold me-1 ${p.textMuted}`}>
              {language === 'ar' ? 'الحالة:' : 'Status:'}
            </span>
            {(
              [
                { id: 'all', ar: 'الكل', en: 'All' },
                { id: 'pending', ar: 'جديد', en: 'New' },
                { id: 'incomplete', ar: 'بانتظار استكمال', en: 'Incomplete' },
                { id: 'approved', ar: 'معتمد', en: 'Approved' },
                { id: 'rejected', ar: 'مرفوض', en: 'Rejected' },
                { id: 'suspended', ar: 'معلق', en: 'Suspended' },
              ] as const
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setStatusFilter(s.id)}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors cursor-pointer ${
                  statusFilter === s.id
                    ? 'bg-[#C8A24A] text-[#071426]'
                    : `${p.cardMutedBg} ${p.textSecondary} hover:opacity-80`
                }`}
              >
                {language === 'ar' ? s.ar : s.en}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Applicants Table */}
      <div className={`rounded-2xl border overflow-hidden ${p.cardBg} ${p.cardBorder}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead>
              <tr className={`border-b font-bold uppercase tracking-wider ${p.tableHeaderBg}`}>
                <th className="py-3.5 px-4">{language === 'ar' ? 'الاسم والمنشأة' : 'Applicant / Facility'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'الدور المهني' : 'Role'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'الترخيص والبيانات' : 'License & Data'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'المحافظة' : 'Governorate'}</th>
                <th className="py-3.5 px-3">{language === 'ar' ? 'الحالة' : 'Status'}</th>
                <th className="py-3.5 px-4 text-end">{language === 'ar' ? 'إجراءات الاعتماد' : 'Decision'}</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${p.tableDivider}`}>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`py-14 text-center ${p.textMuted}`}>
                    {loading
                      ? language === 'ar'
                        ? 'جارٍ تحميل طلبات الاعتماد...'
                        : 'Loading accreditation records...'
                      : language === 'ar'
                      ? 'لا توجد طلبات أو حسابات مطابقة للفلاتر الحالية.'
                      : 'No accounts match the selected filters.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((usr) => {
                  const statusMeta = getStatusMeta(usr.status);
                  const completeness = validateAccountForApproval(usr);
                  const isActing = actionLoadingId === usr.uid;

                  return (
                    <tr key={usr.uid} className={`transition-colors ${p.tableRowHover}`}>
                      <td className="py-3.5 px-4">
                        <div className={`font-extrabold ${p.textPrimary}`}>{usr.displayName || '—'}</div>
                        <div className={`text-[11px] ${p.textMuted}`}>
                          {usr.facilityName || usr.email}
                        </div>
                      </td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${p.accentGoldBadge}`}>
                          {formatRoleLabel(usr.role, language)}
                        </span>
                      </td>

                      <td className="py-3.5 px-3">
                        <div className={`font-mono font-bold tabular-nums ${p.textPrimary}`}>
                          {usr.licenseNumber || '—'}
                        </div>
                        <span
                          className={`text-[10px] font-bold ${
                            completeness.allowed ? 'text-emerald-500' : 'text-amber-500'
                          }`}
                        >
                          {completeness.allowed
                            ? language === 'ar'
                              ? 'البيانات مكتملة'
                              : 'Complete'
                            : language === 'ar'
                            ? `ينقص: ${completeness.missingFieldsAr.slice(0, 2).join('، ')}`
                            : `Missing: ${completeness.missingFieldsEn.slice(0, 2).join(', ')}`}
                        </span>
                      </td>

                      <td className={`py-3.5 px-3 ${p.textSecondary}`}>{usr.governorate || '—'}</td>

                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border ${statusMeta.cls}`}>
                          {language === 'ar' ? statusMeta.labelAr : statusMeta.labelEn}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => openInspector(usr)}
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer ${p.secondaryBtn}`}
                          >
                            <Eye size={13} />
                            <span>{language === 'ar' ? 'تدقيق' : 'Inspect'}</span>
                          </button>

                          {usr.status !== 'approved' && (
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => handleTryApprove(usr)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 size={13} />
                              <span>{language === 'ar' ? 'اعتماد' : 'Approve'}</span>
                            </button>
                          )}

                          {usr.status !== 'incomplete' && usr.status !== 'approved' && (
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => {
                                setCompletionTarget(usr);
                                setCompletionNote('');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-[#0284C7] hover:bg-[#0369A1] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <MessageSquarePlus size={13} />
                              <span>{language === 'ar' ? 'استكمال' : 'Request Info'}</span>
                            </button>
                          )}

                          {usr.status !== 'rejected' && (
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() => {
                                setRejectTarget(usr);
                                setRejectReason('');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <XCircle size={13} />
                              <span>{language === 'ar' ? 'رفض' : 'Reject'}</span>
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={isActing}
                            onClick={() => onRequestDeleteUser(usr)}
                            className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 cursor-pointer"
                            title={language === 'ar' ? 'حذف الحساب نهائياً' : 'Delete Account'}
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

      {/* INSPECTOR MODAL */}
      {selectedUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className={`rounded-3xl max-w-2xl w-full p-6 sm:p-7 shadow-2xl border space-y-5 my-8 max-h-[90vh] overflow-y-auto ${p.modalBg}`}>
            <div className={`flex items-start justify-between gap-3 pb-4 border-b ${p.cardBorder}`}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#0B1F3A] text-[#E5C168] border border-[#C8A24A]/40 flex items-center justify-center font-black text-lg shrink-0">
                  {selectedUser.displayName?.charAt(0) || 'M'}
                </div>
                <div>
                  <h3 className={`text-base font-black ${p.textPrimary}`}>{selectedUser.displayName}</h3>
                  <div className={`text-xs flex items-center gap-2 flex-wrap ${p.textMuted}`}>
                    <span className="font-mono">{selectedUser.email}</span>
                    <span>•</span>
                    <span>{formatRoleLabel(selectedUser.role, language)}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedUser(null);
                  setLocalError(null);
                }}
                className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${p.secondaryBtn}`}
              >
                ✕
              </button>
            </div>

            {localError && (
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-500 text-xs font-bold flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                <span>{localError}</span>
              </div>
            )}

            {/* Applicant Official Registration Credentials */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className={`p-3.5 rounded-xl border ${p.cardMutedBg} ${p.cardBorder}`}>
                <span className={`block mb-1 ${p.textMuted}`}>
                  <FileCheck2 size={12} className="inline me-1" />
                  {language === 'ar' ? 'رقم الترخيص / الإجازة' : 'License Number'}
                </span>
                <span className={`font-mono font-black text-sm ${p.textPrimary}`}>
                  {selectedUser.licenseNumber || (language === 'ar' ? 'غير مزود' : 'Not provided')}
                </span>
              </div>

              <div className={`p-3.5 rounded-xl border ${p.cardMutedBg} ${p.cardBorder}`}>
                <span className={`block mb-1 ${p.textMuted}`}>
                  <Building2 size={12} className="inline me-1" />
                  {language === 'ar' ? 'اسم العيادة / المنشأة' : 'Facility Name'}
                </span>
                <span className={`font-bold ${p.textPrimary}`}>
                  {selectedUser.facilityName || (language === 'ar' ? 'غير مزود' : 'Not provided')}
                </span>
              </div>

              <div className={`p-3.5 rounded-xl border ${p.cardMutedBg} ${p.cardBorder}`}>
                <span className={`block mb-1 ${p.textMuted}`}>
                  <Phone size={12} className="inline me-1" />
                  {language === 'ar' ? 'رقم الهاتف' : 'Phone'}
                </span>
                <span className={`font-mono font-bold ${p.textPrimary}`}>
                  {selectedUser.phone || '—'}
                </span>
              </div>

              <div className={`p-3.5 rounded-xl border ${p.cardMutedBg} ${p.cardBorder}`}>
                <span className={`block mb-1 ${p.textMuted}`}>
                  <MapPin size={12} className="inline me-1" />
                  {language === 'ar' ? 'المحافظة' : 'Governorate'}
                </span>
                <span className={`font-bold ${p.textPrimary}`}>
                  {selectedUser.governorate || '—'}
                </span>
              </div>
            </div>

            {/* Linked Practice Profile & License Document Verification Box */}
            <div className={`rounded-2xl p-4 border space-y-2 text-xs ${p.cardMutedBg} ${p.cardBorder}`}>
              <div className="flex items-center justify-between">
                <span className={`font-extrabold flex items-center gap-1.5 ${p.textPrimary}`}>
                  <FileText size={14} className="text-[#C8A24A]" />
                  <span>{language === 'ar' ? 'الوثائق المهنية والملف التعريفي المرتبط' : 'Linked Profile & Credential Documents'}</span>
                </span>
                {loadingLinkedDetails && <RefreshCw size={13} className="animate-spin text-[#0284C7]" />}
              </div>

              {linkedDetails ? (
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 ${p.textSecondary}`}>
                  {linkedDetails.specialty && (
                    <div>
                      <span className={p.textMuted}>{language === 'ar' ? 'التخصص: ' : 'Specialty: '}</span>
                      <strong>{linkedDetails.specialty}</strong>
                    </div>
                  )}
                  {linkedDetails.qualifications && (
                    <div>
                      <span className={p.textMuted}>{language === 'ar' ? 'الشهادات: ' : 'Qualifications: '}</span>
                      <strong>{linkedDetails.qualifications}</strong>
                    </div>
                  )}
                  {linkedDetails.address && (
                    <div className="sm:col-span-2">
                      <span className={p.textMuted}>{language === 'ar' ? 'العنوان التفصيلي: ' : 'Address: '}</span>
                      <strong>{linkedDetails.address}</strong>
                    </div>
                  )}
                </div>
              ) : !loadingLinkedDetails ? (
                <p className={p.textMuted}>
                  {language === 'ar'
                    ? 'لم يقم مقدم الطلب برفع ملفات مرفقة إضافية في سجل المنشأة؛ يعتمد التحقق على رقم الإجازة وبيانات التسجيل الرسمية أعلاه.'
                    : 'No uploaded document attachments found in linked profile; verification relies on official registration license fields above.'}
                </p>
              ) : null}
            </div>

            {/* Past Accreditation Decisions for this Applicant */}
            <div className="space-y-2 text-xs">
              <h4 className={`font-extrabold flex items-center gap-1.5 ${p.textMuted}`}>
                <Clock size={13} />
                <span>{language === 'ar' ? 'سجل قرارات الاعتماد والتدقيق لهذا الحساب' : 'Accreditation Decision Log'}</span>
              </h4>
              {userDecisionHistory.length === 0 ? (
                <p className={`text-[11px] ${p.textMuted}`}>
                  {language === 'ar' ? 'لا توجد قرارات سابقة مسجلة في السجل.' : 'No prior decisions logged yet.'}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {userDecisionHistory.map((item) => (
                    <div key={item.id} className={`p-2.5 rounded-xl border ${p.cardMutedBg} ${p.cardBorder}`}>
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <span className={`font-bold ${p.textPrimary}`}>{item.status}</span>
                        <span className={`text-[10px] font-mono tabular-nums ${p.textMuted}`}>
                          {new Date(item.timestamp).toLocaleString(language === 'ar' ? 'ar-IQ' : 'en-US')}
                        </span>
                      </div>
                      <p className={`text-[11px] ${p.textSecondary}`}>{item.details}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Inspector Footer Actions */}
            <div className={`pt-4 border-t flex flex-wrap items-center justify-end gap-2 ${p.cardBorder}`}>
              {selectedUser.status !== 'approved' && (
                <button
                  type="button"
                  disabled={actionLoadingId === selectedUser.uid}
                  onClick={() => handleTryApprove(selectedUser)}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer flex items-center gap-1.5"
                >
                  <ShieldCheck size={14} />
                  <span>{language === 'ar' ? 'اعتماد وتوثيق الحساب' : 'Approve Account'}</span>
                </button>
              )}

              {selectedUser.status !== 'incomplete' && (
                <button
                  type="button"
                  disabled={actionLoadingId === selectedUser.uid}
                  onClick={() => {
                    setCompletionTarget(selectedUser);
                    setCompletionNote('');
                  }}
                  className="px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold text-xs cursor-pointer"
                >
                  {language === 'ar' ? 'طلب استكمال البيانات' : 'Request Info Completion'}
                </button>
              )}

              {selectedUser.status !== 'rejected' && (
                <button
                  type="button"
                  disabled={actionLoadingId === selectedUser.uid}
                  onClick={() => {
                    setRejectTarget(selectedUser);
                    setRejectReason('');
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer"
                >
                  {language === 'ar' ? 'رفض الطلب' : 'Reject'}
                </button>
              )}

              {selectedUser.status !== 'suspended' && (
                <button
                  type="button"
                  disabled={actionLoadingId === selectedUser.uid}
                  onClick={() => onSuspendUser(selectedUser)}
                  className="px-4 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 border border-amber-500/30 font-bold text-xs cursor-pointer"
                >
                  {language === 'ar' ? 'تعليق الحساب' : 'Suspend'}
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedUser(null)}
                className={`px-4 py-2 rounded-xl font-bold text-xs cursor-pointer ${p.secondaryBtn}`}
              >
                {language === 'ar' ? 'إغلاق' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT WITH REASON MODAL */}
      {rejectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`rounded-3xl max-w-md w-full p-6 shadow-2xl border space-y-4 ${p.modalBg}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 text-rose-500 flex items-center justify-center">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className={`text-sm font-black ${p.textPrimary}`}>
                  {language === 'ar' ? `رفض اعتماد: ${rejectTarget.displayName}` : `Reject: ${rejectTarget.displayName}`}
                </h3>
                <p className={`text-[11px] ${p.textMuted}`}>
                  {language === 'ar' ? 'يرجى توضيح سبب الرفض ليتم إخطار مقدم الطلب وتسجيله رقابياً' : 'Provide rejection reason for applicant notification & audit log'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitReject} className="space-y-3 text-xs">
              <textarea
                required
                minLength={3}
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={language === 'ar' ? 'مثال: رقم الإجازة النقابية غير مطابق أو منتهي الصلاحية...' : 'Enter rejection reason...'}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs ${p.inputBg}`}
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectTarget(null)}
                  className={`px-4 py-2 rounded-xl font-bold ${p.secondaryBtn}`}
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={rejectReason.trim().length < 3 || actionLoadingId === rejectTarget.uid}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold disabled:opacity-50"
                >
                  {language === 'ar' ? 'تأكيد الرفض وتوثيق القرار' : 'Confirm Rejection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REQUEST INFO COMPLETION MODAL */}
      {completionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className={`rounded-3xl max-w-md w-full p-6 shadow-2xl border space-y-4 ${p.modalBg}`}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0284C7]/15 text-[#0284C7] flex items-center justify-center">
                <Mail size={20} />
              </div>
              <div>
                <h3 className={`text-sm font-black ${p.textPrimary}`}>
                  {language === 'ar' ? `طلب استكمال بيانات: ${completionTarget.displayName}` : `Request Completion: ${completionTarget.displayName}`}
                </h3>
                <p className={`text-[11px] ${p.textMuted}`}>
                  {language === 'ar' ? 'سيتم تحويل الحالة إلى غير مكتمل وإرسال تنبيه فوري للحساب' : 'Sets status to incomplete and notifies applicant'}
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmitCompletionRequest} className="space-y-3 text-xs">
              <textarea
                required
                minLength={3}
                rows={3}
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                placeholder={language === 'ar' ? 'مثال: يرجى تزويدنا برقم إجازة نقابة الأطباء وعنوان العيادة الدقيق...' : 'Specify missing info required...'}
                className={`w-full px-3.5 py-2.5 rounded-xl border text-xs ${p.inputBg}`}
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCompletionTarget(null)}
                  className={`px-4 py-2 rounded-xl font-bold ${p.secondaryBtn}`}
                >
                  {language === 'ar' ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={completionNote.trim().length < 3 || actionLoadingId === completionTarget.uid}
                  className="px-4 py-2 rounded-xl bg-[#0284C7] hover:bg-[#0369A1] text-white font-bold disabled:opacity-50"
                >
                  {language === 'ar' ? 'إرسال طلب الاستكمال' : 'Send Completion Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
