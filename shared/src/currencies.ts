import { CURRENCY_CODES, type CurrencyCode, type PricePoint } from './types';
import { div, mul, roundMoney, roundRate, percentOf, sub } from './money';
import { gaussian, hashString, mulberry32 } from './random';

export interface CurrencyInfo {
  code: CurrencyCode;
  name: string;
  symbol: string;
  flag: string;
  locale: string;
  country: string;
}

export const CURRENCIES: Record<CurrencyCode, CurrencyInfo> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸', locale: 'en-US', country: 'United States' },
  INR: { code: 'INR', name: 'Indian Rupee', symbol: '₹', flag: '🇮🇳', locale: 'en-IN', country: 'India' },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺', locale: 'de-DE', country: 'Eurozone' },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧', locale: 'en-GB', country: 'United Kingdom' },
  AED: { code: 'AED', name: 'UAE Dirham', symbol: 'AED', flag: '🇦🇪', locale: 'en-AE', country: 'United Arab Emirates' },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦', locale: 'en-CA', country: 'Canada' },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺', locale: 'en-AU', country: 'Australia' },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', flag: '🇯🇵', locale: 'ja-JP', country: 'Japan' },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', flag: '🇸🇬', locale: 'en-SG', country: 'Singapore' },
  CHF: { code: 'CHF', name: 'Swiss Franc', symbol: 'CHF', flag: '🇨🇭', locale: 'de-CH', country: 'Switzerland' },
};

/**
 * ILLUSTRATIVE, SIMULATED exchange rates expressed as units of currency per 1 USD.
 * These are static demo values and are NOT live financial quotes.
 */
export const DEMO_RATES_PER_USD: Record<CurrencyCode, number> = {
  USD: 1,
  INR: 85,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.6725,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 149.5,
  SGD: 1.34,
  CHF: 0.88,
};

export const DEMO_RATES_AS_OF = '2026-01-01T00:00:00.000Z';

/** Conversion fee charged on every currency exchange (percent of source amount). */
export const EXCHANGE_FEE_PERCENT = 1;

/** Minimum source amounts in the source currency's units. */
export const EXCHANGE_MIN_AMOUNT = 1;

export function isCurrencyCode(v: unknown): v is CurrencyCode {
  return typeof v === 'string' && (CURRENCY_CODES as readonly string[]).includes(v);
}

/** Units of `to` received for 1 unit of `from` (before fees). */
export function getRate(from: CurrencyCode, to: CurrencyCode, rates: Record<CurrencyCode, number> = DEMO_RATES_PER_USD): number {
  if (from === to) return 1;
  return roundRate(div(rates[to], rates[from]));
}

/** Converts an amount without fees (used for valuations, e.g. net worth in display currency). */
export function convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  if (from === to) return amount;
  return roundMoney(mul(amount, getRate(from, to)), to);
}

export interface ExchangeQuote {
  from: CurrencyCode;
  to: CurrencyCode;
  fromAmount: number;
  rate: number;
  feePercent: number;
  fee: number;
  /** Source amount actually converted after deducting the fee. */
  convertedAmount: number;
  toAmount: number;
}

/**
 * Calculates a currency exchange. The fee is deducted from the source amount
 * and the remainder is converted at the illustrative rate.
 *
 * Example: 100 USD → INR at 85 with 1% fee = 1 USD fee, 99 USD converted, ₹8,415 received.
 */
export function quoteExchange(from: CurrencyCode, to: CurrencyCode, fromAmount: number): ExchangeQuote {
  const amount = roundMoney(fromAmount, from);
  const rate = getRate(from, to);
  const fee = percentOf(amount, EXCHANGE_FEE_PERCENT, from);
  const convertedAmount = roundMoney(sub(amount, fee), from);
  const toAmount = roundMoney(mul(convertedAmount, rate), to);
  return { from, to, fromAmount: amount, rate, feePercent: EXCHANGE_FEE_PERCENT, fee, convertedAmount, toAmount };
}

/** Full cross-rate matrix (simulated). */
export function getRateMatrix(): Record<CurrencyCode, Record<CurrencyCode, number>> {
  const out = {} as Record<CurrencyCode, Record<CurrencyCode, number>>;
  for (const a of CURRENCY_CODES) {
    out[a] = {} as Record<CurrencyCode, number>;
    for (const b of CURRENCY_CODES) out[a][b] = getRate(a, b);
  }
  return out;
}

const VOLATILITY: Record<CurrencyCode, number> = {
  USD: 0,
  INR: 0.0018,
  EUR: 0.0035,
  GBP: 0.0042,
  AED: 0.0002,
  CAD: 0.0033,
  AUD: 0.0049,
  JPY: 0.0052,
  SGD: 0.0024,
  CHF: 0.0039,
};

const DAY = 86_400_000;

/**
 * Synthetic 180-day history of each currency's rate per USD, ending at the demo rate.
 * Deterministic so charts are stable between renders and reloads.
 */
export function getRateHistory(code: CurrencyCode, days = 180, endTime = Date.parse(DEMO_RATES_AS_OF)): PricePoint[] {
  const end = DEMO_RATES_PER_USD[code];
  if (code === 'USD') return Array.from({ length: days }, (_, i) => ({ t: endTime - (days - 1 - i) * DAY, p: 1 }));
  const rand = mulberry32(hashString(`fx:${code}`));
  const vol = VOLATILITY[code];
  // Build backwards from the end value, then reverse.
  const values: number[] = [end];
  for (let i = 1; i < days; i++) {
    const prev = values[i - 1];
    const drift = (end - prev) * 0.02; // gentle mean reversion
    values.push(prev * (1 + gaussian(rand) * vol) + drift);
  }
  values.reverse();
  return values.map((p, i) => ({ t: endTime - (days - 1 - i) * DAY, p: roundRate(p) }));
}

/** Cross-pair history derived from the USD histories. */
export function getPairHistory(from: CurrencyCode, to: CurrencyCode, days = 90): PricePoint[] {
  const a = getRateHistory(from, days);
  const b = getRateHistory(to, days);
  return a.map((pt, i) => ({ t: pt.t, p: roundRate(div(b[i].p, pt.p)) }));
}
