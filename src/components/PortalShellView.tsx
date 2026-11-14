import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { Logo } from './Logo';
import { PORTALS_DATA } from '../data/portalsData';
import { PortalId, UserRole, UserProfile, AccountStatus } from '../types';
import { isVerifiedSuperAdmin, canUserAccessPortal } from '../utils/adminSecurity';
import { 
  ArrowLeft, 
  ArrowRight, 
  Stethoscope, 
  Scan, 
  FlaskConical, 
  Pill, 
  User, 
  ShieldCheck, 
  Users, 
  Lock, 
  Info, 
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  KeyRound,
  FileText,
  Clock,
  XCircle,
  RefreshCw,
  LogIn,
  LogOut,
  Building2,
  MapPin,
  Phone,
  FileCheck2,
  Activity,
  Layers,
  Sparkles,
  Trash2,
  Wallet,
  Headphones
} from 'lucide-react';
import { isPortalActive, isPortalSuspended, getSuspendedPortalNotice } from '../config/portalsConfig';
import { OFFICIAL_SUPPORT_CONFIG } from '../config/officialSupportConfig';
import { buildWhatsAppSupportHref } from '../utils/supportRouting';
const SubscriptionPaymentModal = React.lazy(() =>
  import('./SubscriptionPaymentModal').then((m) => ({ default: m.SubscriptionPaymentModal }))
);
const OfficialSupportCenter = React.lazy(() =>
  import('./OfficialSupportCenter').then((m) => ({ default: m.OfficialSupportCenter }))
);
import {
  checkAndNotifySubscriptionExpiry,
  subscribeUserPaymentRequests,
  subscribeUserSubscription,
} from '../lib/subscriptionPaymentService';
import { getSubscriptionExpiryStatus } from '../utils/subscriptionPaymentEngine';
import { PaymentRequest, UserSubscription } from '../types';

// Lazy-loaded Workspaces for optimal bundle splitting and low memory footprint
const DoctorPortalWorkspace = React.lazy(() =>
  import('./DoctorPortalWorkspace').then((m) => ({ default: m.DoctorPortalWorkspace }))
);
const RadiologyPortalWorkspace = React.lazy(() =>
  import('./RadiologyPortalWorkspace').then((m) => ({ default: m.RadiologyPortalWorkspace }))
);
const LaboratoryPortalWorkspace = React.lazy(() =>
  import('./LaboratoryPortalWorkspace').then((m) => ({ default: m.LaboratoryPortalWorkspace }))
);
const PharmacyPortalWorkspace = React.lazy(() =>
  import('./PharmacyPortalWorkspace').then((m) => ({ default: m.PharmacyPortalWorkspace }))
);
const WholesalerPortalWorkspace = React.lazy(() =>
  import('./WholesalerPortalWorkspace').then((m) => ({ default: m.WholesalerPortalWorkspace }))
);
const PatientPortalWorkspace = React.lazy(() =>
  import('./PatientPortalWorkspace').then((m) => ({ default: m.PatientPortalWorkspace }))
);
const SecretaryPortalWorkspace = React.lazy(() =>
  import('./SecretaryPortalWorkspace').then((m) => ({ default: m.SecretaryPortalWorkspace }))
);
const SuperAdminPortalWorkspace = React.lazy(() =>
  import('./SuperAdminPortalWorkspace').then((m) => ({ default: m.SuperAdminPortalWorkspace }))
);

interface PortalShellViewProps {
  portalId: PortalId;
  onBackToHome: () => void;
  onSelectPortal: (id: PortalId) => void;
  onBackToPortals?: () => void;
}

export const PortalShellView: React.FC<PortalShellViewProps> = ({
  portalId,
  onBackToHome,
  onSelectPortal,
  onBackToPortals,
}) => {
  const { 
    user, 
    userProfile, 
    loading: authLoading, 
    authError, 
    isAdmin, 
    signInWithGoogle, 
    setShowDomainHelp,
    unauthorizedDomainDetected,
    signOut, 
    refreshProfile,
    deleteOwnAccountPermanently,
  } = useAuth();
  const { t, isRTL, language } = useLanguage();

  const [refreshing, setRefreshing] = useState(false);
  const [showSelfDeleteModal, setShowSelfDeleteModal] = useState(false);
  const [isDeletingOwnAccount, setIsDeletingOwnAccount] = useState(false);
  const [selfDeleteError, setSelfDeleteError] = useState<string | null>(null);
  const [providerSubscription, setProviderSubscription] = useState<UserSubscription | null>(null);
  const [providerPaymentRequests, setProviderPaymentRequests] = useState<PaymentRequest[]>([]);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [showSupportModal, setShowSupportModal] = useState(false);

  const handleConfirmSelfDelete = async () => {
    setIsDeletingOwnAccount(true);
    setSelfDeleteError(null);
    try {
      await deleteOwnAccountPermanently();
      setShowSelfDeleteModal(false);
      onBackToHome();
    } catch (err: unknown) {
      console.error('Error deleting account:', err);
      const msg = err instanceof Error ? err.message : (language === 'ar' ? 'فشل حذف الحساب' : 'Failed to delete account');
      setSelfDeleteError(msg);
    } finally {
      setIsDeletingOwnAccount(false);
    }
  };

  const portal = PORTALS_DATA.find((p) => p.id === portalId) || PORTALS_DATA[0];

  const getPortalIcon = (iconName: string, size = 32) => {
    switch (iconName) {
      case 'doctor':
        return <Stethoscope size={size} />;
      case 'radiology':
        return <Scan size={size} />;
      case 'laboratory':
        return <FlaskConical size={size} />;
      case 'pharmacy':
        return <Pill size={size} />;
      case 'wholesaler':
        return <Building2 size={size} />;
      case 'patient':
        return <User size={size} />;
      case 'super_admin':
        return <ShieldCheck size={size} />;
      case 'secretary':
        return <Users size={size} />;
      default:
        return <Stethoscope size={size} />;
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setTimeout(() => setRefreshing(false), 500);
  };

  // Determine Access State via strict security isolation
  const isAuthenticated = !!user;
  const isSuperAdminPortal = portal.id === 'super_admin';
  const accessCheck = canUserAccessPortal(user, userProfile?.role, portal.id);
  const roleMatches = accessCheck.allowed;
  const isSuperAdminIsolated = accessCheck.reason === 'super_admin_isolated';

  // Auto-redirect Super Admin if they try to access operational portals
  useEffect(() => {
    if (isSuperAdminIsolated) {
      const redirectTimer = setTimeout(() => {
        onSelectPortal('super_admin');
      }, 2500);
      return () => clearTimeout(redirectTimer);
    }
  }, [isSuperAdminIsolated, onSelectPortal]);

  const isApproved = userProfile?.status === 'approved';
  const isPending = userProfile?.status === 'pending';
  const isRejected = userProfile?.status === 'rejected';
  const isSuspended = userProfile?.status === 'suspended';

  const portalSuspended = isPortalSuspended(portal.id);

  const isProviderSubscriptionPortal =
    !portalSuspended &&
    (portal.id === 'doctor' ||
      portal.id === 'radiology' ||
      portal.id === 'laboratory' ||
      portal.id === 'pharmacy' ||
      portal.id === 'wholesaler');

  useEffect(() => {
    if (!user?.uid || !isProviderSubscriptionPortal || !isApproved) {
      setProviderSubscription(null);
      setProviderPaymentRequests([]);
      return;
    }

    const unsubSub = subscribeUserSubscription(user.uid, (sub) => {
      setProviderSubscription(sub);
      if (sub) {
        checkAndNotifySubscriptionExpiry(userProfile, sub).catch(() => {});
      }
    });
    const unsubReqs = subscribeUserPaymentRequests(user.uid, (reqs) => {
      setProviderPaymentRequests(reqs);
    });
    return () => {
      unsubSub();
      unsubReqs();
    };
  }, [user?.uid, isProviderSubscriptionPortal, isApproved, userProfile]);

  return (
    <div className="min-h-screen bg-white pt-24 pb-20 print:pt-0 print:pb-0">
      {/* Top Banner Navigation / Breadcrumb */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mb-8 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 py-3 border-b border-slate-200">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              type="button"
              onClick={onBackToPortals || onBackToHome}
              className="inline-flex items-center gap-2 px-4 py-2 min-h-[42px] rounded-xl text-xs sm:text-sm font-bold text-white bg-[#003366] hover:bg-[#002244] transition-colors cursor-pointer group shadow-xs"
            >
              {isRTL ? (
                <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
              ) : (
                <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
              )}
              <span>{language === 'ar' ? 'العودة إلى اختيار الأقسام' : 'Back to Sections'}</span>
            </button>

            <button
              type="button"
              onClick={onBackToHome}
              className="inline-flex items-center gap-1.5 px-3 py-2 min-h-[42px] rounded-xl text-xs font-semibold text-slate-600 hover:text-[#003366] hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <span>{language === 'ar' ? 'شاشة الترحيب' : 'Welcome'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <button
              type="button"
              onClick={() => setShowSupportModal(true)}
              data-portal-support-trigger="true"
              className="px-3.5 py-2 min-h-[42px] rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              title={language === 'ar' ? 'فتح مركز الدعم الرسمي MEDORA' : 'Open MEDORA Official Support Center'}
            >
              <Headphones size={15} className="text-emerald-700" />
              <span>{language === 'ar' ? 'مركز الدعم الرسمي' : 'Support Center'}</span>
            </button>

            {isAuthenticated && (
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 min-h-[42px] rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
                title="تحديث البيانات من الخادم"
              >
                <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#003366]' : ''} />
                <span className="hidden sm:inline">
                  {language === 'ar' ? 'تحديث' : 'Sync'}
                </span>
              </button>
            )}

            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: portal.accentColor }} />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {t.portalShell.currentPortal}:
              </span>
              <span className="text-sm font-bold text-slate-900">
                {language === 'ar' ? portal.titleAr : portal.titleEn}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Portal Shell Content Container */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 print:max-w-none print:px-0">
        {/* Portal Header Card */}
        <div className="bg-white/95 backdrop-blur-md rounded-3xl p-6 sm:p-8 shadow-sm border border-white/80 mb-8 relative overflow-hidden print:hidden">
          <div 
            className="absolute top-0 left-0 right-0 h-2" 
            style={{ backgroundColor: portal.accentColor }}
          />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-start gap-5">
              <div
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0"
                style={{ backgroundColor: portal.accentColor }}
              >
                {getPortalIcon(portal.iconName, 36)}
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                    {language === 'ar' ? portal.titleAr : portal.titleEn}
                  </h1>
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                    MEDORA-{portal.order}
                  </span>
                </div>
                <p className="text-sm sm:text-base font-semibold text-slate-600 mt-1">
                  {language === 'ar' ? portal.subtitleAr : portal.subtitleEn}
                </p>
                <p className="text-xs sm:text-sm text-slate-500 mt-1.5 max-w-2xl leading-relaxed">
                  {language === 'ar' ? portal.descAr : portal.descEn}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Logo size="sm" showTagline={false} />
                </div>
              </div>
            </div>

            {/* Current Auth & Status Chip */}
            <div className="flex flex-col items-start md:items-end gap-1.5 shrink-0">
              {isAuthenticated ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-700">{userProfile?.displayName || user?.email}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    userProfile?.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-800'
                      : userProfile?.status === 'pending'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-red-100 text-red-800'
                  }`}>
                    {userProfile?.status === 'approved' 
                      ? (language === 'ar' ? 'معتمد' : 'Approved')
                      : userProfile?.status === 'pending'
                      ? (language === 'ar' ? 'قيد التدقيق' : 'Pending Review')
                      : (language === 'ar' ? 'غير مصرح' : 'Restricted')}
                  </span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-bold">
                  <Lock size={14} />
                  <span>{language === 'ar' ? 'يتطلب تسجيل الدخول' : 'Sign-In Required'}</span>
                </div>
              )}
              <span className="text-[11px] text-slate-400">
                {language === 'ar' ? 'حماية مشفرة عبر Firebase RBAC' : 'Protected via Firebase RBAC'}
              </span>
            </div>
          </div>
        </div>

        {/* STATE 0: Temporarily Suspended Portal Gate (preserves code & data non-destructively) */}
        {portalSuspended && (() => {
          const notice = getSuspendedPortalNotice(portal.id, language);
          return (
            <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-amber-200 text-center mb-8">
              <div className="w-16 h-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto mb-5">
                <Clock size={32} />
              </div>

              <p className="text-xs font-semibold text-amber-800 mb-2">
                {notice.subtitle}
              </p>

              <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                {notice.title}
              </h2>

              <p className="mt-3 text-xs sm:text-sm text-slate-600 max-w-xl mx-auto leading-relaxed">
                {notice.description}
              </p>

              <div className="mt-5 p-4 rounded-2xl bg-slate-50 border border-slate-200 max-w-xl mx-auto text-xs text-slate-700 leading-relaxed flex items-start gap-2.5 text-start">
                <ShieldCheck size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <span>{notice.preservationNote}</span>
              </div>

              <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={onBackToPortals || onBackToHome}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl text-xs sm:text-sm font-bold text-white bg-[#003366] hover:bg-[#002244] transition-colors cursor-pointer min-h-[44px]"
                >
                  {language === 'ar' ? 'العودة إلى اختيار الأقسام' : 'Back to Sections'}
                </button>
                <button
                  type="button"
                  onClick={onBackToHome}
                  className="w-full sm:w-auto px-6 py-3 rounded-xl text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer min-h-[44px]"
                >
                  {language === 'ar' ? 'شاشة الترحيب' : 'Welcome Screen'}
                </button>
              </div>
            </div>
          );
        })()}

        {/* AUTHENTICATION STATE BRANCHING */}

        {/* STATE 1: User is NOT Authenticated */}
        {!portalSuspended && !isAuthenticated && (
          <div className="bg-white rounded-3xl p-8 sm:p-12 shadow-sm border border-slate-200 text-center mb-8">
            <div 
              className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-md"
              style={{ backgroundColor: portal.accentColor }}
            >
              <KeyRound size={32} />
            </div>
            
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
              {language === 'ar' 
                ? `تسجيل الدخول للوصول إلى ${portal.titleAr}`
                : `Sign In to Access ${portal.titleEn}`}
            </h2>

            <p className="mt-2 text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              {language === 'ar'
                ? 'تعتمد منصة MEDORA | ميدورا العراق معايير أمان موحدة. يتم تسجيل الدخول عبر حساب Google المعتمد لربط هويتك الرقمية بالسجل الطبي الموحد.'
                : 'MEDORA enforces strict role security. Sign in via your verified Google account to establish your certified identity.'}
            </p>

            {/* Role mapping for quick demo access */}
            {(() => {
              const portalRoleMap: Record<string, UserRole> = {
                doctor: 'doctor',
                radiology: 'radiology_center',
                laboratory: 'laboratory',
                pharmacy: 'pharmacy',
                wholesaler: 'wholesaler',
                patient: 'patient',
                super_admin: 'super_admin',
                secretary: 'secretary',
              };
              const targetRole = portalRoleMap[portal.id] || 'patient';

              return (
                <>
                  {/* Detailed Domain Error & Guide Banner */}
                  {unauthorizedDomainDetected && (
                    <div className="mt-5 p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-xs sm:text-sm text-start max-w-xl mx-auto space-y-2.5">
                      <div className="flex items-center gap-2 font-bold text-amber-800">
                        <ShieldAlert size={18} className="shrink-0" />
                        <span>
                          {language === 'ar'
                            ? 'نطاق المعاينة غير مضاف في إعدادات Firebase (auth/unauthorized-domain)'
                            : 'Preview Domain Not Authorized in Firebase (auth/unauthorized-domain)'}
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        {language === 'ar'
                          ? `يتطلب Google Sign-In إضافة نطاق (${window.location.hostname}) إلى Authorized Domains في Firebase Console، أو يمكنك تصفح هذه البوابة فوراً عبر وضع التجربة السريع.`
                          : `Google Sign-In requires (${window.location.hostname}) to be in Firebase Authorized Domains. Alternatively, test this portal immediately via Quick Demo.`}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setShowDomainHelp(true)}
                          className="px-3.5 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <ExternalLink size={14} />
                          <span>{language === 'ar' ? 'عرض خطوات إضافة النطاق' : 'View Domain Fix Guide'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* General Auth Error Banner */}
                  {authError && !unauthorizedDomainDetected && (
                    <div className="mt-5 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-900 text-xs sm:text-sm text-start max-w-xl mx-auto space-y-2 flex items-start gap-2.5">
                      <AlertTriangle size={18} className="shrink-0 text-red-600 mt-0.5" />
                      <div className="flex-1 leading-relaxed">{authError}</div>
                    </div>
                  )}

                  <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <button
                      onClick={signInWithGoogle}
                      disabled={authLoading}
                      className="w-full sm:w-auto px-7 py-3 rounded-xl text-sm font-bold text-white brand-gradient-btn shadow-md hover:shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                    >
                      <LogIn size={18} />
                      <span>
                        {authLoading
                          ? (language === 'ar' ? 'جاري الاتصال بـ Firebase...' : 'Connecting to Firebase...')
                          : (language === 'ar' ? 'تسجيل الدخول عبر Google' : 'Sign In with Google')}
                      </span>
                    </button>

                    <button
                      onClick={onBackToHome}
                      className="w-full sm:w-auto px-5 py-3 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                    >
                      {language === 'ar' ? 'الرجوع إلى الرئيسية' : 'Return to Home'}
                    </button>
                  </div>
                </>
              );
            })()}

            <div className="mt-8 pt-6 border-t border-slate-100 text-xs text-slate-400 flex items-center justify-center gap-2">
              <ShieldCheck size={16} className="text-emerald-600" />
              <span>
                {language === 'ar'
                  ? 'وصول المرضى مجاني وفوري. الكوادر الطبية والمراكز الصحية تخضع لتدقيق الترخيص.'
                  : 'Patient access is free. Medical professionals undergo license verification.'}
              </span>
            </div>
          </div>
        )}

        {/* STATE 2: User IS Authenticated, but Access is Denied */}
        {!portalSuspended && isAuthenticated && !roleMatches && (
          <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-sm border border-amber-200 mb-8 text-center">
            {isSuperAdminIsolated ? (
              <>
                <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mx-auto mb-4 border border-red-200">
                  <ShieldAlert size={36} />
                </div>

                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-bold mb-3">
                  <Lock size={13} />
                  <span>{language === 'ar' ? 'إجراء أمني إلزامي: عزل حساب الإدارة العليا' : 'Mandatory Security Gate: Super Admin Isolated'}</span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-slate-900">
                  {language === 'ar' ? 'تم رفض الوصول: حساب المشرف العام معزول تشغيلياً' : 'Access Denied: Super Admin Account Isolated'}
                </h2>

                <p className="mt-3 text-xs sm:text-sm text-slate-700 max-w-xl mx-auto leading-relaxed">
                  {language === 'ar'
                    ? 'حساب المشرف العام (bcgmoc@gmail.com) مخصص حصرياً للرقابة المركزية والتدقيق الأمني وإدارة منصة MEDORA العليا، ولا يملك صلاحية الدخول المباشر إلى بوابات الرعاية والتشغيل السريري واليومي (المرضى، الأطباء، الصيدليات، المختبرات، السكرتارية) صوناً لخصوصية وسرية البيانات الطبية.'
                    : 'The Super Admin account (bcgmoc@gmail.com) is strictly dedicated to central governance and platform security. To safeguard medical confidentiality, this account is prevented from accessing operational clinical portals.'}
                </p>

                <div className="mt-4 p-3 rounded-2xl bg-slate-50 border border-slate-200 max-w-md mx-auto text-xs text-slate-600 flex items-center justify-center gap-2">
                  <RefreshCw size={14} className="animate-spin text-[#003366]" />
                  <span>
                    {language === 'ar'
                      ? 'جارٍ إعادة توجيهك تلقائياً إلى بوابة الإدارة العليا خلال ثوانٍ...'
                      : 'Automatically redirecting you to the Super Admin Portal...'}
                  </span>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => onSelectPortal('super_admin')}
                    className="px-6 py-3 rounded-xl text-xs sm:text-sm font-bold text-white brand-gradient-btn shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center gap-2"
                  >
                    <ShieldCheck size={16} />
                    <span>{language === 'ar' ? 'الانتقال فوراً إلى بوابة الإدارة العليا' : 'Go to Super Admin Portal Now'}</span>
                  </button>

                  <button
                    onClick={onBackToHome}
                    className="px-5 py-3 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    {language === 'ar' ? 'الرجوع إلى الرئيسية' : 'Return to Home'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
                  <ShieldAlert size={32} />
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {language === 'ar' ? 'صلاحيات البوابة غير متطابقة' : 'Role Mismatch — Access Restricted'}
                </h2>

                <p className="mt-2 text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
                  {isSuperAdminPortal
                    ? (language === 'ar'
                        ? 'هذه البوابة مخصصة حصراً للمشرف العام المعتمد (bcgmoc@gmail.com). تم حظر وتقييد الوصول لجميع الحسابات الأخرى.'
                        : 'This portal is restricted exclusively to the verified Super Administrator (bcgmoc@gmail.com). All other accounts are denied access.')
                    : (language === 'ar'
                        ? `أنت مسجل حالياً بصفتك (${userProfile?.role}). هذه البوابة مخصصة حصراً لـ (${portal.role}). عملاً بمعايير حماية البيانات الطبية، لا يمكن الدخول إلا من خلال الحساب المصرح له.`
                        : `You are currently authenticated as (${userProfile?.role}). This portal requires (${portal.role}). Medical confidentiality prevents cross-role authorization.`)}
                </p>

                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={() => {
                      const targetPortal = PORTALS_DATA.find((p) => p.role === userProfile?.role);
                      if (targetPortal && isPortalActive(targetPortal.id)) {
                        onSelectPortal(targetPortal.id);
                      } else {
                        onBackToHome();
                      }
                    }}
                    className="px-6 py-3 rounded-xl text-xs sm:text-sm font-bold text-white brand-gradient-btn shadow-md hover:shadow-lg transition-all cursor-pointer"
                  >
                    {language === 'ar' ? 'الانتقال إلى بوابتك المعتمدة' : 'Go to Your Authorized Portal'}
                  </button>

                  <button
                    onClick={signOut}
                    className="px-5 py-3 rounded-xl text-xs sm:text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
                  >
                    {language === 'ar' ? 'تسجيل الخروج والتبديل' : 'Sign Out / Switch Account'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* STATE 3: User IS Authenticated and Role matches, but Status is PENDING */}
        {!portalSuspended && isAuthenticated && roleMatches && isPending && !isAdmin && (
          <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-sm border border-amber-200 mb-8">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <div className="w-16 h-16 rounded-2xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-md">
                <Clock size={32} />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800">
                    {language === 'ar' ? 'قيد المراجعة والتدقيق' : 'Pending Verification'}
                  </span>
                  <span className="text-xs text-slate-400">UID: {user.uid.slice(0, 8)}...</span>
                </div>

                <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                  {language === 'ar' ? 'طلب الاعتماد المهني قيد التدقيق الإداري' : 'Professional Accreditation Under Review'}
                </h2>

                <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
                  {language === 'ar'
                    ? 'عملاً بضوابط وزارة الصحة ونقابة الأطباء في العراق، يتم تقييد الوصول إلى السجلات الطبية والروشتات الإلكترونية لحين تدقيق صحة الترخيص المهني من قبل المشرف العام للمنصة.'
                    : 'Pursuant to Iraqi healthcare regulations, clinical and diagnostic records are restricted until the Super Admin validates your professional license.'}
                </p>

                {/* Verification Summary Card */}
                <div className="mt-6 p-4 rounded-2xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-slate-400 block mb-0.5">{language === 'ar' ? 'رقم الإجازة / الترخيص:' : 'License Number:'}</span>
                    <span className="font-bold text-slate-800 font-mono">{userProfile?.licenseNumber || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">{language === 'ar' ? 'المنشأة الطبية:' : 'Facility Name:'}</span>
                    <span className="font-bold text-slate-800">{userProfile?.facilityName || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block mb-0.5">{language === 'ar' ? 'المحافظة:' : 'Governorate:'}</span>
                    <span className="font-bold text-slate-800">{userProfile?.governorate || 'N/A'}</span>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-white brand-gradient-btn shadow-xs hover:shadow transition-all flex items-center gap-2"
                  >
                    <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
                    <span>{language === 'ar' ? 'إعادة فحص حالة الاعتماد' : 'Check Approval Status'}</span>
                  </button>

                  <a
                    href={buildWhatsAppSupportHref('main')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                  >
                    {language === 'ar'
                      ? `تسريع الاعتماد (${OFFICIAL_SUPPORT_CONFIG.generalSupport.titleAr}): ${OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone}`
                      : `Expedite via WhatsApp: ${OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone}`}
                  </a>

                  <button
                    type="button"
                    onClick={() => setShowSelfDeleteModal(true)}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>{language === 'ar' ? 'حذف الحساب نهائياً' : 'Delete Account Permanently'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STATE 4: User IS Authenticated and Role matches, but Status is REJECTED or SUSPENDED */}
        {!portalSuspended && isAuthenticated && roleMatches && (isRejected || isSuspended) && (
          <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-sm border border-red-200 mb-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <XCircle size={32} />
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
              {isSuspended 
                ? (language === 'ar' ? 'تم تعليق الحساب مؤقتاً' : 'Account Suspended')
                : (language === 'ar' ? 'طلب الاعتماد غير مكتمل أو مرفوض' : 'Application Not Approved')}
            </h2>

            <p className="mt-2 text-xs sm:text-sm text-slate-600 max-w-lg mx-auto leading-relaxed">
              {language === 'ar'
                ? 'يرجى مراجعة إدارة منصة MEDORA | ميدورا العراق عبر البريد الرسمي أو الواتساب لتعديل بيانات الترخيص أو فك التعليق.'
                : 'Please contact MEDORA support via email or WhatsApp to resolve accreditation status.'}
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a
                href={OFFICIAL_SUPPORT_CONFIG.email.mailtoHref}
                className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-[#003366] hover:bg-[#002244]"
              >
                {language === 'ar'
                  ? `مراسلة الدعم: ${OFFICIAL_SUPPORT_CONFIG.email.address}`
                  : `Email Support: ${OFFICIAL_SUPPORT_CONFIG.email.address}`}
              </a>

              <a
                href={buildWhatsAppSupportHref('main')}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
              >
                {language === 'ar'
                  ? `${OFFICIAL_SUPPORT_CONFIG.generalSupport.titleAr}: ${OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone}`
                  : `General Support: ${OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone}`}
              </a>

              <a
                href={buildWhatsAppSupportHref('womens')}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-rose-800 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors"
              >
                {language === 'ar'
                  ? `${OFFICIAL_SUPPORT_CONFIG.womensSupport.titleAr}: ${OFFICIAL_SUPPORT_CONFIG.womensSupport.displayPhone}`
                  : `Women's Support: ${OFFICIAL_SUPPORT_CONFIG.womensSupport.displayPhone}`}
              </a>

              <a
                href={OFFICIAL_SUPPORT_CONFIG.generalSupport.callUrl}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
              >
                {language === 'ar'
                  ? `اتصال: ${OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone}`
                  : `Call: ${OFFICIAL_SUPPORT_CONFIG.generalSupport.displayPhone}`}
              </a>

              <button
                type="button"
                onClick={() => setShowSelfDeleteModal(true)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 size={13} />
                <span>{language === 'ar' ? 'حذف الحساب نهائياً' : 'Delete Account Permanently'}</span>
              </button>
            </div>
          </div>
        )}

        {/* STATE 5: User IS Authenticated and Role matches, Status is APPROVED -> OPERATIONAL DASHBOARD */}
        {!portalSuspended && isAuthenticated && roleMatches && (isApproved || isAdmin) && (
          <div className="space-y-8 mb-8">
            {/* APPROVED OPERATIONAL DASHBOARD HEADER */}
            <div className="bg-gradient-to-r from-slate-900 to-[#003366] rounded-3xl p-6 sm:p-8 text-white shadow-xl print:hidden">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold mb-3">
                    <CheckCircle2 size={14} />
                    <span>{language === 'ar' ? 'حساب معتمد وموثق تشغيلياً' : 'Certified & Operational'}</span>
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-black">
                    {language === 'ar' ? `لوحة تشغيل: ${portal.titleAr}` : `${portal.titleEn} Dashboard`}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 mt-1">
                    {language === 'ar'
                      ? `مرحباً بك ${userProfile?.displayName} | الترخيص: ${userProfile?.licenseNumber || 'مفعل'}`
                      : `Welcome, ${userProfile?.displayName} | License: ${userProfile?.licenseNumber || 'Active'}`}
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  {userProfile?.role !== 'super_admin' && (
                    <button
                      type="button"
                      onClick={() => setShowSelfDeleteModal(true)}
                      className="px-3 py-2 rounded-xl text-xs font-bold text-red-200 bg-red-950/40 hover:bg-red-900/60 border border-red-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
                      title={language === 'ar' ? 'حذف حسابي نهائياً من المنصة' : 'Delete my account permanently'}
                    >
                      <Trash2 size={13} />
                      <span className="hidden sm:inline">{language === 'ar' ? 'حذف الحساب' : 'Delete'}</span>
                    </button>
                  )}
                  <button
                    onClick={signOut}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-200 bg-white/10 hover:bg-white/20 border border-white/20 transition-colors flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut size={14} />
                    <span>{language === 'ar' ? 'تسجيل الخروج' : 'Sign Out'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* PROVIDER SUBSCRIPTION STATUS & MANUAL WALLET CHECKOUT BAR */}
            {isProviderSubscriptionPortal && !isAdmin && (() => {
              const exp = getSubscriptionExpiryStatus(providerSubscription);
              const pendingReqs = providerPaymentRequests.filter(
                (r) => r.status === 'pending' || r.status === 'under_review'
              );
              const latestRejected = providerPaymentRequests[0]?.status === 'rejected'
                ? providerPaymentRequests[0]
                : null;

              return (
                <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#003366] border border-emerald-200 flex items-center justify-center shrink-0">
                      <Wallet size={20} />
                    </div>
                    <div className="text-xs space-y-0.5">
                      <div className="font-black text-slate-900 flex items-center gap-2 flex-wrap">
                        <span>
                          {exp.state === 'active' || exp.state === 'nearing_expiration'
                            ? language === 'ar'
                              ? `اشتراك MEDORA: ${providerSubscription?.planName}`
                              : `MEDORA Subscription: ${providerSubscription?.planName}`
                            : language === 'ar'
                            ? 'اشتراك المنصة والمدفوعات (سوبر كي / زين كاش)'
                            : 'Platform Subscription & Wallet Checkout'}
                        </span>
                        {exp.state === 'active' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            {language === 'ar' ? `ساري حتى ${providerSubscription?.endDate}` : `Active until ${providerSubscription?.endDate}`}
                          </span>
                        )}
                        {exp.state === 'nearing_expiration' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                            {language === 'ar' ? `ينتهي خلال ${exp.daysRemaining} أيام` : `Expiring in ${exp.daysRemaining}d`}
                          </span>
                        )}
                        {exp.state === 'expired' && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            {language === 'ar' ? 'منتهي الصلاحية' : 'Expired'}
                          </span>
                        )}
                        {pendingReqs.length > 0 && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                            {language === 'ar'
                              ? `طلب دفع قيد المراجعة (${pendingReqs[0].requestNumber})`
                              : `Payment Pending (${pendingReqs[0].requestNumber})`}
                          </span>
                        )}
                      </div>
                      <p className="text-slate-600">
                        {latestRejected && pendingReqs.length === 0
                          ? language === 'ar'
                            ? `تم رفض آخر طلب دفع (${latestRejected.requestNumber}): ${latestRejected.rejectionReason || ''}`
                            : `Last request rejected (${latestRejected.requestNumber}): ${latestRejected.rejectionReason || ''}`
                          : language === 'ar'
                          ? 'اختر الباقة وارفع إيصال التحويل عبر سوبر كي (SuperQi) أو زين كاش (ZainCash) للتجديد أو التفعيل.'
                          : 'Select your plan and upload a SuperQi or ZainCash transfer receipt for activation or renewal.'}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowCheckoutModal(true)}
                    className="px-4 py-2.5 rounded-xl bg-[#003366] hover:bg-[#002244] text-white font-bold text-xs flex items-center justify-center gap-2 shrink-0 shadow-xs cursor-pointer"
                  >
                    <Sparkles size={14} />
                    <span>
                      {exp.state === 'active' || exp.state === 'nearing_expiration'
                        ? language === 'ar'
                          ? 'إدارة الاشتراك / التجديد'
                          : 'Manage / Renew Subscription'
                        : language === 'ar'
                        ? 'الاشتراك والدفع الآن'
                        : 'Subscribe & Pay'}
                    </span>
                  </button>
                </div>
              );
            })()}

            {/* DEDICATED WORKSPACES FOR ALL PORTALS (LAZY LOADED & KEYED BY UID FOR SESSION ISOLATION) */}
            <React.Suspense
              fallback={
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200 shadow-xs flex flex-col items-center justify-center min-h-[320px]">
                  <RefreshCw size={28} className="animate-spin text-[#003366] mb-3" />
                  <p className="text-sm font-bold text-slate-800">
                    {language === 'ar' ? 'جاري تهيئة مساحة العمل الآمنة...' : 'Loading secure workspace...'}
                  </p>
                  <span className="text-xs text-slate-400 mt-1">
                    {language === 'ar' ? 'MEDORA Healthcare Cloud' : 'MEDORA Healthcare Cloud'}
                  </span>
                </div>
              }
            >
              {portal.id === 'doctor' ? (
                <DoctorPortalWorkspace key={`doctor-${user?.uid || 'anon'}`} onBackToHome={onBackToHome} />
              ) : portal.id === 'radiology' ? (
                <RadiologyPortalWorkspace key={`radiology-${user?.uid || 'anon'}`} onBackToHome={onBackToHome} />
              ) : portal.id === 'laboratory' ? (
                <LaboratoryPortalWorkspace key={`laboratory-${user?.uid || 'anon'}`} onBackToHome={onBackToHome} />
              ) : portal.id === 'pharmacy' ? (
                <PharmacyPortalWorkspace key={`pharmacy-${user?.uid || 'anon'}`} onBackToHome={onBackToHome} />
              ) : portal.id === 'wholesaler' ? (
                <WholesalerPortalWorkspace key={`wholesaler-${user?.uid || 'anon'}`} onBackToHome={onBackToHome} />
              ) : portal.id === 'patient' ? (
                <PatientPortalWorkspace key={`patient-${user?.uid || 'anon'}`} onBackToHome={onBackToHome} />
              ) : portal.id === 'secretary' ? (
                <SecretaryPortalWorkspace key={`secretary-${user?.uid || 'anon'}`} onBackToHome={onBackToHome} />
              ) : portal.id === 'super_admin' ? (
                <SuperAdminPortalWorkspace key={`super_admin-${user?.uid || 'anon'}`} onBackToHome={onBackToHome} />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(language === 'ar' ? portal.plannedModulesAr : portal.plannedModulesEn).map((module, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 hover:shadow-md transition-all flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span 
                          className="w-8 h-8 rounded-lg text-white text-xs font-bold flex items-center justify-center"
                          style={{ backgroundColor: portal.accentColor }}
                        >
                          {idx + 1}
                        </span>
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                          {language === 'ar' ? 'محطة نشطة' : 'Ready'}
                        </span>
                      </div>

                      <h4 className="text-base font-bold text-slate-900 mb-2">{module}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        {language === 'ar'
                          ? 'وحدة مهيأة ومربوطة بسجل الهوية الرقمية في Cloud Firestore (قاعدة البيانات: ai-studio-m737medicalplatf-06180e9d-e98a-4a8d-97fc-d8a6644012dc).'
                          : 'Configured module linked to Cloud Firestore (Database ID: ai-studio-m737medicalplatf-06180e9d-e98a-4a8d-97fc-d8a6644012dc).'}
                      </p>
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                      <span>MEDORA Protocol</span>
                      <span className="text-[#003366] font-semibold">{language === 'ar' ? 'عرض السجلات' : 'View Scope'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            </React.Suspense>
          </div>
        )}

        {/* OFFICIAL MEDORA SUPPORT CENTER APPLIED UNIFORMLY ACROSS EVERY PORTAL */}
        <div className="mb-8 print:hidden">
          <React.Suspense fallback={null}>
            <OfficialSupportCenter
              variant="portal"
              defaultOpenForm={false}
              portalId={portal.id}
              portalTitleAr={portal.titleAr}
              portalTitleEn={portal.titleEn}
            />
          </React.Suspense>
        </div>

        {/* Dedicated Single-Portal Bottom Return Bar (no sibling portals listed) */}
        <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-xs border border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
          <div className="text-center sm:text-start">
            <p className="text-sm font-bold text-slate-900">
              {language === 'ar' ? portal.titleAr : portal.titleEn}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {language === 'ar'
                ? 'بوابة مستقلة ومعزولة الصلاحيات ضمن منصات MEDORA'
                : 'Isolated portal workspace within MEDORA Platforms'}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onBackToPortals || onBackToHome}
              className="px-5 py-2.5 min-h-[44px] rounded-xl text-xs sm:text-sm font-bold text-white bg-[#003366] hover:bg-[#002244] transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
            >
              {isRTL ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
              <span>{language === 'ar' ? 'العودة إلى اختيار الأقسام' : 'Back to Sections'}</span>
            </button>
            <button
              type="button"
              onClick={onBackToHome}
              className="px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-colors cursor-pointer"
            >
              {language === 'ar' ? 'شاشة الترحيب' : 'Welcome'}
            </button>
          </div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* MODAL: SELF-SERVICE PERMANENT ACCOUNT DELETION */}
      {/* ==================================================== */}
      {showSelfDeleteModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-red-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {language === 'ar' ? 'حذف الحساب نهائياً' : 'Delete Account Permanently'}
                </h3>
                <span className="text-xs text-red-600 font-bold">
                  {language === 'ar' ? 'تحذير: هذا الإجراء لا يمكن التراجع عنه' : 'Warning: This cannot be undone'}
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-red-50/80 border border-red-200 text-xs text-slate-700 space-y-2">
              <p className="font-semibold text-red-950">
                {language === 'ar'
                  ? `هل أنت متأكد تماماً من رغبتك بحذف حسابك (${userProfile?.displayName || user?.email}) نهائياً من منصة MEDORA | ميدورا العراق؟`
                  : `Are you sure you want to permanently delete your account (${userProfile?.displayName || user?.email}) from MEDORA?`}
              </p>
              <p className="text-slate-600 leading-relaxed">
                {language === 'ar'
                  ? 'سيتم حذف هويتك الرقمية، ملفك المهني، وسجلاتك فوراً من قاعدة البيانات وإلغاء تسجيل الدخول نهائياً.'
                  : 'Your user profile, authorizations, and credentials will be purged permanently from Firestore and Firebase Authentication.'}
              </p>
            </div>

            {selfDeleteError && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-semibold">
                {selfDeleteError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingOwnAccount}
                onClick={() => {
                  setShowSelfDeleteModal(false);
                  setSelfDeleteError(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                {language === 'ar' ? 'إلغاء والاحتفاظ بالحساب' : 'Cancel & Keep Account'}
              </button>
              <button
                type="button"
                disabled={isDeletingOwnAccount}
                onClick={handleConfirmSelfDelete}
                className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-2 shadow-md hover:shadow-lg disabled:opacity-50"
              >
                {isDeletingOwnAccount ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                <span>
                  {isDeletingOwnAccount
                    ? (language === 'ar' ? 'جارٍ حذف الحساب...' : 'Deleting...')
                    : (language === 'ar' ? 'نعم، حذف الحساب نهائياً' : 'Delete Account Now')}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lazy-Loaded Provider Subscription & Manual Wallet Checkout Modal */}
      {showCheckoutModal && (
        <React.Suspense fallback={null}>
          <SubscriptionPaymentModal
            isOpen={showCheckoutModal}
            onClose={() => setShowCheckoutModal(false)}
            plan={null}
          />
        </React.Suspense>
      )}

      {/* Lazy-Loaded Official Support Center Modal (Accessible inside every portal) */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 print:hidden">
          <div className="w-full max-w-5xl">
            <React.Suspense fallback={null}>
              <OfficialSupportCenter
                variant="modal"
                defaultOpenForm={true}
                portalId={portal.id}
                portalTitleAr={portal.titleAr}
                portalTitleEn={portal.titleEn}
                onClose={() => setShowSupportModal(false)}
              />
            </React.Suspense>
          </div>
        </div>
      )}
    </div>
  );
};
