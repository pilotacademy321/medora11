import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACTIVE_PAYMENT_METHOD_IDS,
  MAX_RECEIPT_SIZE_BYTES,
  DEFAULT_PAYMENT_METHODS,
  calculateSubscriptionDates,
  canApprovePaymentRequest,
  canRejectPaymentRequest,
  computeFinancialSummary,
  createDefaultPaymentSettings,
  getActivePaymentMethods,
  getSubscriptionExpiryStatus,
  isSupportedManualMethod,
  validatePaymentRequestSubmission,
  validateReceiptFileMeta,
  validateWalletNumber,
} from './subscriptionPaymentEngine';
import { DEFAULT_SUBSCRIPTION_PLANS } from '../data/subscriptionPlans';
import { PaymentRequest, UserSubscription } from '../types';

test('official payment methods contain strictly SuperQi (917337618826) and ZainCash (07885663748)', () => {
  assert.deepEqual([...ACTIVE_PAYMENT_METHOD_IDS], ['superqi', 'zaincash']);
  assert.equal(DEFAULT_PAYMENT_METHODS.superqi.walletNumber, '917337618826');
  assert.equal(DEFAULT_PAYMENT_METHODS.superqi.displayNameAr, 'سوبر كي (SuperQi)');
  assert.equal(DEFAULT_PAYMENT_METHODS.zaincash.walletNumber, '07885663748');
  assert.equal(DEFAULT_PAYMENT_METHODS.zaincash.displayNameAr, 'زين كاش (ZainCash)');

  assert.equal(isSupportedManualMethod('superqi'), true);
  assert.equal(isSupportedManualMethod('zaincash'), true);
  assert.equal(isSupportedManualMethod('fib'), false);
  assert.equal(isSupportedManualMethod('visa'), false);
  assert.equal(isSupportedManualMethod('mastercard'), false);
  assert.equal(isSupportedManualMethod('qicard'), false);
});

test('getActivePaymentMethods filters out disabled methods cleanly', () => {
  const settings = createDefaultPaymentSettings();
  assert.equal(getActivePaymentMethods(settings).length, 2);

  settings.methods.superqi.isActive = false;
  const active = getActivePaymentMethods(settings);
  assert.equal(active.length, 1);
  assert.equal(active[0].id, 'zaincash');
});

test('validateWalletNumber enforces clean digit format', () => {
  assert.equal(validateWalletNumber('917337618826').valid, true);
  assert.equal(validateWalletNumber('07885663748').valid, true);
  assert.equal(validateWalletNumber('123').valid, false);
  assert.equal(validateWalletNumber('0788-566-3748').valid, false);
  assert.equal(validateWalletNumber('abc917337').valid, false);
});

test('validateReceiptFileMeta enforces image & PDF formats and 5MB max limit', () => {
  assert.equal(
    validateReceiptFileMeta({ name: 'receipt.jpg', type: 'image/jpeg', size: 1024 * 500 }).valid,
    true
  );
  assert.equal(
    validateReceiptFileMeta({ name: 'receipt.png', type: 'image/png', size: MAX_RECEIPT_SIZE_BYTES }).valid,
    true
  );
  assert.equal(
    validateReceiptFileMeta({ name: 'receipt.webp', type: 'image/webp', size: 2048 }).valid,
    true
  );
  assert.equal(
    validateReceiptFileMeta({ name: 'invoice.pdf', type: 'application/pdf', size: 50000 }).valid,
    true
  );
  assert.equal(
    validateReceiptFileMeta({ name: 'oversized.pdf', type: 'application/pdf', size: MAX_RECEIPT_SIZE_BYTES + 1 }).valid,
    false
  );
  assert.equal(
    validateReceiptFileMeta({ name: 'oversized.jpg', type: 'image/jpeg', size: MAX_RECEIPT_SIZE_BYTES + 1 }).valid,
    false
  );
  assert.equal(
    validateReceiptFileMeta({ name: 'empty.png', type: 'image/png', size: 0 }).valid,
    false
  );
  assert.equal(
    validateReceiptFileMeta({ name: 'vector.svg', type: 'image/svg+xml', size: 5000 }).valid,
    false
  );
  assert.equal(
    validateReceiptFileMeta({ name: 'malware.exe', type: 'application/x-msdownload', size: 5000 }).valid,
    false
  );
  assert.equal(validateReceiptFileMeta(null).valid, false);
});

test('validatePaymentRequestSubmission validates auth, active plan, exact amount, date, method, and receipt', () => {
  const soloPlan = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === 'solo-practice')!;
  const settings = createDefaultPaymentSettings();

  const validRes = validatePaymentRequestSubmission({
    userId: 'doc_uid_1',
    plan: soloPlan,
    paymentMethodId: 'superqi',
    activeMethodSetting: settings.methods.superqi,
    amountIqd: 25000,
    transferDate: '2026-11-12',
    receiptFile: { name: 'transfer.jpg', type: 'image/jpeg', size: 250_000 },
    now: new Date('2026-11-13T10:00:00Z'),
  });
  assert.equal(validRes.valid, true);
  assert.equal(validRes.errors.length, 0);

  // Tampered amount rejected
  const badAmount = validatePaymentRequestSubmission({
    userId: 'doc_uid_1',
    plan: soloPlan,
    paymentMethodId: 'zaincash',
    activeMethodSetting: settings.methods.zaincash,
    amountIqd: 1000,
    transferDate: '2026-11-12',
    receiptFile: { name: 'transfer.jpg', type: 'image/jpeg', size: 250_000 },
    now: new Date('2026-11-13T10:00:00Z'),
  });
  assert.equal(badAmount.valid, false);
  assert.ok(badAmount.errors.some((e) => e.field === 'amountIqd'));

  // Disallowed method rejected
  const badMethod = validatePaymentRequestSubmission({
    userId: 'doc_uid_1',
    plan: soloPlan,
    paymentMethodId: 'fib',
    amountIqd: 25000,
    transferDate: '2026-11-12',
    receiptFile: { name: 'transfer.jpg', type: 'image/jpeg', size: 250_000 },
    now: new Date('2026-11-13T10:00:00Z'),
  });
  assert.equal(badMethod.valid, false);
  assert.ok(badMethod.errors.some((e) => e.field === 'paymentMethod'));
});

test('calculateSubscriptionDates computes monthly/yearly terms and extends active early renewals', () => {
  const freshMonthly = calculateSubscriptionDates({
    billingPeriod: 'monthly',
    approvedAtIso: '2026-11-13T12:00:00.000Z',
  });
  assert.equal(freshMonthly.startDate, '2026-11-13');
  assert.equal(freshMonthly.endDate, '2026-12-13');

  const freshYearly = calculateSubscriptionDates({
    billingPeriod: 'yearly',
    approvedAtIso: '2026-11-13T12:00:00.000Z',
  });
  assert.equal(freshYearly.startDate, '2026-11-13');
  assert.equal(freshYearly.endDate, '2027-11-13');

  // Early renewal before active expiration preserves remaining paid time
  const earlyRenewal = calculateSubscriptionDates({
    billingPeriod: 'monthly',
    approvedAtIso: '2026-11-13T12:00:00.000Z',
    existingSubscription: {
      status: 'active',
      startDate: '2026-10-25',
      endDate: '2026-11-25',
    },
  });
  assert.equal(earlyRenewal.startDate, '2026-10-25');
  assert.equal(earlyRenewal.endDate, '2026-12-25');
});

test('canApprovePaymentRequest and canRejectPaymentRequest block double approval, rejected approval, and empty reason', () => {
  const soloPlan = DEFAULT_SUBSCRIPTION_PLANS.find((p) => p.id === 'solo-practice')!;
  const pendingReq: Partial<PaymentRequest> = {
    id: 'req_1',
    userId: 'doc_1',
    planId: 'solo-practice',
    paymentMethod: 'superqi',
    amountIqd: 25000,
    expectedAmountIqd: 25000,
    status: 'pending',
  };

  assert.equal(canApprovePaymentRequest(pendingReq, soloPlan).allowed, true);
  assert.equal(canApprovePaymentRequest({ ...pendingReq, status: 'approved' }, soloPlan).allowed, false);
  assert.equal(canApprovePaymentRequest({ ...pendingReq, status: 'rejected' }, soloPlan).allowed, false);
  assert.equal(canApprovePaymentRequest({ ...pendingReq, amountIqd: 5000 }, soloPlan).allowed, false);

  assert.equal(canRejectPaymentRequest(pendingReq, '').allowed, false);
  assert.equal(canRejectPaymentRequest(pendingReq, 'الإيصال غير واضح').allowed, true);
  assert.equal(canRejectPaymentRequest({ ...pendingReq, status: 'approved' }, 'reason').allowed, false);
});

test('computeFinancialSummary counts ONLY approved requests in confirmed revenue and excludes pending/rejected', () => {
  const baseReq = (overrides: Partial<PaymentRequest>): PaymentRequest => ({
    id: 'req',
    requestNumber: 'MED-PAY-1',
    userId: 'u1',
    userEmail: 'u1@example.com',
    customerName: 'Dr. Ali',
    institutionName: 'Al-Noor Clinic',
    institutionType: 'doctor',
    planId: 'solo-practice',
    planNameAr: 'العيادة الفردية',
    planNameEn: 'Solo Practice Clinic',
    billingPeriod: 'monthly',
    expectedAmountIqd: 25000,
    amountIqd: 25000,
    paymentMethod: 'superqi',
    paymentMethodName: 'سوبر كي (SuperQi)',
    receivingWalletNumber: '917337618826',
    transferDate: '2026-11-12',
    receiptId: 'rcpt_1',
    receiptUrl: 'https://example.com/r.png',
    receiptStoragePath: 'payment_receipts/u1/req/r.png',
    receiptFileName: 'r.png',
    receiptMimeType: 'image/png',
    receiptSizeBytes: 12000,
    status: 'pending',
    submittedAt: '2026-11-12T10:00:00Z',
    updatedAt: '2026-11-12T10:00:00Z',
    ...overrides,
  });

  const requests: PaymentRequest[] = [
    baseReq({ id: 'r1', status: 'approved', paymentMethod: 'superqi', amountIqd: 25000, expectedAmountIqd: 25000, planId: 'solo-practice' }),
    baseReq({ id: 'r2', status: 'approved', paymentMethod: 'zaincash', amountIqd: 45000, expectedAmountIqd: 45000, planId: 'clinical-lab', planNameAr: 'المختبر', planNameEn: 'Lab' }),
    baseReq({ id: 'r3', status: 'pending', paymentMethod: 'superqi', amountIqd: 60000, expectedAmountIqd: 60000 }),
    baseReq({ id: 'r4', status: 'under_review', paymentMethod: 'zaincash', amountIqd: 35000, expectedAmountIqd: 35000 }),
    baseReq({ id: 'r5', status: 'rejected', paymentMethod: 'zaincash', amountIqd: 150000, expectedAmountIqd: 150000 }),
  ];

  const subs: UserSubscription[] = [
    {
      id: 'u1',
      userId: 'u1',
      userEmail: 'u1@example.com',
      userName: 'Dr. Ali',
      userRole: 'doctor',
      planId: 'solo-practice',
      planName: 'العيادة الفردية',
      customPriceIqd: 25000,
      status: 'active',
      startDate: '2026-11-12',
      endDate: '2026-12-12',
      updatedAt: '2026-11-12T10:00:00Z',
    },
  ];

  const summary = computeFinancialSummary(requests, subs);
  assert.equal(summary.confirmedRevenueIqd, 70000); // ONLY 25000 + 45000
  assert.equal(summary.approvedCount, 2);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.underReviewCount, 1);
  assert.equal(summary.pendingAmountIqd, 95000);
  assert.equal(summary.rejectedCount, 1);
  assert.equal(summary.rejectedAmountIqd, 150000);
  assert.equal(summary.revenueByMethod.superqi.totalIqd, 25000);
  assert.equal(summary.revenueByMethod.zaincash.totalIqd, 45000);
  assert.equal(summary.activeSubscriptionsCount, 1);
});

test('getSubscriptionExpiryStatus detects active, nearing expiration (<=7 days), and expired states', () => {
  const now = new Date('2026-11-13T10:00:00Z');
  assert.equal(getSubscriptionExpiryStatus(null, now).state, 'none');
  assert.equal(
    getSubscriptionExpiryStatus({ status: 'active', endDate: '2026-12-10' }, now).state,
    'active'
  );
  assert.equal(
    getSubscriptionExpiryStatus({ status: 'active', endDate: '2026-11-18' }, now).state,
    'nearing_expiration'
  );
  assert.equal(
    getSubscriptionExpiryStatus({ status: 'active', endDate: '2026-11-01' }, now).state,
    'expired'
  );
});
