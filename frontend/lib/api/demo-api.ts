'use client';

/**
 * Demo API adapter.
 *
 * The UI talks to this adapter instead of calling the engine directly. In the
 * default "localStorage demo mode" each call runs the shared, deterministic
 * NovaFin engine against the browser-local demo state (with a short simulated
 * network latency so loading states are visible). A production build would
 * swap these implementations for authenticated calls to a real ledger service.
 */
import {
  DemoError,
  addBankAccount,
  addToWatchlist,
  buyStock,
  cancelQrRequest,
  cancelTransaction,
  completeOnboarding,
  createQrRequest,
  deleteNotification,
  deposit,
  exchange,
  markAllNotificationsRead,
  markNotificationRead,
  payQr,
  recordRejectedOrder,
  removeBankAccount,
  removeFromWatchlist,
  sellStock,
  setDefaultBankAccount,
  setWatchlistAlert,
  simulateIncomingQrPayment,
  toggleWatchlist,
  transfer,
  updateBankAccount,
  updateSettings,
  validateQrForPayment,
  verifyBankAccount,
  withdraw,
  isDemoError,
  type BankAccountInput,
  type DemoSettings,
  type DepositInput,
  type ExchangeInput,
  type QrRequestInput,
  type TransferInput,
  type WithdrawInput,
} from '@novafin/shared';
import { applyOperation, currentPrice, getDemoState, resetDemo } from '@/lib/store/demo-store';

const LATENCY_MS = 450;
const inFlight = new Set<string>();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Runs an operation once at a time per key (double-submit protection) after a
 * short simulated latency.
 */
async function run<T>(key: string, fn: () => T, latency = LATENCY_MS): Promise<T> {
  if (inFlight.has(key)) throw new DemoError('CONFLICT', 'This operation is already being processed. Please wait.');
  inFlight.add(key);
  try {
    await sleep(latency);
    return fn();
  } finally {
    inFlight.delete(key);
  }
}

export function errorMessage(e: unknown): string {
  if (isDemoError(e)) return e.message;
  if (e instanceof Error) return e.message;
  return 'Something went wrong in the demo.';
}

export const demoApi = {
  // ---------------- Wallet ----------------
  deposit: (input: DepositInput) => run('deposit', () => applyOperation((s) => deposit(s, input))),
  withdraw: (input: WithdrawInput) => run('withdraw', () => applyOperation((s) => withdraw(s, input))),
  transfer: (input: TransferInput) => run('transfer', () => applyOperation((s) => transfer(s, input))),
  exchange: (input: ExchangeInput) => run('exchange', () => applyOperation((s) => exchange(s, input))),
  cancelTransaction: (id: string) => run(`cancel:${id}`, () => applyOperation((s) => cancelTransaction(s, id)), 250),

  // ---------------- Trading ----------------
  /** Executes a simulated market order at the CURRENT simulated price. Rejections are recorded in order history. */
  trade: (side: 'buy' | 'sell', symbol: string, quantity: number) =>
    run('trade', () => {
      const price = currentPrice(symbol);
      try {
        return applyOperation((s) => (side === 'buy' ? buyStock(s, { symbol, quantity, price }) : sellStock(s, { symbol, quantity, price })));
      } catch (e) {
        if (isDemoError(e)) {
          applyOperation((s) => recordRejectedOrder(s, { symbol, side, quantity, price, reason: e.message }));
        }
        throw e;
      }
    }),
  toggleWatchlist: (symbol: string) => applyOperation((s) => toggleWatchlist(s, symbol)),
  addToWatchlist: (symbol: string) => applyOperation((s) => addToWatchlist(s, symbol)),
  removeFromWatchlist: (symbol: string) => applyOperation((s) => removeFromWatchlist(s, symbol)),
  setWatchlistAlert: (symbol: string, alert: { above?: number | null; below?: number | null }) =>
    applyOperation((s) => setWatchlistAlert(s, symbol, alert, currentPrice(symbol))),

  // ---------------- Bank accounts ----------------
  addBankAccount: (input: BankAccountInput) => run('bank:add', () => applyOperation((s) => addBankAccount(s, input))),
  renameBankAccount: (id: string, nickname: string) => applyOperation((s) => updateBankAccount(s, id, { nickname })),
  setDefaultBankAccount: (id: string) => applyOperation((s) => setDefaultBankAccount(s, id)),
  verifyBankAccount: (id: string) => run(`bank:verify:${id}`, () => applyOperation((s) => verifyBankAccount(s, id)), 900),
  removeBankAccount: (id: string) => run(`bank:remove:${id}`, () => applyOperation((s) => removeBankAccount(s, id)), 250),

  // ---------------- QR ----------------
  createQrRequest: (input: QrRequestInput) => run('qr:create', () => applyOperation((s) => createQrRequest(s, input)), 250),
  cancelQrRequest: (id: string) => applyOperation((s) => cancelQrRequest(s, id)),
  /** Validation only — never moves money. */
  validateQr: (raw: string) => {
    const s = getDemoState();
    if (!s) throw new Error('Demo not ready');
    return validateQrForPayment(s, raw);
  },
  /** Pays a validated QR request after explicit user confirmation. */
  payQr: (raw: string) => run('qr:pay', () => applyOperation((s) => payQr(s, raw))),
  simulateIncomingQr: (id: string, payer: string) => run(`qr:incoming:${id}`, () => applyOperation((s) => simulateIncomingQrPayment(s, id, payer)), 700),

  // ---------------- Notifications & settings ----------------
  markRead: (id: string, read = true) => applyOperation((s) => markNotificationRead(s, id, read)),
  markAllRead: () => applyOperation((s) => markAllNotificationsRead(s)),
  deleteNotification: (id: string) => applyOperation((s) => deleteNotification(s, id)),
  updateSettings: (patch: Partial<DemoSettings>) => applyOperation((s) => updateSettings(s, patch)),
  completeOnboarding: () => applyOperation((s) => completeOnboarding(s)),
  resetDemo: () => run('reset', () => resetDemo(), 300),
};
