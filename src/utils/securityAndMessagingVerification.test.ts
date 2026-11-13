/**
 * Comprehensive Verification Suite for:
 * 1. Unified Private Messaging Permissions (role + relationship isolation)
 * 2. Patient Printing Authorization & Ownership Enforcement
 * 3. Subscription Payment Gateways (strictly ZainCash & QiCard only; zero FIB/card)
 * 4. Firestore & Storage Security Rules hardening
 * 5. Portal Data Cleanup & Warehouse / Pharmacy Integrity
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  buildScopedConversationId,
  canCommunicateWithPeer,
  getAuthorizedCategoriesForRole,
  getConversationParticipantIds,
  getUnreadCountForUser,
  roleToPortalId,
} from './messagingPermissions';
import {
  canUserPrintHealthPassport,
  canUserPrintLabResult,
  canUserPrintPersonalRecord,
  canUserPrintPharmacyOrder,
  canUserPrintPrescription,
  canUserPrintRadiologyReport,
  canUserPrintReferral,
} from './printingPermissions';
import {
  calculateAgeFromDob,
  collectScopedPatients,
  hasValidPhoneNumber,
  searchScopedPatients,
} from './patientSearch';
import {
  ACTIVE_PAYMENT_GATEWAY_IDS,
  SUPPORTED_PAYMENT_GATEWAYS,
  isSupportedPaymentGateway,
} from '../lib/paymentGatewayService';

export interface SecurityVerificationResult {
  suite: string;
  name: string;
  passed: boolean;
  message?: string;
}

export function runSecurityAndMessagingVerificationTests(): {
  total: number;
  passed: number;
  failed: number;
  results: SecurityVerificationResult[];
} {
  const results: SecurityVerificationResult[] = [];

  const assert = (suite: string, name: string, condition: boolean, failMessage?: string) => {
    results.push({
      suite,
      name,
      passed: Boolean(condition),
      message: condition ? undefined : failMessage,
    });
  };

  // ==============================================================
  // 1. UNIFIED PRIVATE MESSAGING PERMISSIONS
  // ==============================================================
  assert(
    'Messaging Permissions',
    'Rejects self-messaging and missing UIDs',
    !canCommunicateWithPeer({
      senderRole: 'doctor',
      senderUid: 'doc1',
      targetRole: 'patient',
      targetUid: 'doc1',
      hasVerifiedRelationship: true,
    }).allowed &&
      !canCommunicateWithPeer({
        senderRole: 'patient',
        senderUid: '',
        targetRole: 'doctor',
        targetUid: 'doc1',
        hasVerifiedRelationship: true,
      }).allowed,
    'Self-messaging or empty UID was improperly allowed'
  );

  assert(
    'Messaging Permissions',
    'Patients cannot message unrelated doctors, labs, or pharmacies without a verified link',
    !canCommunicateWithPeer({
      senderRole: 'patient',
      senderUid: 'pat1',
      targetRole: 'doctor',
      targetUid: 'doc_stranger',
      hasVerifiedRelationship: false,
    }).allowed &&
      !canCommunicateWithPeer({
        senderRole: 'patient',
        senderUid: 'pat1',
        targetRole: 'laboratory',
        targetUid: 'lab_stranger',
        hasVerifiedRelationship: false,
      }).allowed &&
      !canCommunicateWithPeer({
        senderRole: 'patient',
        senderUid: 'pat1',
        targetRole: 'pharmacy',
        targetUid: 'pharm_stranger',
        hasVerifiedRelationship: false,
      }).allowed,
    'Patient allowed to message unlinked institution'
  );

  assert(
    'Messaging Permissions',
    'Patients cannot message other patients or medical wholesalers even if linked flag is true',
    !canCommunicateWithPeer({
      senderRole: 'patient',
      senderUid: 'pat1',
      targetRole: 'patient',
      targetUid: 'pat2',
      hasVerifiedRelationship: true,
    }).allowed &&
      !canCommunicateWithPeer({
        senderRole: 'patient',
        senderUid: 'pat1',
        targetRole: 'wholesaler',
        targetUid: 'whole1',
        hasVerifiedRelationship: true,
      }).allowed,
    'Patient allowed to message another patient or wholesaler'
  );

  const docPatOk = canCommunicateWithPeer({
    senderRole: 'doctor',
    senderUid: 'doc1',
    targetRole: 'patient',
    targetUid: 'pat1',
    hasVerifiedRelationship: true,
  });
  const labPatOk = canCommunicateWithPeer({
    senderRole: 'laboratory',
    senderUid: 'lab1',
    targetRole: 'patient',
    targetUid: 'pat1',
    hasVerifiedRelationship: true,
  });
  const pharmCustOk = canCommunicateWithPeer({
    senderRole: 'pharmacy',
    senderUid: 'pharm1',
    targetRole: 'patient',
    targetUid: 'pat1',
    hasVerifiedRelationship: true,
  });
  const wholePharmOk = canCommunicateWithPeer({
    senderRole: 'wholesaler',
    senderUid: 'whole1',
    targetRole: 'pharmacy',
    targetUid: 'pharm1',
    hasVerifiedRelationship: true,
  });
  const adminAnyOk = canCommunicateWithPeer({
    senderRole: 'super_admin',
    senderUid: 'admin1',
    targetRole: 'wholesaler',
    targetUid: 'whole1',
    hasVerifiedRelationship: false,
  });

  assert(
    'Messaging Permissions',
    'Authorized doctor/lab/pharmacy/wholesaler pairs and global super_admin messaging succeed with correct relationship types',
    docPatOk.allowed &&
      docPatOk.relationshipType === 'doctor_patient' &&
      labPatOk.allowed &&
      labPatOk.relationshipType === 'lab_patient' &&
      pharmCustOk.allowed &&
      pharmCustOk.relationshipType === 'pharmacy_customer' &&
      wholePharmOk.allowed &&
      wholePharmOk.relationshipType === 'wholesaler_pharmacy' &&
      adminAnyOk.allowed &&
      adminAnyOk.relationshipType === 'admin_support',
    'Authorized peer check failed'
  );

  assert(
    'Messaging Permissions',
    'Wholesaler cannot message unsubscribed pharmacy without verified relationship',
    !canCommunicateWithPeer({
      senderRole: 'wholesaler',
      senderUid: 'whole1',
      targetRole: 'pharmacy',
      targetUid: 'pharm_unsub',
      hasVerifiedRelationship: false,
    }).allowed,
    'Wholesaler was allowed to message unsubscribed pharmacy'
  );

  assert(
    'Messaging Helpers',
    'buildScopedConversationId is deterministic regardless of participant order',
    buildScopedConversationId('uid_b', 'uid_a', 'pharmacy_customer') ===
      buildScopedConversationId('uid_a', 'uid_b', 'pharmacy_customer'),
    'Conversation ID order mismatch'
  );

  const radPatOk = canCommunicateWithPeer({
    senderRole: 'radiology_center',
    senderUid: 'rad1',
    targetRole: 'patient',
    targetUid: 'pat1',
    hasVerifiedRelationship: true,
  });
  const radPatDenied = canCommunicateWithPeer({
    senderRole: 'radiology_center',
    senderUid: 'rad1',
    targetRole: 'patient',
    targetUid: 'pat_stranger',
    hasVerifiedRelationship: false,
  });

  assert(
    'Messaging Permissions',
    'Radiology center <-> Patient messaging enforces verified relationship and assigns radiology_patient',
    radPatOk.allowed && radPatOk.relationshipType === 'radiology_patient' && !radPatDenied.allowed,
    'Radiology center <-> Patient messaging failed verification'
  );

  assert(
    'Messaging Categories',
    'Categorized messenger exposes strict authorized peer categories per role',
    getAuthorizedCategoriesForRole('patient').every((c) => c.role !== 'wholesaler' && c.role !== 'patient') &&
      getAuthorizedCategoriesForRole('wholesaler').every((c) => c.role === 'pharmacy' || c.role === 'super_admin') &&
      getAuthorizedCategoriesForRole('pharmacy').some((c) => c.role === 'wholesaler') &&
      getAuthorizedCategoriesForRole('radiology_center').some((c) => c.role === 'patient') &&
      getAuthorizedCategoriesForRole('super_admin').length === 6,
    'Categorized messaging role mapping failed'
  );

  assert(
    'Messaging Helpers',
    'roleToPortalId, getConversationParticipantIds, and getUnreadCountForUser handle unified & legacy schemas',
    roleToPortalId('radiology_center') === 'radiology' &&
      getConversationParticipantIds({ doctorId: 'd1', patientId: 'p1' }).length === 2 &&
      getUnreadCountForUser({ id: 'c1', doctorId: 'd1', patientId: 'p1', unreadByPatient: 3 } as any, 'p1', 'patient') === 3,
    'Messaging helper failed on schema normalization'
  );

  // ==============================================================
  // 2. PATIENT PRINTING AUTHORIZATION & OWNERSHIP
  // ==============================================================
  const sampleRx = {
    doctorId: 'doc_1',
    patientId: 'pat_1',
    targetPharmacyId: 'pharm_1',
    dispensedPharmacyId: 'pharm_2',
  };

  assert(
    'Printing Ownership',
    'PrescriptionPdfModal authorization grants owner/doctor/pharmacy/admin and denies unrelated patients/doctors/pharmacies',
    canUserPrintPrescription('pat_1', false, sampleRx) &&
      canUserPrintPrescription('doc_1', false, sampleRx) &&
      canUserPrintPrescription('pharm_1', false, sampleRx) &&
      canUserPrintPrescription('pharm_2', false, sampleRx) &&
      canUserPrintPrescription('any_admin', true, sampleRx) &&
      !canUserPrintPrescription('pat_other', false, sampleRx) &&
      !canUserPrintPrescription('doc_other', false, sampleRx) &&
      !canUserPrintPrescription('pharm_other', false, sampleRx) &&
      !canUserPrintPrescription(null, false, sampleRx),
    'Prescription ownership check leaked access or blocked rightful party'
  );

  assert(
    'Printing Ownership',
    'Lab results, radiology reports, pharmacy orders, personal records, referrals, and health passport restrict access strictly to owners & authorized facilities',
    canUserPrintLabResult('pat_1', false, { patientId: 'pat_1', labId: 'lab_1' }) &&
      !canUserPrintLabResult('pat_2', false, { patientId: 'pat_1', labId: 'lab_1' }) &&
      canUserPrintRadiologyReport('pat_1', false, { patientId: 'pat_1', centerId: 'rad_1' }) &&
      !canUserPrintRadiologyReport('pat_2', false, { patientId: 'pat_1', centerId: 'rad_1' }) &&
      canUserPrintPharmacyOrder('pharm_1', false, { patientId: 'pat_1', pharmacyId: 'pharm_1' }) &&
      canUserPrintPharmacyOrder('pat_1', false, { patientId: 'pat_1', pharmacyId: 'pharm_1' }) &&
      !canUserPrintPharmacyOrder('pharm_2', false, { patientId: 'pat_1', pharmacyId: 'pharm_1' }) &&
      canUserPrintPersonalRecord('pat_1', false, { patientId: 'pat_1' }) &&
      !canUserPrintPersonalRecord('pat_2', false, { patientId: 'pat_1' }) &&
      canUserPrintReferral('pat_1', false, { patientId: 'pat_1', doctorId: 'doc_1', targetLabId: 'lab_1' }) &&
      !canUserPrintReferral('lab_other', false, { patientId: 'pat_1', doctorId: 'doc_1', targetLabId: 'lab_1' }) &&
      canUserPrintHealthPassport('pat_1', false, 'pat_1') &&
      !canUserPrintHealthPassport('pat_2', false, 'pat_1'),
    'Document ownership predicate failed'
  );

  // ==============================================================
  // 3. PAYMENT METHODS (STRICTLY SUPERQI & ZAINCASH ONLY)
  // ==============================================================
  assert(
    'Payment Gateways',
    'Active payment methods list contains strictly ["superqi", "zaincash"]',
    ACTIVE_PAYMENT_GATEWAY_IDS.length === 2 &&
      ACTIVE_PAYMENT_GATEWAY_IDS.includes('superqi') &&
      ACTIVE_PAYMENT_GATEWAY_IDS.includes('zaincash') &&
      SUPPORTED_PAYMENT_GATEWAYS.length === 2 &&
      SUPPORTED_PAYMENT_GATEWAYS.every((g) => g.id === 'superqi' || g.id === 'zaincash'),
    `Unexpected payment methods: ${SUPPORTED_PAYMENT_GATEWAYS.map((g) => g.id).join(', ')}`
  );

  assert(
    'Payment Gateways',
    'isSupportedPaymentGateway accepts superqi & zaincash and rejects qicard, fib, & card',
    isSupportedPaymentGateway('superqi') &&
      isSupportedPaymentGateway('zaincash') &&
      !isSupportedPaymentGateway('qicard') &&
      !isSupportedPaymentGateway('fib') &&
      !isSupportedPaymentGateway('card'),
    'Rejected or accepted wrong payment method ID'
  );

  const serverSrc = fs.readFileSync(path.resolve(process.cwd(), 'server.ts'), 'utf8');
  assert(
    'Payment Gateways',
    'Backend server.ts enables only superqi and zaincash with server-side Super Admin payment verification',
    serverSrc.includes("new Set(['superqi', 'zaincash'])") &&
      serverSrc.includes('/api/admin/payments/verify-approval') &&
      serverSrc.includes('/api/admin/payments/verify-rejection') &&
      serverSrc.includes('/api/admin/payments/verify-settings') &&
      !serverSrc.includes("id: 'qicard'") &&
      !serverSrc.includes("id: 'fib'") &&
      !serverSrc.includes("id: 'card'"),
    'server.ts still contains legacy gateway definitions or lacks SuperQi/ZainCash verification endpoints'
  );

  // ==============================================================
  // 4. FIRESTORE & STORAGE SECURITY RULES VERIFICATION
  // ==============================================================
  const firestoreRules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const storageRules = fs.readFileSync(path.resolve(process.cwd(), 'storage.rules'), 'utf8');

  assert(
    'Security Rules',
    'firestore.rules enforces deleted_accounts, scoped conversations, admin-only subscriptions, and hardened payment_requests',
    firestoreRules.includes('match /deleted_accounts/{uid}') &&
      firestoreRules.includes('match /conversations/{convId}') &&
      firestoreRules.includes('isConversationParticipantData(resource.data)') &&
      firestoreRules.includes('match /subscriptions/{subscriptionId}') &&
      firestoreRules.includes('allow create, update, delete: if isAdmin();') &&
      firestoreRules.includes('match /payment_requests/{requestId}') &&
      firestoreRules.includes('match /payment_settings/{settingId}') &&
      firestoreRules.includes('match /subscription_transactions/{txId}'),
    'firestore.rules missing hardened rules for payment_requests, payment_settings, or admin-only subscriptions'
  );

  assert(
    'Security Rules',
    'storage.rules enforces conversation participant lookup, DICOM validation, and 5 MB image-only payment_receipts',
    storageRules.includes('match /chat_attachments/{conversationId}/{fileName}') &&
      storageRules.includes('isConversationParticipant(conversationId)') &&
      storageRules.includes('application/dicom') &&
      storageRules.includes('100 * 1024 * 1024') &&
      storageRules.includes('match /payment_receipts/{userId}/{requestId}/{fileName}') &&
      storageRules.includes('5 * 1024 * 1024'),
    'storage.rules missing chat participant guard, DICOM validation, or payment_receipts guard'
  );

  // ==============================================================
  // 5. DATA CLEANUP, PORTAL MESSAGING MOUNT & WAREHOUSE/PHARMACY INTEGRITY
  // ==============================================================
  const patientSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/PatientPortalWorkspace.tsx'), 'utf8');
  const pharmacySrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/PharmacyPortalWorkspace.tsx'), 'utf8');
  const wholesalerSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/WholesalerPortalWorkspace.tsx'), 'utf8');
  const labSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/LaboratoryPortalWorkspace.tsx'), 'utf8');
  const radSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/RadiologyPortalWorkspace.tsx'), 'utf8');
  const doctorSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/DoctorPortalWorkspace.tsx'), 'utf8');
  const adminSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SuperAdminPortalWorkspace.tsx'), 'utf8');

  const secretarySrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/SecretaryPortalWorkspace.tsx'), 'utf8');
  const messagingSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/components/PrivateMessagingWorkspace.tsx'), 'utf8');

  assert(
    'Data Cleanup',
    'Fake/demo catalogs, fake patient Sarah profile, and unguarded demo clinical records removed',
    !patientSrc.includes('FALLBACK_DOCTORS') &&
      !patientSrc.includes('FALLBACK_MEDICINES') &&
      !patientSrc.includes('demo_rx_sara_1') &&
      !patientSrc.includes('demo_lab_ref_sara') &&
      !patientSrc.includes('demo_rad_ref_sara') &&
      !doctorSrc.includes('M737-PAT-SARA96') &&
      !pharmacySrc.includes('صيدلية النور النموذجية') &&
      !wholesalerSrc.includes('IQ-WHOLE-88301') &&
      !labSrc.includes('defaultTests') &&
      !radSrc.includes('defaultServices'),
    'Residual demo/fake seeded constants found in portal workspaces'
  );

  assert(
    'Portal Feature Integrity',
    'Unified PrivateMessagingWorkspace mounted in all 7 operational & governance portals (including Radiology)',
    [patientSrc, pharmacySrc, wholesalerSrc, labSrc, radSrc, doctorSrc, adminSrc].every((src) =>
      src.includes('<PrivateMessagingWorkspace')
    ),
    'One or more of the 7 portals is missing <PrivateMessagingWorkspace'
  );

  assert(
    'Categorized Messaging & Super Admin Oversight',
    'PrivateMessagingWorkspace uses 2-step categories and server-verified Super Admin oversight',
    messagingSrc.includes('getAuthorizedCategoriesForRole') &&
      messagingSrc.includes('/api/admin/verify-oversight') &&
      messagingSrc.includes('/api/admin/audit-message-access') &&
      serverSrc.includes("'/api/admin/verify-oversight'") &&
      serverSrc.includes("'/api/admin/audit-message-access'") &&
      firestoreRules.includes('isSuperAdminEmail()'),
    'Categorized messaging or Super Admin oversight route verification failed'
  );

  assert(
    'Warehouse & Pharmacy Marketplace Integrity',
    'Wholesaler licenseNumber is editable, order rejection supported, and overselling stock check present',
    wholesalerSrc.includes('value={profileForm.licenseNumber}') &&
      wholesalerSrc.includes('setProfileForm({ ...profileForm, licenseNumber: e.target.value })') &&
      wholesalerSrc.includes("'rejected'") &&
      wholesalerSrc.includes('rejectionReason') &&
      pharmacySrc.includes('handleSelectWarehouse') &&
      pharmacySrc.includes('handleAddWholesaleCatalogItemToCart') &&
      firestoreRules.includes("'rejected'"),
    'Warehouse or pharmacy marketplace integrity checks failed'
  );

  assert(
    'Booking Card Contact Actions & Isolated Print',
    'Patient booking cards expose Contact modal and provider portals use triggerIsolatedPrint without modal window.print()',
    patientSrc.includes('مراسلة / تواصل') &&
      patientSrc.includes('tel:') &&
      [pharmacySrc, labSrc, radSrc].every((src) => !src.includes('window.print()') && src.includes('triggerIsolatedPrint')),
    'Contact modal or isolated print migration incomplete'
  );

  assert(
    'Scoped Patient Search & Medical Profile',
    'Provider portals disallow global Medical ID lookup and use Name/Phone scoped search + Age/Phone helpers',
    [doctorSrc, secretarySrc, labSrc, radSrc, pharmacySrc].every(
      (src) => !src.includes('searchPatientProfileAcrossSystem')
    ) &&
      hasValidPhoneNumber('07701234567') &&
      !hasValidPhoneNumber('07XXXXXXXXX') &&
      calculateAgeFromDob('1996-05-01') !== null &&
      searchScopedPatients(
        collectScopedPatients([
          { patientId: 'p1', patientName: 'علي حسين محمد', patientPhone: '07701234567' },
          { patientId: 'p2', patientName: 'زينب كاظم', patientPhone: '07809998877' },
        ]),
        'علي حسين',
        '07701234567'
      ).length === 1,
    'Scoped patient search or global Medical ID removal check failed'
  );

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return {
    total: results.length,
    passed,
    failed,
    results,
  };
}

const summary = runSecurityAndMessagingVerificationTests();
console.log(`\n================ SECURITY, MESSAGING, PRINTING & GATEWAY TEST SUMMARY ================`);
console.log(`Total: ${summary.total} | Passed: ${summary.passed} | Failed: ${summary.failed}`);
summary.results.forEach((r, idx) => {
  console.log(`  [${r.passed ? 'PASS' : 'FAIL'}] #${idx + 1} (${r.suite}) ${r.name}`);
  if (!r.passed && r.message) {
    console.error(`         Error: ${r.message}`);
  }
});
console.log(`=======================================================================================\n`);
if (summary.failed > 0) {
  process.exit(1);
}
