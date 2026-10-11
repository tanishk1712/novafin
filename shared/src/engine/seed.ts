import type {
  AppNotification,
  BankAccount,
  CurrencyCode,
  DemoSettings,
  DemoState,
  QrPaymentRequest,
  Recipient,
  Transaction,
  WatchlistItem,
} from '../types';
import { CURRENCY_CODES } from '../types';
import { createIdGenerator } from '../ids';
import { mulberry32 } from '../random';
import { roundShares, div, sub, roundMoney } from '../money';
import { STOCKS_BY_SYMBOL } from '../market/stocks.seed';
import {
  buyStock,
  createQrRequest,
  deposit,
  exchange,
  payQr,
  sellStock,
  simulateIncomingQrPayment,
  transfer,
  withdraw,
  type OpContext,
} from './operations';
import { encodeQrPayload } from './qr';
import type { FundingMethod, WithdrawalSpeed } from './fees';

/**
 * Builds the initial DEMO account.
 *
 * Seed history is produced by replaying a scripted list of operations through
 * the same engine functions the UI uses, so every balance, holding and
 * transaction is internally consistent. The size of the opening deposit is
 * solved so the account ends with exactly $25,000.00 of available USD cash and
 * ≈ $8,500 of invested stock value at seed prices.
 */

export const SCHEMA_VERSION = 1;
export const INITIAL_USD_CASH = 25_000;
export const INITIAL_INVESTED_TARGET = 8_500;

const DAY = 86_400_000;

export const DEFAULT_SETTINGS: DemoSettings = {
  displayCurrency: 'USD',
  secondaryCurrency: 'INR',
  marketSimulation: true,
  marketTickMs: 7000,
  notifyTransactions: true,
  notifyMarket: true,
  notifySecurity: true,
  settlementSeconds: 45,
  hideBalances: false,
};

/** Fictional bank names used by the demo (no real institutions). */
export const DEMO_BANKS: Record<string, string[]> = {
  US: ['Liberty National Bank', 'Pacific Crest Bank', 'Summit Federal Credit Union', 'Harborview Savings Bank'],
  IN: ['Bharat Union Bank', 'Deccan Cooperative Bank', 'Indus Valley Bank', 'Kaveri Gramin Bank'],
  GB: ['Thames & Mercer Bank', 'Highland Building Society'],
  EU: ['Rhine Atlantic Bank', 'Banca Lumen'],
  AE: ['Gulf Horizon Bank'],
  CA: ['Northern Maple Bank'],
  AU: ['Coral Coast Bank'],
  SG: ['Lion City Bank'],
  JP: ['Sakura Heights Bank'],
  CH: ['Alpenrose Privatbank'],
};

export const DEMO_COUNTRIES: { code: string; name: string; currency: CurrencyCode }[] = [
  { code: 'US', name: 'United States', currency: 'USD' },
  { code: 'IN', name: 'India', currency: 'INR' },
  { code: 'GB', name: 'United Kingdom', currency: 'GBP' },
  { code: 'EU', name: 'Eurozone', currency: 'EUR' },
  { code: 'AE', name: 'United Arab Emirates', currency: 'AED' },
  { code: 'CA', name: 'Canada', currency: 'CAD' },
  { code: 'AU', name: 'Australia', currency: 'AUD' },
  { code: 'SG', name: 'Singapore', currency: 'SGD' },
  { code: 'JP', name: 'Japan', currency: 'JPY' },
  { code: 'CH', name: 'Switzerland', currency: 'CHF' },
];

/** Demo merchants whose QR codes the user can scan/upload to test payments. */
export const DEMO_MERCHANTS = [
  { walletId: 'NVF-1001-2002', name: 'Blue Lantern Café', amount: 6.75, currency: 'USD' as CurrencyCode, note: 'Oat latte + croissant' },
  { walletId: 'NVF-3141-5926', name: 'Green Leaf Market', amount: 42.3, currency: 'USD' as CurrencyCode, note: 'Weekly groceries' },
  { walletId: 'NVF-2718-2818', name: 'Chai Point Express', amount: 250, currency: 'INR' as CurrencyCode, note: 'Masala chai x2' },
  { walletId: 'NVF-1618-0339', name: 'Metro Bike Share', amount: 12, currency: 'USD' as CurrencyCode, note: 'Day pass' },
];

/** Builds a merchant payment request valid for `minutes` from `now`. */
export function buildMerchantRequest(index: number, now = Date.now(), minutes = 24 * 60): QrPaymentRequest {
  const m = DEMO_MERCHANTS[index % DEMO_MERCHANTS.length];
  const span = minutes * 60_000;
  const bucket = Math.floor(now / span);
  const start = bucket * span;
  return {
    id: `QR-MERCH${index}${bucket.toString(36).toUpperCase()}`.slice(0, 23),
    walletId: m.walletId,
    payeeName: m.name,
    amount: m.amount,
    currency: m.currency,
    note: m.note,
    createdAt: new Date(start).toISOString(),
    expiresAt: new Date(start + 2 * span).toISOString(),
    status: 'open',
  };
}

function emptyBalances(): Record<CurrencyCode, number> {
  return Object.fromEntries(CURRENCY_CODES.map((c) => [c, 0])) as Record<CurrencyCode, number>;
}

function baseState(now: number): DemoState {
  const created = new Date(now - 160 * DAY).toISOString();
  const bankAccounts: BankAccount[] = [
    {
      id: 'bank_seed_us_checking',
      nickname: 'Everyday Checking',
      bankName: 'Liberty National Bank',
      holderName: 'Alex Morgan',
      country: 'US',
      currency: 'USD',
      accountType: 'checking',
      last4: '4821',
      routingLabel: 'ACH routing',
      routingMasked: '••••••021',
      isDefault: true,
      verification: 'verified',
      addedAt: created,
    },
    {
      id: 'bank_seed_in_savings',
      nickname: 'Family Savings (India)',
      bankName: 'Bharat Union Bank',
      holderName: 'Alex Morgan',
      country: 'IN',
      currency: 'INR',
      accountType: 'savings',
      last4: '7730',
      routingLabel: 'IFSC',
      routingMasked: '••••••0412',
      isDefault: false,
      verification: 'verified',
      addedAt: new Date(now - 150 * DAY).toISOString(),
    },
    {
      id: 'bank_seed_us_savings',
      nickname: 'Rainy-day Savings',
      bankName: 'Pacific Crest Bank',
      holderName: 'Alex Morgan',
      country: 'US',
      currency: 'USD',
      accountType: 'savings',
      last4: '3319',
      routingLabel: 'ACH routing',
      routingMasked: '••••••118',
      isDefault: false,
      verification: 'pending',
      addedAt: new Date(now - 4 * DAY).toISOString(),
    },
  ];
  const recipients: Recipient[] = [
    { id: 'rcp_priya', name: 'Priya Sharma', handle: '@priya.sharma', kind: 'novafin', country: 'IN', currency: 'USD', avatarColor: '#8b5cf6' },
    { id: 'rcp_liam', name: 'Liam Carter', handle: 'liam.carter@example.com', kind: 'external', country: 'US', currency: 'USD', avatarColor: '#0ea5e9' },
    { id: 'rcp_sofia', name: 'Sofia Rossi', handle: '@sofia.rossi', kind: 'novafin', country: 'EU', currency: 'EUR', avatarColor: '#14b8a6' },
    { id: 'rcp_daniel', name: 'Daniel Kim', handle: '@dkim', kind: 'novafin', country: 'US', currency: 'USD', avatarColor: '#f59e0b' },
    { id: 'rcp_aisha', name: 'Aisha Khan', handle: 'AE07 0331 •••• 4421', kind: 'external', country: 'AE', currency: 'AED', avatarColor: '#ec4899' },
    { id: 'rcp_oliver', name: 'Oliver Brown', handle: 'GB33 TMBK •••• 9910', kind: 'external', country: 'GB', currency: 'GBP', avatarColor: '#22c55e' },
  ];
  const watchSymbols = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMZN', 'META', 'GOOGL', 'AMD', 'PLTR', 'NFLX', 'JPM', 'V', 'COIN', 'LLY', 'SPY', 'QQQ'];
  const watchlist: WatchlistItem[] = watchSymbols.map((symbol, i) => {
    const price = STOCKS_BY_SYMBOL[symbol].price;
    const item: WatchlistItem = { symbol, addedAt: new Date(now - (60 - i * 3) * DAY).toISOString() };
    if (symbol === 'NVDA') return { ...item, alertAbove: roundMoney(price * 1.01), lastAlertState: 'inside' };
    if (symbol === 'TSLA') return { ...item, alertBelow: roundMoney(price * 0.985), lastAlertState: 'inside' };
    if (symbol === 'AAPL') return { ...item, alertAbove: roundMoney(price * 1.02), alertBelow: roundMoney(price * 0.98), lastAlertState: 'inside' };
    return item;
  });
  return {
    schemaVersion: SCHEMA_VERSION,
    user: {
      id: 'usr_demo_alex',
      name: 'Alex Morgan',
      email: 'alex.morgan@demo.novafin.app',
      walletId: 'NVF-4821-7730',
      createdAt: created,
      onboarded: false,
      tier: 'Nova Plus (Demo)',
    },
    wallet: { id: 'wal_demo_primary', balances: emptyBalances() },
    bankAccounts,
    recipients,
    transactions: [],
    portfolio: [],
    orders: [],
    watchlist,
    notifications: [],
    exchangeHistory: [],
    qr: { requests: [], paidRequestIds: [] },
    settings: { ...DEFAULT_SETTINGS },
  };
}

type Event =
  | { d: number; h: number; kind: 'deposit'; amount: number | 'OPENING'; method: FundingMethod }
  | { d: number; h: number; kind: 'withdraw'; amount: number; bank: string; speed: WithdrawalSpeed }
  | { d: number; h: number; kind: 'transfer'; amount: number; currency: CurrencyCode; recipient: string; note?: string }
  | { d: number; h: number; kind: 'exchange'; amount: number; from: CurrencyCode; to: CurrencyCode }
  | { d: number; h: number; kind: 'buy'; symbol: string; shares: number | { target: number; fraction: number } }
  | { d: number; h: number; kind: 'sell'; symbol: string; shares: number }
  | { d: number; h: number; kind: 'qr_out'; merchant: number }
  | { d: number; h: number; kind: 'qr_in'; amount: number; payer: string; note: string };

/** Target dollar value of each seeded holding at seed prices (sums to $8,500). */
const HOLDING_TARGETS: Record<string, number> = { AAPL: 2000, MSFT: 1500, NVDA: 1500, VOO: 2000, JPM: 800, KO: 700 };

const EVENTS: Event[] = [
  { d: 152, h: 10, kind: 'deposit', amount: 'OPENING', method: 'bank_transfer' },
  { d: 148, h: 14, kind: 'exchange', amount: 1200, from: 'USD', to: 'INR' },
  { d: 140, h: 11, kind: 'transfer', amount: 75, currency: 'USD', recipient: 'rcp_priya', note: 'Dinner split' },
  { d: 125, h: 9, kind: 'deposit', amount: 2500, method: 'debit_card' },
  { d: 112, h: 16, kind: 'withdraw', amount: 400, bank: 'bank_seed_us_checking', speed: 'standard' },
  { d: 104, h: 13, kind: 'transfer', amount: 200, currency: 'USD', recipient: 'rcp_liam', note: 'Concert tickets' },
  { d: 96, h: 10, kind: 'exchange', amount: 800, from: 'USD', to: 'EUR' },
  { d: 88, h: 15, kind: 'buy', symbol: 'AAPL', shares: { target: HOLDING_TARGETS.AAPL, fraction: 0.6 } },
  { d: 87, h: 15, kind: 'buy', symbol: 'MSFT', shares: { target: HOLDING_TARGETS.MSFT, fraction: 1 } },
  { d: 86, h: 11, kind: 'deposit', amount: 500, method: 'apple_pay' },
  { d: 84, h: 12, kind: 'buy', symbol: 'CRWD', shares: 3 },
  { d: 82, h: 18, kind: 'transfer', amount: 45.5, currency: 'USD', recipient: 'rcp_daniel', note: 'Coffee beans' },
  { d: 78, h: 10, kind: 'withdraw', amount: 1000, bank: 'bank_seed_us_checking', speed: 'instant' },
  { d: 74, h: 14, kind: 'buy', symbol: 'VOO', shares: { target: HOLDING_TARGETS.VOO, fraction: 0.6 } },
  { d: 70, h: 15, kind: 'buy', symbol: 'META', shares: 1.5 },
  { d: 66, h: 19, kind: 'qr_out', merchant: 0 },
  { d: 61, h: 9, kind: 'deposit', amount: 3000, method: 'bank_transfer' },
  { d: 58, h: 11, kind: 'buy', symbol: 'NVDA', shares: { target: HOLDING_TARGETS.NVDA, fraction: 1 } },
  { d: 55, h: 16, kind: 'transfer', amount: 300, currency: 'EUR', recipient: 'rcp_sofia', note: 'Rome apartment deposit' },
  { d: 52, h: 12, kind: 'exchange', amount: 300, from: 'USD', to: 'GBP' },
  { d: 50, h: 13, kind: 'buy', symbol: 'AMD', shares: 4 },
  { d: 47, h: 10, kind: 'deposit', amount: 500, method: 'bank_transfer' },
  { d: 44, h: 15, kind: 'buy', symbol: 'JPM', shares: { target: HOLDING_TARGETS.JPM, fraction: 1 } },
  { d: 41, h: 17, kind: 'withdraw', amount: 120, bank: 'bank_seed_us_checking', speed: 'standard' },
  { d: 38, h: 14, kind: 'sell', symbol: 'CRWD', shares: 3 },
  { d: 35, h: 12, kind: 'qr_out', merchant: 1 },
  { d: 33, h: 18, kind: 'transfer', amount: 60, currency: 'USD', recipient: 'rcp_priya', note: 'Birthday gift' },
  { d: 30, h: 10, kind: 'buy', symbol: 'KO', shares: { target: HOLDING_TARGETS.KO, fraction: 1 } },
  { d: 28, h: 11, kind: 'exchange', amount: 100, from: 'USD', to: 'INR' },
  { d: 26, h: 15, kind: 'withdraw', amount: 15000, bank: 'bank_seed_in_savings', speed: 'standard' },
  { d: 24, h: 13, kind: 'qr_in', amount: 60, payer: 'Daniel Kim', note: 'Board game night' },
  { d: 22, h: 15, kind: 'sell', symbol: 'META', shares: 1.5 },
  { d: 20, h: 12, kind: 'buy', symbol: 'AAPL', shares: { target: HOLDING_TARGETS.AAPL, fraction: 0.4 } },
  { d: 18, h: 16, kind: 'transfer', amount: 125, currency: 'USD', recipient: 'rcp_daniel', note: 'Ski trip fuel' },
  { d: 16, h: 9, kind: 'deposit', amount: 1500, method: 'wire' },
  { d: 14, h: 10, kind: 'buy', symbol: 'VOO', shares: { target: HOLDING_TARGETS.VOO, fraction: 0.4 } },
  { d: 12, h: 14, kind: 'exchange', amount: 200, from: 'EUR', to: 'USD' },
  { d: 10, h: 15, kind: 'sell', symbol: 'AMD', shares: 4 },
  { d: 9, h: 19, kind: 'qr_out', merchant: 3 },
  { d: 7, h: 11, kind: 'transfer', amount: 150, currency: 'GBP', recipient: 'rcp_oliver', note: 'London flat share' },
  { d: 5, h: 10, kind: 'withdraw', amount: 250, bank: 'bank_seed_us_checking', speed: 'standard' },
  { d: 3, h: 9, kind: 'deposit', amount: 750, method: 'bank_transfer' },
  { d: 2, h: 13, kind: 'qr_in', amount: 32.5, payer: 'Priya Sharma', note: 'Movie tickets' },
  { d: 1, h: 18, kind: 'transfer', amount: 40, currency: 'USD', recipient: 'rcp_daniel', note: 'Lunch' },
  { d: 0, h: -2, kind: 'withdraw', amount: 180, bank: 'bank_seed_us_checking', speed: 'standard' },
  { d: 0, h: -1, kind: 'transfer', amount: 95, currency: 'USD', recipient: 'rcp_liam', note: 'Shared utilities' },
];

function eventTime(now: number, e: Event): number {
  if (e.d === 0) return now + e.h * 3_600_000;
  const t = new Date(now - e.d * DAY);
  t.setHours(e.h, (e.d * 7) % 60, 0, 0);
  return t.getTime();
}

/** Historical seed price for a symbol `d` calendar days ago (from the 90-day synthetic history). */
function historicalPrice(symbol: string, d: number): number {
  const s = STOCKS_BY_SYMBOL[symbol];
  const tradingAgo = Math.round((d * 5) / 7);
  const idx = Math.max(0, s.history.length - 1 - tradingAgo);
  return s.history[idx].p;
}

function sharesFor(symbol: string, spec: number | { target: number; fraction: number }): number {
  if (typeof spec === 'number') return spec;
  const total = roundShares(div(spec.target, STOCKS_BY_SYMBOL[symbol].price));
  if (spec.fraction >= 1) return total;
  // split the target across tranches; second tranche gets the remainder
  const first = roundShares(total * 0.6);
  return spec.fraction === 0.6 ? first : roundShares(sub(total, first));
}

function replay(now: number, openingDeposit: number): DemoState {
  const rand = mulberry32(20260101);
  const ids = createIdGenerator(rand);
  let state = baseState(now);
  for (const e of EVENTS) {
    const ts = eventTime(now, e);
    const ctx: OpContext = { now: ts, ids, source: 'seed', silent: true };
    switch (e.kind) {
      case 'deposit':
        state = deposit(state, { amount: e.amount === 'OPENING' ? openingDeposit : e.amount, method: e.method }, ctx).state;
        break;
      case 'withdraw':
        state = withdraw(state, { amount: e.amount, bankAccountId: e.bank, speed: e.speed }, ctx).state;
        break;
      case 'transfer':
        state = transfer(state, { recipientId: e.recipient, amount: e.amount, currency: e.currency, note: e.note }, ctx).state;
        break;
      case 'exchange':
        state = exchange(state, { from: e.from, to: e.to, amount: e.amount }, ctx).state;
        break;
      case 'buy':
        state = buyStock(state, { symbol: e.symbol, quantity: sharesFor(e.symbol, e.shares), price: historicalPrice(e.symbol, e.d) }, ctx).state;
        break;
      case 'sell':
        state = sellStock(state, { symbol: e.symbol, quantity: e.shares, price: historicalPrice(e.symbol, e.d) }, ctx).state;
        break;
      case 'qr_out': {
        const req = buildMerchantRequest(e.merchant, ts, 30);
        state = payQr(state, encodeQrPayload(req), ctx).state;
        break;
      }
      case 'qr_in': {
        const { state: s1, result } = createQrRequest(state, { amount: e.amount, currency: 'USD', note: e.note, expiresInMinutes: 60 }, ctx);
        state = simulateIncomingQrPayment(s1, result.request.id, e.payer, { ...ctx, now: ts + 5 * 60_000 }).state;
        break;
      }
    }
  }
  return state;
}

function seedNotifications(now: number): AppNotification[] {
  const items: [number, AppNotification['type'], string, string, boolean, string?][] = [
    [0.02, 'transaction', 'Withdrawal requested', '$180.00 demo withdrawal to Liberty National Bank •••• 4821 is processing.', false, '/transactions'],
    [0.03, 'transaction', 'Transfer processing', 'Your simulated transfer of $95.00 to Liam Carter is processing.', false, '/transactions'],
    [0.2, 'market', 'NVDA watchlist alert', 'Your NVDA watchlist price increased 2.4% today (simulated).', false, '/market/NVDA'],
    [0.6, 'market', 'Portfolio update', 'Your portfolio value changed by +1.1% since yesterday (simulated).', false, '/portfolio'],
    [1.1, 'system', 'Weekly summary ready', 'Your weekly portfolio summary is available in Analytics.', false, '/analytics'],
    [2, 'transaction', 'QR payment received', 'Priya Sharma paid your $32.50 QR request.', true, '/qr-payments'],
    [3, 'transaction', 'Deposit completed', '$750.00 demo deposit received.', true, '/transactions'],
    [5, 'transaction', 'Withdrawal completed', '$250.00 demo withdrawal processed.', true, '/transactions'],
    [10, 'transaction', 'Sell order completed', 'Your AMD paper-trading sell order was completed.', true, '/orders'],
    [12, 'transaction', 'Currency exchange completed', 'Currency exchange completed successfully: €200.00 → USD.', true, '/exchange'],
    [14, 'transaction', 'Buy order completed', 'Your VOO paper-trading buy order was completed.', true, '/orders'],
    [20, 'transaction', 'Buy order completed', 'Your AAPL paper-trading buy order was completed.', true, '/orders'],
    [24, 'transaction', 'QR payment request created', 'A new QR payment request was created for $60.00.', true, '/qr-payments'],
    [41, 'transaction', 'Withdrawal completed', '$120.00 demo withdrawal processed.', true, '/transactions'],
    [47, 'transaction', 'Deposit completed', '$500.00 demo deposit received.', true, '/transactions'],
    [4, 'security', 'New bank account added', 'Pacific Crest Bank •••• 3319 was added and is awaiting demo verification.', false, '/bank-accounts'],
    [30, 'security', 'New sign-in', 'New demo sign-in from Chrome on Windows. If this wasn\'t you… it was, it\'s a demo.', true, '/settings'],
  ];
  return items.map(([daysAgo, type, title, message, read, link], i) => ({
    id: `ntf_seed_${String(i + 1).padStart(2, '0')}`,
    type,
    title,
    message,
    read,
    link,
    createdAt: new Date(now - daysAgo * DAY).toISOString(),
  }));
}

function rawTx(now: number, daysAgo: number, partial: Partial<Transaction> & Pick<Transaction, 'id' | 'reference' | 'category' | 'status' | 'direction' | 'amount' | 'description'>): Transaction {
  const iso = new Date(now - daysAgo * DAY).toISOString();
  return { currency: 'USD', fee: 0, createdAt: iso, updatedAt: iso, source: 'seed', ...partial };
}

/** Creates a fresh, fully consistent demo state. */
export function createSeedState(now = Date.now()): DemoState {
  const PROBE = 49_000;
  const probe = replay(now, PROBE);
  const opening = roundMoney(PROBE - (probe.wallet.balances.USD - INITIAL_USD_CASH));
  let state = replay(now, opening);

  // A few non-completed historical examples (no balance effect: failed / cancelled).
  const extras: Transaction[] = [
    rawTx(now, 57, {
      id: 'tx_seed_failed_card',
      reference: 'NVF-DEP-FAILED01',
      category: 'deposit',
      status: 'failed',
      direction: 'credit',
      amount: 900,
      description: 'Deposit via Debit card',
      counterparty: 'Debit card',
      meta: { reason: 'Card declined (simulated)' },
    }),
    rawTx(now, 31, {
      id: 'tx_seed_cancelled_wdl',
      reference: 'NVF-WDL-CANCEL01',
      category: 'withdrawal',
      status: 'cancelled',
      direction: 'debit',
      amount: 600,
      description: 'Withdrawal to Everyday Checking',
      counterparty: 'Liberty National Bank •••• 4821',
      meta: { bankAccountId: 'bank_seed_us_checking', reason: 'Cancelled by user' },
    }),
  ];

  // Make the two most recent operations still in flight so the user sees them settle live.
  const settleBase = now + 60_000;
  const lastWithdrawal = state.transactions.find((t) => t.category === 'withdrawal');
  const lastTransfer = state.transactions.find((t) => t.category === 'transfer');
  const inFlight = new Map<string, { status: Transaction['status']; settleAt: number }>();
  if (lastWithdrawal) inFlight.set(lastWithdrawal.id, { status: 'processing', settleAt: settleBase });
  if (lastTransfer) inFlight.set(lastTransfer.id, { status: 'pending', settleAt: settleBase + 30_000 });
  const transactions = [...state.transactions, ...extras]
    .map((t) => {
      const key = inFlight.has(t.id) ? t.id : t.linkedTo && inFlight.has(t.linkedTo) ? t.linkedTo : null;
      if (!key) return t;
      const f = inFlight.get(key)!;
      return { ...t, status: f.status, meta: t.category === 'fee' ? t.meta : { ...t.meta, settleAt: f.settleAt } };
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  state = {
    ...state,
    transactions,
    notifications: seedNotifications(now),
    qr: { ...state.qr, requests: state.qr.requests },
  };
  return state;
}
