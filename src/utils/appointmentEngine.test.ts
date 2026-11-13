/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  generateDynamicSlots,
  validateAppointmentBooking,
  isProviderWorkingOnDate,
  isSlotDuringBreak,
  timeStringToMinutes,
  minutesToFormattedTime,
  ProviderScheduleConfig,
} from './appointmentEngine';
import { Appointment } from '../types';

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

console.log('================ APPOINTMENT ENGINE TEST SUITE ================');

// 1. Time string conversion
assert(timeStringToMinutes('09:00 AM') === 540, 'Parses 09:00 AM to 540 minutes');
assert(timeStringToMinutes('01:30 PM') === 810, 'Parses 01:30 PM to 810 minutes');
assert(timeStringToMinutes('12:00 PM') === 720, 'Parses 12:00 PM (noon) to 720 minutes');
assert(timeStringToMinutes('12:00 AM') === 0, 'Parses 12:00 AM (midnight) to 0 minutes');
assert(minutesToFormattedTime(540) === '09:00 AM', 'Formats 540 minutes to 09:00 AM');
assert(minutesToFormattedTime(810) === '01:30 PM', 'Formats 810 minutes to 01:30 PM');

// 2. Working days detection
const sampleWorkingDays = ['الأحد (Sun)', 'الثلاثاء (Tue)', 'الخميس (Thu)'];
// 2026-11-15 is Sunday (day 0)
assert(isProviderWorkingOnDate('2026-11-15', sampleWorkingDays) === true, 'Sunday is recognized as working day');
// 2026-11-16 is Monday (day 1)
assert(isProviderWorkingOnDate('2026-11-16', sampleWorkingDays) === false, 'Monday is recognized as non-working day');

// 3. Break time collision detection
// Break: 12:00 (720m) to 13:00 (780m)
assert(isSlotDuringBreak(700, 730, 720, 780) === true, 'Slot 11:40 - 12:10 overlaps break start');
assert(isSlotDuringBreak(750, 770, 720, 780) === true, 'Slot completely inside break is rejected');
assert(isSlotDuringBreak(660, 690, 720, 780) === false, 'Morning slot 11:00 - 11:30 does not overlap break');
assert(isSlotDuringBreak(780, 810, 720, 780) === false, 'Afternoon slot starting exactly at break end is accepted');

// 4. Dynamic slot generation with break
const sampleConfig: ProviderScheduleConfig = {
  workingDays: ['الأحد (Sun)', 'الإثنين (Mon)', 'الثلاثاء (Tue)', 'الأربعاء (Wed)', 'الخميس (Thu)'],
  openingHour: '09:00',
  closingHour: '12:00',
  breakStart: '10:30',
  breakEnd: '11:00',
  slotDurationMinutes: 30,
  maxDailyCapacity: 5,
  closedDates: ['2026-11-20'],
  confirmationMode: 'manual',
};

const result = generateDynamicSlots(sampleConfig, '2026-11-15');
assert(result.isWorkingDay === true, 'Target date is identified as working day');
assert(result.isClosedDate === false, 'Target date is not a closed holiday');
// Slots: 09:00-09:30, 09:30-10:00, 10:00-10:30, (10:30-11:00 break omitted), 11:00-11:30, 11:30-12:00
assert(result.slots.length === 5, `Generated exactly 5 non-break slots, got ${result.slots.length}`);
assert(result.slots.every((s) => !s.slot.includes('10:30 AM - 11:00 AM')), 'Break slot 10:30-11:00 is excluded');

// 5. Closed date enforcement
const closedResult = generateDynamicSlots(sampleConfig, '2026-11-20');
assert(closedResult.isClosedDate === true, 'Configured holiday is flagged as closed');
assert(closedResult.slots.length === 0, 'No slots generated on closed date');

// 6. Double booking prevention
const existingAppts: Appointment[] = [
  {
    id: 'apt_1',
    doctorId: 'doc_1',
    patientId: 'pat_1',
    patientName: 'أحمد علي',
    patientPhone: '07700000000',
    doctorName: 'د. سامر',
    specialty: 'باطنية',
    date: '2026-11-15',
    timeSlot: '09:00 AM - 09:30 AM',
    status: 'confirmed',
    createdAt: '2026-11-12T00:00:00Z',
    updatedAt: '2026-11-12T00:00:00Z',
  },
];

const validationDouble = validateAppointmentBooking({
  providerConfig: sampleConfig,
  targetDate: '2026-11-15',
  timeSlot: '09:00 AM - 09:30 AM',
  patientId: 'pat_2', // Different patient trying to book already taken slot
  providerId: 'doc_1',
  existingAppointments: existingAppts,
});

assert(validationDouble.isValid === false, 'Double booking of same time slot is rejected');
assert(validationDouble.alternatives !== undefined && validationDouble.alternatives.length > 0, 'Alternatives provided when slot is full');

// 7. Duplicate booking prevention (same patient booking twice on same date)
const validationDup = validateAppointmentBooking({
  providerConfig: sampleConfig,
  targetDate: '2026-11-15',
  timeSlot: '09:30 AM - 10:00 AM',
  patientId: 'pat_1', // Same patient who already has a booking on 2026-11-15
  providerId: 'doc_1',
  existingAppointments: existingAppts,
});

assert(validationDup.isValid === false, 'Duplicate booking by same patient on same date is rejected');
assert(validationDup.error!.includes('موعد مسجل مسبقاً'), 'Correct duplicate error message returned');

// 8. Manual confirmation mode: booking becomes 'pending'
const validManual = validateAppointmentBooking({
  providerConfig: sampleConfig,
  targetDate: '2026-11-15',
  timeSlot: '09:30 AM - 10:00 AM',
  patientId: 'pat_3',
  providerId: 'doc_1',
  existingAppointments: existingAppts,
});

assert(validManual.isValid === true, 'Valid booking is accepted');
assert(validManual.status === 'pending', 'Manual confirmation mode results in pending status');

// 9. Automatic confirmation mode: booking becomes 'confirmed' instantly
const autoConfig: ProviderScheduleConfig = {
  ...sampleConfig,
  confirmationMode: 'automatic',
};

const validAuto = validateAppointmentBooking({
  providerConfig: autoConfig,
  targetDate: '2026-11-15',
  timeSlot: '09:30 AM - 10:00 AM',
  patientId: 'pat_3',
  providerId: 'doc_1',
  existingAppointments: existingAppts,
});

assert(validAuto.isValid === true, 'Auto confirmation booking is accepted');
assert(validAuto.status === 'confirmed', 'Automatic confirmation mode results in confirmed status');

// 10. Daily capacity limit enforcement
const maxedAppts: Appointment[] = [1, 2, 3, 4, 5].map((i) => ({
  id: `apt_${i}`,
  doctorId: 'doc_1',
  patientId: `pat_user_${i}`,
  patientName: `مريض ${i}`,
  patientPhone: '07700000000',
  doctorName: 'د. سامر',
  specialty: 'باطنية',
  date: '2026-11-15',
  timeSlot: `slot_${i}`,
  status: 'confirmed',
  createdAt: '2026-11-12T00:00:00Z',
  updatedAt: '2026-11-12T00:00:00Z',
}));

const capResult = generateDynamicSlots(sampleConfig, '2026-11-15', maxedAppts);
assert(capResult.isAtCapacity === true, 'Daily capacity reached is flagged');
assert(capResult.availableSlotsCount === 0, 'No slots available when capacity reached');

const capValidation = validateAppointmentBooking({
  providerConfig: sampleConfig,
  targetDate: '2026-11-15',
  timeSlot: '09:30 AM - 10:00 AM',
  patientId: 'pat_new',
  providerId: 'doc_1',
  existingAppointments: maxedAppts,
});

assert(capValidation.isValid === false, 'Booking attempt over daily capacity is rejected');

// 11. Concurrent reservation simulation
// Simulate 10 simultaneous patients trying to race for the last remaining slot
const singleSlotConfig: ProviderScheduleConfig = {
  workingDays: ['الأحد (Sun)'],
  openingHour: '10:00',
  closingHour: '10:30',
  slotDurationMinutes: 30,
  maxDailyCapacity: 1,
};

let successfulReservations = 0;
const reservationLog: Appointment[] = [];

for (let i = 0; i < 10; i++) {
  const attempt = validateAppointmentBooking({
    providerConfig: singleSlotConfig,
    targetDate: '2026-11-15',
    timeSlot: '10:00 AM - 10:30 AM',
    patientId: `race_pat_${i}`,
    providerId: 'doc_race',
    existingAppointments: reservationLog,
  });

  if (attempt.isValid) {
    successfulReservations++;
    reservationLog.push({
      id: `race_apt_${i}`,
      doctorId: 'doc_race',
      patientId: `race_pat_${i}`,
      patientName: `Patient ${i}`,
      patientPhone: '07700000000',
      doctorName: 'د. Race',
      specialty: 'طوارئ',
      date: '2026-11-15',
      timeSlot: '10:00 AM - 10:30 AM',
      status: attempt.status,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
}

assert(successfulReservations === 1, `Exactly 1 winner in 10-patient race condition, got ${successfulReservations}`);
assert(reservationLog.length === 1, 'Strict single active appointment recorded');

console.log(`================ TEST RESULT: ${passedTests}/${totalTests} PASSED ================`);
if (failedTests > 0) {
  process.exit(1);
}
