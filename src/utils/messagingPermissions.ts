import {
  collection,
  getDocs,
  query,
  where,
  Firestore,
} from 'firebase/firestore';
import {
  Conversation,
  ConversationRelationshipType,
  PortalId,
  UserProfile,
  UserRole,
} from '../types';
import { isPortalSuspended, isRoleSuspended } from '../config/portalsConfig';

export interface AuthorizedMessagingPeer {
  uid: string;
  name: string;
  role: UserRole;
  relationshipType: ConversationRelationshipType;
  relationshipRefId?: string;
  accountId?: string;
  subtitle?: string;
}

export interface MessagingCategoryDescriptor {
  role: UserRole;
  labelAr: string;
  labelEn: string;
  descAr: string;
  descEn: string;
}

export const ALL_MESSAGING_CATEGORIES: MessagingCategoryDescriptor[] = [
  {
    role: 'doctor',
    labelAr: 'الأطباء والعيادات',
    labelEn: 'Doctors & Clinics',
    descAr: 'استشارات ومتابعات طبية مع أطبائك المرتبطين',
    descEn: 'Medical follow-ups with linked doctors',
  },
  {
    role: 'laboratory',
    labelAr: 'المختبرات الطبية',
    labelEn: 'Medical Laboratories',
    descAr: 'حجوزات التحاليل ومتابعة النتائج المخبرية',
    descEn: 'Lab tests and diagnostic results inquiries',
  },
  {
    role: 'radiology_center',
    labelAr: 'مراكز الأشعة والسونار',
    labelEn: 'Radiology Centers',
    descAr: 'حجوزات التصوير الطبي وتقارير الأشعة',
    descEn: 'Imaging bookings and radiology reports',
  },
  {
    role: 'pharmacy',
    labelAr: 'الصيدليات الأهلية',
    labelEn: 'Pharmacies',
    descAr: 'طلبات الأدوية والوصفات الإلكترونية',
    descEn: 'Medicine orders and electronic prescriptions',
  },
  {
    role: 'wholesaler',
    labelAr: 'مذاخر الأدوية والمجهزون',
    labelEn: 'Medical Warehouses',
    descAr: 'التجهيز الدوائي بالجملة للصيدليات المعتمدة',
    descEn: 'Wholesale medicine supply for pharmacies',
  },
  {
    role: 'patient',
    labelAr: 'المرضى والعملاء',
    labelEn: 'Patients & Customers',
    descAr: 'المراجعون والمرضى المرتبطون بمنشأتك فقط',
    descEn: 'Patients and customers linked to your facility',
  },
  {
    role: 'super_admin',
    labelAr: 'الدعم الإداري للنظام',
    labelEn: 'Platform Admin Support',
    descAr: 'التواصل المباشر مع الإدارة العليا لمنصة MEDORA',
    descEn: 'Direct support with MEDORA Super Administration',
  },
];

/**
 * Returns the strict set of peer role categories a user is allowed to browse inside the categorized messenger.
 */
export function getAuthorizedCategoriesForRole(role: UserRole): MessagingCategoryDescriptor[] {
  const allowedByRole: Record<UserRole, UserRole[]> = {
    patient: ['doctor', 'laboratory', 'radiology_center', 'pharmacy', 'super_admin'],
    doctor: ['patient', 'super_admin'],
    laboratory: ['patient', 'super_admin'],
    radiology_center: ['patient', 'super_admin'],
    pharmacy: ['patient', 'wholesaler', 'super_admin'],
    wholesaler: ['pharmacy', 'super_admin'],
    secretary: ['super_admin'],
    super_admin: ['doctor', 'laboratory', 'radiology_center', 'pharmacy', 'wholesaler', 'patient'],
  };
  const allowedRoles = allowedByRole[role] || ['super_admin'];
  return ALL_MESSAGING_CATEGORIES.filter((cat) => allowedRoles.includes(cat.role));
}

/**
 * Returns active (non-suspended) messaging categories for live UI browsing.
 */
export function getActiveAuthorizedCategoriesForRole(role: UserRole): MessagingCategoryDescriptor[] {
  return getAuthorizedCategoriesForRole(role).filter((cat) => !isRoleSuspended(cat.role));
}

/**
 * Resolves the target portal URL slug for notification deep-linking.
 */
export function roleToPortalId(role: UserRole): PortalId {
  if (role === 'radiology_center') return 'radiology';
  if (role === 'super_admin') return 'super_admin';
  if (role === 'doctor') return 'doctor';
  if (role === 'laboratory') return 'laboratory';
  if (role === 'pharmacy') return 'pharmacy';
  if (role === 'wholesaler') return 'wholesaler';
  if (role === 'secretary') return 'secretary';
  return 'patient';
}

/**
 * Builds a deterministic conversation ID for a participant pair & relationship scope.
 */
export function buildScopedConversationId(
  uidA: string,
  uidB: string,
  relationshipType: ConversationRelationshipType
): string {
  const [first, second] = [String(uidA || '').trim(), String(uidB || '').trim()].sort();
  return `conv_${relationshipType}_${first}_${second}`;
}

/**
 * Enforces strict role & relationship-based messaging authorization.
 * - Super Admin: global messaging across all roles.
 * - Doctor <-> Patient: requires verified clinical relationship.
 * - Laboratory <-> Patient: requires verified lab order/booking/result relationship.
 * - Pharmacy <-> Patient (customer): requires verified prescription or pharmacy order.
 * - Wholesaler <-> Pharmacy: requires verified wholesale subscription / B2B order.
 * - Patients cannot initiate chats with unrelated institutions, other patients, or wholesalers.
 */
export function canCommunicateWithPeer(params: {
  senderRole: UserRole;
  senderUid: string;
  targetRole: UserRole;
  targetUid: string;
  hasVerifiedRelationship: boolean;
}): { allowed: boolean; relationshipType?: ConversationRelationshipType; reason?: string } {
  const { senderRole, senderUid, targetRole, targetUid, hasVerifiedRelationship } = params;

  if (!senderUid || !targetUid || senderUid === targetUid) {
    return { allowed: false, reason: 'Invalid participant pair' };
  }

  // Super Admin has global messaging permissions across all portals
  if (senderRole === 'super_admin' || targetRole === 'super_admin') {
    return { allowed: true, relationshipType: 'admin_support' };
  }

  const pair = new Set<UserRole>([senderRole, targetRole]);

  if (pair.has('doctor') && pair.has('patient')) {
    if (!hasVerifiedRelationship) {
      return {
        allowed: false,
        reason: 'Messaging requires an active appointment, chart, prescription, or record-sharing link between doctor and patient.',
      };
    }
    return { allowed: true, relationshipType: 'doctor_patient' };
  }

  if (pair.has('laboratory') && pair.has('patient')) {
    if (!hasVerifiedRelationship) {
      return {
        allowed: false,
        reason: 'Messaging requires a laboratory booking, order, or result linking the patient and laboratory.',
      };
    }
    return { allowed: true, relationshipType: 'lab_patient' };
  }

  if (pair.has('radiology_center') && pair.has('patient')) {
    if (!hasVerifiedRelationship) {
      return {
        allowed: false,
        reason: 'Messaging requires a radiology booking, order, or report linking the patient and center.',
      };
    }
    return { allowed: true, relationshipType: 'radiology_patient' };
  }

  if (pair.has('pharmacy') && pair.has('patient')) {
    if (!hasVerifiedRelationship) {
      return {
        allowed: false,
        reason: 'Messaging requires a pharmacy order or prescription linking the customer and pharmacy.',
      };
    }
    return { allowed: true, relationshipType: 'pharmacy_customer' };
  }

  if (pair.has('wholesaler') && pair.has('pharmacy')) {
    if (!hasVerifiedRelationship) {
      return {
        allowed: false,
        reason: 'Wholesaler messaging is limited to authorized/subscribed pharmacy partners.',
      };
    }
    return { allowed: true, relationshipType: 'wholesaler_pharmacy' };
  }

  return {
    allowed: false,
    reason: `Messaging between ${senderRole} and ${targetRole} is not permitted.`,
  };
}

/**
 * Extracts normalized participant IDs from either unified or legacy Conversation docs.
 */
export function getConversationParticipantIds(conv: Partial<Conversation>): string[] {
  if (Array.isArray(conv.participantIds) && conv.participantIds.length > 0) {
    return conv.participantIds;
  }
  const ids: string[] = [];
  if (conv.patientId) ids.push(conv.patientId);
  if (conv.doctorId && conv.doctorId !== conv.patientId) ids.push(conv.doctorId);
  return ids;
}

/**
 * Resolves the display metadata of the other participant in a 1:1 conversation.
 */
export function getConversationPeerDisplay(
  conv: Conversation,
  currentUserUid: string
): { uid: string; name: string; role: UserRole; subtitle?: string } {
  const participantIds = getConversationParticipantIds(conv);
  const peerUid = participantIds.find((id) => id !== currentUserUid) || '';

  if (conv.participants && peerUid && conv.participants[peerUid]) {
    const info = conv.participants[peerUid];
    return {
      uid: info.uid || peerUid,
      name: info.name || peerUid,
      role: info.role || 'patient',
      subtitle: info.specialtyOrFacility || info.accountId,
    };
  }

  // Backward-compatible legacy doctor-patient conversation fallback
  if (conv.doctorId === currentUserUid) {
    return {
      uid: conv.patientId || peerUid,
      name: conv.patientName || 'Patient',
      role: 'patient',
      subtitle: conv.patientMedicalId,
    };
  }

  // Infer non-doctor role accurately when relationshipType is specified on partial docs
  if (conv.relationshipType === 'admin_support') {
    return {
      uid: peerUid,
      name: 'Platform Admin Support',
      role: 'super_admin',
    };
  }
  if (conv.relationshipType === 'lab_patient' && conv.patientId !== peerUid) {
    return {
      uid: peerUid,
      name: 'Laboratory',
      role: 'laboratory',
    };
  }
  if (conv.relationshipType === 'radiology_patient' && conv.patientId !== peerUid) {
    return {
      uid: peerUid,
      name: 'Radiology Center',
      role: 'radiology_center',
    };
  }
  if (conv.relationshipType === 'pharmacy_customer' && conv.patientId !== peerUid) {
    return {
      uid: peerUid,
      name: 'Pharmacy',
      role: 'pharmacy',
    };
  }
  if (conv.relationshipType === 'wholesaler_pharmacy') {
    return {
      uid: peerUid,
      name: 'Partner',
      role: 'wholesaler',
    };
  }

  return {
    uid: conv.doctorId || peerUid,
    name: conv.doctorName || 'Doctor',
    role: 'doctor',
    subtitle: conv.doctorSpecialty,
  };
}

/**
 * Computes unread message count for the current user safely across unified & legacy schemas.
 */
export function getUnreadCountForUser(
  conv: Conversation,
  currentUserUid: string,
  currentUserRole: UserRole
): number {
  if (conv.unreadCounts && typeof conv.unreadCounts[currentUserUid] === 'number') {
    return conv.unreadCounts[currentUserUid];
  }
  if (currentUserRole === 'doctor' && conv.doctorId === currentUserUid) {
    return conv.unreadByDoctor || 0;
  }
  if (currentUserRole === 'patient' && conv.patientId === currentUserUid) {
    return conv.unreadByPatient || 0;
  }
  return 0;
}

/**
 * Loads strictly authorized messaging peers from Firestore based on the user's role
 * and verified clinical/order/subscription relationships.
 */
export async function loadAuthorizedMessagingPeers(
  db: Firestore,
  currentUserUid: string,
  currentUserRole: UserRole
): Promise<AuthorizedMessagingPeer[]> {
  if (!currentUserUid) return [];

  const peerMap = new Map<string, AuthorizedMessagingPeer>();

  const upsertPeer = (peer: AuthorizedMessagingPeer) => {
    if (!peer.uid || peer.uid === currentUserUid) return;
    const key = `${peer.relationshipType}_${peer.uid}`;
    const existing = peerMap.get(key);
    if (!existing) {
      peerMap.set(key, peer);
    } else if ((!existing.name || existing.name === existing.uid) && peer.name) {
      peerMap.set(key, { ...existing, ...peer });
    }
  };

  try {
    if (currentUserRole === 'super_admin') {
      const usersSnap = await getDocs(collection(db, 'users'));
      usersSnap.forEach((d) => {
        const u = d.data() as UserProfile;
        if (d.id !== currentUserUid) {
          upsertPeer({
            uid: d.id,
            name: u.facilityName ? `${u.displayName} (${u.facilityName})` : u.displayName || u.email,
            role: u.role,
            relationshipType: 'admin_support',
            accountId: u.accountId,
            subtitle: u.email,
          });
        }
      });
    } else if (currentUserRole === 'doctor') {
      const [appts, charts, rxs, labOrders, radOrders, shares] = await Promise.all([
        getDocs(query(collection(db, 'appointments'), where('doctorId', '==', currentUserUid))),
        getDocs(query(collection(db, 'doctor_patient_charts'), where('doctorId', '==', currentUserUid))),
        getDocs(query(collection(db, 'electronic_prescriptions'), where('doctorId', '==', currentUserUid))),
        getDocs(query(collection(db, 'lab_orders'), where('doctorId', '==', currentUserUid))),
        isPortalSuspended('radiology')
          ? Promise.resolve(null)
          : getDocs(query(collection(db, 'radiology_orders'), where('doctorId', '==', currentUserUid))),
        getDocs(query(collection(db, 'record_sharing_permissions'), where('targetDoctorId', '==', currentUserUid))),
      ]);

      appts.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'doctor_patient',
            relationshipRefId: d.id,
            subtitle: data.patientPhone,
          });
        }
      });
      charts.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'doctor_patient',
            relationshipRefId: d.id,
            accountId: data.patientMedicalId,
            subtitle: data.patientMedicalId,
          });
        }
      });
      rxs.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'doctor_patient',
            relationshipRefId: d.id,
          });
        }
      });
      labOrders.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'doctor_patient',
            relationshipRefId: d.id,
          });
        }
      });
      radOrders?.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'doctor_patient',
            relationshipRefId: d.id,
          });
        }
      });
      shares.forEach((d) => {
        const data = d.data();
        if (data.patientId && data.status === 'active') {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'doctor_patient',
            relationshipRefId: d.id,
            accountId: data.patientMedicalId,
          });
        }
      });
    } else if (currentUserRole === 'laboratory') {
      const [bookings, orders, results] = await Promise.all([
        getDocs(query(collection(db, 'lab_bookings'), where('labId', '==', currentUserUid))),
        getDocs(query(collection(db, 'lab_orders'), where('targetLabId', '==', currentUserUid))),
        getDocs(query(collection(db, 'lab_results'), where('labId', '==', currentUserUid))),
      ]);

      bookings.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'lab_patient',
            relationshipRefId: d.id,
            subtitle: data.testName,
          });
        }
      });
      orders.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'lab_patient',
            relationshipRefId: d.id,
            subtitle: data.orderNumber,
          });
        }
      });
      results.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'lab_patient',
            relationshipRefId: d.id,
            subtitle: data.testName,
          });
        }
      });
    } else if (currentUserRole === 'radiology_center') {
      const [bookings, orders, reports] = await Promise.all([
        getDocs(query(collection(db, 'radiology_bookings'), where('centerId', '==', currentUserUid))),
        getDocs(query(collection(db, 'radiology_orders'), where('targetCenterId', '==', currentUserUid))),
        getDocs(query(collection(db, 'radiology_reports'), where('centerId', '==', currentUserUid))),
      ]);

      bookings.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'radiology_patient',
            relationshipRefId: d.id,
            subtitle: data.serviceName,
          });
        }
      });
      orders.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'radiology_patient',
            relationshipRefId: d.id,
            subtitle: data.orderNumber || data.bodyRegion,
          });
        }
      });
      reports.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'radiology_patient',
            relationshipRefId: d.id,
            subtitle: data.serviceName,
          });
        }
      });
    } else if (currentUserRole === 'pharmacy') {
      const [orders, targetedRxs, dispensedRxs, wholesaleOrders] = await Promise.all([
        getDocs(query(collection(db, 'pharmacy_orders'), where('pharmacyId', '==', currentUserUid))),
        getDocs(query(collection(db, 'electronic_prescriptions'), where('targetPharmacyId', '==', currentUserUid))),
        getDocs(query(collection(db, 'electronic_prescriptions'), where('dispensedPharmacyId', '==', currentUserUid))),
        isPortalSuspended('wholesaler')
          ? Promise.resolve(null)
          : getDocs(query(collection(db, 'wholesale_orders'), where('pharmacyId', '==', currentUserUid))),
      ]);

      orders.forEach((d) => {
        const data = d.data();
        if (data.patientId && !String(data.patientId).startsWith('walkin_')) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Customer',
            role: 'patient',
            relationshipType: 'pharmacy_customer',
            relationshipRefId: d.id,
            subtitle: data.patientPhone,
          });
        }
      });
      targetedRxs.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'pharmacy_customer',
            relationshipRefId: d.id,
            subtitle: data.prescriptionNumber,
          });
        }
      });
      dispensedRxs.forEach((d) => {
        const data = d.data();
        if (data.patientId) {
          upsertPeer({
            uid: data.patientId,
            name: data.patientName || 'Patient',
            role: 'patient',
            relationshipType: 'pharmacy_customer',
            relationshipRefId: d.id,
            subtitle: data.prescriptionNumber,
          });
        }
      });
      wholesaleOrders?.forEach((d) => {
        const data = d.data();
        if (data.wholesalerId) {
          upsertPeer({
            uid: data.wholesalerId,
            name: data.wholesalerName || 'Medical Warehouse',
            role: 'wholesaler',
            relationshipType: 'wholesaler_pharmacy',
            relationshipRefId: d.id,
            subtitle: data.invoiceNumber,
          });
        }
      });
    } else if (currentUserRole === 'wholesaler') {
      const wholesaleOrders = await getDocs(
        query(collection(db, 'wholesale_orders'), where('wholesalerId', '==', currentUserUid))
      );
      wholesaleOrders.forEach((d) => {
        const data = d.data();
        if (data.pharmacyId) {
          upsertPeer({
            uid: data.pharmacyId,
            name: data.pharmacyName || 'Pharmacy Subscriber',
            role: 'pharmacy',
            relationshipType: 'wholesaler_pharmacy',
            relationshipRefId: d.id,
            subtitle: data.pharmacyGovernorate || data.pharmacyPhone,
          });
        }
      });
    } else if (currentUserRole === 'patient') {
      // Strictly ONLY linked doctors, labs, and pharmacies from the patient's own real records (skipping suspended radiology queries)
      const radSuspended = isPortalSuspended('radiology');
      const [appts, charts, rxs, labBookings, labOrders, labResults, radBookings, radOrders, radReports, pharmOrders, shares] = await Promise.all([
        getDocs(query(collection(db, 'appointments'), where('patientId', '==', currentUserUid))),
        getDocs(query(collection(db, 'doctor_patient_charts'), where('patientId', '==', currentUserUid))),
        getDocs(query(collection(db, 'electronic_prescriptions'), where('patientId', '==', currentUserUid))),
        getDocs(query(collection(db, 'lab_bookings'), where('patientId', '==', currentUserUid))),
        getDocs(query(collection(db, 'lab_orders'), where('patientId', '==', currentUserUid))),
        getDocs(query(collection(db, 'lab_results'), where('patientId', '==', currentUserUid))),
        radSuspended
          ? Promise.resolve(null)
          : getDocs(query(collection(db, 'radiology_bookings'), where('patientId', '==', currentUserUid))),
        radSuspended
          ? Promise.resolve(null)
          : getDocs(query(collection(db, 'radiology_orders'), where('patientId', '==', currentUserUid))),
        radSuspended
          ? Promise.resolve(null)
          : getDocs(query(collection(db, 'radiology_reports'), where('patientId', '==', currentUserUid))),
        getDocs(query(collection(db, 'pharmacy_orders'), where('patientId', '==', currentUserUid))),
        getDocs(query(collection(db, 'record_sharing_permissions'), where('patientId', '==', currentUserUid))),
      ]);

      appts.forEach((d) => {
        const data = d.data();
        if (data.doctorId) {
          upsertPeer({
            uid: data.doctorId,
            name: data.doctorName || 'Doctor',
            role: 'doctor',
            relationshipType: 'doctor_patient',
            relationshipRefId: d.id,
            subtitle: data.specialty,
          });
        }
      });
      charts.forEach((d) => {
        const data = d.data();
        if (data.doctorId) {
          upsertPeer({
            uid: data.doctorId,
            name: data.doctorName || 'Doctor',
            role: 'doctor',
            relationshipType: 'doctor_patient',
            relationshipRefId: d.id,
            subtitle: data.doctorSpecialty,
          });
        }
      });
      rxs.forEach((d) => {
        const data = d.data();
        if (data.doctorId) {
          upsertPeer({
            uid: data.doctorId,
            name: data.doctorName || 'Doctor',
            role: 'doctor',
            relationshipType: 'doctor_patient',
            relationshipRefId: d.id,
            subtitle: data.doctorSpecialty,
          });
        }
        const pharmUid = data.dispensedPharmacyId || data.targetPharmacyId;
        const pharmName = data.dispensedPharmacyName || data.targetPharmacyName;
        if (pharmUid) {
          upsertPeer({
            uid: pharmUid,
            name: pharmName || 'Pharmacy',
            role: 'pharmacy',
            relationshipType: 'pharmacy_customer',
            relationshipRefId: d.id,
          });
        }
      });
      shares.forEach((d) => {
        const data = d.data();
        if (data.targetDoctorId && data.status === 'active') {
          upsertPeer({
            uid: data.targetDoctorId,
            name: data.targetDoctorName || 'Doctor',
            role: 'doctor',
            relationshipType: 'doctor_patient',
            relationshipRefId: d.id,
            subtitle: data.targetDoctorSpecialty,
          });
        }
      });
      labBookings.forEach((d) => {
        const data = d.data();
        if (data.labId) {
          upsertPeer({
            uid: data.labId,
            name: data.labName || 'Laboratory',
            role: 'laboratory',
            relationshipType: 'lab_patient',
            relationshipRefId: d.id,
          });
        }
      });
      labOrders.forEach((d) => {
        const data = d.data();
        if (data.targetLabId) {
          upsertPeer({
            uid: data.targetLabId,
            name: data.targetLabName || 'Laboratory',
            role: 'laboratory',
            relationshipType: 'lab_patient',
            relationshipRefId: d.id,
          });
        }
      });
      labResults.forEach((d) => {
        const data = d.data();
        if (data.labId) {
          upsertPeer({
            uid: data.labId,
            name: data.labName || 'Laboratory',
            role: 'laboratory',
            relationshipType: 'lab_patient',
            relationshipRefId: d.id,
          });
        }
      });
      pharmOrders.forEach((d) => {
        const data = d.data();
        if (data.pharmacyId) {
          upsertPeer({
            uid: data.pharmacyId,
            name: data.pharmacyName || 'Pharmacy',
            role: 'pharmacy',
            relationshipType: 'pharmacy_customer',
            relationshipRefId: d.id,
          });
        }
      });
      radBookings?.forEach((d) => {
        const data = d.data();
        if (data.centerId) {
          upsertPeer({
            uid: data.centerId,
            name: data.centerName || 'Radiology Center',
            role: 'radiology_center',
            relationshipType: 'radiology_patient',
            relationshipRefId: d.id,
          });
        }
      });
      radOrders?.forEach((d) => {
        const data = d.data();
        if (data.targetCenterId) {
          upsertPeer({
            uid: data.targetCenterId,
            name: data.targetCenterName || 'Radiology Center',
            role: 'radiology_center',
            relationshipType: 'radiology_patient',
            relationshipRefId: d.id,
          });
        }
      });
      radReports?.forEach((d) => {
        const data = d.data();
        if (data.centerId) {
          upsertPeer({
            uid: data.centerId,
            name: data.centerName || 'Radiology Center',
            role: 'radiology_center',
            relationshipType: 'radiology_patient',
            relationshipRefId: d.id,
          });
        }
      });
    }
  } catch (err) {
    console.warn('[MessagingPermissions] Error loading authorized peers:', err);
  }

  const allPeers = Array.from(peerMap.values());
  if (currentUserRole !== 'super_admin') {
    return allPeers.filter((peer) => !isRoleSuspended(peer.role));
  }
  return allPeers;
}
