import { PortalId, UserRole } from '../types';

/**
 * Centralized Feature Flag Configuration for MEDORA Portals.
 *
 * Allows temporarily suspending specific portals (e.g. 'wholesaler' and 'radiology')
 * without deleting their source files, Firestore schemas, or existing records.
 * Flipping a portal back to 'active' immediately restores full access and visibility.
 */
export type PortalAvailabilityStatus = 'active' | 'temporarily_suspended';

export const PORTAL_STATUS_CONFIG: Record<PortalId, PortalAvailabilityStatus> = {
  laboratory: 'active',
  pharmacy: 'active',
  doctor: 'active',
  patient: 'active',
  super_admin: 'active',
  secretary: 'active',
  wholesaler: 'temporarily_suspended',
  radiology: 'temporarily_suspended',
};

export const ACTIVE_PORTAL_IDS: PortalId[] = (
  Object.keys(PORTAL_STATUS_CONFIG) as PortalId[]
).filter((id) => PORTAL_STATUS_CONFIG[id] === 'active');

export const SUSPENDED_PORTAL_IDS: PortalId[] = (
  Object.keys(PORTAL_STATUS_CONFIG) as PortalId[]
).filter((id) => PORTAL_STATUS_CONFIG[id] === 'temporarily_suspended');

export const SUSPENDED_ROLES: UserRole[] = ['wholesaler', 'radiology_center'];

export function isPortalActive(portalId: PortalId): boolean {
  return PORTAL_STATUS_CONFIG[portalId] === 'active';
}

export function isPortalSuspended(portalId: PortalId): boolean {
  return PORTAL_STATUS_CONFIG[portalId] === 'temporarily_suspended';
}

export function roleToPortalConfigId(role?: UserRole | string | null): PortalId | null {
  switch (role) {
    case 'doctor':
      return 'doctor';
    case 'laboratory':
      return 'laboratory';
    case 'pharmacy':
      return 'pharmacy';
    case 'patient':
      return 'patient';
    case 'super_admin':
      return 'super_admin';
    case 'secretary':
      return 'secretary';
    case 'wholesaler':
      return 'wholesaler';
    case 'radiology_center':
    case 'radiology':
      return 'radiology';
    default:
      return null;
  }
}

export function isRoleSuspended(role?: UserRole | string | null): boolean {
  if (!role) return false;
  if (role === 'wholesaler' || role === 'radiology_center' || role === 'radiology') {
    const portalId = roleToPortalConfigId(role);
    return portalId ? isPortalSuspended(portalId) : false;
  }
  return false;
}

export function getSuspendedPortalNotice(
  portalId: PortalId,
  lang: 'ar' | 'en'
): {
  title: string;
  subtitle: string;
  description: string;
  preservationNote: string;
} {
  const isWholesaler = portalId === 'wholesaler';
  if (lang === 'ar') {
    return {
      title: isWholesaler
        ? 'بوابة المذاخر ومجهزي الأدوية متوقفة مؤقتاً'
        : 'بوابة الأشعة والسونار متوقفة مؤقتاً',
      subtitle: 'تحديث وتنظيم مرحلي ضمن منظومة MEDORA',
      description: isWholesaler
        ? 'تم إيقاف استقبال طلبات التجهيز الدوائي بالجملة وإخفاء بوابة المذخر مؤقتاً عن الواجهة الرئيسية وخيارات الدخول العامة.'
        : 'تم إيقاف حجوزات وخدمات مراكز الأشعة والسونار وإخفاء البوابة مؤقتاً عن الواجهة الرئيسية وخيارات الدخول العامة.',
      preservationNote:
        'كافة الحسابات المسجلة، الصلاحيات، والبيانات السابقة محفوظة بأمان تام في قاعدة البيانات، ويمكن إعادة تفعيل البوابة فور اعتماد التحديث القادم.',
    };
  }
  return {
    title: isWholesaler
      ? 'Pharmaceutical Wholesalers Portal Temporarily Suspended'
      : 'Radiology & Ultrasound Portal Temporarily Suspended',
    subtitle: 'Scheduled MEDORA Service Organization',
    description: isWholesaler
      ? 'B2B wholesale ordering and warehouse listings are temporarily paused and hidden from the main directory.'
      : 'Radiology imaging bookings and center services are temporarily paused and hidden from the main directory.',
    preservationNote:
      'All existing accounts, roles, and historical records remain safely preserved in the database for seamless future reactivation.',
  };
}
