/**
 * Typed localStorage persistence for the NovaFin DEMO.
 *
 * - localStorage is browser-local: it is NOT shared with the Express backend and
 *   is NOT a production database. Only non-sensitive demo data is stored here.
 * - Each slice of the demo state lives under its own key (novafin_*), with a
 *   schema version + migrations in `novafin_meta`.
 * - Corrupted JSON is recovered: non-critical slices fall back to seed data,
 *   ledger slices (wallet / transactions / holdings / orders) trigger a full reseed
 *   so balances can never become inconsistent.
 * - Never call these functions during SSR — callers guard with `typeof window`.
 */
import {
  DEFAULT_SETTINGS,
  SCHEMA_VERSION,
  createSeedState,
  reconcileMarketState,
  type DemoState,
  type MarketState,
} from '@novafin/shared';

export const STORAGE_KEYS = {
  meta: 'novafin_meta',
  user: 'novafin_demo_user',
  wallet: 'novafin_wallet',
  bankAccounts: 'novafin_bank_accounts',
  recipients: 'novafin_recipients',
  transactions: 'novafin_transactions',
  portfolio: 'novafin_portfolio',
  orders: 'novafin_orders',
  watchlist: 'novafin_watchlist',
  notifications: 'novafin_notifications',
  exchangeHistory: 'novafin_exchange_history',
  qr: 'novafin_qr',
  settings: 'novafin_settings',
  market: 'novafin_market_state',
} as const;

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & { key?(i: number): string | null; length?: number };

type SliceKey = Exclude<keyof DemoState, 'schemaVersion'>;

const SLICE_TO_KEY: Record<SliceKey, string> = {
  user: STORAGE_KEYS.user,
  wallet: STORAGE_KEYS.wallet,
  bankAccounts: STORAGE_KEYS.bankAccounts,
  recipients: STORAGE_KEYS.recipients,
  transactions: STORAGE_KEYS.transactions,
  portfolio: STORAGE_KEYS.portfolio,
  orders: STORAGE_KEYS.orders,
  watchlist: STORAGE_KEYS.watchlist,
  notifications: STORAGE_KEYS.notifications,
  exchangeHistory: STORAGE_KEYS.exchangeHistory,
  qr: STORAGE_KEYS.qr,
  settings: STORAGE_KEYS.settings,
};

export const DEMO_STATE_KEYS = new Set<string>([STORAGE_KEYS.meta, ...Object.values(SLICE_TO_KEY)]);

/** Slices that must stay mutually consistent — corruption in any of them forces a full reseed. */
const CRITICAL: SliceKey[] = ['user', 'wallet', 'transactions', 'portfolio', 'orders'];

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const VALIDATORS: Record<SliceKey, (v: unknown) => boolean> = {
  user: (v) => isObj(v) && typeof v.walletId === 'string' && typeof v.name === 'string',
  wallet: (v) =>
    isObj(v) && isObj(v.balances) && Object.values(v.balances).every((b) => typeof b === 'number' && Number.isFinite(b) && b >= 0),
  bankAccounts: Array.isArray,
  recipients: Array.isArray,
  transactions: (v) => Array.isArray(v) && v.every((t) => isObj(t) && typeof t.id === 'string' && typeof t.amount === 'number'),
  portfolio: (v) => Array.isArray(v) && v.every((h) => isObj(h) && typeof h.symbol === 'string' && typeof h.shares === 'number'),
  orders: Array.isArray,
  watchlist: (v) => Array.isArray(v) && v.every((w) => isObj(w) && typeof w.symbol === 'string'),
  notifications: Array.isArray,
  exchangeHistory: Array.isArray,
  qr: (v) => isObj(v) && Array.isArray(v.requests) && Array.isArray(v.paidRequestIds),
  settings: (v) => isObj(v) && typeof v.displayCurrency === 'string',
};

interface Meta {
  schemaVersion: number;
  seededAt: string;
  updatedAt: string;
}

/**
 * Migrations keyed by the version they upgrade FROM. Each receives the raw slice
 * map and returns the upgraded map. Add entries here when DemoState changes shape.
 */
export const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
  // Example for a future v2: 1: (raw) => ({ ...raw, settings: { ...(raw.settings as object), newFlag: true } }),
};

export type LoadStatus = 'seeded' | 'restored' | 'recovered' | 'migrated' | 'reset';

export interface LoadResult {
  state: DemoState;
  status: LoadStatus;
  problems: string[];
}

function safeParse(raw: string | null): { ok: true; value: unknown } | { ok: false } {
  if (raw === null) return { ok: false };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

function writeJSON(storage: StorageLike, key: string, value: unknown): boolean {
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    // Quota exceeded or storage disabled — the demo keeps working in memory.
    console.warn(`[novafin] could not persist ${key}`, e);
    return false;
  }
}

function writeMeta(storage: StorageLike, seededAt?: string) {
  const prev = safeParse(storage.getItem(STORAGE_KEYS.meta));
  const meta: Meta = {
    schemaVersion: SCHEMA_VERSION,
    seededAt: seededAt ?? (prev.ok && isObj(prev.value) && typeof prev.value.seededAt === 'string' ? prev.value.seededAt : new Date().toISOString()),
    updatedAt: new Date().toISOString(),
  };
  writeJSON(storage, STORAGE_KEYS.meta, meta);
}

/** Persists every slice whose reference changed since `prev` (or all slices when `prev` is omitted). */
export function saveDemoState(storage: StorageLike, state: DemoState, prev?: DemoState | null): void {
  for (const [slice, key] of Object.entries(SLICE_TO_KEY) as [SliceKey, string][]) {
    if (!prev || prev[slice] !== state[slice]) writeJSON(storage, key, state[slice]);
  }
  writeMeta(storage);
}

export function seedDemoState(storage: StorageLike, now = Date.now()): DemoState {
  const state = createSeedState(now);
  saveDemoState(storage, state);
  writeMeta(storage, new Date(now).toISOString());
  return state;
}

/** Loads (or seeds) the demo state from storage with validation, recovery and migrations. */
export function loadDemoState(storage: StorageLike, now = Date.now()): LoadResult {
  const metaRaw = safeParse(storage.getItem(STORAGE_KEYS.meta));
  if (!metaRaw.ok || !isObj(metaRaw.value) || typeof metaRaw.value.schemaVersion !== 'number') {
    const hadSomething = Object.values(SLICE_TO_KEY).some((k) => storage.getItem(k) !== null);
    return { state: seedDemoState(storage, now), status: hadSomething ? 'recovered' : 'seeded', problems: hadSomething ? ['meta'] : [] };
  }
  let version = metaRaw.value.schemaVersion as number;
  if (version > SCHEMA_VERSION) {
    // Data from a newer build — cannot downgrade safely.
    return { state: seedDemoState(storage, now), status: 'recovered', problems: ['schema-version'] };
  }

  const raw: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const [slice, key] of Object.entries(SLICE_TO_KEY) as [SliceKey, string][]) {
    const parsed = safeParse(storage.getItem(key));
    raw[slice] = parsed.ok ? parsed.value : undefined;
  }

  let migrated = false;
  while (version < SCHEMA_VERSION) {
    const m = MIGRATIONS[version];
    if (!m) return { state: seedDemoState(storage, now), status: 'recovered', problems: [`no-migration-from-${version}`] };
    Object.assign(raw, m(raw));
    version += 1;
    migrated = true;
  }

  let seed: DemoState | null = null;
  const getSeed = () => (seed ??= createSeedState(now));
  const state = { schemaVersion: SCHEMA_VERSION } as DemoState;
  for (const slice of Object.keys(SLICE_TO_KEY) as SliceKey[]) {
    const value = raw[slice];
    if (value !== undefined && VALIDATORS[slice](value)) {
      (state as unknown as Record<string, unknown>)[slice] = value;
      continue;
    }
    problems.push(slice);
    if (CRITICAL.includes(slice)) {
      return { state: seedDemoState(storage, now), status: 'recovered', problems };
    }
    (state as unknown as Record<string, unknown>)[slice] = getSeed()[slice];
  }
  // fill settings keys added after the data was written
  state.settings = { ...DEFAULT_SETTINGS, ...state.settings };

  if (problems.length || migrated) saveDemoState(storage, state);
  return { state, status: problems.length ? 'recovered' : migrated ? 'migrated' : 'restored', problems };
}

/** Removes every NovaFin key (demo state + market) and reseeds. */
export function resetDemoStorage(storage: StorageLike, now = Date.now()): DemoState {
  for (const key of [...DEMO_STATE_KEYS, STORAGE_KEYS.market]) {
    try {
      storage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
  return seedDemoState(storage, now);
}

// ---------------- Market state ----------------

export function loadMarketState(storage: StorageLike, now = Date.now()): MarketState {
  const parsed = safeParse(storage.getItem(STORAGE_KEYS.market));
  return reconcileMarketState(parsed.ok ? parsed.value : null, now);
}

export function saveMarketState(storage: StorageLike, market: MarketState): void {
  writeJSON(storage, STORAGE_KEYS.market, market);
}
