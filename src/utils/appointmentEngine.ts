/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ConfirmationMode, AppointmentStatus, Appointment } from '../types';

export interface ProviderScheduleConfig {
  workingDays?: string[];
  openingHour?: string; // HH:MM in 24h format, e.g. '09:00' or '16:00'
  closingHour?: string; // HH:MM in 24h format, e.g. '13:00' or '21:00'
  breakStart?: string;  // HH:MM, e.g. '12:00'
  breakEnd?: string;    // HH:MM, e.g. '13:00'
  slotDurationMinutes?: number; // 15, 20, 30, 45, 60 (default 30)
  maxDailyCapacity?: number;    // Maximum allowed active appointments per day
  closedDates?: string[];       // ['YYYY-MM-DD']
  confirmationMode?: ConfirmationMode; // 'manual' | 'automatic'
}

export interface GeneratedTimeSlot {
  slot: string; // e.g. '09:00 AM - 09:30 AM'
  startTime24: string; // '09:00'
  endTime24: string;   // '09:30'
  isAvailable: boolean;
  unavailableReason?: string;
}

export interface SlotGenerationResult {
  date: string;
  isWorkingDay: boolean;
  isClosedDate: boolean;
  isAtCapacity: boolean;
  currentBookedCount: number;
  maxDailyCapacity: number;
  slots: GeneratedTimeSlot[];
  availableSlotsCount: number;
  error?: string;
}

/**
 * Standard Day of week names mapping for Arabic and English match
 */
const DAY_INDEX_MAP: Record<number, string[]> = {
  0: ['الأحد', 'الأحد (Sun)', 'Sun', 'Sunday'],
  1: ['الإثنين', 'الإثنين (Mon)', 'Mon', 'Monday'],
  2: ['الثلاثاء', 'الثلاثاء (Tue)', 'Tue', 'Tuesday'],
  3: ['الأربعاء', 'الأربعاء (Wed)', 'Wed', 'Wednesday'],
  4: ['الخميس', 'الخميس (Thu)', 'Thu', 'Thursday'],
  5: ['الجمعة', 'الجمعة (Fri)', 'Fri', 'Friday'],
  6: ['السبت', 'السبت (Sat)', 'Sat', 'Saturday'],
};

/**
 * Helper to parse time string like '09:00', '9:00', '16:30' or '4:00 PM' to total minutes from midnight
 */
export function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const clean = timeStr.trim();
  const isPM = /pm/i.test(clean);
  const isAM = /am/i.test(clean);
  const parts = clean.replace(/[^\d:]/g, '').split(':');
  let hours = parseInt(parts[0], 10) || 0;
  const minutes = parseInt(parts[1], 10) || 0;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * Format total minutes from midnight to readable 12h format: e.g. 570 -> '09:30 AM'
 */
export function minutesToFormattedTime(totalMinutes: number): string {
  const norm = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  let hours24 = Math.floor(norm / 60);
  const minutes = norm % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  let hours12 = hours24 % 12;
  if (hours12 === 0) hours12 = 12;
  const hh = hours12.toString().padStart(2, '0');
  const mm = minutes.toString().padStart(2, '0');
  return `${hh}:${mm} ${period}`;
}

/**
 * Format minutes to 24-hour HH:MM
 */
export function minutesTo24H(totalMinutes: number): string {
  const norm = ((totalMinutes % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hours = Math.floor(norm / 60).toString().padStart(2, '0');
  const minutes = (norm % 60).toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Check if a date string 'YYYY-MM-DD' falls on a provider's configured working day
 */
export function isProviderWorkingOnDate(dateStr: string, workingDays?: string[]): boolean {
  if (!workingDays || workingDays.length === 0) return true;
  // Parse date without timezone offset issues
  const [year, month, day] = dateStr.split('-').map(Number);
  const dateObj = new Date(year, month - 1, day);
  const dayIndex = dateObj.getDay();
  const dayLabels = DAY_INDEX_MAP[dayIndex] || [];

  return workingDays.some((configuredDay) => {
    return dayLabels.some(
      (lbl) =>
        configuredDay.toLowerCase().includes(lbl.toLowerCase()) ||
        lbl.toLowerCase().includes(configuredDay.toLowerCase())
    );
  });
}

/**
 * Check if a slot range [slotStart, slotEnd] intersects with a break [breakStart, breakEnd]
 */
export function isSlotDuringBreak(
  slotStartMin: number,
  slotEndMin: number,
  breakStartMin: number,
  breakEndMin: number
): boolean {
  if (breakStartMin <= 0 || breakEndMin <= 0 || breakEndMin <= breakStartMin) {
    return false;
  }
  return slotStartMin < breakEndMin && slotEndMin > breakStartMin;
}

/**
 * Generates all dynamic appointment slots for a given provider on a specific date,
 * checking break intervals, working hours, closed dates, and already booked appointments.
 */
export function generateDynamicSlots(
  config: ProviderScheduleConfig,
  targetDate: string,
  existingAppointments: Array<{ timeSlot: string; status: AppointmentStatus }> = []
): SlotGenerationResult {
  const maxCapacity = config.maxDailyCapacity && config.maxDailyCapacity > 0 ? config.maxDailyCapacity : 30;
  const duration = config.slotDurationMinutes && config.slotDurationMinutes > 0 ? config.slotDurationMinutes : 30;

  // 1. Check closed dates / holidays
  const isClosedDate = Boolean(config.closedDates && config.closedDates.includes(targetDate));
  if (isClosedDate) {
    return {
      date: targetDate,
      isWorkingDay: false,
      isClosedDate: true,
      isAtCapacity: false,
      currentBookedCount: 0,
      maxDailyCapacity: maxCapacity,
      slots: [],
      availableSlotsCount: 0,
      error: 'العيادة أو المركز مغلق في هذا التاريخ (عطلة أو تاريخ غير متاح)',
    };
  }

  // 2. Check day of week
  const isWorkingDay = isProviderWorkingOnDate(targetDate, config.workingDays);
  if (!isWorkingDay) {
    return {
      date: targetDate,
      isWorkingDay: false,
      isClosedDate: false,
      isAtCapacity: false,
      currentBookedCount: 0,
      maxDailyCapacity: maxCapacity,
      slots: [],
      availableSlotsCount: 0,
      error: 'هذا اليوم خارج أيام الدوام المعتمدة للعيادة / المركز',
    };
  }

  // 3. Count active appointments on this date
  const activeBookings = existingAppointments.filter((a) => a.status !== 'cancelled');
  const isAtCapacity = activeBookings.length >= maxCapacity;

  // 4. Resolve opening and closing minutes
  // Default window if unconfigured: 09:00 AM (540m) to 01:00 PM (780m) & 04:00 PM (960m) to 08:30 PM (1230m)
  let startMinutes = config.openingHour ? timeStringToMinutes(config.openingHour) : 9 * 60;
  let endMinutes = config.closingHour ? timeStringToMinutes(config.closingHour) : 13 * 60;

  // If closing <= opening (e.g. overnight or unset), fallback to standard 8h window
  if (endMinutes <= startMinutes) {
    endMinutes = startMinutes + 6 * 60;
  }

  const breakStartMin = config.breakStart ? timeStringToMinutes(config.breakStart) : 0;
  const breakEndMin = config.breakEnd ? timeStringToMinutes(config.breakEnd) : 0;

  // Set of occupied timeSlot strings (normalized)
  const occupiedSlots = new Set(
    activeBookings.map((a) => a.timeSlot.trim().toLowerCase())
  );

  const slots: GeneratedTimeSlot[] = [];
  let availableSlotsCount = 0;

  for (let currentMin = startMinutes; currentMin + duration <= endMinutes; currentMin += duration) {
    const slotEndMin = currentMin + duration;
    const formattedStart = minutesToFormattedTime(currentMin);
    const formattedEnd = minutesToFormattedTime(slotEndMin);
    const slotLabel = `${formattedStart} - ${formattedEnd}`;

    // Check if slot falls in break
    const inBreak = isSlotDuringBreak(currentMin, slotEndMin, breakStartMin, breakEndMin);
    if (inBreak) {
      continue; // Breaks are not offered as slots
    }

    // Check if slot is occupied
    const isOccupied = occupiedSlots.has(slotLabel.toLowerCase());
    const isAvailable = !isAtCapacity && !isOccupied;

    let unavailableReason: string | undefined;
    if (isAtCapacity) {
      unavailableReason = 'تم بلوغ الحد الأقصى للطاقة الاستيعابية لهذا اليوم';
    } else if (isOccupied) {
      unavailableReason = 'الموعد محجوز مسبقاً (Double Booking Prevented)';
    }

    if (isAvailable) {
      availableSlotsCount++;
    }

    slots.push({
      slot: slotLabel,
      startTime24: minutesTo24H(currentMin),
      endTime24: minutesTo24H(slotEndMin),
      isAvailable,
      unavailableReason,
    });
  }

  return {
    date: targetDate,
    isWorkingDay: true,
    isClosedDate: false,
    isAtCapacity,
    currentBookedCount: activeBookings.length,
    maxDailyCapacity: maxCapacity,
    slots,
    availableSlotsCount,
  };
}

/**
 * Validates an appointment booking request against all strict healthcare booking rules:
 * - Prevents double booking on the same time slot
 * - Prevents duplicate booking by the same patient for the same provider on the same date
 * - Prevents booking outside working hours
 * - Prevents booking during break periods
 * - Prevents booking on closed dates or non-working days
 * - Enforces daily capacity limits
 * - Determines resulting status based on provider's confirmationMode ('manual' -> 'pending', 'automatic' -> 'confirmed')
 */
export function validateAppointmentBooking(params: {
  providerConfig: ProviderScheduleConfig;
  targetDate: string;
  timeSlot: string;
  patientId: string;
  providerId: string;
  existingAppointments: Appointment[];
}): {
  isValid: boolean;
  status: AppointmentStatus;
  error?: string;
  alternatives?: string[];
} {
  const { providerConfig, targetDate, timeSlot, patientId, providerId, existingAppointments } = params;

  // 1. Closed date check
  if (providerConfig.closedDates && providerConfig.closedDates.includes(targetDate)) {
    return {
      isValid: false,
      status: 'cancelled',
      error: 'العيادة / المركز في عطلة أو مغلق في هذا التاريخ.',
    };
  }

  // 2. Working day check
  if (!isProviderWorkingOnDate(targetDate, providerConfig.workingDays)) {
    return {
      isValid: false,
      status: 'cancelled',
      error: 'التاريخ المحدد خارج أيام الدوام المعتمدة للعيادة.',
    };
  }

  // 3. Duplicate booking prevention: Patient already has an active booking with this provider on this date
  const patientExistingBooking = existingAppointments.find(
    (a) =>
      a.patientId === patientId &&
      a.doctorId === providerId &&
      a.date === targetDate &&
      a.status !== 'cancelled'
  );

  if (patientExistingBooking) {
    return {
      isValid: false,
      status: 'cancelled',
      error: `لديك موعد مسجل مسبقاً لدى العيادة في نفس هذا اليوم (${patientExistingBooking.timeSlot}). لا يمكن تكرار الحجز لنفس اليوم.`,
    };
  }

  // 4. Double booking prevention: Time slot already taken by another patient
  const normalizedSlot = timeSlot.trim().toLowerCase();
  const conflictingSlotBooking = existingAppointments.find(
    (a) =>
      a.doctorId === providerId &&
      a.date === targetDate &&
      a.timeSlot.trim().toLowerCase() === normalizedSlot &&
      a.status !== 'cancelled'
  );

  // Generate dynamic slots to find alternatives and check capacity
  const slotGen = generateDynamicSlots(providerConfig, targetDate, existingAppointments);

  if (slotGen.isAtCapacity) {
    return {
      isValid: false,
      status: 'cancelled',
      error: `اكتملت الطاقة الاستيعابية اليومية للعيادة (${slotGen.maxDailyCapacity} مريضاً). يرجى اختيار تاريخ آخر.`,
      alternatives: [],
    };
  }

  if (conflictingSlotBooking) {
    const availableAlternatives = slotGen.slots.filter((s) => s.isAvailable).map((s) => s.slot);
    return {
      isValid: false,
      status: 'cancelled',
      error: 'الفترة الزمنية المختارة محجوزة مسبقاً من قبل مراجع آخر.',
      alternatives: availableAlternatives.slice(0, 4),
    };
  }

  // 5. Break intersection check
  const [slotStartStr, slotEndStr] = timeSlot.split('-').map((s) => s.trim());
  if (slotStartStr && slotEndStr) {
    const startMin = timeStringToMinutes(slotStartStr);
    const endMin = timeStringToMinutes(slotEndStr);
    const breakStart = providerConfig.breakStart ? timeStringToMinutes(providerConfig.breakStart) : 0;
    const breakEnd = providerConfig.breakEnd ? timeStringToMinutes(providerConfig.breakEnd) : 0;

    if (isSlotDuringBreak(startMin, endMin, breakStart, breakEnd)) {
      return {
        isValid: false,
        status: 'cancelled',
        error: 'الفترة المختارة تقع ضمن استراحة العيادة الرسمية.',
      };
    }
  }

  // 6. Confirmation mode check: 'automatic' confirms instantly; 'manual' marks as 'pending'
  const finalStatus: AppointmentStatus =
    providerConfig.confirmationMode === 'automatic' ? 'confirmed' : 'pending';

  return {
    isValid: true,
    status: finalStatus,
  };
}
