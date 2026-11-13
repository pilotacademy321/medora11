/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { calculateAge, calculateProfileCompletion, MedicalRecord, PatientProfile } from '../types';
import { sanitizeForFirestore } from '../lib/firebase';
import { verifyDicomMagicBytes } from '../lib/medicalStorage';

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

async function runTests() {
  console.log('================ PATIENT PROFILE & STORAGE VERIFICATION TEST SUITE ================');

  // 1. calculateAge tests
  const today = new Date();
  const twentyYearsAgo = new Date(today.getFullYear() - 20, today.getMonth(), today.getDate());
  const dob20 = twentyYearsAgo.toISOString().split('T')[0];
  assert(calculateAge(dob20) === 20, 'Calculates exact age on birthday');

  const notYetBirthdayYear = today.getFullYear() - 30;
  const futureMonth = (today.getMonth() + 2) % 12;
  const yearAdjust = today.getMonth() + 2 >= 12 ? notYetBirthdayYear + 1 : notYetBirthdayYear;
  const dob29 = `${yearAdjust}-${String(futureMonth + 1).padStart(2, '0')}-15`;
  assert(calculateAge(dob29) === (today.getMonth() + 2 >= 12 ? 29 : 29), 'Handles birthday later in year');

  assert(calculateAge('') === null, 'Returns null for empty DOB');
  assert(calculateAge('invalid-date') === null, 'Returns null for invalid DOB');

  const futureDob = `${today.getFullYear() + 2}-01-01`;
  assert(calculateAge(futureDob) === null, 'Returns null for future DOB');

  // 2. calculateProfileCompletion tests
  assert(calculateProfileCompletion(null) === 0, 'Null profile yields 0% completion');
  assert(calculateProfileCompletion({}) === 0, 'Empty profile yields 0% completion');

  const partialProfile: Partial<PatientProfile> = {
    fullName: 'علي حسن',
    phone: '07701234567',
    governorate: 'بغداد (Baghdad)',
    bloodType: 'Unknown',
  };
  const partialScore = calculateProfileCompletion(partialProfile);
  assert(
    partialScore === 25,
    'Incomplete profile calculates partial completion without requiring Blood Type when Unknown',
    `Expected 25, got ${partialScore}`
  );

  const completeProfile: Partial<PatientProfile> = {
    fullName: 'علي حسن كريم',
    fullNameAr: 'علي حسن كريم',
    fullNameEn: 'Ali Hassan Kareem',
    phone: '07701234567',
    governorate: 'بغداد (Baghdad)',
    cityDistrict: 'الكرادة',
    address: 'شارع 62',
    dateOfBirth: '1992-05-10',
    gender: 'male',
    emergencyContactName: 'حسن كريم',
    emergencyContactPhone: '07801112233',
    bloodType: 'A+',
    allergies: ['Penicillin'],
    chronicDiseases: ['Hypertension'],
    currentMedications: ['Amlodipine 5mg'],
    previousSurgeries: ['Appendectomy'],
    medicalConditions: ['Seasonal Asthma'],
    additionalNotes: 'No recent hospital admissions',
  };
  assert(calculateProfileCompletion(completeProfile) === 100, 'Complete profile reaches 100% completion');

  // 3. sanitizeForFirestore on incomplete PatientProfile & extended MedicalRecord
  const sanitizedProfile = sanitizeForFirestore({
    patientId: 'uid_patient_1',
    fullName: 'مراجع',
    fullNameAr: '',
    fullNameEn: '',
    medicalId: 'M737-IQ-000111',
    phone: '',
    governorate: 'بغداد (Baghdad)',
    address: '',
    emergencyContactName: undefined,
    bloodType: 'Unknown',
    allergies: [],
    chronicDiseases: [],
    createdAt: '2026-11-12T00:00:00Z',
    updatedAt: '2026-11-12T00:00:00Z',
  } as Partial<PatientProfile>);
  assert(!('emergencyContactName' in sanitizedProfile), 'Strips undefined optional fields from incomplete PatientProfile');
  assert(Array.isArray(sanitizedProfile.allergies) && sanitizedProfile.allergies.length === 0, 'Preserves empty arrays on incomplete PatientProfile');

  const sanitizedRecord = sanitizeForFirestore({
    id: 'mrec_1',
    patientId: 'uid_patient_1',
    patientName: 'مراجع',
    doctorId: 'uid_patient_1',
    recordType: 'radiology_report',
    subCategory: 'mri',
    imagingModality: 'mri',
    title: 'Brain MRI',
    details: 'Normal brain scan',
    fileUrl: 'https://storage.googleapis.com/example/mri.dcm',
    fileName: 'scan.dcm',
    mimeType: 'application/dicom',
    isAuthorizedDocument: undefined,
    createdAt: '2026-11-12T00:00:00Z',
    updatedAt: '2026-11-12T00:00:00Z',
  } as MedicalRecord);
  assert(sanitizedRecord.imagingModality === 'mri', 'Preserves imagingModality on MedicalRecord');
  assert(!('isAuthorizedDocument' in sanitizedRecord), 'Strips undefined isAuthorizedDocument on MedicalRecord');

  // 4. verifyDicomMagicBytes ASCII "DICM" check (offset 128..131 = 0x44 0x49 0x43 0x4d)
  const validDicomBytes = new Uint8Array(136);
  validDicomBytes[128] = 0x44; // 'D'
  validDicomBytes[129] = 0x49; // 'I'
  validDicomBytes[130] = 0x43; // 'C'
  validDicomBytes[131] = 0x4d; // 'M'
  const validDicomBlob = new File([validDicomBytes], 'study.dcm', { type: 'application/dicom' });
  assert((await verifyDicomMagicBytes(validDicomBlob)) === true, 'verifyDicomMagicBytes detects valid "DICM" magic bytes');

  const invalidDicomBytes = new Uint8Array(136);
  invalidDicomBytes[128] = 0x44;
  invalidDicomBytes[129] = 0x73; // old bug byte 's' instead of 'I'
  invalidDicomBytes[130] = 0x43;
  invalidDicomBytes[131] = 0x4d;
  const invalidDicomBlob = new File([invalidDicomBytes], 'bad.dcm', { type: 'application/dicom' });
  assert((await verifyDicomMagicBytes(invalidDicomBlob)) === false, 'verifyDicomMagicBytes rejects corrupted magic bytes');

  const tinyBlob = new File([new Uint8Array(64)], 'tiny.dcm', { type: 'application/dicom' });
  assert((await verifyDicomMagicBytes(tinyBlob)) === false, 'verifyDicomMagicBytes rejects files shorter than 132 bytes');

  console.log(`================ TEST RESULT: ${passedTests}/${totalTests} PASSED ================`);
  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
