/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { sanitizeForFirestore } from '../lib/firebase';
import { UserProfile, Appointment, ElectronicPrescription } from '../types';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] #${totalTests} ${testName}`);
  } else {
    failedTests++;
    console.error(`  [FAIL] #${totalTests} ${testName} - ${detail || 'Assertion failed'}`);
  }
}

/**
 * Strict validator replicating the exact check performed by Firestore SDK:
 * Firestore throws: "Function setDoc() called with invalid data. Unsupported field value: undefined (found in field ...)"
 */
function simulateFirestoreSetDocCheck(obj: any, path: string = ''): void {
  if (obj === undefined) {
    throw new Error(`Function setDoc() called with invalid data. Unsupported field value: undefined (found in field ${path})`);
  }
  if (obj === null || typeof obj !== 'object') {
    return;
  }
  if (Array.isArray(obj)) {
    obj.forEach((item, idx) => simulateFirestoreSetDocCheck(item, `${path}[${idx}]`));
    return;
  }
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = path ? `${path}.${key}` : key;
    if (value === undefined) {
      throw new Error(`Function setDoc() called with invalid data. Unsupported field value: undefined (found in field ${currentPath})`);
    }
    simulateFirestoreSetDocCheck(value, currentPath);
  }
}

console.log('================ FIRESTORE SETDOC UNDEFINED REGRESSION TEST SUITE ================');

// 1. Primitive preservation
assert(sanitizeForFirestore(null) === null, 'Preserves null value');
assert(sanitizeForFirestore('test') === 'test', 'Preserves string value');
assert(sanitizeForFirestore(12345) === 12345, 'Preserves number value');
assert(sanitizeForFirestore(false) === false, 'Preserves boolean value');
assert(sanitizeForFirestore('') === '', 'Preserves empty string value');

// 2. The exact bug from AuthContext.tsx:
// `medicalId: effectiveRole === 'patient' ? assignedId : undefined`
const brokenUserProfile: any = {
  uid: 'user_doc_123',
  email: 'doctor@example.com',
  displayName: 'د. علي الجبوري',
  role: 'doctor',
  status: 'pending',
  accountId: 'M737-DOC-982142',
  medicalId: undefined, // <--- EXACT REGRESSION POINT
  phone: '07701234567',
  createdAt: '2026-11-12T00:00:00Z',
  updatedAt: '2026-11-12T00:00:00Z',
};

// Verify the un-sanitized object would crash Firestore
let unSanitizedCrashed = false;
try {
  simulateFirestoreSetDocCheck(brokenUserProfile);
} catch (e: any) {
  unSanitizedCrashed = true;
  assert(e.message.includes('found in field medicalId'), 'Simulator successfully caught un-sanitized undefined medicalId');
}
assert(unSanitizedCrashed === true, 'Unsanitized object fails Firestore check as expected');

// Now sanitize and verify Firestore accepts it
const cleanUserProfile = sanitizeForFirestore(brokenUserProfile);
assert(!('medicalId' in cleanUserProfile), 'Sanitizer completely omitted undefined medicalId key');
let sanitizedSuccess = false;
try {
  simulateFirestoreSetDocCheck(cleanUserProfile);
  sanitizedSuccess = true;
} catch (e) {
  sanitizedSuccess = false;
}
assert(sanitizedSuccess === true, 'Sanitized UserProfile passes strict Firestore validation');

// 3. Optional properties in Appointment
const rawAppointment: any = {
  id: 'apt_test_001',
  doctorId: 'doc_123',
  patientId: 'pat_456',
  patientName: 'مريم أحمد',
  patientPhone: '07800000000',
  doctorName: 'د. أحمد',
  specialty: 'أطفال',
  date: '2026-11-15',
  timeSlot: '10:00 AM - 10:30 AM',
  status: 'pending',
  notes: undefined, // Optional undefined
  rescheduleReason: undefined, // Optional undefined
  rescheduleProposedDate: undefined, // Optional undefined
  createdAt: '2026-11-12T00:00:00Z',
  updatedAt: '2026-11-12T00:00:00Z',
};

const cleanAppointment = sanitizeForFirestore(rawAppointment);
assert(!('notes' in cleanAppointment), 'Omitted undefined notes');
assert(!('rescheduleReason' in cleanAppointment), 'Omitted undefined rescheduleReason');
let aptSuccess = false;
try {
  simulateFirestoreSetDocCheck(cleanAppointment);
  aptSuccess = true;
} catch (e) {
  aptSuccess = false;
}
assert(aptSuccess === true, 'Sanitized Appointment passes Firestore validation');

// 4. Nested objects and arrays with undefined values
const complexMedicalRecord: any = {
  recordId: 'rec_999',
  summary: 'Periodic health check',
  metadata: {
    sourceHospital: undefined,
    department: 'Cardiology',
    auditor: {
      auditorId: undefined,
      auditorName: 'System',
    },
  },
  attachments: [
    { name: 'Scan1.jpg', url: 'https://...', size: undefined },
    { name: 'Lab.pdf', url: 'https://...', size: 2048 },
  ],
};

const cleanComplex = sanitizeForFirestore(complexMedicalRecord);
assert(!('sourceHospital' in cleanComplex.metadata), 'Nested undefined field removed');
assert(!('auditorId' in cleanComplex.metadata.auditor), 'Deep nested undefined field removed');
assert(cleanComplex.metadata.department === 'Cardiology', 'Retains sibling valid properties');
assert(!('size' in cleanComplex.attachments[0]), 'Undefined field in array item removed');
assert(cleanComplex.attachments[1].size === 2048, 'Array item valid property preserved');

let complexSuccess = false;
try {
  simulateFirestoreSetDocCheck(cleanComplex);
  complexSuccess = true;
} catch (e) {
  complexSuccess = false;
}
assert(complexSuccess === true, 'Complex nested payload passes Firestore validation');

// 5. Notification Record with optional link and push token with optional subscription
const rawInAppNotification: any = {
  id: 'notif_test_101',
  recipientUid: 'user_recip_888',
  title: 'تأكيد الموعد',
  titleEn: undefined, // Optional undefined
  message: 'تم تأكيد موعدك',
  messageEn: undefined, // Optional undefined
  type: 'booking_update',
  category: 'appointment',
  targetPortal: undefined, // Optional undefined
  link: undefined, // Optional undefined
  priority: 'normal',
  read: false,
  createdAt: '2026-11-12T12:00:00Z',
};

let rawNotifCrashed = false;
try {
  simulateFirestoreSetDocCheck(rawInAppNotification);
} catch (e: any) {
  rawNotifCrashed = true;
  assert(e.message.includes('found in field titleEn') || e.message.includes('found in field link'), 'Simulator caught undefined notification field');
}
assert(rawNotifCrashed === true, 'Raw in-app notification without sanitizer fails Firestore validation');

const cleanInAppNotification = sanitizeForFirestore(rawInAppNotification);
assert(!('titleEn' in cleanInAppNotification), 'Sanitizer omitted undefined titleEn');
assert(!('link' in cleanInAppNotification), 'Sanitizer omitted undefined link');
let notifSuccess = false;
try {
  simulateFirestoreSetDocCheck(cleanInAppNotification);
  notifSuccess = true;
} catch (e) {
  notifSuccess = false;
}
assert(notifSuccess === true, 'Sanitized in-app notification passes strict Firestore validation');

// 6. Device Token Record with optional Web Push subscription
const rawDeviceToken: any = {
  token: 'fcm_token_device_999',
  subscription: undefined, // Web Push subscription optional (e.g. mobile app or Safari)
  uid: 'user_uid_444',
  role: 'doctor',
  platform: 'android',
  userAgent: 'Mozilla/5.0 Android',
  createdAt: '2026-11-12T12:00:00Z',
  lastSeenAt: '2026-11-12T12:00:00Z',
  preferences: {
    enabled: true,
    appointments: true,
    customKey: undefined,
  },
};

const cleanDeviceToken = sanitizeForFirestore(rawDeviceToken);
assert(!('subscription' in cleanDeviceToken), 'Sanitizer omitted undefined subscription');
assert(!('customKey' in cleanDeviceToken.preferences), 'Sanitizer omitted nested undefined preference');
let tokenSuccess = false;
try {
  simulateFirestoreSetDocCheck(cleanDeviceToken);
  tokenSuccess = true;
} catch (e) {
  tokenSuccess = false;
}
assert(tokenSuccess === true, 'Sanitized DeviceToken passes strict Firestore validation');

// 7. Subscription payload with optional notes
const rawSubscription: any = {
  id: 'sub-user-001',
  userId: 'user-001',
  userName: 'د. كريم',
  userRole: 'doctor',
  planId: 'plan-doctor-standard',
  customPriceIqd: 25000,
  status: 'active',
  startDate: '2026-11-12T00:00:00Z',
  endDate: '2026-12-12T00:00:00Z',
  notes: undefined, // Optional undefined
  updatedAt: '2026-11-12T00:00:00Z',
};

const cleanSubscription = sanitizeForFirestore(rawSubscription);
assert(!('notes' in cleanSubscription), 'Sanitizer omitted undefined subscription notes');
let subSuccess = false;
try {
  simulateFirestoreSetDocCheck(cleanSubscription);
  subSuccess = true;
} catch (e) {
  subSuccess = false;
}
assert(subSuccess === true, 'Sanitized Subscription passes strict Firestore validation');

console.log(`================ TEST RESULT: ${passedTests}/${totalTests} PASSED ================`);
if (failedTests > 0) {
  process.exit(1);
}
