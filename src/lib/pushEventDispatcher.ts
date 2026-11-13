/**
 * M737IQ Multi-Portal Push Notification Event Dispatcher
 * 
 * Provides unified, typed, concurrency-safe, and idempotent notification delivery
 * across all 8 M737IQ portals:
 * - Patient
 * - Doctor
 * - Secretary
 * - Pharmacy
 * - Laboratory
 * - Radiology & Ultrasound
 * - Wholesaler
 * - Super Admin (strictly restricted to bcgmoc@gmail.com)
 */

import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  getDocs, 
  query, 
  where 
} from 'firebase/firestore';
import { db, sanitizeForFirestore } from './firebase';
import { UserRole } from '../types';
import { isVerifiedSuperAdmin, SOLE_SUPER_ADMIN_EMAIL } from '../utils/adminSecurity';
import { DeviceTokenRecord, getUserNotificationPreferences } from './pushNotificationService';

export type NotificationCategory = 
  | 'appointment' 
  | 'prescription' 
  | 'lab_radiology' 
  | 'order' 
  | 'message' 
  | 'security' 
  | 'accreditation'
  | 'subscription_payment'
  | 'general';

export interface DispatchNotificationParams {
  recipientUid: string;
  recipientRole?: UserRole | string;
  category: NotificationCategory;
  titleAr: string;
  titleEn: string;
  messageAr: string;
  messageEn: string;
  targetPortal: 'patient' | 'doctor' | 'secretary' | 'pharmacy' | 'laboratory' | 'radiology' | 'wholesaler' | 'super_admin';
  targetUrl: string;
  sourceEventId?: string;
  priority?: 'normal' | 'urgent';
  lockscreenGenericText?: boolean;
}

export interface PushOutboxRecord {
  id: string;
  recipientUid: string;
  recipientRole?: string;
  category: NotificationCategory;
  title: string;
  body: string;
  genericBody: string;
  targetUrl: string;
  targetPortal: string;
  priority: 'normal' | 'urgent';
  status: 'pending' | 'delivered' | 'failed' | 'skipped';
  deviceTokensCount: number;
  idempotencyKey: string;
  createdAt: string;
  deliveredAt?: string;
}

// In-memory set to prevent duplicate event dispatches within the same session
const dispatchedEventKeys = new Set<string>();

/**
 * Dispatches an authorized, idempotent notification and push delivery across all portals.
 */
export async function dispatchM737Notification(
  params: DispatchNotificationParams
): Promise<{ success: boolean; notificationId: string; pushDispatched: boolean; skippedReason?: string }> {
  const {
    recipientUid,
    recipientRole,
    category,
    titleAr,
    titleEn,
    messageAr,
    messageEn,
    targetPortal,
    targetUrl,
    sourceEventId = `evt_${Date.now()}`,
    priority = 'normal',
    lockscreenGenericText = true,
  } = params;

  if (!recipientUid) {
    return { success: false, notificationId: '', pushDispatched: false, skippedReason: 'Missing recipient UID' };
  }

  // Idempotency check: prevent duplicate notifications from repetitive UI re-renders
  const idempotencyKey = `idemp_${category}_${sourceEventId}_${recipientUid}`;
  if (dispatchedEventKeys.has(idempotencyKey)) {
    console.log(`[PushDispatcher] Duplicate notification suppressed by idempotency key: ${idempotencyKey}`);
    return { success: true, notificationId: idempotencyKey, pushDispatched: false, skippedReason: 'Duplicate event suppressed' };
  }
  dispatchedEventKeys.add(idempotencyKey);

  const now = new Date().toISOString();
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Super Admin security gate: only bcgmoc@gmail.com can receive Super Admin specific notifications
  if (targetPortal === 'super_admin' || category === 'security') {
    try {
      const userDoc = await getDoc(doc(db, 'users', recipientUid));
      if (userDoc.exists()) {
        const uData = userDoc.data();
        if (targetPortal === 'super_admin' && (uData.email || '').toLowerCase() !== SOLE_SUPER_ADMIN_EMAIL.toLowerCase()) {
          console.warn(`[SECURITY] Blocked Super Admin notification dispatch to non-admin UID: ${recipientUid}`);
          return { success: false, notificationId: '', pushDispatched: false, skippedReason: 'Unauthorized admin recipient' };
        }
      }
    } catch {}
  }

  // 1. Write in-app Notification record to /notifications collection
  const inAppRecord = {
    id: notifId,
    recipientUid,
    title: titleAr, // Default Arabic, fallback English
    titleEn: titleEn || titleAr,
    message: messageAr,
    messageEn: messageEn || messageAr,
    type: mapCategoryToLegacyType(category),
    category,
    targetPortal: targetPortal || 'home',
    link: targetUrl || '/',
    priority,
    read: false,
    createdAt: now,
  };

  try {
    await setDoc(doc(db, 'notifications', notifId), sanitizeForFirestore(inAppRecord));
  } catch (err) {
    console.warn('[PushDispatcher] Notice writing in-app notification:', err);
  }

  // 2. Query Recipient Device Tokens
  let deviceTokens: DeviceTokenRecord[] = [];
  try {
    const tokensRef = collection(db, 'users', recipientUid, 'device_tokens');
    const tokensSnap = await getDocs(tokensRef);
    tokensSnap.forEach((d) => {
      deviceTokens.push(d.data() as DeviceTokenRecord);
    });
  } catch (err) {
    console.warn('[PushDispatcher] Notice fetching device tokens:', err);
  }

  // 3. Filter tokens based on user notification category preferences
  const activeTokens = deviceTokens.filter((d) => {
    if (!d.preferences || d.preferences.enabled === false) return false;
    if (category === 'appointment' && d.preferences.appointments === false) return false;
    if (category === 'prescription' && d.preferences.prescriptions === false) return false;
    if (category === 'lab_radiology' && d.preferences.labRadiology === false) return false;
    if (category === 'order' && d.preferences.orders === false) return false;
    if (category === 'security' && d.preferences.security === false) return false;
    return true;
  });

  // 4. Create Push Outbox Record for Background & Cloud Push Tracking
  const genericBody = 'لديك تحديث طبي جديد في منصة MEDORA | ميدورا العراق';
  const outboxRecord: PushOutboxRecord = {
    id: `push_${notifId}`,
    recipientUid,
    recipientRole,
    category,
    title: titleAr,
    body: messageAr,
    genericBody,
    targetUrl,
    targetPortal,
    priority,
    status: activeTokens.length > 0 ? 'delivered' : 'pending',
    deviceTokensCount: activeTokens.length,
    idempotencyKey,
    createdAt: now,
    deliveredAt: activeTokens.length > 0 ? now : undefined,
  };

  try {
    await setDoc(doc(db, 'push_outbox', `push_${notifId}`), sanitizeForFirestore(outboxRecord));
  } catch (err) {
    console.warn('[PushDispatcher] Notice creating push outbox job:', err);
  }

  // 5. Send real Web Push to active device subscriptions via Backend Push Engine
  const activeSubscriptions = activeTokens
    .map((t) => t.subscription)
    .filter((s): s is NonNullable<typeof s> => Boolean(s && s.endpoint));

  if (activeSubscriptions.length > 0 && typeof window !== 'undefined') {
    try {
      fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientUid,
          recipientRole,
          category,
          title: titleAr,
          body: messageAr,
          genericBody,
          targetUrl,
          targetPortal,
          priority,
          sourceEventId,
          subscriptions: activeSubscriptions,
        }),
      }).catch((apiErr) => {
        console.warn('[PushDispatcher] Backend push API notice:', apiErr);
      });
    } catch (e) {
      console.warn('[PushDispatcher] Fetch dispatch notice:', e);
    }
  }

  // 6. If Service Worker is active on the current device and matches recipient, trigger local notification
  if (typeof window !== 'undefined' && 'serviceWorker' in navigator && Notification.permission === 'granted') {
    try {
      const swReg = await navigator.serviceWorker.getRegistration('/firebase-messaging-sw.js');
      if (swReg) {
        swReg.showNotification(titleAr, {
          body: lockscreenGenericText ? genericBody : messageAr,
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-192.png',
          vibrate: priority === 'urgent' ? [300, 100, 300, 100, 400] : [200, 100, 200],
          tag: `m737-${targetPortal}-${notifId}`,
          data: {
            url: targetUrl,
            portal: targetPortal,
            eventId: notifId,
          },
        } as NotificationOptions & { vibrate?: number[] });
      }
    } catch (swErr) {
      console.warn('[PushDispatcher] Local SW dispatch notice:', swErr);
    }
  }

  return {
    success: true,
    notificationId: notifId,
    pushDispatched: activeTokens.length > 0,
  };
}

function mapCategoryToLegacyType(cat: NotificationCategory): 'booking_update' | 'report_ready' | 'prescription' | 'order' | 'system' | 'general' {
  switch (cat) {
    case 'appointment':
      return 'booking_update';
    case 'prescription':
      return 'prescription';
    case 'lab_radiology':
      return 'report_ready';
    case 'order':
      return 'order';
    case 'security':
    case 'accreditation':
    case 'subscription_payment':
      return 'system';
    default:
      return 'general';
  }
}

// =========================================================================
// HIGH-LEVEL CONVENIENCE EVENT DISPATCHERS FOR ALL 8 PORTALS
// =========================================================================

/**
 * 1. PATIENT PORTAL EVENTS
 */
export async function notifyPatientAppointmentStatus({
  patientUid,
  doctorName,
  date,
  time,
  status,
  appointmentId,
}: {
  patientUid: string;
  doctorName: string;
  date: string;
  time: string;
  status: 'confirmed' | 'cancelled' | 'rescheduled';
  appointmentId: string;
}) {
  const statusTexts = {
    confirmed: { ar: 'تم تأكيد موعدك بنجاح', en: 'Your appointment has been confirmed' },
    cancelled: { ar: 'تم إلغاء موعدك', en: 'Your appointment was cancelled' },
    rescheduled: { ar: 'تم تعديل موعدك', en: 'Your appointment was rescheduled' },
  };

  return dispatchM737Notification({
    recipientUid: patientUid,
    recipientRole: 'patient',
    category: 'appointment',
    titleAr: `تحديث الموعد: د. ${doctorName}`,
    titleEn: `Appointment Update: Dr. ${doctorName}`,
    messageAr: `${statusTexts[status].ar} بتاريخ ${date} الساعة ${time}.`,
    messageEn: `${statusTexts[status].en} on ${date} at ${time}.`,
    targetPortal: 'patient',
    targetUrl: '/patient',
    sourceEventId: `appt_${appointmentId}_${status}`,
    priority: status === 'confirmed' ? 'urgent' : 'normal',
  });
}

export async function notifyPatientPrescriptionReady({
  patientUid,
  doctorName,
  prescriptionId,
}: {
  patientUid: string;
  doctorName: string;
  prescriptionId: string;
}) {
  return dispatchM737Notification({
    recipientUid: patientUid,
    recipientRole: 'patient',
    category: 'prescription',
    titleAr: 'روشتة إلكترونية جديدة صادرة',
    titleEn: 'New Electronic Prescription Issued',
    messageAr: `أصدر د. ${doctorName} وصفة علاجية إلكترونية جديدة لك. يمكنك الآن استعراضها وصرفها من أي صيدلية معتمدة.`,
    messageEn: `Dr. ${doctorName} issued a new e-prescription for you. Available for pharmacy fulfillment.`,
    targetPortal: 'patient',
    targetUrl: '/patient',
    sourceEventId: `rx_${prescriptionId}`,
    priority: 'urgent',
  });
}

export async function notifyPatientDiagnosticReport({
  patientUid,
  facilityName,
  type,
  reportId,
}: {
  patientUid: string;
  facilityName: string;
  type: 'laboratory' | 'radiology';
  reportId: string;
}) {
  const typeLabelAr = type === 'laboratory' ? 'المختبر' : 'الأشعة والسونار';
  const typeLabelEn = type === 'laboratory' ? 'Laboratory' : 'Radiology';

  return dispatchM737Notification({
    recipientUid: patientUid,
    recipientRole: 'patient',
    category: 'lab_radiology',
    titleAr: `نتائج الفحص جاهزة (${typeLabelAr})`,
    titleEn: `${typeLabelEn} Results Ready`,
    messageAr: `تم اعتماد وتوثيق نتائج الفحص من قِبل ${facilityName}. تقريرك الطبي متاح في ملفك الصحي.`,
    messageEn: `Your diagnostic report from ${facilityName} is verified and ready in your health record.`,
    targetPortal: 'patient',
    targetUrl: '/patient',
    sourceEventId: `report_${reportId}`,
    priority: 'urgent',
  });
}

/**
 * 2. DOCTOR PORTAL EVENTS
 */
export async function notifyDoctorNewBooking({
  doctorUid,
  patientName,
  date,
  time,
  appointmentId,
}: {
  doctorUid: string;
  patientName: string;
  date: string;
  time: string;
  appointmentId: string;
}) {
  return dispatchM737Notification({
    recipientUid: doctorUid,
    recipientRole: 'doctor',
    category: 'appointment',
    titleAr: 'حجز كشف جديد في العيادة',
    titleEn: 'New Clinic Booking Received',
    messageAr: `حجز المريض ${patientName} موعداً للكشف في ${date} الساعة ${time}.`,
    messageEn: `Patient ${patientName} booked a consultation on ${date} at ${time}.`,
    targetPortal: 'doctor',
    targetUrl: '/doctor',
    sourceEventId: `doc_appt_${appointmentId}`,
    priority: 'urgent',
  });
}

/**
 * 3. SECRETARY PORTAL EVENTS
 */
export async function notifySecretaryAppointmentUpdate({
  secretaryUid,
  patientName,
  doctorName,
  action,
  appointmentId,
}: {
  secretaryUid: string;
  patientName: string;
  doctorName: string;
  action: string;
  appointmentId: string;
}) {
  return dispatchM737Notification({
    recipientUid: secretaryUid,
    recipientRole: 'secretary',
    category: 'appointment',
    titleAr: `تحديث جدول الاستقبال — د. ${doctorName}`,
    titleEn: `Front-Desk Schedule Update — Dr. ${doctorName}`,
    messageAr: `تم ${action} للمريض ${patientName} في عيادة د. ${doctorName}.`,
    messageEn: `Action ${action} recorded for patient ${patientName} in Dr. ${doctorName}'s clinic.`,
    targetPortal: 'secretary',
    targetUrl: '/secretary',
    sourceEventId: `sec_appt_${appointmentId}_${action}`,
  });
}

/**
 * 4. PHARMACY PORTAL EVENTS
 */
export async function notifyPharmacyNewPrescription({
  pharmacyUid,
  patientName,
  prescriptionId,
}: {
  pharmacyUid: string;
  patientName: string;
  prescriptionId: string;
}) {
  return dispatchM737Notification({
    recipientUid: pharmacyUid,
    recipientRole: 'pharmacy',
    category: 'prescription',
    titleAr: 'وصفة طبية جديدة للصرف',
    titleEn: 'New Prescription for Dispensing',
    messageAr: `وصلت روشتة إلكترونية للمريض ${patientName} بانتظار التحضير والصرف.`,
    messageEn: `New e-prescription received for patient ${patientName} pending fulfillment.`,
    targetPortal: 'pharmacy',
    targetUrl: '/pharmacy',
    sourceEventId: `rx_pharm_${prescriptionId}`,
    priority: 'urgent',
  });
}

/**
 * 5. LABORATORY & RADIOLOGY PORTAL EVENTS
 */
export async function notifyCenterNewRequest({
  centerUid,
  centerRole,
  patientName,
  testName,
  requestId,
}: {
  centerUid: string;
  centerRole: 'laboratory' | 'radiology_center';
  patientName: string;
  testName: string;
  requestId: string;
}) {
  const isLab = centerRole === 'laboratory';
  return dispatchM737Notification({
    recipientUid: centerUid,
    recipientRole: centerRole,
    category: 'lab_radiology',
    titleAr: isLab ? 'طلب تحليل مخبري جديد' : 'طلب فحص أشعة وسونار جديد',
    titleEn: isLab ? 'New Laboratory Test Order' : 'New Radiology Scan Order',
    messageAr: `طلب فحص (${testName}) للمريض ${patientName}.`,
    messageEn: `Order for (${testName}) submitted for patient ${patientName}.`,
    targetPortal: isLab ? 'laboratory' : 'radiology',
    targetUrl: `/${isLab ? 'laboratory' : 'radiology'}`,
    sourceEventId: `req_${requestId}`,
    priority: 'urgent',
  });
}

/**
 * 6. WHOLESALER PORTAL EVENTS
 */
export async function notifyWholesalerNewOrder({
  wholesalerUid,
  pharmacyName,
  orderId,
  itemCount,
}: {
  wholesalerUid: string;
  pharmacyName: string;
  orderId: string;
  itemCount: number;
}) {
  return dispatchM737Notification({
    recipientUid: wholesalerUid,
    recipientRole: 'wholesaler',
    category: 'order',
    titleAr: 'طلب توريد أدوية جديد (B2B)',
    titleEn: 'New Wholesale Medicine Order (B2B)',
    messageAr: `قدمت صيدلية ${pharmacyName} طلباً جديداً يشمل ${itemCount} أصناف دوائية.`,
    messageEn: `Pharmacy ${pharmacyName} placed a new order containing ${itemCount} items.`,
    targetPortal: 'wholesaler',
    targetUrl: '/wholesaler',
    sourceEventId: `wh_order_${orderId}`,
    priority: 'urgent',
  });
}

/**
 * 7. SUPER ADMIN SECURITY & ACCREDITATION EVENTS
 */
export async function notifySuperAdminAccreditationRequest({
  adminUid,
  applicantName,
  role,
  licenseNumber,
}: {
  adminUid: string;
  applicantName: string;
  role: UserRole;
  licenseNumber: string;
}) {
  return dispatchM737Notification({
    recipientUid: adminUid,
    recipientRole: 'super_admin',
    category: 'accreditation',
    titleAr: 'طلب اعتماد مهني جديد بانتظار التدقيق',
    titleEn: 'New Professional Accreditation Request',
    messageAr: `قدم ${applicantName} طلب اعتماد لصفة (${role}) بترخيص رقم (${licenseNumber}).`,
    messageEn: `${applicantName} submitted credentials for role (${role}) with license (${licenseNumber}).`,
    targetPortal: 'super_admin',
    targetUrl: '/super_admin',
    sourceEventId: `admin_accred_${licenseNumber}_${Date.now()}`,
    priority: 'urgent',
  });
}

/**
 * 8. ADDITIONAL MULTI-PORTAL EVENT HELPERS
 */

// Pharmacy Order Status Update to Patient
export async function notifyPatientPharmacyOrderStatus({
  patientUid,
  pharmacyName,
  orderId,
  status,
}: {
  patientUid: string;
  pharmacyName: string;
  orderId: string;
  status: 'preparing' | 'ready_for_pickup' | 'out_for_delivery' | 'completed' | 'cancelled';
}) {
  const statusMap = {
    preparing: { ar: 'قيد التحضير والتجهيز', en: 'being prepared' },
    ready_for_pickup: { ar: 'جاهز للاستلام من الصيدلية', en: 'ready for pickup' },
    out_for_delivery: { ar: 'خرج مع مندوب التوصيل', en: 'out for delivery' },
    completed: { ar: 'تم التسليم بنجاح', en: 'completed' },
    cancelled: { ar: 'تم الاعتذار عن الطلب', en: 'cancelled' },
  };

  return dispatchM737Notification({
    recipientUid: patientUid,
    recipientRole: 'patient',
    category: 'order',
    titleAr: `تحديث طلب الصيدلية — ${pharmacyName}`,
    titleEn: `Pharmacy Order Update — ${pharmacyName}`,
    messageAr: `طلبك الدوائي (${orderId.slice(-6)}) أصبح ${statusMap[status].ar}.`,
    messageEn: `Your medicine order (${orderId.slice(-6)}) is ${statusMap[status].en}.`,
    targetPortal: 'patient',
    targetUrl: '/patient',
    sourceEventId: `ord_pat_${orderId}_${status}`,
    priority: status === 'ready_for_pickup' || status === 'out_for_delivery' ? 'urgent' : 'normal',
  });
}

// Doctor notification when prescription is dispensed by pharmacy
export async function notifyDoctorPrescriptionDispensed({
  doctorUid,
  patientName,
  pharmacyName,
  prescriptionNumber,
}: {
  doctorUid: string;
  patientName: string;
  pharmacyName: string;
  prescriptionNumber: string;
}) {
  return dispatchM737Notification({
    recipientUid: doctorUid,
    recipientRole: 'doctor',
    category: 'prescription',
    titleAr: 'تأكيد صرف روشتة إلكترونية',
    titleEn: 'Prescription Dispensed Confirmation',
    messageAr: `قامت ${pharmacyName} بصرف الوصفة رقم ${prescriptionNumber} للمريض ${patientName}.`,
    messageEn: `${pharmacyName} dispensed e-prescription ${prescriptionNumber} for patient ${patientName}.`,
    targetPortal: 'doctor',
    targetUrl: '/doctor',
    sourceEventId: `rx_disp_${prescriptionNumber}`,
  });
}

// Doctor notification when booking is cancelled by patient or secretary
export async function notifyDoctorBookingCancelled({
  doctorUid,
  patientName,
  date,
  time,
  appointmentId,
}: {
  doctorUid: string;
  patientName: string;
  date: string;
  time: string;
  appointmentId: string;
}) {
  return dispatchM737Notification({
    recipientUid: doctorUid,
    recipientRole: 'doctor',
    category: 'appointment',
    titleAr: 'إلغاء حجز كشفية بالعيادة',
    titleEn: 'Clinic Appointment Cancelled',
    messageAr: `تم إلغاء موعد المريض ${patientName} المقرر في ${date} (${time}).`,
    messageEn: `Appointment for ${patientName} on ${date} (${time}) was cancelled.`,
    targetPortal: 'doctor',
    targetUrl: '/doctor',
    sourceEventId: `doc_cancel_${appointmentId}`,
  });
}

// Wholesaler shipment notification to Pharmacy
export async function notifyPharmacyWholesaleShipment({
  pharmacyUid,
  wholesalerName,
  orderId,
  status,
}: {
  pharmacyUid: string;
  wholesalerName: string;
  orderId: string;
  status: 'approved' | 'preparing' | 'dispatched' | 'delivered' | 'cancelled';
}) {
  const statusMap = {
    approved: { ar: 'تمت الموافقة على طلب التوريد', en: 'approved your wholesale order' },
    preparing: { ar: 'قيد التجهيز بمستودع المذخر', en: 'is preparing your items' },
    dispatched: { ar: 'تم شحن وتوجيه الطلبية لصيدليتكم', en: 'dispatched your medicine order' },
    delivered: { ar: 'تم توثيق استلام الطلبية بنجاح', en: 'marked order as delivered' },
    cancelled: { ar: 'تم إلغاء طلب التوريد', en: 'cancelled the wholesale order' },
  };

  return dispatchM737Notification({
    recipientUid: pharmacyUid,
    recipientRole: 'pharmacy',
    category: 'order',
    titleAr: `تحديث طلبية المذخر — ${wholesalerName}`,
    titleEn: `Wholesale Order Update — ${wholesalerName}`,
    messageAr: `${wholesalerName}: ${statusMap[status].ar} (طلب #${orderId.slice(-6)}).`,
    messageEn: `${wholesalerName} ${statusMap[status].en} (order #${orderId.slice(-6)}).`,
    targetPortal: 'pharmacy',
    targetUrl: '/pharmacy',
    sourceEventId: `wh_ship_${orderId}_${status}`,
    priority: status === 'dispatched' ? 'urgent' : 'normal',
  });
}

// Professional Account Approval / Status Notification by Super Admin
export async function notifyUserAccountApprovalStatus({
  userUid,
  userRole,
  isApproved,
}: {
  userUid: string;
  userRole: UserRole | string;
  isApproved: boolean;
}) {
  return dispatchM737Notification({
    recipientUid: userUid,
    recipientRole: userRole,
    category: 'accreditation',
    titleAr: isApproved ? 'تهانينا! تم اعتماد حسابك المهني' : 'تحديث حول حالة مراجعة حسابك',
    titleEn: isApproved ? 'Congratulations! Professional Account Approved' : 'Account Verification Update',
    messageAr: isApproved
      ? 'تم تدقيق وثائقك وتفعيل حسابك المهني في منصة MEDORA | ميدورا العراق بالكامل. يمكنك الآن بدء العمل.'
      : 'تمت مراجعة طلب الاعتماد المهني. يرجى مراجعة إدارة المنصة لطلب توضيحات.',
    messageEn: isApproved
      ? 'Your professional credentials have been verified and your MEDORA account is active.'
      : 'Your application has been reviewed. Please contact platform support.',
    targetPortal: (userRole as any) || 'patient',
    targetUrl: `/${userRole}`,
    sourceEventId: `accred_result_${userUid}_${isApproved}`,
    priority: 'urgent',
  });
}

// =========================================================================
// 9. SUBSCRIPTION & MANUAL PAYMENT VERIFICATION NOTIFICATIONS (MEDORA)
// =========================================================================

export async function notifySuperAdminNewPaymentRequest({
  requestId,
  requestNumber,
  customerName,
  institutionName,
  planNameAr,
  planNameEn,
  amountIqd,
  paymentMethodName,
}: {
  requestId: string;
  requestNumber: string;
  customerName: string;
  institutionName: string;
  planNameAr: string;
  planNameEn: string;
  amountIqd: number;
  paymentMethodName: string;
}) {
  try {
    const adminQuery = query(
      collection(db, 'users'),
      where('email', '==', SOLE_SUPER_ADMIN_EMAIL)
    );
    const snap = await getDocs(adminQuery);
    if (snap.empty) {
      return { success: false, notificationId: '', pushDispatched: false, skippedReason: 'Super Admin doc not found' };
    }

    const adminUid = snap.docs[0].id;
    return dispatchM737Notification({
      recipientUid: adminUid,
      recipientRole: 'super_admin',
      category: 'subscription_payment',
      titleAr: `طلب دفع اشتراك جديد (${requestNumber})`,
      titleEn: `New Subscription Payment Request (${requestNumber})`,
      messageAr: `أرسل ${customerName} (${institutionName}) إيصال تحويل بقيمة ${amountIqd.toLocaleString('en-US')} د.ع عبر ${paymentMethodName} لباقة "${planNameAr}" وهو بانتظار المراجعة والتحقق.`,
      messageEn: `${customerName} (${institutionName}) submitted a ${amountIqd.toLocaleString('en-US')} IQD transfer receipt via ${paymentMethodName} for "${planNameEn}". Pending manual verification.`,
      targetPortal: 'super_admin',
      targetUrl: '/super_admin',
      sourceEventId: `pay_req_new_${requestId}`,
      priority: 'urgent',
    });
  } catch (err) {
    console.warn('[PushDispatcher] Failed notifying Super Admin of new payment request:', err);
    return { success: false, notificationId: '', pushDispatched: false, skippedReason: 'Lookup error' };
  }
}

export type CustomerPaymentNotificationEvent =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'activated'
  | 'nearing_expiration'
  | 'expired';

export async function notifyCustomerPaymentStatus({
  userUid,
  userRole,
  event,
  requestId,
  requestNumber,
  planNameAr,
  planNameEn,
  amountIqd,
  rejectionReason,
  endDate,
  daysRemaining,
}: {
  userUid: string;
  userRole: UserRole | string;
  event: CustomerPaymentNotificationEvent;
  requestId: string;
  requestNumber?: string;
  planNameAr: string;
  planNameEn?: string;
  amountIqd?: number;
  rejectionReason?: string;
  endDate?: string;
  daysRemaining?: number | null;
}) {
  const portalTarget =
    userRole === 'radiology_center'
      ? 'radiology'
      : userRole === 'doctor' ||
        userRole === 'laboratory' ||
        userRole === 'pharmacy' ||
        userRole === 'wholesaler' ||
        userRole === 'secretary' ||
        userRole === 'patient'
      ? userRole
      : 'doctor';

  const planEn = planNameEn || planNameAr;
  const refLabel = requestNumber ? ` (${requestNumber})` : '';

  const contentByEvent: Record<
    CustomerPaymentNotificationEvent,
    { titleAr: string; titleEn: string; messageAr: string; messageEn: string; priority: 'normal' | 'urgent' }
  > = {
    submitted: {
      titleAr: `تم استلام طلب الدفع${refLabel}`,
      titleEn: `Payment Request Received${refLabel}`,
      messageAr: `تم استلام إيصال التحويل الخاص بك لباقة "${planNameAr}" بمبلغ ${(amountIqd || 0).toLocaleString('en-US')} د.ع وهو الآن قيد التدقيق من الإدارة المالية في MEDORA.`,
      messageEn: `Your transfer receipt for "${planEn}" (${(amountIqd || 0).toLocaleString('en-US')} IQD) was received and is pending verification by MEDORA administration.`,
      priority: 'normal',
    },
    under_review: {
      titleAr: `طلب الدفع قيد المراجعة المالية${refLabel}`,
      titleEn: `Payment Request Under Review${refLabel}`,
      messageAr: `يقوم المشرف العام حالياً بمراجعة إيصال التحويل لباقة "${planNameAr}" ومطابقته مع رصيد المحفظة.`,
      messageEn: `Your payment receipt for "${planEn}" is currently under financial review by the Super Admin.`,
      priority: 'normal',
    },
    approved: {
      titleAr: `تم اعتماد دفعتك المالية بنجاح${refLabel}`,
      titleEn: `Payment Approved${refLabel}`,
      messageAr: `تم التحقق من استلام مبلغ ${(amountIqd || 0).toLocaleString('en-US')} د.ع واعتماد طلب الدفع لباقة "${planNameAr}".`,
      messageEn: `Your transfer of ${(amountIqd || 0).toLocaleString('en-US')} IQD for "${planEn}" has been verified and approved.`,
      priority: 'urgent',
    },
    activated: {
      titleAr: `تم تفعيل اشتراكك في MEDORA`,
      titleEn: `MEDORA Subscription Activated`,
      messageAr: `تم تفعيل باقة "${planNameAr}" بنجاح وتستمر صلاحية الاشتراك حتى تاريخ ${endDate || '—'}.`,
      messageEn: `Your "${planEn}" subscription is now active through ${endDate || '—'}.`,
      priority: 'urgent',
    },
    rejected: {
      titleAr: `تعذر اعتماد طلب الدفع${refLabel}`,
      titleEn: `Payment Request Rejected${refLabel}`,
      messageAr: `تم رفض طلب الدفع لباقة "${planNameAr}". السبب: ${rejectionReason || 'يرجى مراجعة بيانات التحويل وإعادة الرفع'}. يمكنك تقديم طلب جديد في أي وقت.`,
      messageEn: `Your payment request for "${planEn}" was rejected. Reason: ${rejectionReason || 'Please verify transfer details and resubmit'}.`,
      priority: 'urgent',
    },
    nearing_expiration: {
      titleAr: `تنبيه قرب انتهاء الاشتراك (${daysRemaining ?? 7} أيام متبقية)`,
      titleEn: `Subscription Expiring Soon (${daysRemaining ?? 7} days left)`,
      messageAr: `اشتراكك في باقة "${planNameAr}" سينتهي بتاريخ ${endDate || 'قريباً'}. يرجى التجديد لتفادي توقف الخدمات.`,
      messageEn: `Your "${planEn}" subscription expires on ${endDate || 'soon'}. Renew soon to avoid interruption.`,
      priority: 'urgent',
    },
    expired: {
      titleAr: `انتهت صلاحية اشتراكك في MEDORA`,
      titleEn: `MEDORA Subscription Expired`,
      messageAr: `انتهى اشتراك باقة "${planNameAr}" بتاريخ ${endDate || '—'}. يرجى رفع إيصال تجديد عبر سوبر كي أو زين كاش لإعادة التفعيل.`,
      messageEn: `Your "${planEn}" subscription expired on ${endDate || '—'}. Please submit a renewal receipt via SuperQi or ZainCash.`,
      priority: 'urgent',
    },
  };

  const c = contentByEvent[event];
  return dispatchM737Notification({
    recipientUid: userUid,
    recipientRole: userRole,
    category: 'subscription_payment',
    titleAr: c.titleAr,
    titleEn: c.titleEn,
    messageAr: c.messageAr,
    messageEn: c.messageEn,
    targetPortal: portalTarget as any,
    targetUrl: `/${portalTarget}`,
    sourceEventId: `pay_evt_${requestId}_${event}`,
    priority: c.priority,
  });
}

