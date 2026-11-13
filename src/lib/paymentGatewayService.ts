/**
 * MEDORA — Unified Payment Methods Registry
 *
 * Strictly ONLY TWO active manual wallet payment methods:
 * 1. سوبر كي (SuperQi) — 917337618826
 * 2. زين كاش (ZainCash) — 07885663748
 *
 * Zero QiCard, FIB, Visa, Mastercard, or invented bank account details.
 */

import { ManualPaymentMethodId, PaymentGatewayType } from '../types';
import {
  ACTIVE_PAYMENT_METHOD_IDS,
  DEFAULT_PAYMENT_METHODS,
  isSupportedManualMethod,
} from '../utils/subscriptionPaymentEngine';

export const ACTIVE_PAYMENT_GATEWAY_IDS: readonly PaymentGatewayType[] = ACTIVE_PAYMENT_METHOD_IDS;

export function isSupportedPaymentGateway(gateway: string): gateway is PaymentGatewayType {
  return isSupportedManualMethod(gateway);
}

export interface GatewayInfo {
  id: ManualPaymentMethodId;
  nameAr: string;
  nameEn: string;
  walletNumber: string;
  descriptionAr: string;
  descriptionEn: string;
  currency: 'IQD';
}

export const SUPPORTED_PAYMENT_GATEWAYS: GatewayInfo[] = [
  {
    id: 'superqi',
    nameAr: DEFAULT_PAYMENT_METHODS.superqi.displayNameAr,
    nameEn: DEFAULT_PAYMENT_METHODS.superqi.displayNameEn,
    walletNumber: DEFAULT_PAYMENT_METHODS.superqi.walletNumber,
    descriptionAr: DEFAULT_PAYMENT_METHODS.superqi.instructionsAr,
    descriptionEn: DEFAULT_PAYMENT_METHODS.superqi.instructionsEn,
    currency: 'IQD',
  },
  {
    id: 'zaincash',
    nameAr: DEFAULT_PAYMENT_METHODS.zaincash.displayNameAr,
    nameEn: DEFAULT_PAYMENT_METHODS.zaincash.displayNameEn,
    walletNumber: DEFAULT_PAYMENT_METHODS.zaincash.walletNumber,
    descriptionAr: DEFAULT_PAYMENT_METHODS.zaincash.instructionsAr,
    descriptionEn: DEFAULT_PAYMENT_METHODS.zaincash.instructionsEn,
    currency: 'IQD',
  },
];

export * from './subscriptionPaymentService';
