import type { CurrencyCode } from '../types';
import { percentOf, roundMoney, mul } from '../money';

/** Centralised demo fee schedule. All UI previews and the engine use these functions. */

export type FundingMethod = 'bank_transfer' | 'debit_card' | 'apple_pay' | 'wire';

export const FUNDING_METHODS: Record<FundingMethod, { label: string; feePercent: number; arrival: string; description: string }> = {
  bank_transfer: { label: 'Bank transfer (ACH)', feePercent: 0, arrival: 'Instant in demo', description: 'Free · simulated ACH pull' },
  debit_card: { label: 'Debit card', feePercent: 1.5, arrival: 'Instant', description: '1.5% card fee' },
  apple_pay: { label: 'Apple Pay / Google Pay', feePercent: 1, arrival: 'Instant', description: '1% wallet fee' },
  wire: { label: 'Wire transfer', feePercent: 0, arrival: 'Same day in demo', description: 'Free · simulated incoming wire' },
};

export type WithdrawalSpeed = 'standard' | 'instant';

export const WITHDRAWAL_SPEEDS: Record<WithdrawalSpeed, { label: string; arrival: string; description: string }> = {
  standard: { label: 'Standard', arrival: '1–3 business days', description: '$1.50 flat fee' },
  instant: { label: 'Instant', arrival: 'Within 30 minutes', description: '1.5% (min $2.50, max $25)' },
};

export const LIMITS = {
  depositMax: 50_000,
  withdrawMin: 10,
  withdrawMax: 25_000,
  transferMax: 10_000,
  qrMax: 5_000,
  orderMaxValue: 250_000,
  minShares: 0.0001,
};

export function depositFee(amount: number, method: FundingMethod): number {
  return percentOf(amount, FUNDING_METHODS[method].feePercent);
}

export function withdrawalFee(amount: number, speed: WithdrawalSpeed): number {
  if (speed === 'standard') return 1.5;
  const fee = percentOf(amount, 1.5);
  return roundMoney(Math.min(25, Math.max(2.5, fee)));
}

/** Transfers to NovaFin users are free; external transfers cost 0.5% (min 1, max 15 units). */
export function transferFee(amount: number, kind: 'novafin' | 'external', currency: CurrencyCode = 'USD'): number {
  if (kind === 'novafin') return 0;
  const fee = percentOf(amount, 0.5, currency);
  return roundMoney(Math.min(15, Math.max(1, fee)), currency);
}

/** Paper-trading commission: 0.1% of order value (min $0.01, max $9.99). */
export function tradeFee(orderValue: number): number {
  if (orderValue <= 0) return 0;
  const fee = roundMoney(mul(orderValue, 0.001));
  return roundMoney(Math.min(9.99, Math.max(0.01, fee)));
}
