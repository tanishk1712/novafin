import Decimal from 'decimal.js';
import type { CurrencyCode } from './types';

/**
 * Decimal-safe arithmetic helpers. All monetary math in NovaFin goes through
 * these functions so that 0.1 + 0.2 style floating point errors never reach a
 * balance. Values are stored as plain numbers rounded to the currency's minor
 * unit (cash) or to 6 decimals (share quantities).
 */

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export type Num = number | string | Decimal;

const d = (v: Num) => new Decimal(v);

/** Currencies without minor units in this demo. */
const ZERO_DECIMAL: ReadonlySet<CurrencyCode> = new Set<CurrencyCode>(['JPY']);

export function minorUnits(currency: CurrencyCode = 'USD'): number {
  return ZERO_DECIMAL.has(currency) ? 0 : 2;
}

export function roundMoney(v: Num, currency: CurrencyCode = 'USD'): number {
  return d(v).toDecimalPlaces(minorUnits(currency), Decimal.ROUND_HALF_UP).toNumber();
}

/** Round a price to 2 decimals (4 for sub-dollar prices). */
export function roundPrice(v: Num): number {
  const x = d(v);
  return x.abs().lt(1) ? x.toDecimalPlaces(4).toNumber() : x.toDecimalPlaces(2).toNumber();
}

export function roundShares(v: Num): number {
  return d(v).toDecimalPlaces(6, Decimal.ROUND_DOWN).toNumber();
}

export function roundRate(v: Num): number {
  return d(v).toSignificantDigits(8).toNumber();
}

export function add(...vals: Num[]): number {
  return vals.reduce<Decimal>((acc, v) => acc.plus(v), d(0)).toNumber();
}

export function sub(a: Num, b: Num): number {
  return d(a).minus(b).toNumber();
}

export function mul(a: Num, b: Num): number {
  return d(a).times(b).toNumber();
}

export function div(a: Num, b: Num): number {
  if (d(b).isZero()) return 0;
  return d(a).div(b).toNumber();
}

export function addMoney(a: Num, b: Num, currency: CurrencyCode = 'USD'): number {
  return roundMoney(d(a).plus(b), currency);
}

export function subMoney(a: Num, b: Num, currency: CurrencyCode = 'USD'): number {
  return roundMoney(d(a).minus(b), currency);
}

export function mulMoney(a: Num, b: Num, currency: CurrencyCode = 'USD'): number {
  return roundMoney(d(a).times(b), currency);
}

export function percentOf(amount: Num, pct: Num, currency: CurrencyCode = 'USD'): number {
  return roundMoney(d(amount).times(pct).div(100), currency);
}

export function sum(vals: Num[]): number {
  return vals.reduce<Decimal>((acc, v) => acc.plus(v), d(0)).toNumber();
}

export function gte(a: Num, b: Num): boolean {
  return d(a).gte(b);
}

export function gt(a: Num, b: Num): boolean {
  return d(a).gt(b);
}

export function lt(a: Num, b: Num): boolean {
  return d(a).lt(b);
}

export function isPositiveFinite(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v > 0;
}

/** Percentage change from `from` to `to`, rounded to 2 decimals. */
export function pctChange(from: Num, to: Num): number {
  if (d(from).isZero()) return 0;
  return d(to).minus(from).div(from).times(100).toDecimalPlaces(2).toNumber();
}

/** Returns true if the value has no more decimals than allowed. */
export function hasMaxDecimals(v: number, places: number): boolean {
  return d(v).decimalPlaces() <= places;
}

export { Decimal };
