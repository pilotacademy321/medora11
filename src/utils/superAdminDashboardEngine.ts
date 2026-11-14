import {
  Appointment,
  Conversation,
  PaymentRequest,
  UserProfile,
  UserRole,
  UserSubscription,
} from '../types';
import { isPortalActive, isRoleSuspended } from '../config/portalsConfig';
import {
  getConversationParticipantIds,
  getConversationPeerDisplay,
  getConversationParticipantsList,
  getUnreadCountForUser,
} from './messagingPermissions';
import {
  getSubscriptionExpiryStatus,
  SubscriptionExpiryState,
} from './subscriptionPaymentEngine';

export type SuperAdminSectionId =
  | 'home'
  | 'accreditation'
  | 'analytics'
  | 'audit_logs'
  | 'subscriptions'
  | 'payment_management'
  | 'messages';

export interface SuperAdminNavItem {
  id: SuperAdminSectionId;
  labelAr: string;
  labelEn: string;
}

export const SUPER_ADMIN_NAV_ITEMS: readonly SuperAdminNavItem[] = [
  { id: 'home', labelAr: 'الصفحة الرئيسية', labelEn: 'Home' },
  { id: 'accreditation', labelAr: 'مركز اعتماد الكوادر', labelEn: 'Staff Accreditation' },
  { id: 'analytics', labelAr: 'المؤشرات والعمليات', labelEn: 'Analytics & Operations' },
  { id: 'audit_logs', labelAr: 'سجل الرقابة الإدارية', labelEn: 'Admin Audit Trail' },
  { id: 'subscriptions', labelAr: 'الاشتراكات والعيادات', labelEn: 'Subscriptions & Clinics' },
  { id: 'payment_management', labelAr: 'إدارة المدفوعات', labelEn: 'Payment Management' },
  { id: 'messages', labelAr: 'المراسلات الإدارية', labelEn: 'Admin Messaging' },
] as const;

export type AnalyticsPeriod = 'daily' | 'weekly' | 'monthly' | 'all';

export type SubscriptionFilterTab =
  | 'all'
  | 'active'
  | 'nearing_expiration'
  | 'expired'
  | 'pending'
  | 'awaiting_renewal';

export interface ClassifiedSubscription {
  subscription: UserSubscription;
  computedState: SubscriptionExpiryState;
  daysRemaining: number | null;
  isAwaitingRenewal: boolean;
  lastRenewalDate: string;
  hasPendingRenewalPayment: boolean;
}

export interface HomeSubscriptionsSummary {
  activeCount: number;
  nearingExpirationCount: number;
  expiredCount: number;
  pendingCount: number;
  awaitingRenewalCount: number;
  newPaymentRequestsCount: number;
}

export interface HomeMessagePreviewItem {
  id: string;
  senderName: string;
  senderRole: UserRole;
  lastMessageText: string;
  timestamp: string;
  unreadCount: number;
}

export interface HomeMessagesSummary {
  newMessagesCount: number;
  unreadMessagesCount: number;
  totalConversations: number;
  latestMessages: HomeMessagePreviewItem[];
}

export interface ApprovalValidationResult {
  allowed: boolean;
  missingFieldsAr: string[];
  missingFieldsEn: string[];
}

/**
 * Classifies a subscription strictly by real Firestore dates and pending renewal requests.
 */
export function classifySubscriptionRecord(
  sub: UserSubscription,
  pendingPaymentRequests: PaymentRequest[] = [],
  now: Date = new Date()
): ClassifiedSubscription {
  const { state, daysRemaining } = getSubscriptionExpiryStatus(sub, now);
  const hasPendingRenewalPayment = pendingPaymentRequests.some(
    (req) =>
      req.userId === sub.userId &&
      (req.status === 'pending' || req.status === 'under_review')
  );

  const isAwaitingRenewal =
    state === 'expired' ||
    state === 'nearing_expiration' ||
    state === 'pending' ||
    hasPendingRenewalPayment;

  const lastRenewalDate = sub.activatedAt || sub.updatedAt || sub.startDate || '';

  return {
    subscription: sub,
    computedState: state,
    daysRemaining,
    isAwaitingRenewal,
    lastRenewalDate,
    hasPendingRenewalPayment,
  };
}

/**
 * Computes real Home summary metrics for Subscriptions & Clinics card.
 */
export function summarizeSubscriptionsForHome(
  subscriptions: UserSubscription[],
  paymentRequests: PaymentRequest[],
  now: Date = new Date()
): HomeSubscriptionsSummary {
  const pendingReqs = paymentRequests.filter(
    (r) => r.status === 'pending' || r.status === 'under_review'
  );

  let activeCount = 0;
  let nearingExpirationCount = 0;
  let expiredCount = 0;
  let pendingCount = 0;
  let awaitingRenewalCount = 0;

  for (const sub of subscriptions) {
    const classified = classifySubscriptionRecord(sub, pendingReqs, now);
    if (classified.computedState === 'active') activeCount += 1;
    if (classified.computedState === 'nearing_expiration') {
      activeCount += 1; // Still active operationally until endDate passes
      nearingExpirationCount += 1;
    }
    if (classified.computedState === 'expired') expiredCount += 1;
    if (classified.computedState === 'pending') pendingCount += 1;
    if (classified.isAwaitingRenewal) awaitingRenewalCount += 1;
  }

  return {
    activeCount,
    nearingExpirationCount,
    expiredCount,
    pendingCount,
    awaitingRenewalCount,
    newPaymentRequestsCount: pendingReqs.length,
  };
}

/**
 * Computes real Home summary metrics for Administrative Messaging card.
 */
export function summarizeConversationsForAdmin(
  conversations: Conversation[],
  adminUid: string,
  now: Date = new Date()
): HomeMessagesSummary {
  const dayMs = 24 * 60 * 60 * 1000;
  const recentThreshold = now.getTime() - dayMs;

  let unreadMessagesCount = 0;
  let newMessagesCount = 0;

  const sorted = [...conversations].sort((a, b) => {
    const ta = new Date(a.lastMessageTimestamp || a.updatedAt || 0).getTime();
    const tb = new Date(b.lastMessageTimestamp || b.updatedAt || 0).getTime();
    return tb - ta;
  });

  const latestMessages: HomeMessagePreviewItem[] = [];

  for (const conv of sorted) {
    const unread = adminUid ? getUnreadCountForUser(conv, adminUid, 'super_admin') : 0;
    unreadMessagesCount += unread;

    const tsIso = conv.lastMessageTimestamp || conv.updatedAt || conv.createdAt || '';
    const tsMs = tsIso ? new Date(tsIso).getTime() : 0;
    const isFromOther = Boolean(conv.lastSenderUid && conv.lastSenderUid !== adminUid);
    if ((tsMs >= recentThreshold && isFromOther) || unread > 0) {
      newMessagesCount += 1;
    }

    if (latestMessages.length < 4 && conv.lastMessageText) {
      const participants = getConversationParticipantsList(conv);
      const isDirect = adminUid && getConversationParticipantIds(conv).includes(adminUid);
      let senderName = '';
      let senderRole: UserRole = 'patient';

      if (isDirect) {
        const peer = getConversationPeerDisplay(conv, adminUid);
        senderName = peer.name;
        senderRole = peer.role;
      } else {
        const lastParticipant =
          participants.find((p) => p.uid === conv.lastSenderUid) || participants[0];
        if (lastParticipant) {
          senderName = lastParticipant.name;
          senderRole = lastParticipant.role;
        } else {
          const peer = getConversationPeerDisplay(conv, adminUid || '');
          senderName = peer.name;
          senderRole = peer.role;
        }
      }

      latestMessages.push({
        id: conv.id,
        senderName: senderName || 'مستخدم MEDORA',
        senderRole,
        lastMessageText: conv.lastMessageText,
        timestamp: tsIso,
        unreadCount: unread,
      });
    }
  }

  return {
    newMessagesCount,
    unreadMessagesCount,
    totalConversations: conversations.length,
    latestMessages,
  };
}

/**
 * Enforces strict completeness before approving an applicant account.
 * Professional / facility accounts MUST have full profile & license number.
 */
export function validateAccountForApproval(user: Partial<UserProfile> | null | undefined): ApprovalValidationResult {
  if (!user) {
    return {
      allowed: false,
      missingFieldsAr: ['بيانات الحساب غير متوفرة'],
      missingFieldsEn: ['Account data missing'],
    };
  }

  const missingAr: string[] = [];
  const missingEn: string[] = [];

  if (!String(user.displayName || '').trim()) {
    missingAr.push('الاسم الكامل');
    missingEn.push('Full Name');
  }
  if (!String(user.email || '').trim()) {
    missingAr.push('البريد الإلكتروني');
    missingEn.push('Email');
  }
  if (!String(user.phone || '').trim()) {
    missingAr.push('رقم الهاتف');
    missingEn.push('Phone Number');
  }

  const isClinicalOrFacility =
    user.role === 'doctor' ||
    user.role === 'laboratory' ||
    user.role === 'radiology_center' ||
    user.role === 'pharmacy' ||
    user.role === 'wholesaler';

  if (isClinicalOrFacility) {
    if (!String(user.licenseNumber || '').trim()) {
      missingAr.push('رقم الترخيص المهني / الإجازة');
      missingEn.push('Professional License Number');
    }
    if (!String(user.facilityName || '').trim()) {
      missingAr.push('اسم العيادة أو المؤسسة الصحية');
      missingEn.push('Clinic / Facility Name');
    }
    if (!String(user.governorate || '').trim()) {
      missingAr.push('المحافظة');
      missingEn.push('Governorate');
    }
  }

  return {
    allowed: missingAr.length === 0,
    missingFieldsAr: missingAr,
    missingFieldsEn: missingEn,
  };
}

export interface AnalyticsBucket {
  labelAr: string;
  labelEn: string;
  registrations: number;
  appointments: number;
}

export interface AnalyticsSummaryReport {
  totalPatients: number;
  totalDoctors: number;
  totalLaboratories: number;
  totalPharmacies: number;
  totalRadiology: number;
  totalSecretaries: number;
  totalInstitutions: number;
  activeAccounts: number;
  suspendedOrPendingAccounts: number;
  pendingRegistrationsCount: number;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  activeAppointments: number;
  activeSubscriptions: number;
  expiredSubscriptions: number;
  nearingExpirationSubscriptions: number;
  registrationsInPeriod: number;
  appointmentsInPeriod: number;
  chartBuckets: AnalyticsBucket[];
}

function getPeriodWindowMs(period: AnalyticsPeriod): number | null {
  const day = 24 * 60 * 60 * 1000;
  switch (period) {
    case 'daily':
      return day;
    case 'weekly':
      return 7 * day;
    case 'monthly':
      return 30 * day;
    case 'all':
    default:
      return null;
  }
}

/**
 * Computes real platform analytics from live Firestore collections without fabricated data.
 */
export function computeAnalyticsByPeriod(params: {
  users: UserProfile[];
  appointments: Appointment[];
  subscriptions: UserSubscription[];
  period: AnalyticsPeriod;
  now?: Date;
}): AnalyticsSummaryReport {
  const { users, appointments, subscriptions, period, now = new Date() } = params;
  const windowMs = getPeriodWindowMs(period);
  const cutoff = windowMs !== null ? now.getTime() - windowMs : null;

  const nonAdminUsers = users.filter((u) => u.role !== 'super_admin');

  const totalPatients = nonAdminUsers.filter((u) => u.role === 'patient').length;
  const totalDoctors = nonAdminUsers.filter((u) => u.role === 'doctor').length;
  const totalLaboratories = nonAdminUsers.filter((u) => u.role === 'laboratory').length;
  const totalPharmacies = nonAdminUsers.filter((u) => u.role === 'pharmacy').length;
  const totalRadiology = isPortalActive('radiology')
    ? nonAdminUsers.filter((u) => u.role === 'radiology_center').length
    : 0;
  const totalWholesalers = isPortalActive('wholesaler')
    ? nonAdminUsers.filter((u) => u.role === 'wholesaler').length
    : 0;
  const totalSecretaries = nonAdminUsers.filter((u) => u.role === 'secretary').length;

  const totalInstitutions =
    totalDoctors + totalLaboratories + totalPharmacies + totalRadiology + totalWholesalers;

  const activeAccounts = nonAdminUsers.filter((u) => u.status === 'approved').length;
  const pendingRegistrationsCount = nonAdminUsers.filter(
    (u) => u.status === 'pending' || u.status === 'incomplete'
  ).length;
  const suspendedOrPendingAccounts = nonAdminUsers.filter(
    (u) => u.status === 'suspended' || u.status === 'pending' || u.status === 'incomplete' || u.status === 'rejected'
  ).length;

  const filteredUsers =
    cutoff === null
      ? nonAdminUsers
      : nonAdminUsers.filter((u) => {
          const t = new Date(u.createdAt || 0).getTime();
          return !isNaN(t) && t >= cutoff;
        });

  const filteredAppointments =
    cutoff === null
      ? appointments
      : appointments.filter((a) => {
          const t = new Date(a.createdAt || a.date || 0).getTime();
          return !isNaN(t) && t >= cutoff;
        });

  const completedAppointments = filteredAppointments.filter((a) => a.status === 'completed').length;
  const cancelledAppointments = filteredAppointments.filter((a) => a.status === 'cancelled').length;
  const activeAppointments = filteredAppointments.filter(
    (a) => a.status === 'pending' || a.status === 'confirmed' || a.status === 'rescheduled'
  ).length;

  let activeSubscriptions = 0;
  let expiredSubscriptions = 0;
  let nearingExpirationSubscriptions = 0;

  for (const sub of subscriptions) {
    const exp = getSubscriptionExpiryStatus(sub, now);
    if (exp.state === 'active') activeSubscriptions += 1;
    else if (exp.state === 'nearing_expiration') {
      activeSubscriptions += 1;
      nearingExpirationSubscriptions += 1;
    } else if (exp.state === 'expired') {
      expiredSubscriptions += 1;
    }
  }

  // Build real visual chart buckets for selected timeframe
  const chartBuckets: AnalyticsBucket[] = [];
  if (period === 'daily') {
    const spans = [
      { startH: 0, endH: 6, labelAr: '00:00 - 06:00', labelEn: '00-06h' },
      { startH: 6, endH: 12, labelAr: '06:00 - 12:00', labelEn: '06-12h' },
      { startH: 12, endH: 18, labelAr: '12:00 - 18:00', labelEn: '12-18h' },
      { startH: 18, endH: 24, labelAr: '18:00 - 24:00', labelEn: '18-24h' },
    ];
    for (const s of spans) {
      chartBuckets.push({
        labelAr: s.labelAr,
        labelEn: s.labelEn,
        registrations: filteredUsers.filter((u) => {
          const d = new Date(u.createdAt || 0);
          return !isNaN(d.getTime()) && d.getHours() >= s.startH && d.getHours() < s.endH;
        }).length,
        appointments: filteredAppointments.filter((a) => {
          const d = new Date(a.createdAt || a.date || 0);
          return !isNaN(d.getTime()) && d.getHours() >= s.startH && d.getHours() < s.endH;
        }).length,
      });
    }
  } else if (period === 'weekly') {
    const dayMs = 24 * 60 * 60 * 1000;
    for (let i = 6; i >= 0; i--) {
      const bucketDate = new Date(now.getTime() - i * dayMs);
      const ymd = bucketDate.toISOString().split('T')[0];
      const shortLabel = `${bucketDate.getUTCMonth() + 1}/${bucketDate.getUTCDate()}`;
      chartBuckets.push({
        labelAr: shortLabel,
        labelEn: shortLabel,
        registrations: filteredUsers.filter((u) => String(u.createdAt || '').startsWith(ymd)).length,
        appointments: filteredAppointments.filter(
          (a) => String(a.createdAt || '').startsWith(ymd) || String(a.date || '').startsWith(ymd)
        ).length,
      });
    }
  } else if (period === 'monthly') {
    const dayMs = 24 * 60 * 60 * 1000;
    for (let w = 3; w >= 0; w--) {
      const endMs = now.getTime() - w * 7 * dayMs;
      const startMs = endMs - 7 * dayMs;
      const weekNum = 4 - w;
      chartBuckets.push({
        labelAr: `أسبوع ${weekNum}`,
        labelEn: `Week ${weekNum}`,
        registrations: filteredUsers.filter((u) => {
          const t = new Date(u.createdAt || 0).getTime();
          return !isNaN(t) && t >= startMs && t < endMs + 1000;
        }).length,
        appointments: filteredAppointments.filter((a) => {
          const t = new Date(a.createdAt || a.date || 0).getTime();
          return !isNaN(t) && t >= startMs && t < endMs + 1000;
        }).length,
      });
    }
  } else {
    // 'all' -> last 6 calendar months
    for (let m = 5; m >= 0; m--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - m, 1));
      const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      chartBuckets.push({
        labelAr: ym,
        labelEn: ym,
        registrations: nonAdminUsers.filter((u) => String(u.createdAt || '').startsWith(ym)).length,
        appointments: appointments.filter(
          (a) => String(a.createdAt || '').startsWith(ym) || String(a.date || '').startsWith(ym)
        ).length,
      });
    }
  }

  return {
    totalPatients,
    totalDoctors,
    totalLaboratories,
    totalPharmacies,
    totalRadiology,
    totalSecretaries,
    totalInstitutions,
    activeAccounts,
    suspendedOrPendingAccounts,
    pendingRegistrationsCount,
    totalAppointments: filteredAppointments.length,
    completedAppointments,
    cancelledAppointments,
    activeAppointments,
    activeSubscriptions,
    expiredSubscriptions,
    nearingExpirationSubscriptions,
    registrationsInPeriod: filteredUsers.length,
    appointmentsInPeriod: filteredAppointments.length,
    chartBuckets,
  };
}

/**
 * Filters and sorts provider subscriptions by category tab, search query, role, and expiration date.
 */
export function filterAndSortSubscriptions(params: {
  subscriptions: UserSubscription[];
  paymentRequests: PaymentRequest[];
  tab: SubscriptionFilterTab;
  roleFilter: 'all' | UserRole;
  searchQuery: string;
  sortOrder: 'end_asc' | 'end_desc';
  now?: Date;
}): ClassifiedSubscription[] {
  const { subscriptions, paymentRequests, tab, roleFilter, searchQuery, sortOrder, now = new Date() } = params;
  const q = searchQuery.trim().toLowerCase();

  const classified = subscriptions.map((s) => classifySubscriptionRecord(s, paymentRequests, now));

  const filtered = classified.filter((item) => {
    const s = item.subscription;
    if (isRoleSuspended(s.userRole)) return false;

    if (tab === 'active' && item.computedState !== 'active' && item.computedState !== 'nearing_expiration') {
      return false;
    }
    if (tab === 'nearing_expiration' && item.computedState !== 'nearing_expiration') {
      return false;
    }
    if (tab === 'expired' && item.computedState !== 'expired') {
      return false;
    }
    if (tab === 'pending' && item.computedState !== 'pending' && item.computedState !== 'cancelled') {
      return false;
    }
    if (tab === 'awaiting_renewal' && !item.isAwaitingRenewal) {
      return false;
    }

    if (roleFilter !== 'all' && s.userRole !== roleFilter) {
      return false;
    }

    if (q) {
      const hay = [
        s.userName,
        s.facilityName || '',
        s.userEmail || '',
        s.planName || '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });

  filtered.sort((a, b) => {
    const ta = a.subscription.endDate ? new Date(a.subscription.endDate).getTime() : 0;
    const tb = b.subscription.endDate ? new Date(b.subscription.endDate).getTime() : 0;
    return sortOrder === 'end_asc' ? ta - tb : tb - ta;
  });

  return filtered;
}
