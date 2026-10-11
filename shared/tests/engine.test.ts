import { describe, expect, it } from 'vitest';
import {
  DemoError,
  INITIAL_USD_CASH,
  addMoney,
  buildMerchantRequest,
  buyStock,
  cancelTransaction,
  computePortfolio,
  createInitialMarketState,
  createQrRequest,
  createSeedState,
  deposit,
  encodeQrPayload,
  exchange,
  getRate,
  parseQrPayload,
  payQr,
  quoteExchange,
  sellStock,
  settlePending,
  simulateIncomingQrPayment,
  tradeFee,
  transfer,
  transferFee,
  withdraw,
  withdrawalFee,
  depositFee,
  balanceHistory,
  checkWatchlistAlerts,
  setWatchlistAlert,
  type DemoState,
} from '../src';

const NOW = Date.parse('2026-06-15T15:00:00Z');

function fresh(): DemoState {
  return createSeedState(NOW);
}

function expectDemoError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(DemoError);
    expect((e as DemoError).code).toBe(code);
    return;
  }
  throw new Error(`Expected DemoError ${code}`);
}

describe('seed state', () => {
  it('starts with $25,000 cash and ≈$8,500 invested', () => {
    const s = fresh();
    expect(s.wallet.balances.USD).toBe(INITIAL_USD_CASH);
    const p = computePortfolio(s, createInitialMarketState(NOW));
    expect(Math.abs(p.marketValue - 8500)).toBeLessThan(0.05);
    expect(s.transactions.length).toBeGreaterThanOrEqual(50);
    expect(s.notifications.length).toBeGreaterThanOrEqual(12);
    expect(s.watchlist.length).toBeGreaterThanOrEqual(15);
    expect(s.bankAccounts).toHaveLength(3);
  });

  it('has unique transaction references', () => {
    const s = fresh();
    const refs = new Set(s.transactions.map((t) => t.reference));
    expect(refs.size).toBe(s.transactions.length);
  });

  it('reconstructed balance history ends at the current balance and never goes negative', () => {
    const s = fresh();
    const hist = balanceHistory(s, 'USD', 160, NOW);
    expect(hist[hist.length - 1].balance).toBe(s.wallet.balances.USD);
    expect(hist.every((p) => p.balance >= 0)).toBe(true);
  });
});

describe('deposits', () => {
  it('credits the wallet and records a transaction', () => {
    const s = fresh();
    const { state, result } = deposit(s, { amount: 500, method: 'bank_transfer' }, { now: NOW });
    expect(state.wallet.balances.USD).toBe(25_500);
    expect(result.transaction.category).toBe('deposit');
    expect(result.transaction.reference).toMatch(/^NVF-DEP-/);
    expect(state.transactions[0].id).toBe(result.transaction.id);
    expect(state.notifications[0].message).toContain('$500.00 demo deposit received');
  });

  it('deducts card funding fees as a separate fee transaction', () => {
    const s = fresh();
    const { state, result } = deposit(s, { amount: 200, method: 'debit_card' });
    expect(depositFee(200, 'debit_card')).toBe(3);
    expect(result.feeTransaction?.amount).toBe(3);
    expect(state.wallet.balances.USD).toBe(25_197);
  });

  it('rejects zero, negative and non-numeric amounts', () => {
    const s = fresh();
    expectDemoError(() => deposit(s, { amount: 0, method: 'bank_transfer' }), 'INVALID_AMOUNT');
    expectDemoError(() => deposit(s, { amount: -10, method: 'bank_transfer' }), 'INVALID_AMOUNT');
    expectDemoError(() => deposit(s, { amount: Number.NaN, method: 'bank_transfer' }), 'INVALID_AMOUNT');
    expectDemoError(() => deposit(s, { amount: 10.123, method: 'bank_transfer' }), 'INVALID_AMOUNT');
  });

  it('uses decimal-safe arithmetic', () => {
    let s = fresh();
    s = { ...s, wallet: { ...s.wallet, balances: { ...s.wallet.balances, USD: 0.1 } } };
    s = deposit(s, { amount: 0.2, method: 'bank_transfer' }).state;
    expect(s.wallet.balances.USD).toBe(0.3);
    expect(addMoney(0.1, 0.2)).toBe(0.3);
  });
});

describe('withdrawals', () => {
  it('deducts amount plus fee and starts processing', () => {
    const s = fresh();
    const { state, result } = withdraw(s, { amount: 100, bankAccountId: 'bank_seed_us_checking', speed: 'standard' }, { now: NOW });
    expect(withdrawalFee(100, 'standard')).toBe(1.5);
    expect(state.wallet.balances.USD).toBe(25_000 - 101.5);
    expect(result.transaction.status).toBe('processing');
    expect(result.feeTransaction?.category).toBe('fee');
  });

  it('calculates instant fees with min/max', () => {
    expect(withdrawalFee(100, 'instant')).toBe(2.5);
    expect(withdrawalFee(1000, 'instant')).toBe(15);
    expect(withdrawalFee(5000, 'instant')).toBe(25);
  });

  it('rejects insufficient balance and never goes negative', () => {
    const s = fresh();
    expectDemoError(() => withdraw(s, { amount: 24_999.5, bankAccountId: 'bank_seed_us_checking', speed: 'standard' }), 'INSUFFICIENT_FUNDS');
    expect(s.wallet.balances.USD).toBe(25_000);
  });

  it('rejects unverified accounts and amounts below the minimum', () => {
    const s = fresh();
    expectDemoError(() => withdraw(s, { amount: 100, bankAccountId: 'bank_seed_us_savings', speed: 'standard' }), 'INVALID_STATE');
    expectDemoError(() => withdraw(s, { amount: 5, bankAccountId: 'bank_seed_us_checking', speed: 'standard' }), 'INVALID_AMOUNT');
  });

  it('settles after the simulated settlement time and can be cancelled before', () => {
    const s = fresh();
    const { state, result } = withdraw(s, { amount: 100, bankAccountId: 'bank_seed_us_checking', speed: 'standard' }, { now: NOW });
    const settled = settlePending(state, { now: NOW + 10 * 60_000 }).state;
    expect(settled.transactions.find((t) => t.id === result.transaction.id)?.status).toBe('completed');
    const cancelled = cancelTransaction(state, result.transaction.id).state;
    expect(cancelled.wallet.balances.USD).toBe(25_000);
    expect(cancelled.transactions.find((t) => t.id === result.transaction.id)?.status).toBe('cancelled');
  });
});

describe('transfers', () => {
  it('charges external transfer fees only', () => {
    expect(transferFee(100, 'novafin')).toBe(0);
    expect(transferFee(100, 'external')).toBe(1);
    expect(transferFee(1000, 'external')).toBe(5);
    expect(transferFee(10_000, 'external')).toBe(15);
    const s = fresh();
    const r = transfer(s, { recipientId: 'rcp_liam', amount: 100, currency: 'USD' });
    expect(r.state.wallet.balances.USD).toBe(24_899);
  });

  it('rejects transfers above the available balance', () => {
    const s = fresh();
    expectDemoError(() => transfer(s, { recipientId: 'rcp_sofia', amount: 5000, currency: 'EUR' }), 'INSUFFICIENT_FUNDS');
  });
});

describe('currency exchange', () => {
  it('matches the documented example: $100 → ₹8,415 at 85 with 1% fee', () => {
    const q = quoteExchange('USD', 'INR', 100);
    expect(q.rate).toBe(85);
    expect(q.fee).toBe(1);
    expect(q.convertedAmount).toBe(99);
    expect(q.toAmount).toBe(8415);
  });

  it('debits the source and credits the destination', () => {
    const s = fresh();
    const inrBefore = s.wallet.balances.INR;
    const { state, result } = exchange(s, { from: 'USD', to: 'INR', amount: 100 });
    expect(state.wallet.balances.USD).toBe(24_900);
    expect(state.wallet.balances.INR).toBe(addMoney(inrBefore, 8415));
    expect(result.record.toAmount).toBe(8415);
    expect(state.exchangeHistory[0].id).toBe(result.record.id);
  });

  it('computes inverse cross rates consistently', () => {
    expect(getRate('INR', 'USD')).toBeCloseTo(1 / 85, 6);
    expect(getRate('EUR', 'GBP')).toBeCloseTo(0.79 / 0.92, 6);
  });

  it('rejects same-currency and insufficient exchanges', () => {
    const s = fresh();
    expectDemoError(() => exchange(s, { from: 'USD', to: 'USD', amount: 10 }), 'VALIDATION_ERROR');
    expectDemoError(() => exchange(s, { from: 'GBP', to: 'USD', amount: 10_000 }), 'INSUFFICIENT_FUNDS');
  });
});

describe('paper trading', () => {
  it('calculates buy cost, fee and updates holdings', () => {
    const s = fresh();
    const { state, result } = buyStock(s, { symbol: 'TSLA', quantity: 2, price: 250 });
    expect(tradeFee(500)).toBe(0.5);
    expect(result.order.value).toBe(500);
    expect(result.order.fee).toBe(0.5);
    expect(state.wallet.balances.USD).toBe(24_499.5);
    const h = state.portfolio.find((p) => p.symbol === 'TSLA')!;
    expect(h.shares).toBe(2);
    expect(h.avgPrice).toBe(250);
    expect(h.costBasis).toBe(500);
  });

  it('supports fractional shares and recalculates average price', () => {
    let s = fresh();
    s = buyStock(s, { symbol: 'TSLA', quantity: 1.5, price: 200 }).state;
    s = buyStock(s, { symbol: 'TSLA', quantity: 0.5, price: 300 }).state;
    const h = s.portfolio.find((p) => p.symbol === 'TSLA')!;
    expect(h.shares).toBe(2);
    expect(h.costBasis).toBe(450);
    expect(h.avgPrice).toBe(225);
  });

  it('rejects buys with insufficient cash', () => {
    const s = fresh();
    expectDemoError(() => buyStock(s, { symbol: 'BKNG', quantity: 6, price: 4850 }), 'INSUFFICIENT_FUNDS');
  });

  it('sells shares, credits proceeds and computes realized P/L', () => {
    let s = fresh();
    s = buyStock(s, { symbol: 'TSLA', quantity: 4, price: 200 }).state;
    const cashBefore = s.wallet.balances.USD;
    const { state, result } = sellStock(s, { symbol: 'TSLA', quantity: 1, price: 260 });
    expect(result.order.realizedPnl).toBe(60);
    expect(result.order.fee).toBe(0.26);
    expect(state.wallet.balances.USD).toBe(addMoney(cashBefore, 259.74));
    const h = state.portfolio.find((p) => p.symbol === 'TSLA')!;
    expect(h.shares).toBe(3);
    expect(h.costBasis).toBe(600);
    expect(h.avgPrice).toBe(200);
  });

  it('closes the position when selling all shares', () => {
    let s = fresh();
    s = buyStock(s, { symbol: 'TSLA', quantity: 0.333333, price: 300 }).state;
    s = sellStock(s, { symbol: 'TSLA', quantity: 0.333333, price: 150 }).state;
    expect(s.portfolio.find((p) => p.symbol === 'TSLA')).toBeUndefined();
    expect(s.orders[0].realizedPnl).toBe(-50);
  });

  it('rejects selling more shares than owned', () => {
    const s = fresh();
    expectDemoError(() => sellStock(s, { symbol: 'TSLA', quantity: 1, price: 250 }), 'INSUFFICIENT_SHARES');
    const aapl = s.portfolio.find((p) => p.symbol === 'AAPL')!;
    expectDemoError(() => sellStock(s, { symbol: 'AAPL', quantity: aapl.shares + 1, price: 200 }), 'INSUFFICIENT_SHARES');
  });

  it('rejects invalid quantities and unknown symbols', () => {
    const s = fresh();
    expectDemoError(() => buyStock(s, { symbol: 'AAPL', quantity: 0, price: 200 }), 'INVALID_AMOUNT');
    expectDemoError(() => buyStock(s, { symbol: 'AAPL', quantity: -1, price: 200 }), 'INVALID_AMOUNT');
    expectDemoError(() => buyStock(s, { symbol: 'NOPE', quantity: 1, price: 200 }), 'NOT_FOUND');
  });
});

describe('QR payments', () => {
  it('round-trips a valid payload', () => {
    const req = buildMerchantRequest(0, NOW);
    const parsed = parseQrPayload(encodeQrPayload(req));
    expect(parsed.ok).toBe(true);
  });

  it('rejects malformed, unknown and tampered payloads', () => {
    expect(parseQrPayload('hello world').ok).toBe(false);
    expect(parseQrPayload('{"type":"upi","amount":5}').ok).toBe(false);
    expect(parseQrPayload('upi://pay?pa=someone@bank&am=10').ok).toBe(false);
    const payload = JSON.parse(encodeQrPayload(buildMerchantRequest(0, NOW)));
    payload.amount = 9999;
    const tampered = parseQrPayload(JSON.stringify(payload));
    expect(tampered.ok).toBe(false);
    const extra = JSON.parse(encodeQrPayload(buildMerchantRequest(0, NOW)));
    extra.injected = true;
    expect(parseQrPayload(JSON.stringify(extra)).ok).toBe(false);
  });

  it('pays only once — replaying the same request is blocked', () => {
    const s = fresh();
    const raw = encodeQrPayload(buildMerchantRequest(1, NOW));
    const { state } = payQr(s, raw, { now: NOW });
    expect(state.wallet.balances.USD).toBe(25_000 - 42.3);
    expectDemoError(() => payQr(state, raw, { now: NOW }), 'DUPLICATE_PAYMENT');
  });

  it('rejects expired requests, self-payments and insufficient balances', () => {
    const s = fresh();
    const raw = encodeQrPayload(buildMerchantRequest(0, NOW, 1));
    expectDemoError(() => payQr(s, raw, { now: NOW + 3 * 60_000 }), 'QR_EXPIRED');
    const own = createQrRequest(s, { amount: 10, currency: 'USD' });
    expectDemoError(() => payQr(own.state, own.result.payload), 'QR_SELF_PAYMENT');
    const broke = { ...s, wallet: { ...s.wallet, balances: { ...s.wallet.balances, USD: 1 } } };
    expectDemoError(() => payQr(broke, encodeQrPayload(buildMerchantRequest(0, Date.now()))), 'INSUFFICIENT_FUNDS');
  });

  it('simulates an incoming payment once', () => {
    const s = fresh();
    const { state, result } = createQrRequest(s, { amount: 25, currency: 'USD', note: 'Pizza' });
    const paid = simulateIncomingQrPayment(state, result.request.id, 'Test Payer');
    expect(paid.state.wallet.balances.USD).toBe(25_025);
    expectDemoError(() => simulateIncomingQrPayment(paid.state, result.request.id), 'DUPLICATE_PAYMENT');
  });
});

describe('watchlist alerts', () => {
  it('fires a notification when a threshold is crossed', () => {
    let s = fresh();
    s = setWatchlistAlert(s, 'MSFT', { above: 500 }, 430).state;
    const before = s.notifications.length;
    const r = checkWatchlistAlerts(s, { MSFT: 505 });
    expect(r.result).toHaveLength(1);
    expect(r.state.notifications.length).toBe(before + 1);
    // no duplicate alert while staying above
    const again = checkWatchlistAlerts(r.state, { MSFT: 506 });
    expect(again.result).toHaveLength(0);
  });
});
