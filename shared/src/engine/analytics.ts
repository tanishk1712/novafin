import type { CurrencyCode, DemoState, Holding, MarketState, Order, Transaction } from '../types';
import { CURRENCY_CODES } from '../types';
import { addMoney, div, mul, pctChange, roundMoney, sub, sum } from '../money';
import { convert } from '../currencies';
import { STOCKS_BY_SYMBOL } from '../market/stocks.seed';
import { getHistory } from '../market/engine';

/** Derived, read-only metrics. These functions never mutate state. */

export interface PositionView extends Holding {
  name: string;
  sector: string;
  price: number;
  previousClose: number;
  marketValue: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  dayChange: number;
  dayChangePercent: number;
  allocationPercent: number;
}

export interface PortfolioSummary {
  positions: PositionView[];
  marketValue: number;
  costBasis: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedPnl: number;
  dayPnl: number;
  dayPnlPercent: number;
  totalReturn: number;
  totalReturnPercent: number;
}

export function computePortfolio(state: DemoState, market: MarketState): PortfolioSummary {
  const raw = state.portfolio.map((h) => {
    const q = market.quotes[h.symbol];
    const seed = STOCKS_BY_SYMBOL[h.symbol];
    const price = q?.price ?? seed?.price ?? h.avgPrice;
    const previousClose = q?.previousClose ?? seed?.previousClose ?? price;
    const marketValue = roundMoney(mul(h.shares, price));
    const unrealizedPnl = roundMoney(sub(marketValue, h.costBasis));
    const dayChange = roundMoney(mul(h.shares, sub(price, previousClose)));
    return {
      ...h,
      name: seed?.name ?? h.symbol,
      sector: seed?.sector ?? 'Other',
      price,
      previousClose,
      marketValue,
      unrealizedPnl,
      unrealizedPnlPercent: pctChange(h.costBasis, marketValue),
      dayChange,
      dayChangePercent: pctChange(previousClose, price),
      allocationPercent: 0,
    };
  });
  const marketValue = roundMoney(sum(raw.map((p) => p.marketValue)));
  const positions = raw
    .map((p) => ({ ...p, allocationPercent: marketValue ? Math.round(div(p.marketValue, marketValue) * 10000) / 100 : 0 }))
    .sort((a, b) => b.marketValue - a.marketValue);
  const costBasis = roundMoney(sum(raw.map((p) => p.costBasis)));
  const unrealizedPnl = roundMoney(sub(marketValue, costBasis));
  const realizedPnl = realizedPnlTotal(state.orders);
  const dayPnl = roundMoney(sum(raw.map((p) => p.dayChange)));
  const prevValue = sub(marketValue, dayPnl);
  const totalReturn = roundMoney(addMoney(unrealizedPnl, realizedPnl));
  return {
    positions,
    marketValue,
    costBasis,
    unrealizedPnl,
    unrealizedPnlPercent: pctChange(costBasis, marketValue),
    realizedPnl,
    dayPnl,
    dayPnlPercent: prevValue ? pctChange(prevValue, marketValue) : 0,
    totalReturn,
    totalReturnPercent: costBasis ? Math.round(div(totalReturn, costBasis) * 10000) / 100 : 0,
  };
}

export function realizedPnlTotal(orders: Order[]): number {
  return roundMoney(sum(orders.filter((o) => o.side === 'sell' && o.status === 'filled').map((o) => o.realizedPnl ?? 0)));
}

export interface NetWorth {
  cashUsd: number;
  otherCashUsd: number;
  totalCashUsd: number;
  invested: number;
  total: number;
  byCurrency: { currency: CurrencyCode; balance: number; usdValue: number }[];
}

/** Net worth = all cash balances (converted to USD at demo rates) + current market value of holdings. Nothing is counted twice. */
export function computeNetWorth(state: DemoState, portfolioValue: number): NetWorth {
  const byCurrency = CURRENCY_CODES.map((c) => ({
    currency: c,
    balance: state.wallet.balances[c] ?? 0,
    usdValue: convert(state.wallet.balances[c] ?? 0, c, 'USD'),
  }));
  const cashUsd = state.wallet.balances.USD ?? 0;
  const otherCashUsd = roundMoney(sum(byCurrency.filter((b) => b.currency !== 'USD').map((b) => b.usdValue)));
  const totalCashUsd = addMoney(cashUsd, otherCashUsd);
  return { cashUsd, otherCashUsd, totalCashUsd, invested: portfolioValue, total: addMoney(totalCashUsd, portfolioValue), byCurrency };
}

const INACTIVE = new Set(['failed', 'cancelled']);

export function isEffective(t: Transaction): boolean {
  return !INACTIVE.has(t.status);
}

/** Effect of a transaction on a single currency balance. */
export function balanceDelta(t: Transaction, currency: CurrencyCode): number {
  if (!isEffective(t)) return 0;
  let delta = 0;
  if (t.currency === currency) delta += t.direction === 'credit' ? t.amount : -t.amount;
  if (t.category === 'exchange' && t.meta?.toCurrency === currency) delta += Number(t.meta.toAmount ?? 0);
  return delta;
}

export interface BalancePoint {
  date: string;
  t: number;
  balance: number;
}

/** Reconstructs the daily balance of a currency by walking transactions backwards from the current balance. */
export function balanceHistory(state: DemoState, currency: CurrencyCode = 'USD', days = 90, now = Date.now()): BalancePoint[] {
  const DAY = 86_400_000;
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const txs = [...state.transactions].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  let balance = state.wallet.balances[currency] ?? 0;
  let idx = 0;
  const points: BalancePoint[] = [];
  for (let i = 0; i < days; i++) {
    const dayEnd = end.getTime() - i * DAY;
    // undo transactions that happened after this day's end
    while (idx < txs.length && Date.parse(txs[idx].createdAt) > dayEnd) {
      balance = sub(balance, balanceDelta(txs[idx], currency));
      idx++;
    }
    points.push({ t: dayEnd, date: new Date(dayEnd).toISOString().slice(0, 10), balance: roundMoney(balance, currency) });
  }
  return points.reverse();
}

export interface CashflowMonth {
  month: string;
  label: string;
  income: number;
  expense: number;
  deposits: number;
  withdrawals: number;
  fees: number;
  invested: number;
  divested: number;
}

const INCOME_CATS = new Set(['deposit', 'transfer', 'qr_payment']);
const EXPENSE_CATS = new Set(['withdrawal', 'transfer', 'qr_payment', 'fee']);

/** Monthly cash-flow buckets in USD-equivalent. Exchanges are neutral (not income/expense). */
export function monthlyCashflow(state: DemoState, months = 6, now = Date.now()): CashflowMonth[] {
  const out: CashflowMonth[] = [];
  const base = new Date(now);
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    out.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: d.toLocaleString('en-US', { month: 'short' }),
      income: 0,
      expense: 0,
      deposits: 0,
      withdrawals: 0,
      fees: 0,
      invested: 0,
      divested: 0,
    });
  }
  const byKey = new Map(out.map((m) => [m.month, m]));
  for (const t of state.transactions) {
    if (!isEffective(t)) continue;
    const m = byKey.get(t.createdAt.slice(0, 7));
    if (!m) continue;
    const usd = convert(t.amount, t.currency, 'USD');
    if (t.direction === 'credit' && INCOME_CATS.has(t.category)) m.income = addMoney(m.income, usd);
    if (t.direction === 'debit' && EXPENSE_CATS.has(t.category)) m.expense = addMoney(m.expense, usd);
    if (t.category === 'deposit') m.deposits = addMoney(m.deposits, usd);
    if (t.category === 'withdrawal') m.withdrawals = addMoney(m.withdrawals, usd);
    if (t.category === 'fee') m.fees = addMoney(m.fees, usd);
    if (t.category === 'stock_buy') m.invested = addMoney(m.invested, usd);
    if (t.category === 'stock_sell') m.divested = addMoney(m.divested, usd);
  }
  return out;
}

export interface WalletTotals {
  totalDeposits: number;
  totalWithdrawals: number;
  totalFees: number;
  completedTrades: number;
  transactionCount: number;
  pendingCount: number;
}

export function walletTotals(state: DemoState): WalletTotals {
  const eff = state.transactions.filter(isEffective);
  const usd = (t: Transaction) => convert(t.amount, t.currency, 'USD');
  return {
    totalDeposits: roundMoney(sum(eff.filter((t) => t.category === 'deposit').map(usd))),
    totalWithdrawals: roundMoney(sum(eff.filter((t) => t.category === 'withdrawal').map(usd))),
    totalFees: roundMoney(sum(eff.filter((t) => t.category === 'fee').map(usd))),
    completedTrades: state.orders.filter((o) => o.status === 'filled').length,
    transactionCount: state.transactions.length,
    pendingCount: state.transactions.filter((t) => (t.status === 'pending' || t.status === 'processing') && t.category !== 'fee').length,
  };
}

export function spendingByCategory(state: DemoState, days = 90, now = Date.now()) {
  const since = now - days * 86_400_000;
  const buckets = new Map<string, number>();
  for (const t of state.transactions) {
    if (!isEffective(t) || t.direction !== 'debit' || Date.parse(t.createdAt) < since) continue;
    if (t.category === 'exchange') continue;
    const key = t.category;
    buckets.set(key, addMoney(buckets.get(key) ?? 0, convert(t.amount, t.currency, 'USD')));
  }
  return Array.from(buckets.entries())
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export function tradePerformance(orders: Order[]) {
  const sells = orders
    .filter((o) => o.side === 'sell' && o.status === 'filled')
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  let cumulative = 0;
  return sells.map((o) => {
    cumulative = addMoney(cumulative, o.realizedPnl ?? 0);
    return { id: o.id, symbol: o.symbol, date: o.createdAt.slice(0, 10), pnl: o.realizedPnl ?? 0, cumulative };
  });
}

/**
 * Simulated value of the CURRENT holdings over the selected range, using each
 * symbol's synthetic history. Illustrative only.
 */
export function portfolioValueSeries(state: DemoState, market: MarketState, range: '1M' | '3M' | '1Y' = '3M') {
  if (!state.portfolio.length) return [];
  const series = state.portfolio
    .map((h) => ({ h, hist: getHistory(market, h.symbol, range) }))
    .filter((x) => x.hist !== null);
  if (!series.length) return [];
  const len = Math.min(...series.map((s) => s.hist!.prices.length));
  const out: { t: number; value: number; cost: number }[] = [];
  const cost = roundMoney(sum(state.portfolio.map((h) => h.costBasis)));
  for (let i = 0; i < len; i++) {
    let v = 0;
    let t = 0;
    for (const s of series) {
      const pts = s.hist!.prices;
      const pt = pts[pts.length - len + i];
      v += s.h.shares * pt.p;
      t = pt.t;
    }
    out.push({ t, value: roundMoney(v), cost });
  }
  return out;
}

export function exchangeVolumeByPair(state: DemoState) {
  const map = new Map<string, { pair: string; count: number; volumeUsd: number }>();
  for (const r of state.exchangeHistory) {
    const pair = `${r.from}/${r.to}`;
    const cur = map.get(pair) ?? { pair, count: 0, volumeUsd: 0 };
    cur.count += 1;
    cur.volumeUsd = addMoney(cur.volumeUsd, convert(r.fromAmount, r.from, 'USD'));
    map.set(pair, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.volumeUsd - a.volumeUsd);
}
