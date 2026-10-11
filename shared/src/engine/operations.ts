import type {
  AppNotification,
  BankAccount,
  BankAccountType,
  CurrencyCode,
  DemoSettings,
  DemoState,
  ExchangeRecord,
  Holding,
  NotificationType,
  OperationResult,
  Order,
  QrPaymentRequest,
  Recipient,
  Transaction,
  TxCategory,
  TxDirection,
  TxStatus,
} from '../types';
import { DemoError } from '../errors';
import { defaultIds, type IdGenerator } from '../ids';
import {
  addMoney,
  div,
  gt,
  hasMaxDecimals,
  minorUnits,
  mul,
  roundMoney,
  roundPrice,
  roundShares,
  subMoney,
  sub,
  lt,
} from '../money';
import { CURRENCIES, convert, isCurrencyCode, quoteExchange, EXCHANGE_MIN_AMOUNT } from '../currencies';
import {
  FUNDING_METHODS,
  LIMITS,
  WITHDRAWAL_SPEEDS,
  depositFee,
  tradeFee,
  transferFee,
  withdrawalFee,
  type FundingMethod,
  type WithdrawalSpeed,
} from './fees';
import { encodeQrPayload, parseQrPayload, type QrPayload } from './qr';
import { STOCKS_BY_SYMBOL } from '../market/stocks.seed';

// ---------------------------------------------------------------------------
// Context & helpers
// ---------------------------------------------------------------------------

export interface OpContext {
  /** Timestamp of the operation (defaults to now). */
  now?: number;
  ids?: IdGenerator;
  source?: 'seed' | 'user';
  /** Do not generate notifications (used while building seed history). */
  silent?: boolean;
}

interface Ctx {
  now: number;
  iso: string;
  ids: IdGenerator;
  source: 'seed' | 'user';
  silent: boolean;
}

function resolve(c?: OpContext): Ctx {
  const now = c?.now ?? Date.now();
  return { now, iso: new Date(now).toISOString(), ids: c?.ids ?? defaultIds, source: c?.source ?? 'user', silent: !!c?.silent };
}

export const MAX_NOTIFICATIONS = 200;
export const MAX_TRANSACTIONS = 2000;

export function formatAmount(amount: number, currency: CurrencyCode): string {
  const info = CURRENCIES[currency];
  const digits = minorUnits(currency);
  const n = amount.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return info.symbol.length === 1 ? `${info.symbol}${n}` : `${info.symbol} ${n}`;
}

/** Validates an amount: finite, > 0, max decimals for the currency, optional max. */
export function assertAmount(amount: unknown, currency: CurrencyCode = 'USD', opts: { max?: number; min?: number; label?: string } = {}): number {
  const label = opts.label ?? 'Amount';
  if (typeof amount !== 'number' || !Number.isFinite(amount)) throw new DemoError('INVALID_AMOUNT', `${label} must be a valid number.`);
  if (amount <= 0) throw new DemoError('INVALID_AMOUNT', `${label} must be greater than zero.`);
  if (!hasMaxDecimals(amount, minorUnits(currency))) {
    throw new DemoError('INVALID_AMOUNT', `${label} can have at most ${minorUnits(currency)} decimal places for ${currency}.`);
  }
  if (opts.min !== undefined && amount < opts.min) throw new DemoError('INVALID_AMOUNT', `${label} must be at least ${formatAmount(opts.min, currency)}.`);
  if (opts.max !== undefined && amount > opts.max) throw new DemoError('LIMIT_EXCEEDED', `${label} exceeds the demo limit of ${formatAmount(opts.max, currency)}.`);
  return amount;
}

function assertCurrency(c: unknown): CurrencyCode {
  if (!isCurrencyCode(c)) throw new DemoError('VALIDATION_ERROR', 'Unsupported currency.');
  return c;
}

export function getBalance(state: DemoState, currency: CurrencyCode): number {
  return state.wallet.balances[currency] ?? 0;
}

function credit(state: DemoState, currency: CurrencyCode, amount: number): DemoState {
  const balances = { ...state.wallet.balances, [currency]: addMoney(getBalance(state, currency), amount, currency) };
  return { ...state, wallet: { ...state.wallet, balances } };
}

function debit(state: DemoState, currency: CurrencyCode, amount: number): DemoState {
  const current = getBalance(state, currency);
  if (lt(current, amount)) {
    throw new DemoError(
      'INSUFFICIENT_FUNDS',
      `Insufficient ${currency} balance. Available ${formatAmount(current, currency)}, required ${formatAmount(amount, currency)}.`,
      { available: current, required: amount },
    );
  }
  const balances = { ...state.wallet.balances, [currency]: subMoney(current, amount, currency) };
  return { ...state, wallet: { ...state.wallet, balances } };
}

interface TxInput {
  category: TxCategory;
  direction: TxDirection;
  amount: number;
  currency: CurrencyCode;
  fee?: number;
  status?: TxStatus;
  description: string;
  counterparty?: string;
  meta?: Transaction['meta'];
  linkedTo?: string;
}

function makeTx(ctx: Ctx, input: TxInput): Transaction {
  return {
    id: ctx.ids.id('tx'),
    reference: ctx.ids.reference(input.category),
    category: input.category,
    status: input.status ?? 'completed',
    direction: input.direction,
    amount: input.amount,
    currency: input.currency,
    fee: input.fee ?? 0,
    description: input.description,
    counterparty: input.counterparty,
    createdAt: ctx.iso,
    updatedAt: ctx.iso,
    source: ctx.source,
    linkedTo: input.linkedTo,
    meta: input.meta,
  };
}

function makeFeeTx(ctx: Ctx, parent: Transaction, fee: number, description: string): Transaction {
  return makeTx(ctx, {
    category: 'fee',
    direction: 'debit',
    amount: fee,
    currency: parent.currency,
    status: parent.status,
    description,
    linkedTo: parent.id,
    meta: { parentReference: parent.reference },
  });
}

function addTransactions(state: DemoState, txs: Transaction[]): DemoState {
  const transactions = [...txs, ...state.transactions].slice(0, MAX_TRANSACTIONS);
  return { ...state, transactions };
}

const SETTING_BY_TYPE: Record<NotificationType, keyof DemoSettings | null> = {
  transaction: 'notifyTransactions',
  market: 'notifyMarket',
  security: 'notifySecurity',
  system: null,
};

export function pushNotification(
  state: DemoState,
  c: OpContext | undefined,
  n: { type: NotificationType; title: string; message: string; link?: string },
): DemoState {
  const ctx = resolve(c);
  if (ctx.silent) return state;
  const settingKey = SETTING_BY_TYPE[n.type];
  if (settingKey && state.settings[settingKey] === false) return state;
  const notification: AppNotification = { id: ctx.ids.id('ntf'), createdAt: ctx.iso, read: false, ...n };
  return { ...state, notifications: [notification, ...state.notifications].slice(0, MAX_NOTIFICATIONS) };
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

export interface DepositInput {
  amount: number;
  method: FundingMethod;
  currency?: CurrencyCode;
}

export interface MoneyOpResult {
  transaction: Transaction;
  feeTransaction?: Transaction;
}

export function deposit(state: DemoState, input: DepositInput, c?: OpContext): OperationResult<MoneyOpResult> {
  const ctx = resolve(c);
  const currency = assertCurrency(input.currency ?? 'USD');
  if (!FUNDING_METHODS[input.method]) throw new DemoError('VALIDATION_ERROR', 'Select a valid funding method.');
  const limit = currency === 'USD' ? LIMITS.depositMax : convert(LIMITS.depositMax, 'USD', currency);
  const amount = assertAmount(input.amount, currency, { max: limit, label: 'Deposit amount' });
  const feeUsd = depositFee(convert(amount, currency, 'USD'), input.method);
  const fee = convert(feeUsd, 'USD', currency);
  if (!lt(fee, amount)) throw new DemoError('INVALID_AMOUNT', 'Deposit amount must be larger than the funding fee.');

  const method = FUNDING_METHODS[input.method];
  const tx = makeTx(ctx, {
    category: 'deposit',
    direction: 'credit',
    amount,
    currency,
    fee,
    description: `Deposit via ${method.label}`,
    counterparty: method.label,
    meta: { method: input.method, netCredited: subMoney(amount, fee, currency) },
  });
  let next = credit(state, currency, amount);
  const txs = [tx];
  let feeTx: Transaction | undefined;
  if (fee > 0) {
    feeTx = makeFeeTx(ctx, tx, fee, `${method.label} funding fee`);
    next = debit(next, currency, fee);
    txs.push(feeTx);
  }
  next = addTransactions(next, txs);
  next = pushNotification(next, c, {
    type: 'transaction',
    title: 'Deposit completed',
    message: `${formatAmount(amount, currency)} demo deposit received via ${method.label}.`,
    link: `/transactions/${tx.id}`,
  });
  return { state: next, result: { transaction: tx, feeTransaction: feeTx } };
}

// ---------------------------------------------------------------------------
// Withdrawals
// ---------------------------------------------------------------------------

export interface WithdrawInput {
  amount: number;
  bankAccountId: string;
  speed: WithdrawalSpeed;
}

export function quoteWithdrawal(state: DemoState, input: Partial<WithdrawInput>) {
  const account = state.bankAccounts.find((b) => b.id === input.bankAccountId);
  const currency = account?.currency ?? 'USD';
  const amount = typeof input.amount === 'number' && input.amount > 0 ? input.amount : 0;
  const speed = input.speed ?? 'standard';
  const feeUsd = amount ? withdrawalFee(convert(amount, currency, 'USD'), speed) : 0;
  const fee = convert(feeUsd, 'USD', currency);
  const total = addMoney(amount, fee, currency);
  return { account, currency, amount, fee, total, arrival: WITHDRAWAL_SPEEDS[speed].arrival, available: getBalance(state, currency) };
}

export function withdraw(state: DemoState, input: WithdrawInput, c?: OpContext): OperationResult<MoneyOpResult> {
  const ctx = resolve(c);
  const account = state.bankAccounts.find((b) => b.id === input.bankAccountId);
  if (!account) throw new DemoError('NOT_FOUND', 'Select a saved bank account.');
  if (account.verification !== 'verified') throw new DemoError('INVALID_STATE', 'This bank account must be verified before withdrawals.');
  if (!WITHDRAWAL_SPEEDS[input.speed]) throw new DemoError('VALIDATION_ERROR', 'Select a withdrawal speed.');
  const currency = account.currency;
  const min = currency === 'USD' ? LIMITS.withdrawMin : convert(LIMITS.withdrawMin, 'USD', currency);
  const max = currency === 'USD' ? LIMITS.withdrawMax : convert(LIMITS.withdrawMax, 'USD', currency);
  const amount = assertAmount(input.amount, currency, { min, max, label: 'Withdrawal amount' });
  const q = quoteWithdrawal(state, input);
  if (lt(getBalance(state, currency), q.total)) {
    throw new DemoError(
      'INSUFFICIENT_FUNDS',
      `Insufficient ${currency} balance. You need ${formatAmount(q.total, currency)} including the ${formatAmount(q.fee, currency)} fee.`,
    );
  }
  const settleMs = (input.speed === 'instant' ? 0.34 : 1) * state.settings.settlementSeconds * 1000;
  const tx = makeTx(ctx, {
    category: 'withdrawal',
    direction: 'debit',
    amount,
    currency,
    fee: q.fee,
    status: ctx.source === 'seed' ? 'completed' : 'processing',
    description: `Withdrawal to ${account.nickname}`,
    counterparty: `${account.bankName} •••• ${account.last4}`,
    meta: { bankAccountId: account.id, speed: input.speed, arrival: q.arrival, settleAt: ctx.now + settleMs },
  });
  let next = debit(state, currency, amount);
  const txs = [tx];
  let feeTx: Transaction | undefined;
  if (q.fee > 0) {
    next = debit(next, currency, q.fee);
    feeTx = makeFeeTx(ctx, tx, q.fee, `${WITHDRAWAL_SPEEDS[input.speed].label} withdrawal fee`);
    txs.push(feeTx);
  }
  next = addTransactions(next, txs);
  next = pushNotification(next, c, {
    type: 'transaction',
    title: 'Withdrawal requested',
    message: `${formatAmount(amount, currency)} demo withdrawal to ${account.bankName} •••• ${account.last4} is processing. Ref ${tx.reference}.`,
    link: `/transactions/${tx.id}`,
  });
  return { state: next, result: { transaction: tx, feeTransaction: feeTx } };
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

export interface TransferInput {
  recipientId?: string;
  newRecipient?: { name: string; handle: string; kind: 'novafin' | 'external'; country?: string };
  saveRecipient?: boolean;
  amount: number;
  currency: CurrencyCode;
  note?: string;
}

export function quoteTransfer(kind: 'novafin' | 'external', amount: number, currency: CurrencyCode) {
  const fee = amount > 0 ? transferFee(amount, kind, currency) : 0;
  return { fee, total: addMoney(amount, fee, currency) };
}

const AVATAR_COLORS = ['#6366f1', '#14b8a6', '#8b5cf6', '#0ea5e9', '#f59e0b', '#ec4899', '#22c55e'];

export function transfer(state: DemoState, input: TransferInput, c?: OpContext): OperationResult<MoneyOpResult & { recipient: Recipient }> {
  const ctx = resolve(c);
  const currency = assertCurrency(input.currency);
  let recipient: Recipient | undefined;
  let next = state;
  if (input.recipientId) {
    recipient = state.recipients.find((r) => r.id === input.recipientId);
    if (!recipient) throw new DemoError('NOT_FOUND', 'Recipient not found.');
  } else if (input.newRecipient) {
    const name = input.newRecipient.name?.trim();
    const handle = input.newRecipient.handle?.trim();
    if (!name || name.length < 2) throw new DemoError('VALIDATION_ERROR', 'Enter the recipient name.');
    if (!handle || handle.length < 3) throw new DemoError('VALIDATION_ERROR', 'Enter the recipient email, @handle or IBAN.');
    recipient = {
      id: ctx.ids.id('rcp'),
      name,
      handle,
      kind: input.newRecipient.kind,
      country: input.newRecipient.country ?? 'US',
      currency,
      avatarColor: AVATAR_COLORS[state.recipients.length % AVATAR_COLORS.length],
    };
    if (input.saveRecipient) next = { ...next, recipients: [...next.recipients, recipient] };
  } else {
    throw new DemoError('VALIDATION_ERROR', 'Choose a recipient.');
  }
  const max = currency === 'USD' ? LIMITS.transferMax : convert(LIMITS.transferMax, 'USD', currency);
  const amount = assertAmount(input.amount, currency, { max, label: 'Transfer amount' });
  const { fee, total } = quoteTransfer(recipient.kind, amount, currency);
  if (lt(getBalance(next, currency), total)) {
    throw new DemoError('INSUFFICIENT_FUNDS', `Insufficient ${currency} balance. You need ${formatAmount(total, currency)} including fees.`);
  }
  const instant = recipient.kind === 'novafin' || ctx.source === 'seed';
  const tx = makeTx(ctx, {
    category: 'transfer',
    direction: 'debit',
    amount,
    currency,
    fee,
    status: instant ? 'completed' : 'processing',
    description: `Transfer to ${recipient.name}`,
    counterparty: recipient.name,
    meta: {
      recipientId: recipient.id,
      handle: recipient.handle,
      kind: recipient.kind,
      ...(input.note ? { note: input.note.slice(0, 140) } : {}),
      ...(instant ? {} : { settleAt: ctx.now + state.settings.settlementSeconds * 1000 }),
    },
  });
  next = debit(next, currency, amount);
  const txs = [tx];
  let feeTx: Transaction | undefined;
  if (fee > 0) {
    next = debit(next, currency, fee);
    feeTx = makeFeeTx(ctx, tx, fee, 'External transfer fee');
    txs.push(feeTx);
  }
  next = addTransactions(next, txs);
  next = pushNotification(next, c, {
    type: 'transaction',
    title: instant ? 'Transfer sent' : 'Transfer processing',
    message: instant
      ? `${formatAmount(amount, currency)} sent to ${recipient.name}.`
      : `Your simulated transfer of ${formatAmount(amount, currency)} to ${recipient.name} is processing.`,
    link: `/transactions/${tx.id}`,
  });
  return { state: next, result: { transaction: tx, feeTransaction: feeTx, recipient } };
}

// ---------------------------------------------------------------------------
// Currency exchange
// ---------------------------------------------------------------------------

export interface ExchangeInput {
  from: CurrencyCode;
  to: CurrencyCode;
  amount: number;
}

export function exchange(state: DemoState, input: ExchangeInput, c?: OpContext): OperationResult<MoneyOpResult & { record: ExchangeRecord }> {
  const ctx = resolve(c);
  const from = assertCurrency(input.from);
  const to = assertCurrency(input.to);
  if (from === to) throw new DemoError('VALIDATION_ERROR', 'Choose two different currencies.');
  const min = from === 'USD' ? EXCHANGE_MIN_AMOUNT : convert(EXCHANGE_MIN_AMOUNT, 'USD', from);
  const amount = assertAmount(input.amount, from, { min, label: 'Exchange amount' });
  const q = quoteExchange(from, to, amount);
  if (q.toAmount <= 0) throw new DemoError('INVALID_AMOUNT', 'Amount is too small to convert.');
  // fee is included in the source amount: total debit = amount
  if (lt(getBalance(state, from), q.fromAmount)) {
    throw new DemoError('INSUFFICIENT_FUNDS', `Insufficient ${from} balance. Available ${formatAmount(getBalance(state, from), from)}.`);
  }
  const tx = makeTx(ctx, {
    category: 'exchange',
    direction: 'debit',
    amount: q.convertedAmount,
    currency: from,
    fee: q.fee,
    description: `Exchanged ${from} → ${to}`,
    counterparty: 'NovaFin FX (simulated)',
    meta: { toCurrency: to, toAmount: q.toAmount, rate: q.rate, fromAmount: q.fromAmount },
  });
  let next = debit(state, from, q.convertedAmount);
  const txs = [tx];
  let feeTx: Transaction | undefined;
  if (q.fee > 0) {
    next = debit(next, from, q.fee);
    feeTx = makeFeeTx(ctx, tx, q.fee, `Currency conversion fee (${q.feePercent}%)`);
    txs.push(feeTx);
  }
  next = credit(next, to, q.toAmount);
  const record: ExchangeRecord = {
    id: ctx.ids.id('fx'),
    transactionId: tx.id,
    from,
    to,
    fromAmount: q.fromAmount,
    fee: q.fee,
    rate: q.rate,
    toAmount: q.toAmount,
    createdAt: ctx.iso,
    source: ctx.source,
  };
  next = addTransactions(next, txs);
  next = { ...next, exchangeHistory: [record, ...next.exchangeHistory] };
  next = pushNotification(next, c, {
    type: 'transaction',
    title: 'Currency exchange completed',
    message: `Converted ${formatAmount(q.fromAmount, from)} to ${formatAmount(q.toAmount, to)} at ${q.rate} (simulated rate).`,
    link: `/transactions/${tx.id}`,
  });
  return { state: next, result: { transaction: tx, feeTransaction: feeTx, record } };
}

// ---------------------------------------------------------------------------
// Pending settlement & cancellation
// ---------------------------------------------------------------------------

function setStatus(state: DemoState, ids: Set<string>, status: TxStatus, iso: string): DemoState {
  return {
    ...state,
    transactions: state.transactions.map((t) =>
      ids.has(t.id) || (t.linkedTo && ids.has(t.linkedTo)) ? { ...t, status, updatedAt: iso } : t,
    ),
  };
}

/** Completes processing withdrawals/transfers whose simulated settlement time has passed. */
export function settlePending(state: DemoState, c?: OpContext): OperationResult<Transaction[]> {
  const ctx = resolve(c);
  const due = state.transactions.filter(
    (t) =>
      (t.status === 'processing' || t.status === 'pending') &&
      t.category !== 'fee' &&
      typeof t.meta?.settleAt === 'number' &&
      (t.meta.settleAt as number) <= ctx.now,
  );
  if (!due.length) return { state, result: [] };
  let next = setStatus(state, new Set(due.map((t) => t.id)), 'completed', ctx.iso);
  for (const t of due) {
    next = pushNotification(next, c, {
      type: 'transaction',
      title: t.category === 'withdrawal' ? 'Withdrawal completed' : 'Transfer completed',
      message:
        t.category === 'withdrawal'
          ? `${formatAmount(t.amount, t.currency)} demo withdrawal processed to ${t.counterparty}.`
          : `${formatAmount(t.amount, t.currency)} transfer to ${t.counterparty} has been delivered.`,
      link: `/transactions/${t.id}`,
    });
  }
  return { state: next, result: due };
}

/** Cancels a pending/processing withdrawal or transfer and refunds the amount plus fee. */
export function cancelTransaction(state: DemoState, txId: string, c?: OpContext): OperationResult<Transaction> {
  const ctx = resolve(c);
  const tx = state.transactions.find((t) => t.id === txId);
  if (!tx) throw new DemoError('NOT_FOUND', 'Transaction not found.');
  if (!['withdrawal', 'transfer'].includes(tx.category) || !['pending', 'processing'].includes(tx.status)) {
    throw new DemoError('INVALID_STATE', 'Only pending or processing withdrawals and transfers can be cancelled.');
  }
  let next = credit(state, tx.currency, addMoney(tx.amount, tx.fee, tx.currency));
  next = setStatus(next, new Set([tx.id]), 'cancelled', ctx.iso);
  next = pushNotification(next, c, {
    type: 'transaction',
    title: 'Transaction cancelled',
    message: `${tx.reference} was cancelled and ${formatAmount(addMoney(tx.amount, tx.fee, tx.currency), tx.currency)} was returned to your wallet.`,
    link: `/transactions/${tx.id}`,
  });
  return { state: next, result: next.transactions.find((t) => t.id === tx.id)! };
}

// ---------------------------------------------------------------------------
// Paper trading
// ---------------------------------------------------------------------------

export interface TradeInput {
  symbol: string;
  /** Number of shares (fractional allowed, up to 6 decimals). */
  quantity: number;
  /** Simulated market price at execution, provided by the market engine. */
  price: number;
}

export interface TradeQuote {
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  price: number;
  value: number;
  fee: number;
  /** Buy: total cash required. Sell: net proceeds credited. */
  total: number;
}

export function quoteTrade(side: 'buy' | 'sell', symbol: string, quantity: number, price: number): TradeQuote {
  const qty = Number.isFinite(quantity) && quantity > 0 ? roundShares(quantity) : 0;
  const value = roundMoney(mul(qty, price));
  const fee = qty > 0 ? tradeFee(value) : 0;
  const total = side === 'buy' ? addMoney(value, fee) : subMoney(value, fee);
  return { symbol, side, quantity: qty, price, value, fee, total };
}

/** Converts a dollar amount into a fractional share quantity at the given price. */
export function sharesForAmount(amount: number, price: number): number {
  if (!(amount > 0) || !(price > 0)) return 0;
  return roundShares(div(amount, price));
}

function validateTradeInput(input: TradeInput): { symbol: string; quantity: number; price: number } {
  const symbol = String(input.symbol ?? '').toUpperCase();
  if (!STOCKS_BY_SYMBOL[symbol]) throw new DemoError('NOT_FOUND', `Unknown symbol ${symbol || '(empty)'}.`);
  if (typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price <= 0) {
    throw new DemoError('VALIDATION_ERROR', 'A valid simulated market price is required.');
  }
  if (typeof input.quantity !== 'number' || !Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new DemoError('INVALID_AMOUNT', 'Quantity must be greater than zero.');
  }
  if (!hasMaxDecimals(input.quantity, 6)) throw new DemoError('INVALID_AMOUNT', 'Quantity can have at most 6 decimal places.');
  if (input.quantity < LIMITS.minShares) throw new DemoError('INVALID_AMOUNT', `Minimum order is ${LIMITS.minShares} shares.`);
  return { symbol, quantity: input.quantity, price: roundPrice(input.price) };
}

export interface TradeResult {
  order: Order;
  transaction: Transaction;
  feeTransaction?: Transaction;
  holding: Holding | null;
}

export function buyStock(state: DemoState, input: TradeInput, c?: OpContext): OperationResult<TradeResult> {
  const ctx = resolve(c);
  const { symbol, quantity, price } = validateTradeInput(input);
  const q = quoteTrade('buy', symbol, quantity, price);
  if (q.value > LIMITS.orderMaxValue) throw new DemoError('LIMIT_EXCEEDED', `Orders are limited to ${formatAmount(LIMITS.orderMaxValue, 'USD')} in the demo.`);
  if (q.value < 0.01) throw new DemoError('INVALID_AMOUNT', 'Order value is too small.');
  if (lt(getBalance(state, 'USD'), q.total)) {
    throw new DemoError(
      'INSUFFICIENT_FUNDS',
      `Insufficient cash. Order requires ${formatAmount(q.total, 'USD')}, available ${formatAmount(getBalance(state, 'USD'), 'USD')}.`,
    );
  }
  const existing = state.portfolio.find((h) => h.symbol === symbol);
  const shares = roundShares(addShares(existing?.shares ?? 0, q.quantity));
  const costBasis = addMoney(existing?.costBasis ?? 0, q.value);
  const holding: Holding = {
    symbol,
    shares,
    costBasis,
    avgPrice: averagePrice(costBasis, shares),
    realizedPnl: existing?.realizedPnl ?? 0,
    openedAt: existing?.openedAt ?? ctx.iso,
  };
  const name = STOCKS_BY_SYMBOL[symbol].name;
  const tx = makeTx(ctx, {
    category: 'stock_buy',
    direction: 'debit',
    amount: q.value,
    currency: 'USD',
    fee: q.fee,
    description: `Bought ${q.quantity} ${symbol}`,
    counterparty: name,
    meta: { symbol, quantity: q.quantity, price },
  });
  const order: Order = {
    id: ctx.ids.id('ord'),
    reference: ctx.ids.reference('ORD'),
    symbol,
    side: 'buy',
    type: 'market',
    quantity: q.quantity,
    price,
    value: q.value,
    fee: q.fee,
    status: 'filled',
    createdAt: ctx.iso,
    transactionId: tx.id,
    source: ctx.source,
  };
  tx.meta = { ...tx.meta, orderId: order.id };
  let next = debit(state, 'USD', q.value);
  const txs = [tx];
  let feeTx: Transaction | undefined;
  if (q.fee > 0) {
    next = debit(next, 'USD', q.fee);
    feeTx = makeFeeTx(ctx, tx, q.fee, `Trading commission · ${symbol}`);
    txs.push(feeTx);
  }
  next = addTransactions(next, txs);
  const portfolio = existing ? next.portfolio.map((h) => (h.symbol === symbol ? holding : h)) : [...next.portfolio, holding];
  next = { ...next, portfolio, orders: [order, ...next.orders] };
  next = pushNotification(next, c, {
    type: 'transaction',
    title: 'Buy order completed',
    message: `Your ${symbol} paper-trading buy order was completed: ${q.quantity} shares at ${formatAmount(price, 'USD')}.`,
    link: `/market/${symbol}`,
  });
  return { state: next, result: { order, transaction: tx, feeTransaction: feeTx, holding } };
}

export function sellStock(state: DemoState, input: TradeInput, c?: OpContext): OperationResult<TradeResult> {
  const ctx = resolve(c);
  const { symbol, quantity, price } = validateTradeInput(input);
  const existing = state.portfolio.find((h) => h.symbol === symbol);
  if (!existing || existing.shares <= 0) throw new DemoError('INSUFFICIENT_SHARES', `You do not own any ${symbol} shares.`);
  if (gt(quantity, existing.shares)) {
    throw new DemoError('INSUFFICIENT_SHARES', `Insufficient shares. You own ${existing.shares} ${symbol}, tried to sell ${quantity}.`);
  }
  const q = quoteTrade('sell', symbol, quantity, price);
  const remaining = roundShares(sub(existing.shares, q.quantity));
  const closing = remaining < LIMITS.minShares / 10;
  // proportional cost basis of the sold shares
  const costPortion = closing ? existing.costBasis : roundMoney(mul(existing.costBasis, div(q.quantity, existing.shares)));
  const realizedPnl = subMoney(q.value, costPortion);
  const holding: Holding | null = closing
    ? null
    : {
        ...existing,
        shares: remaining,
        costBasis: subMoney(existing.costBasis, costPortion),
        avgPrice: existing.avgPrice,
        realizedPnl: addMoney(existing.realizedPnl, realizedPnl),
      };
  const name = STOCKS_BY_SYMBOL[symbol].name;
  const tx = makeTx(ctx, {
    category: 'stock_sell',
    direction: 'credit',
    amount: q.value,
    currency: 'USD',
    fee: q.fee,
    description: `Sold ${q.quantity} ${symbol}`,
    counterparty: name,
    meta: { symbol, quantity: q.quantity, price, realizedPnl },
  });
  const order: Order = {
    id: ctx.ids.id('ord'),
    reference: ctx.ids.reference('ORD'),
    symbol,
    side: 'sell',
    type: 'market',
    quantity: q.quantity,
    price,
    value: q.value,
    fee: q.fee,
    realizedPnl,
    status: 'filled',
    createdAt: ctx.iso,
    transactionId: tx.id,
    source: ctx.source,
  };
  tx.meta = { ...tx.meta, orderId: order.id };
  let next = credit(state, 'USD', q.value);
  const txs = [tx];
  let feeTx: Transaction | undefined;
  if (q.fee > 0) {
    next = debit(next, 'USD', q.fee);
    feeTx = makeFeeTx(ctx, tx, q.fee, `Trading commission · ${symbol}`);
    txs.push(feeTx);
  }
  next = addTransactions(next, txs);
  const portfolio = holding ? next.portfolio.map((h) => (h.symbol === symbol ? holding : h)) : next.portfolio.filter((h) => h.symbol !== symbol);
  next = { ...next, portfolio, orders: [order, ...next.orders] };
  next = pushNotification(next, c, {
    type: 'transaction',
    title: 'Sell order completed',
    message: `Sold ${q.quantity} ${symbol} at ${formatAmount(price, 'USD')}. Realized P/L ${realizedPnl >= 0 ? '+' : '−'}${formatAmount(Math.abs(realizedPnl), 'USD')}.`,
    link: `/market/${symbol}`,
  });
  return { state: next, result: { order, transaction: tx, feeTransaction: feeTx, holding } };
}

/** Realized P/L a sale would produce (same proportional cost-basis method as `sellStock`). */
export function estimateRealizedPnl(holding: Pick<Holding, 'shares' | 'costBasis'>, quantity: number, price: number): number {
  const qty = roundShares(Math.min(quantity, holding.shares));
  if (!(qty > 0) || !(holding.shares > 0)) return 0;
  const value = roundMoney(mul(qty, price));
  const closing = roundShares(sub(holding.shares, qty)) < LIMITS.minShares / 10;
  const costPortion = closing ? holding.costBasis : roundMoney(mul(holding.costBasis, div(qty, holding.shares)));
  return subMoney(value, costPortion);
}

function addShares(a: number, b: number): number {
  return roundShares(Number((a + b).toFixed(8)));
}

export function averagePrice(costBasis: number, shares: number): number {
  if (shares <= 0) return 0;
  return Math.round(div(costBasis, shares) * 10_000) / 10_000;
}

/** Records an order that the engine rejected so it shows up in order history. */
export function recordRejectedOrder(
  state: DemoState,
  input: { symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; reason: string },
  c?: OpContext,
): OperationResult<Order> {
  const ctx = resolve(c);
  const symbol = String(input.symbol ?? '').toUpperCase();
  const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? roundShares(input.quantity) : 0;
  const price = Number.isFinite(input.price) && input.price > 0 ? roundPrice(input.price) : 0;
  const order: Order = {
    id: ctx.ids.id('ord'),
    reference: ctx.ids.reference('ORD'),
    symbol,
    side: input.side,
    type: 'market',
    quantity,
    price,
    value: roundMoney(mul(quantity, price)),
    fee: 0,
    status: 'rejected',
    rejectReason: input.reason,
    createdAt: ctx.iso,
    source: ctx.source,
  };
  return { state: { ...state, orders: [order, ...state.orders] }, result: order };
}

// ---------------------------------------------------------------------------
// Bank accounts
// ---------------------------------------------------------------------------

export interface BankAccountInput {
  nickname: string;
  bankName: string;
  holderName: string;
  country: string;
  currency: CurrencyCode;
  accountType: BankAccountType;
  /** Demo account number — only the last 4 digits are kept. */
  accountNumber: string;
  /** Routing number / IFSC / sort code / IBAN — stored masked. */
  routingCode: string;
  makeDefault?: boolean;
}

export function maskTail(value: string, visible = 4): string {
  const clean = value.replace(/\s+/g, '');
  if (clean.length <= visible) return clean;
  return '•'.repeat(Math.min(clean.length - visible, 6)) + clean.slice(-visible);
}

function routingLabelFor(country: string): string {
  if (country === 'IN') return 'IFSC';
  if (country === 'US') return 'ACH routing';
  if (country === 'GB') return 'Sort code';
  return 'IBAN / SWIFT';
}

export function addBankAccount(state: DemoState, input: BankAccountInput, c?: OpContext): OperationResult<BankAccount> {
  const ctx = resolve(c);
  const digits = String(input.accountNumber ?? '').replace(/\D/g, '');
  if (digits.length < 6 || digits.length > 18) throw new DemoError('VALIDATION_ERROR', 'Account number must be 6–18 digits (demo only).');
  if (!input.bankName?.trim()) throw new DemoError('VALIDATION_ERROR', 'Choose a bank.');
  if (!input.holderName?.trim()) throw new DemoError('VALIDATION_ERROR', 'Enter the account holder name.');
  if (!input.routingCode?.trim() || input.routingCode.trim().length < 4) throw new DemoError('VALIDATION_ERROR', 'Enter a routing / IFSC / sort code.');
  const currency = assertCurrency(input.currency);
  const last4 = digits.slice(-4);
  if (state.bankAccounts.some((b) => b.bankName === input.bankName && b.last4 === last4)) {
    throw new DemoError('CONFLICT', 'This bank account is already saved.');
  }
  if (state.bankAccounts.length >= 10) throw new DemoError('LIMIT_EXCEEDED', 'You can save up to 10 demo bank accounts.');
  const makeDefault = !!input.makeDefault || state.bankAccounts.length === 0;
  const account: BankAccount = {
    id: ctx.ids.id('bank'),
    nickname: input.nickname?.trim() || `${input.bankName} ${input.accountType}`,
    bankName: input.bankName.trim(),
    holderName: input.holderName.trim(),
    country: input.country,
    currency,
    accountType: input.accountType,
    last4,
    routingLabel: routingLabelFor(input.country),
    routingMasked: maskTail(input.routingCode.trim().toUpperCase(), 3),
    isDefault: makeDefault,
    verification: 'pending',
    addedAt: ctx.iso,
  };
  const others = makeDefault ? state.bankAccounts.map((b) => ({ ...b, isDefault: false })) : state.bankAccounts;
  let next: DemoState = { ...state, bankAccounts: [...others, account] };
  next = pushNotification(next, c, {
    type: 'security',
    title: 'Bank account added',
    message: `${account.bankName} •••• ${account.last4} was added. Complete demo verification before withdrawing.`,
    link: '/bank-accounts',
  });
  return { state: next, result: account };
}

export function updateBankAccount(state: DemoState, id: string, patch: { nickname?: string }, c?: OpContext): OperationResult<BankAccount> {
  const account = state.bankAccounts.find((b) => b.id === id);
  if (!account) throw new DemoError('NOT_FOUND', 'Bank account not found.');
  const nickname = patch.nickname?.trim();
  if (nickname !== undefined && (nickname.length < 2 || nickname.length > 40)) {
    throw new DemoError('VALIDATION_ERROR', 'Nickname must be 2–40 characters.');
  }
  const updated = { ...account, ...(nickname ? { nickname } : {}) };
  void c;
  return { state: { ...state, bankAccounts: state.bankAccounts.map((b) => (b.id === id ? updated : b)) }, result: updated };
}

export function setDefaultBankAccount(state: DemoState, id: string): OperationResult<BankAccount> {
  const account = state.bankAccounts.find((b) => b.id === id);
  if (!account) throw new DemoError('NOT_FOUND', 'Bank account not found.');
  const bankAccounts = state.bankAccounts.map((b) => ({ ...b, isDefault: b.id === id }));
  return { state: { ...state, bankAccounts }, result: bankAccounts.find((b) => b.id === id)! };
}

/** Simulated micro-deposit verification. */
export function verifyBankAccount(state: DemoState, id: string, c?: OpContext): OperationResult<BankAccount> {
  const account = state.bankAccounts.find((b) => b.id === id);
  if (!account) throw new DemoError('NOT_FOUND', 'Bank account not found.');
  const updated: BankAccount = { ...account, verification: 'verified' };
  let next: DemoState = { ...state, bankAccounts: state.bankAccounts.map((b) => (b.id === id ? updated : b)) };
  next = pushNotification(next, c, {
    type: 'security',
    title: 'Bank account verified',
    message: `${account.bankName} •••• ${account.last4} passed simulated verification.`,
    link: '/bank-accounts',
  });
  return { state: next, result: updated };
}

export function removeBankAccount(state: DemoState, id: string, c?: OpContext): OperationResult<BankAccount> {
  const account = state.bankAccounts.find((b) => b.id === id);
  if (!account) throw new DemoError('NOT_FOUND', 'Bank account not found.');
  const inFlight = state.transactions.some(
    (t) => t.meta?.bankAccountId === id && (t.status === 'processing' || t.status === 'pending'),
  );
  if (inFlight) throw new DemoError('INVALID_STATE', 'This account has a withdrawal in progress. Cancel it or wait for it to complete.');
  let bankAccounts = state.bankAccounts.filter((b) => b.id !== id);
  if (account.isDefault && bankAccounts.length) bankAccounts = bankAccounts.map((b, i) => ({ ...b, isDefault: i === 0 }));
  let next: DemoState = { ...state, bankAccounts };
  next = pushNotification(next, c, {
    type: 'security',
    title: 'Bank account removed',
    message: `${account.bankName} •••• ${account.last4} was removed from your demo profile.`,
    link: '/bank-accounts',
  });
  return { state: next, result: account };
}

// ---------------------------------------------------------------------------
// Watchlist
// ---------------------------------------------------------------------------

export function addToWatchlist(state: DemoState, symbol: string, c?: OpContext): OperationResult<DemoState['watchlist']> {
  const ctx = resolve(c);
  const s = symbol.toUpperCase();
  if (!STOCKS_BY_SYMBOL[s]) throw new DemoError('NOT_FOUND', `Unknown symbol ${s}.`);
  if (state.watchlist.some((w) => w.symbol === s)) return { state, result: state.watchlist };
  const watchlist = [...state.watchlist, { symbol: s, addedAt: ctx.iso }];
  return { state: { ...state, watchlist }, result: watchlist };
}

export function removeFromWatchlist(state: DemoState, symbol: string): OperationResult<DemoState['watchlist']> {
  const s = symbol.toUpperCase();
  const watchlist = state.watchlist.filter((w) => w.symbol !== s);
  return { state: { ...state, watchlist }, result: watchlist };
}

export function toggleWatchlist(state: DemoState, symbol: string, c?: OpContext): OperationResult<boolean> {
  const s = symbol.toUpperCase();
  if (state.watchlist.some((w) => w.symbol === s)) return { state: removeFromWatchlist(state, s).state, result: false };
  return { state: addToWatchlist(state, s, c).state, result: true };
}

export function setWatchlistAlert(
  state: DemoState,
  symbol: string,
  alert: { above?: number | null; below?: number | null },
  currentPrice?: number,
): OperationResult<DemoState['watchlist']> {
  const s = symbol.toUpperCase();
  const item = state.watchlist.find((w) => w.symbol === s);
  if (!item) throw new DemoError('NOT_FOUND', `${s} is not on your watchlist.`);
  for (const v of [alert.above, alert.below]) {
    if (v !== undefined && v !== null && (!Number.isFinite(v) || v <= 0)) throw new DemoError('VALIDATION_ERROR', 'Alert prices must be positive.');
  }
  if (alert.above && alert.below && alert.below >= alert.above) throw new DemoError('VALIDATION_ERROR', '"Below" alert must be lower than the "above" alert.');
  const updated = {
    ...item,
    alertAbove: alert.above ?? undefined,
    alertBelow: alert.below ?? undefined,
    lastAlertState: currentPrice ? alertSide(currentPrice, alert.above ?? undefined, alert.below ?? undefined) : undefined,
  };
  const watchlist = state.watchlist.map((w) => (w.symbol === s ? updated : w));
  return { state: { ...state, watchlist }, result: watchlist };
}

function alertSide(price: number, above?: number, below?: number): 'above' | 'below' | 'inside' {
  if (above !== undefined && price >= above) return 'above';
  if (below !== undefined && price <= below) return 'below';
  return 'inside';
}

/** Checks watchlist thresholds against current prices and creates notifications for new crossings. */
export function checkWatchlistAlerts(state: DemoState, prices: Record<string, number>, c?: OpContext): OperationResult<string[]> {
  const fired: string[] = [];
  let changed = false;
  const watchlist = state.watchlist.map((w) => {
    if (w.alertAbove === undefined && w.alertBelow === undefined) return w;
    const price = prices[w.symbol];
    if (!price) return w;
    const side = alertSide(price, w.alertAbove, w.alertBelow);
    if (side === w.lastAlertState) return w;
    changed = true;
    if (side !== 'inside') fired.push(`${w.symbol}:${side}:${price}`);
    return { ...w, lastAlertState: side };
  });
  if (!changed) return { state, result: [] };
  let next: DemoState = { ...state, watchlist };
  for (const f of fired) {
    const [symbol, side, price] = f.split(':');
    const item = watchlist.find((w) => w.symbol === symbol)!;
    const threshold = side === 'above' ? item.alertAbove! : item.alertBelow!;
    next = pushNotification(next, c, {
      type: 'market',
      title: `${symbol} price alert`,
      message: `${symbol} ${side === 'above' ? 'rose above' : 'fell below'} your ${formatAmount(threshold, 'USD')} alert (now ${formatAmount(Number(price), 'USD')}, simulated).`,
      link: `/market/${symbol}`,
    });
  }
  return { state: next, result: fired };
}

// ---------------------------------------------------------------------------
// Notifications & settings
// ---------------------------------------------------------------------------

export function markNotificationRead(state: DemoState, id: string, read = true): OperationResult<AppNotification> {
  const n = state.notifications.find((x) => x.id === id);
  if (!n) throw new DemoError('NOT_FOUND', 'Notification not found.');
  const updated = { ...n, read };
  return { state: { ...state, notifications: state.notifications.map((x) => (x.id === id ? updated : x)) }, result: updated };
}

export function markAllNotificationsRead(state: DemoState): OperationResult<number> {
  const count = state.notifications.filter((n) => !n.read).length;
  return { state: { ...state, notifications: state.notifications.map((n) => (n.read ? n : { ...n, read: true })) }, result: count };
}

export function deleteNotification(state: DemoState, id: string): OperationResult<boolean> {
  if (!state.notifications.some((n) => n.id === id)) throw new DemoError('NOT_FOUND', 'Notification not found.');
  return { state: { ...state, notifications: state.notifications.filter((n) => n.id !== id) }, result: true };
}

export function updateSettings(state: DemoState, patch: Partial<DemoSettings>): OperationResult<DemoSettings> {
  const s = { ...state.settings };
  if (patch.displayCurrency !== undefined) s.displayCurrency = assertCurrency(patch.displayCurrency);
  if (patch.secondaryCurrency !== undefined) s.secondaryCurrency = assertCurrency(patch.secondaryCurrency);
  if (patch.marketTickMs !== undefined) {
    if (!Number.isFinite(patch.marketTickMs) || patch.marketTickMs < 3000 || patch.marketTickMs > 60000) {
      throw new DemoError('VALIDATION_ERROR', 'Market update interval must be between 3 and 60 seconds.');
    }
    s.marketTickMs = patch.marketTickMs;
  }
  if (patch.settlementSeconds !== undefined) {
    if (!Number.isFinite(patch.settlementSeconds) || patch.settlementSeconds < 5 || patch.settlementSeconds > 3600) {
      throw new DemoError('VALIDATION_ERROR', 'Settlement time must be between 5 and 3600 seconds.');
    }
    s.settlementSeconds = patch.settlementSeconds;
  }
  for (const k of ['marketSimulation', 'notifyTransactions', 'notifyMarket', 'notifySecurity', 'hideBalances'] as const) {
    if (patch[k] !== undefined) s[k] = !!patch[k];
  }
  return { state: { ...state, settings: s }, result: s };
}

export function completeOnboarding(state: DemoState): OperationResult<boolean> {
  return { state: { ...state, user: { ...state.user, onboarded: true } }, result: true };
}

// ---------------------------------------------------------------------------
// QR payments
// ---------------------------------------------------------------------------

export interface QrRequestInput {
  amount: number;
  currency: CurrencyCode;
  note?: string;
  expiresInMinutes?: number;
}

function qrId(ids: IdGenerator): string {
  return `QR-${ids.reference('QR').split('-').pop()}${Math.floor(Math.random() * 1e4).toString().padStart(4, '0')}`;
}

export function createQrRequest(state: DemoState, input: QrRequestInput, c?: OpContext): OperationResult<{ request: QrPaymentRequest; payload: string }> {
  const ctx = resolve(c);
  const currency = assertCurrency(input.currency);
  const max = currency === 'USD' ? LIMITS.qrMax : convert(LIMITS.qrMax, 'USD', currency);
  const amount = assertAmount(input.amount, currency, { max, label: 'Requested amount' });
  const minutes = input.expiresInMinutes ?? 30;
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > 7 * 24 * 60) throw new DemoError('VALIDATION_ERROR', 'Expiry must be between 1 minute and 7 days.');
  const note = input.note?.trim().slice(0, 140) || undefined;
  const request: QrPaymentRequest = {
    id: qrId(ctx.ids),
    walletId: state.user.walletId,
    payeeName: state.user.name,
    amount,
    currency,
    note,
    createdAt: ctx.iso,
    expiresAt: new Date(ctx.now + minutes * 60_000).toISOString(),
    status: 'open',
  };
  let next: DemoState = { ...state, qr: { ...state.qr, requests: [request, ...state.qr.requests].slice(0, 100) } };
  next = pushNotification(next, c, {
    type: 'transaction',
    title: 'QR payment request created',
    message: `A new QR payment request for ${formatAmount(amount, currency)} was created${note ? ` (“${note}”)` : ''}.`,
    link: '/qr-payments',
  });
  return { state: next, result: { request, payload: encodeQrPayload(request) } };
}

export function cancelQrRequest(state: DemoState, id: string): OperationResult<QrPaymentRequest> {
  const req = state.qr.requests.find((r) => r.id === id);
  if (!req) throw new DemoError('NOT_FOUND', 'Payment request not found.');
  if (req.status !== 'open') throw new DemoError('INVALID_STATE', `This request is already ${req.status}.`);
  const updated: QrPaymentRequest = { ...req, status: 'cancelled' };
  return { state: { ...state, qr: { ...state.qr, requests: state.qr.requests.map((r) => (r.id === id ? updated : r)) } }, result: updated };
}

export function expireQrRequests(state: DemoState, now = Date.now()): DemoState {
  let changed = false;
  const requests = state.qr.requests.map((r) => {
    if (r.status === 'open' && Date.parse(r.expiresAt) <= now) {
      changed = true;
      return { ...r, status: 'expired' as const };
    }
    return r;
  });
  return changed ? { ...state, qr: { ...state.qr, requests } } : state;
}

/**
 * Validates scanned QR text for payment by this wallet. Does NOT move money.
 * Rejects malformed payloads, expired requests, self-payments, replays and insufficient balance.
 */
export function validateQrForPayment(state: DemoState, raw: string, now = Date.now()): QrPayload {
  const parsed = parseQrPayload(raw);
  if (!parsed.ok) throw new DemoError('QR_INVALID', parsed.error);
  const p = parsed.payload;
  if (Date.parse(p.exp) <= now) throw new DemoError('QR_EXPIRED', 'This payment request has expired.');
  if (p.wallet === state.user.walletId) throw new DemoError('QR_SELF_PAYMENT', 'This is your own payment request. Share it with someone else to get paid.');
  if (state.qr.paidRequestIds.includes(p.id)) throw new DemoError('DUPLICATE_PAYMENT', 'This payment request has already been paid. Duplicate payments are blocked.');
  const max = p.currency === 'USD' ? LIMITS.qrMax : convert(LIMITS.qrMax, 'USD', p.currency);
  if (p.amount > max) throw new DemoError('LIMIT_EXCEEDED', `QR payments are limited to ${formatAmount(max, p.currency)} in the demo.`);
  if (lt(getBalance(state, p.currency), p.amount)) {
    throw new DemoError('INSUFFICIENT_FUNDS', `Insufficient ${p.currency} balance to pay ${formatAmount(p.amount, p.currency)}.`);
  }
  return p;
}

/** Pays a scanned QR request after explicit user confirmation. */
export function payQr(state: DemoState, raw: string, c?: OpContext): OperationResult<{ transaction: Transaction; payload: QrPayload }> {
  const ctx = resolve(c);
  const p = validateQrForPayment(state, raw, ctx.now);
  const tx = makeTx(ctx, {
    category: 'qr_payment',
    direction: 'debit',
    amount: p.amount,
    currency: p.currency,
    description: `QR payment to ${p.name}`,
    counterparty: p.name,
    meta: { qrRequestId: p.id, wallet: p.wallet, ...(p.note ? { note: p.note } : {}) },
  });
  let next = debit(state, p.currency, p.amount);
  next = addTransactions(next, [tx]);
  next = { ...next, qr: { ...next.qr, paidRequestIds: [...next.qr.paidRequestIds, p.id] } };
  next = pushNotification(next, c, {
    type: 'transaction',
    title: 'QR payment sent',
    message: `You paid ${formatAmount(p.amount, p.currency)} to ${p.name} via QR. Ref ${tx.reference}.`,
    link: `/transactions/${tx.id}`,
  });
  return { state: next, result: { transaction: tx, payload: p } };
}

/** Simulates another demo user paying one of your open QR requests. */
export function simulateIncomingQrPayment(
  state: DemoState,
  requestId: string,
  payerName = 'Demo Payer',
  c?: OpContext,
): OperationResult<{ transaction: Transaction; request: QrPaymentRequest }> {
  const ctx = resolve(c);
  const req = state.qr.requests.find((r) => r.id === requestId);
  if (!req) throw new DemoError('NOT_FOUND', 'Payment request not found.');
  if (req.status === 'paid') throw new DemoError('DUPLICATE_PAYMENT', 'This request has already been paid.');
  if (req.status !== 'open') throw new DemoError('INVALID_STATE', `This request is ${req.status}.`);
  if (Date.parse(req.expiresAt) <= ctx.now) throw new DemoError('QR_EXPIRED', 'This payment request has expired.');
  const tx = makeTx(ctx, {
    category: 'qr_payment',
    direction: 'credit',
    amount: req.amount,
    currency: req.currency,
    description: `QR payment from ${payerName}`,
    counterparty: payerName,
    meta: { qrRequestId: req.id, ...(req.note ? { note: req.note } : {}) },
  });
  const updated: QrPaymentRequest = { ...req, status: 'paid', paidAt: ctx.iso };
  let next = credit(state, req.currency, req.amount);
  next = addTransactions(next, [tx]);
  next = { ...next, qr: { ...next.qr, requests: next.qr.requests.map((r) => (r.id === req.id ? updated : r)) } };
  next = pushNotification(next, c, {
    type: 'transaction',
    title: 'QR payment received',
    message: `${payerName} paid your ${formatAmount(req.amount, req.currency)} QR request.`,
    link: `/transactions/${tx.id}`,
  });
  return { state: next, result: { transaction: tx, request: updated } };
}
