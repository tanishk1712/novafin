import { CURRENCIES, minorUnits, type CurrencyCode } from '@novafin/shared';
import { formatDistanceToNowStrict, format as fmtDate } from 'date-fns';

export function formatMoney(
  amount: number,
  currency: CurrencyCode = 'USD',
  opts: { compact?: boolean; sign?: boolean; decimals?: number } = {},
): string {
  const info = CURRENCIES[currency];
  const digits = opts.decimals ?? minorUnits(currency);
  const abs = Math.abs(amount);
  let n: string;
  if (opts.compact && abs >= 10_000) {
    n = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(abs);
  } else {
    n = abs.toLocaleString(currency === 'INR' ? 'en-IN' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  const sym = info.symbol.length === 1 || info.symbol.endsWith('$') ? info.symbol : `${info.symbol} `;
  const sign = amount < 0 ? '−' : opts.sign && amount > 0 ? '+' : '';
  return `${sign}${sym}${n}`;
}

export function formatUsd(amount: number, opts: { compact?: boolean; sign?: boolean } = {}) {
  return formatMoney(amount, 'USD', opts);
}

export function formatPrice(p: number): string {
  return formatMoney(p, 'USD', { decimals: p < 1 ? 4 : 2 });
}

export function formatPct(p: number, opts: { sign?: boolean } = { sign: true }): string {
  const sign = p > 0 && opts.sign ? '+' : p < 0 ? '−' : '';
  return `${sign}${Math.abs(p).toFixed(2)}%`;
}

export function formatNumber(n: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  if (opts.compact) return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
  return n.toLocaleString('en-US', { maximumFractionDigits: opts.decimals ?? 2 });
}

export function formatShares(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export function formatMarketCap(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  return `$${n.toLocaleString()}`;
}

export function relativeTime(iso: string | number): string {
  const d = typeof iso === 'number' ? new Date(iso) : new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  if (Math.abs(Date.now() - d.getTime()) < 45_000) return 'just now';
  return formatDistanceToNowStrict(d, { addSuffix: true });
}

export function formatDateTime(iso: string | number): string {
  return fmtDate(new Date(iso), 'MMM d, yyyy · HH:mm');
}

export function formatDate(iso: string | number, pattern = 'MMM d, yyyy'): string {
  return fmtDate(new Date(iso), pattern);
}

export function changeColor(v: number): string {
  return v > 0 ? 'text-gain' : v < 0 ? 'text-loss' : 'text-muted-foreground';
}

export const CATEGORY_LABELS: Record<string, string> = {
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
  exchange: 'Exchange',
  transfer: 'Transfer',
  qr_payment: 'QR payment',
  stock_buy: 'Stock buy',
  stock_sell: 'Stock sell',
  fee: 'Fee',
};
