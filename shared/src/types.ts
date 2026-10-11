/**
 * NovaFin domain types.
 *
 * Every value modelled here is DEMO / SIMULATED. None of these structures
 * represent a real financial account, real ledger, or real market quote.
 */

export const CURRENCY_CODES = ['USD', 'INR', 'EUR', 'GBP', 'AED', 'CAD', 'AUD', 'JPY', 'SGD', 'CHF'] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

export type ISODate = string;

export const TX_CATEGORIES = [
  'deposit',
  'withdrawal',
  'exchange',
  'transfer',
  'qr_payment',
  'stock_buy',
  'stock_sell',
  'fee',
] as const;
export type TxCategory = (typeof TX_CATEGORIES)[number];

export const TX_STATUSES = ['pending', 'processing', 'completed', 'failed', 'cancelled'] as const;
export type TxStatus = (typeof TX_STATUSES)[number];

export type TxDirection = 'credit' | 'debit';

export interface Transaction {
  id: string;
  /** Human readable unique reference, e.g. NVF-DEP-8K2J4Q */
  reference: string;
  category: TxCategory;
  status: TxStatus;
  direction: TxDirection;
  /** Principal amount of the operation, excluding fees (fees are separate `fee` transactions). */
  amount: number;
  currency: CurrencyCode;
  /** Fee charged for this operation (also recorded as a linked `fee` transaction when > 0). */
  fee: number;
  description: string;
  counterparty?: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** `seed` = historical demo example, `user` = created by the user in this browser/session. */
  source: 'seed' | 'user';
  /** Parent transaction id for fee transactions. */
  linkedTo?: string;
  meta?: Record<string, string | number | boolean>;
}

export interface Wallet {
  id: string;
  balances: Record<CurrencyCode, number>;
}

export type BankVerification = 'verified' | 'pending' | 'failed';
export type BankAccountType = 'checking' | 'savings' | 'current';

export interface BankAccount {
  id: string;
  nickname: string;
  bankName: string;
  holderName: string;
  country: string;
  currency: CurrencyCode;
  accountType: BankAccountType;
  /** Only the last 4 digits are ever stored. */
  last4: string;
  /** Masked routing / IFSC / sort code, e.g. ACH •••••0021 or HDFC0•••••1 */
  routingLabel: string;
  routingMasked: string;
  isDefault: boolean;
  verification: BankVerification;
  addedAt: ISODate;
}

export interface Recipient {
  id: string;
  name: string;
  handle: string;
  kind: 'novafin' | 'external';
  country: string;
  currency: CurrencyCode;
  avatarColor: string;
}

export interface Holding {
  symbol: string;
  shares: number;
  avgPrice: number;
  costBasis: number;
  realizedPnl: number;
  openedAt: ISODate;
}

export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'filled' | 'rejected' | 'cancelled' | 'pending';

export interface Order {
  id: string;
  reference: string;
  symbol: string;
  side: OrderSide;
  type: 'market';
  quantity: number;
  price: number;
  value: number;
  fee: number;
  /** Realised P/L for sell orders. */
  realizedPnl?: number;
  status: OrderStatus;
  rejectReason?: string;
  createdAt: ISODate;
  transactionId?: string;
  source: 'seed' | 'user';
}

export interface WatchlistItem {
  symbol: string;
  addedAt: ISODate;
  /** Notify when price rises above this value. */
  alertAbove?: number;
  /** Notify when price falls below this value. */
  alertBelow?: number;
  /** Last side of the threshold that was observed, used to detect crossings. */
  lastAlertState?: 'above' | 'below' | 'inside';
}

export type NotificationType = 'transaction' | 'market' | 'security' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  createdAt: ISODate;
  read: boolean;
  link?: string;
}

export interface ExchangeRecord {
  id: string;
  transactionId: string;
  from: CurrencyCode;
  to: CurrencyCode;
  fromAmount: number;
  fee: number;
  rate: number;
  toAmount: number;
  createdAt: ISODate;
  source: 'seed' | 'user';
}

export interface QrPaymentRequest {
  id: string;
  walletId: string;
  payeeName: string;
  amount: number;
  currency: CurrencyCode;
  note?: string;
  createdAt: ISODate;
  expiresAt: ISODate;
  status: 'open' | 'paid' | 'expired' | 'cancelled';
  paidAt?: ISODate;
}

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  walletId: string;
  createdAt: ISODate;
  onboarded: boolean;
  tier: string;
}

export interface DemoSettings {
  displayCurrency: CurrencyCode;
  secondaryCurrency: CurrencyCode;
  marketSimulation: boolean;
  marketTickMs: number;
  notifyTransactions: boolean;
  notifyMarket: boolean;
  notifySecurity: boolean;
  /** Seconds after which a processing withdrawal/transfer completes in the simulation. */
  settlementSeconds: number;
  hideBalances: boolean;
}

export interface QrState {
  requests: QrPaymentRequest[];
  /** Ids of payment requests this wallet has already paid (replay protection). */
  paidRequestIds: string[];
}

/** Complete per-user demo state. In the browser it is persisted to localStorage, on the backend it lives in memory. */
export interface DemoState {
  schemaVersion: number;
  user: DemoUser;
  wallet: Wallet;
  bankAccounts: BankAccount[];
  recipients: Recipient[];
  transactions: Transaction[];
  portfolio: Holding[];
  orders: Order[];
  watchlist: WatchlistItem[];
  notifications: AppNotification[];
  exchangeHistory: ExchangeRecord[];
  qr: QrState;
  settings: DemoSettings;
}

// ---------------------------------------------------------------------------
// Market
// ---------------------------------------------------------------------------

export type Sector =
  | 'Technology'
  | 'Communication Services'
  | 'Consumer Discretionary'
  | 'Consumer Staples'
  | 'Financials'
  | 'Healthcare'
  | 'Energy'
  | 'Industrials'
  | 'Materials'
  | 'Utilities'
  | 'Real Estate'
  | 'ETF';

export interface PricePoint {
  /** Unix ms */
  t: number;
  p: number;
}

export interface VolumePoint {
  t: number;
  v: number;
}

export interface StockSeed {
  symbol: string;
  name: string;
  sector: Sector;
  exchange: 'NASDAQ' | 'NYSE' | 'NYSE Arca' | 'BATS';
  type: 'stock' | 'etf';
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  /** Market capitalisation / AUM in USD. */
  marketCap: number;
  description: string;
  /** Daily volatility used by the market simulator (e.g. 0.018 = 1.8%). */
  volatility: number;
  /** 90 trading days of synthetic daily closes. */
  history: PricePoint[];
  /** 90 trading days of synthetic daily volume. */
  volumeHistory: VolumePoint[];
  updatedAt: ISODate;
}

export interface LiveQuote {
  symbol: string;
  price: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  change: number;
  changePercent: number;
  updatedAt: number;
  /** Recent simulated intraday ticks. */
  ticks: PricePoint[];
}

export interface MarketState {
  version: number;
  quotes: Record<string, LiveQuote>;
  lastTick: number;
  tickCount: number;
  /** Seed used by the deterministic random generator so ticks are reproducible per session. */
  rngState: number;
}

export type HistoryRange = '1D' | '1W' | '1M' | '3M' | '1Y' | '5Y';

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export interface OperationResult<T = unknown> {
  state: DemoState;
  result: T;
}
