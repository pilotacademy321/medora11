/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  MAIN_SUPPORT_NUMBER,
  MAIN_SUPPORT_URL,
  PATIENT_WOMEN_SUPPORT_NUMBER,
  PATIENT_WOMEN_SUPPORT_URL,
  MAIN_SUPPORT_TITLE_AR,
  MAIN_SUPPORT_BUTTON_AR,
  PATIENT_WOMEN_SUPPORT_TITLE_AR,
  WOMENS_SUPPORT_BUTTON_AR,
  DEFAULT_MAIN_SUPPORT_MESSAGE,
  DEFAULT_PATIENT_SUPPORT_MESSAGE,
  DEFAULT_WOMENS_SUPPORT_MESSAGE,
  DIRECT_MAIN_SUPPORT_WHATSAPP_HREF,
  DIRECT_PATIENT_SUPPORT_WHATSAPP_HREF,
  DIRECT_WOMENS_SUPPORT_WHATSAPP_HREF,
  resolveSupportChannel,
  mapUserRoleToAccountType,
  mapAccountTypeToDefaultCategory,
  buildMainSupportMessage,
  buildPatientSupportMessage,
  buildWomensSupportMessage,
  buildWhatsAppSupportHref,
  detectSensitiveSupportInput,
  OFFICIAL_SUPPORT_EMAIL,
  buildPhoneCallHref,
  canViewFemaleSupport,
  getVisibleSupportContacts,
} from './supportRouting';

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

function runTests() {
  console.log('================ DUAL WHATSAPP SUPPORT SYSTEM TEST SUITE ================');

  // 1. Exact phone numbers, URLs, and Arabic titles/buttons
  assert(MAIN_SUPPORT_NUMBER === '9647885663748', 'Main support number is 9647885663748');
  assert(MAIN_SUPPORT_URL === 'https://wa.me/9647885663748', 'Main support URL matches https://wa.me/9647885663748');
  assert(PATIENT_WOMEN_SUPPORT_NUMBER === '9647752564326', 'Patient & Women support number is 9647752564326');
  assert(PATIENT_WOMEN_SUPPORT_URL === 'https://wa.me/9647752564326', 'Patient & Women URL matches https://wa.me/9647752564326');
  assert(MAIN_SUPPORT_TITLE_AR === 'الدعم الرئيسي والاشتراكات', 'Main support Arabic title matches');
  assert(MAIN_SUPPORT_BUTTON_AR === 'تواصل مع الدعم الرئيسي', 'Main support Arabic button matches');
  assert(PATIENT_WOMEN_SUPPORT_TITLE_AR === 'دعم المرضى والمساعدة النسائية', 'Patient & Women support Arabic title matches');
  assert(WOMENS_SUPPORT_BUTTON_AR === 'تواصلي مع الدعم النسائي', 'Women support Arabic button matches');

  // 2. Smart Support Routing rules
  const docRoute = resolveSupportChannel('doctor_institution');
  assert(
    docRoute.channel === 'main' && docRoute.phoneNumber === MAIN_SUPPORT_NUMBER,
    'Doctors and medical institutions route to Main Support (9647885663748)'
  );

  const subRoute = resolveSupportChannel('subscription_payment');
  assert(
    subRoute.channel === 'main' && subRoute.phoneNumber === MAIN_SUPPORT_NUMBER,
    'Subscriptions and payment inquiries route to Main Support (9647885663748)'
  );

  const adminRoute = resolveSupportChannel('general_admin');
  assert(
    adminRoute.channel === 'main' && adminRoute.phoneNumber === MAIN_SUPPORT_NUMBER,
    'General admin inquiries route to Main Support (9647885663748)'
  );

  const patientRoute = resolveSupportChannel('patient_assistance');
  assert(
    patientRoute.channel === 'patient' && patientRoute.phoneNumber === PATIENT_WOMEN_SUPPORT_NUMBER,
    'Patients route to Patient Support (9647752564326)'
  );

  const womensRoute = resolveSupportChannel('womens_support');
  assert(
    womensRoute.channel === 'womens' &&
      womensRoute.phoneNumber === PATIENT_WOMEN_SUPPORT_NUMBER &&
      womensRoute.buttonLabelAr === WOMENS_SUPPORT_BUTTON_AR,
    'Women requesting dedicated assistance route to Women Support (9647752564326)'
  );

  // 3. Account role mapping
  assert(mapUserRoleToAccountType('radiology_center') === 'radiology_center', 'Maps radiology_center role cleanly');
  assert(mapAccountTypeToDefaultCategory('laboratory') === 'doctor_institution', 'Lab role suggests doctor_institution');
  assert(mapAccountTypeToDefaultCategory('pharmacy') === 'doctor_institution', 'Pharmacy role suggests doctor_institution');
  assert(mapAccountTypeToDefaultCategory('wholesaler') === 'doctor_institution', 'Wholesaler role suggests doctor_institution');
  assert(mapAccountTypeToDefaultCategory('patient') === 'patient_assistance', 'Patient role suggests patient_assistance');

  // 4. Exact Prefilled Arabic Messages when empty
  assert(
    buildMainSupportMessage() === DEFAULT_MAIN_SUPPORT_MESSAGE &&
      DEFAULT_MAIN_SUPPORT_MESSAGE ===
        'السلام عليكم، أتواصل مع الدعم الرئيسي لمنصة MEDORA. نوع الحساب أو المؤسسة: [اكتب هنا]. نوع المشكلة أو الاستفسار: [اكتب هنا]. شرح الحالة بالتفصيل: [اكتب هنا].',
    'Default Main Support Arabic prefilled message matches exact specification'
  );

  assert(
    buildPatientSupportMessage() === DEFAULT_PATIENT_SUPPORT_MESSAGE &&
      DEFAULT_PATIENT_SUPPORT_MESSAGE ===
        'السلام عليكم، أحتاج مساعدة من دعم المرضى في منصة MEDORA. نوع المشكلة: [اكتب هنا]. شرح الحالة بالتفصيل: [اكتب هنا].',
    'Default Patient Support Arabic prefilled message matches exact specification'
  );

  assert(
    buildWomensSupportMessage() === DEFAULT_WOMENS_SUPPORT_MESSAGE &&
      DEFAULT_WOMENS_SUPPORT_MESSAGE ===
        'السلام عليكم، أحتاج مساعدة من قسم الدعم النسائي في منصة MEDORA. أود شرح حالتي أو استفساري بالتفصيل والحصول على المساعدة المناسبة.',
    'Default Women Support Arabic prefilled message matches exact specification'
  );

  // 5. Detailed Support Request message population & URL encoding safety
  const customMainHref = buildWhatsAppSupportHref('main', {
    name: 'د. سليم العراقي',
    accountType: 'doctor',
    inquiryCategory: 'تجديد أو ترقية الاشتراك',
    description: 'أرغب في ترقية اشتراك العيادة السنوي.',
    referenceNumber: 'M737-DOC-9911',
  });
  assert(
    customMainHref.startsWith('https://wa.me/9647885663748?text='),
    'Custom Main Support href targets exact Main number with ?text= query param'
  );
  const decodedMain = decodeURIComponent(customMainHref.split('?text=')[1]);
  assert(
    decodedMain.includes('طبيب / عيادة') &&
      decodedMain.includes('تجديد أو ترقية الاشتراك') &&
      decodedMain.includes('د. سليم العراقي') &&
      decodedMain.includes('M737-DOC-9911'),
    'Decoded Main Support URL includes populated Name, Account Type, Inquiry, Description, and Reference'
  );

  const customPatientHref = buildWhatsAppSupportHref('patient', {
    name: 'نور الهدى',
    inquiryCategory: 'مشكلة في حجز موعد طبي',
    description: 'لم يصل تأكيد الموعد في البوابة.',
    referenceNumber: 'APT-2026-88',
  });
  assert(
    customPatientHref.startsWith('https://wa.me/9647752564326?text='),
    'Custom Patient Support href targets exact Patient number with ?text= query param'
  );
  const decodedPatient = decodeURIComponent(customPatientHref.split('?text=')[1]);
  assert(
    decodedPatient.includes('نور الهدى') &&
      decodedPatient.includes('مشكلة في حجز موعد طبي') &&
      decodedPatient.includes('APT-2026-88'),
    'Decoded Patient Support URL includes populated details'
  );

  const customWomensHref = buildWhatsAppSupportHref('womens', {
    name: 'مريم',
    description: 'أحتاج مساعدة بخصوص الخصوصية.',
  });
  assert(
    customWomensHref.startsWith('https://wa.me/9647752564326?text='),
    'Custom Women Support href targets exact Patient/Women number'
  );
  const decodedWomens = decodeURIComponent(customWomensHref.split('?text=')[1]);
  assert(
    decodedWomens.startsWith(DEFAULT_WOMENS_SUPPORT_MESSAGE) &&
      decodedWomens.includes('مريم') &&
      decodedWomens.includes('أحتاج مساعدة بخصوص الخصوصية.'),
    'Decoded Women Support URL retains exact opening text and includes custom details'
  );

  assert(
    DIRECT_MAIN_SUPPORT_WHATSAPP_HREF.startsWith('https://wa.me/9647885663748?text=') &&
      DIRECT_PATIENT_SUPPORT_WHATSAPP_HREF.startsWith('https://wa.me/9647752564326?text=') &&
      DIRECT_WOMENS_SUPPORT_WHATSAPP_HREF.startsWith('https://wa.me/9647752564326?text='),
    'Direct WhatsApp prefilled links are properly encoded with encodeURIComponent'
  );

  // 6. Sensitive data guardrail detection
  const cleanCheck = detectSensitiveSupportInput('أواجه مشكلة في تجديد الاشتراك السنوي للعيادة.');
  assert(!cleanCheck.detected, 'Clean support text does not trigger sensitive warning');

  const passwordCheck = detectSensitiveSupportInput('هذا هو password الخاص بحسابي ورمز التحقق OTP 123456');
  assert(
    passwordCheck.detected &&
      passwordCheck.reasons.includes('password') &&
      passwordCheck.reasons.includes('otp'),
    'Detects password and OTP keywords so user is warned before opening WhatsApp'
  );

  const medicalCheck = detectSensitiveSupportInput('أرسلت لكم تحليل الدم وتقرير الأشعة MRI');
  assert(
    medicalCheck.detected && medicalCheck.reasons.includes('medical_record'),
    'Detects medical record keywords so user is guided to authorized Record Sharing'
  );

  // 7. Strict Female Support Privacy Gate & Official Contacts Matrix
  assert(
    OFFICIAL_SUPPORT_EMAIL === 'support@medora-iq.com' &&
      String(OFFICIAL_SUPPORT_EMAIL) !== 'bcgmoc@gmail.com',
    'Official public support email is support@medora-iq.com (not bcgmoc@gmail.com)'
  );
  assert(
    buildPhoneCallHref('07885663748') === 'tel:+9647885663748' &&
      buildPhoneCallHref('07752564326') === 'tel:+9647752564326',
    'Phone call tel: href builders format Iraqi numbers accurately'
  );

  // ONLY authenticated female patient is permitted
  assert(
    canViewFemaleSupport({ isAuthenticated: true, userRole: 'patient', gender: 'female', isAdmin: false }) === true,
    'Female support IS visible to authenticated female patient'
  );

  // Exhaustive deny cases
  assert(
    canViewFemaleSupport({ isAuthenticated: false, userRole: 'patient', gender: 'female', isAdmin: false }) === false,
    'Female support is HIDDEN for unauthenticated visitors'
  );
  assert(
    canViewFemaleSupport(null) === false,
    'Female support is HIDDEN when auth context is null'
  );
  assert(
    canViewFemaleSupport({ isAuthenticated: true, userRole: 'patient', gender: 'male', isAdmin: false }) === false,
    'Female support is HIDDEN for male patient'
  );
  assert(
    canViewFemaleSupport({ isAuthenticated: true, userRole: 'patient', gender: undefined, isAdmin: false }) === false,
    'Female support is HIDDEN for patient without explicit female gender'
  );
  for (const role of [
    'doctor',
    'laboratory',
    'radiology_center',
    'pharmacy',
    'wholesaler',
    'secretary',
    'super_admin',
  ] as const) {
    assert(
      canViewFemaleSupport({ isAuthenticated: true, userRole: role, gender: 'female', isAdmin: role === 'super_admin' }) === false,
      `Female support is HIDDEN for ${role} role even if gender=female`
    );
  }

  const publicContacts = getVisibleSupportContacts({ isAuthenticated: false });
  assert(
    publicContacts.showFemaleSupport === false &&
      publicContacts.femaleContact === null &&
      publicContacts.generalContact.displayPhone === '07885663748' &&
      publicContacts.generalContact.callHref === 'tel:+9647885663748' &&
      publicContacts.email === 'support@medora-iq.com',
    'Public unauthenticated contacts expose general support & public email only without 07752564326'
  );

  const femalePatientContacts = getVisibleSupportContacts({
    isAuthenticated: true,
    userRole: 'patient',
    gender: 'female',
    isAdmin: false,
  });
  assert(
    femalePatientContacts.showFemaleSupport === true &&
      femalePatientContacts.femaleContact?.displayPhone === '07752564326' &&
      femalePatientContacts.femaleContact?.callHref === 'tel:+9647752564326',
    'Female patient contacts expose dedicated 07752564326 WhatsApp and Call channels'
  );

  console.log(`\nSummary: ${passedTests}/${totalTests} passed, ${failedTests} failed.`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
