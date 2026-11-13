/**
 * Institution-Scoped Patient Search Utility (by Full Name & Registered Phone Number ONLY)
 * Replaces legacy global Medical ID search across clinical/facility portals.
 * Never queries global patient_profiles; strictly searches records already linked to the institution.
 */

export interface ScopedPatientRecord {
  patientId: string;
  patientName: string;
  patientPhone?: string;
  sourceLabel?: string;
  gender?: 'male' | 'female';
  dateOfBirth?: string;
  lastInteractionDate?: string;
}

/**
 * Normalizes Arabic & Latin text for forgiving partial name search.
 */
export function normalizeSearchText(input?: string | null): string {
  if (!input) return '';
  return input
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '') // Strip Arabic diacritics
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ');
}

/**
 * Normalizes Iraqi & international phone numbers to trailing digits for clean matching.
 * e.g. "+964 770 123 4567", "009647701234567", "0770-123-4567" -> "7701234567"
 */
export function normalizePhoneDigits(phone?: string | null): string {
  if (!phone) return '';
  // Convert Arabic-Indic digits to ASCII digits first
  const ascii = phone
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
  const digits = ascii.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00964')) return digits.slice(5);
  if (digits.startsWith('964') && digits.length >= 12) return digits.slice(3);
  if (digits.startsWith('0') && digits.length >= 10) return digits.slice(1);
  return digits;
}

/**
 * Returns true if the institution has a valid dialable phone number (not a placeholder like 07XXXXXXXXX).
 */
export function hasValidPhoneNumber(phone?: string | null): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  if (!trimmed || trimmed.includes('X') || trimmed.includes('x')) return false;
  const digits = trimmed.replace(/\D/g, '');
  return digits.length >= 7;
}

/**
 * Computes age in whole years from an ISO YYYY-MM-DD date of birth string.
 */
export function calculateAgeFromDob(dateOfBirth?: string): number | null {
  if (!dateOfBirth) return null;
  const birth = new Date(dateOfBirth);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  if (birth.getTime() > today.getTime()) return null;
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age >= 0 ? age : null;
}

/**
 * Deduplicates patient candidates originating from appointments, charts, bookings, orders, or prescriptions.
 */
export function collectScopedPatients<T extends ScopedPatientRecord>(records: T[]): ScopedPatientRecord[] {
  const map = new Map<string, ScopedPatientRecord>();
  for (const r of records) {
    if (!r.patientName && !r.patientPhone) continue;
    const normPhone = normalizePhoneDigits(r.patientPhone);
    const normName = normalizeSearchText(r.patientName);
    const key = r.patientId && !r.patientId.startsWith('walkin_')
      ? r.patientId
      : normPhone
      ? `phone_${normPhone}`
      : `name_${normName}`;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        patientId: r.patientId,
        patientName: r.patientName,
        patientPhone: r.patientPhone && hasValidPhoneNumber(r.patientPhone) ? r.patientPhone : '',
        sourceLabel: r.sourceLabel,
        gender: r.gender,
        dateOfBirth: r.dateOfBirth,
        lastInteractionDate: r.lastInteractionDate,
      });
    } else {
      map.set(key, {
        ...existing,
        patientName: existing.patientName || r.patientName,
        patientPhone:
          existing.patientPhone && hasValidPhoneNumber(existing.patientPhone)
            ? existing.patientPhone
            : r.patientPhone && hasValidPhoneNumber(r.patientPhone)
            ? r.patientPhone
            : '',
        gender: existing.gender || r.gender,
        dateOfBirth: existing.dateOfBirth || r.dateOfBirth,
        lastInteractionDate: existing.lastInteractionDate || r.lastInteractionDate,
      });
    }
  }
  return Array.from(map.values());
}

/**
 * Filters already-linked patients strictly by Full Name and/or Registered Phone Number.
 */
export function searchScopedPatients<T extends ScopedPatientRecord>(
  records: T[],
  nameQuery: string,
  phoneQuery?: string
): T[] {
  const normNameQ = normalizeSearchText(nameQuery);
  const normPhoneQ = normalizePhoneDigits(phoneQuery ?? nameQuery);

  if (!normNameQ && !normPhoneQ) return records;

  return records.filter((rec) => {
    const recName = normalizeSearchText(rec.patientName);
    const recPhone = normalizePhoneDigits(rec.patientPhone);

    // If explicit separate phoneQuery was provided alongside nameQuery, satisfy provided fields
    if (phoneQuery !== undefined) {
      const nameOk = !normNameQ || recName.includes(normNameQ);
      const phoneOk = !normPhoneQ || (recPhone.length > 0 && recPhone.includes(normPhoneQ));
      return nameOk && phoneOk;
    }

    // Combined single-input search: match either full name or phone digits
    const nameMatch = Boolean(normNameQ) && recName.includes(normNameQ);
    const phoneMatch = Boolean(normPhoneQ) && normPhoneQ.length >= 3 && recPhone.includes(normPhoneQ);
    return nameMatch || phoneMatch;
  });
}
