import { ElectronicPrescription, LabOrder, LabResult, MedicalRecord, PharmacyOrder, RadiologyOrder, RadiologyReport } from '../types';

/**
 * Pure ownership predicates for patient / clinical document printing.
 * Used both in UI components and automated security tests.
 */
export function canUserPrintPrescription(
  userUid: string | null | undefined,
  isAdmin: boolean,
  prescription: Pick<ElectronicPrescription, 'doctorId' | 'patientId' | 'targetPharmacyId' | 'dispensedPharmacyId'> | null | undefined,
  isDemoMode = false
): boolean {
  if (!prescription) return false;
  if (isAdmin || isDemoMode) return true;
  if (!userUid) return false;
  return (
    userUid === prescription.doctorId ||
    userUid === prescription.patientId ||
    userUid === prescription.targetPharmacyId ||
    userUid === prescription.dispensedPharmacyId
  );
}

export function canUserPrintLabResult(
  userUid: string | null | undefined,
  isAdmin: boolean,
  result: Pick<LabResult, 'patientId' | 'labId'> | null | undefined,
  isDemoMode = false
): boolean {
  if (!result) return false;
  if (isAdmin || isDemoMode) return true;
  if (!userUid) return false;
  return userUid === result.patientId || userUid === result.labId;
}

export function canUserPrintRadiologyReport(
  userUid: string | null | undefined,
  isAdmin: boolean,
  report: Pick<RadiologyReport, 'patientId' | 'centerId'> | null | undefined,
  isDemoMode = false
): boolean {
  if (!report) return false;
  if (isAdmin || isDemoMode) return true;
  if (!userUid) return false;
  return userUid === report.patientId || userUid === report.centerId;
}

export function canUserPrintPharmacyOrder(
  userUid: string | null | undefined,
  isAdmin: boolean,
  order: Pick<PharmacyOrder, 'patientId' | 'pharmacyId'> | null | undefined,
  isDemoMode = false
): boolean {
  if (!order) return false;
  if (isAdmin || isDemoMode) return true;
  if (!userUid) return false;
  return userUid === order.patientId || userUid === order.pharmacyId;
}

export function canUserPrintPersonalRecord(
  userUid: string | null | undefined,
  isAdmin: boolean,
  record: Pick<MedicalRecord, 'patientId'> | null | undefined,
  isDemoMode = false
): boolean {
  if (!record) return false;
  if (isAdmin || isDemoMode) return true;
  if (!userUid) return false;
  return userUid === record.patientId;
}

export function canUserPrintReferral(
  userUid: string | null | undefined,
  isAdmin: boolean,
  referral:
    | Pick<LabOrder, 'patientId' | 'doctorId' | 'targetLabId'>
    | Pick<RadiologyOrder, 'patientId' | 'doctorId' | 'targetCenterId'>
    | null
    | undefined,
  isDemoMode = false
): boolean {
  if (!referral) return false;
  if (isAdmin || isDemoMode) return true;
  if (!userUid) return false;
  if (userUid === referral.patientId || userUid === referral.doctorId) return true;
  if ('targetLabId' in referral && referral.targetLabId && userUid === referral.targetLabId) return true;
  if ('targetCenterId' in referral && referral.targetCenterId && userUid === referral.targetCenterId) return true;
  return false;
}

export function canUserPrintHealthPassport(
  userUid: string | null | undefined,
  isAdmin: boolean,
  passportPatientId: string | null | undefined,
  isDemoMode = false
): boolean {
  if (!passportPatientId) return false;
  if (isAdmin || isDemoMode) return true;
  if (!userUid) return false;
  return userUid === passportPatientId;
}

/**
 * Isolates a single DOM medical sheet for A4 printing on mobile & desktop browsers.
 * Prevents fixed modals, sidebars, scroll containers, or tall backgrounds from clipping
 * or producing blank pages when printing.
 */
export function triggerIsolatedPrint(
  targetElement: HTMLElement | null,
  dir: 'rtl' | 'ltr' = 'rtl'
): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }

  const stageId = 'medora-print-stage';

  const cleanup = () => {
    document.body.classList.remove('medora-print-stage-active');
    const existing = document.getElementById(stageId);
    if (existing) {
      existing.remove();
    }
  };

  // Clean up any leftover stage before starting
  cleanup();

  if (targetElement) {
    const stage = document.createElement('div');
    stage.id = stageId;
    stage.setAttribute('dir', dir);
    stage.className = 'medora-print-sheet';

    const clone = targetElement.cloneNode(true) as HTMLElement;
    clone.classList.remove('max-h-[92vh]', 'max-h-[90vh]', 'overflow-y-auto');
    stage.appendChild(clone);

    document.body.appendChild(stage);
    document.body.classList.add('medora-print-stage-active');

    window.addEventListener('afterprint', cleanup, { once: true });
    // Safety fallback for older mobile browsers that do not reliably fire afterprint
    window.setTimeout(() => {
      if (document.body.classList.contains('medora-print-stage-active')) {
        // Only clean up when tab regains focus or after generous delay
        const onFocus = () => cleanup();
        window.addEventListener('focus', onFocus, { once: true });
      }
    }, 300);
  }

  window.print();
  return true;
}
