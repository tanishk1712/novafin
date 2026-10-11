import type { HistoryRange, LiveQuote, MarketState, Sector, StockSeed } from '../types';
import { STOCKS_SEED, STOCKS_BY_SYMBOL, getAvgVolume } from './stocks.seed';
import { clamp, hashString, stepRng } from '../random';
import { pctChange, roundPrice } from '../money';
import { buildHistory, type HistoryResult } from './history';

/**
 * SIMULATED MARKET ENGINE.
 *
 * Generates small, bounded, volatility-scaled random price moves for every
 * symbol. Nothing here reflects real exchange prices.
 */

export const MARKET_STATE_VERSION = 1;
export const MAX_TICKS_KEPT = 60;
/** Per-tick move is capped at ±1.2% so prices never jump unrealistically. */
export const MAX_TICK_MOVE = 0.012;
/** Total daily move is capped at ±18% from the previous close. */
export const MAX_DAILY_MOVE = 0.18;

export function createInitialMarketState(now = Date.now(), seeds: StockSeed[] = STOCKS_SEED): MarketState {
  const quotes: Record<string, LiveQuote> = {};
  for (const s of seeds) {
    quotes[s.symbol] = {
      symbol: s.symbol,
      price: s.price,
      previousClose: s.previousClose,
      open: s.open,
      high: s.high,
      low: s.low,
      volume: s.volume,
      change: s.change,
      changePercent: s.changePercent,
      updatedAt: now,
      ticks: [],
    };
  }
  return { version: MARKET_STATE_VERSION, quotes, lastTick: now, tickCount: 0, rngState: hashString(`market:${now}`) };
}

/** Normal sample from the deterministic stepped RNG. Returns [sample, nextState]. */
function gaussianStep(state: number): [number, number] {
  let [u, s1] = stepRng(state);
  let [v, s2] = stepRng(s1);
  if (u === 0) u = 1e-9;
  if (v === 0) v = 1e-9;
  return [Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v), s2];
}

export interface TickOptions {
  /** Scales the size of moves (1 = default). */
  intensity?: number;
  /** Only tick these symbols (default: all). */
  symbols?: string[];
}

/**
 * Advances the simulated market by one tick. Pure function: returns a new state.
 * Market-wide factor + idiosyncratic noise gives a mix of rising and falling stocks,
 * with mean-reversion as prices approach the daily cap.
 */
export function tickMarket(state: MarketState, now = Date.now(), opts: TickOptions = {}): MarketState {
  const intensity = opts.intensity ?? 1;
  let rng = state.rngState;
  let marketShock: number;
  [marketShock, rng] = gaussianStep(rng);
  const quotes: Record<string, LiveQuote> = { ...state.quotes };
  const symbols = opts.symbols ?? Object.keys(quotes);

  for (const symbol of symbols) {
    const q = quotes[symbol];
    const seed = STOCKS_BY_SYMBOL[symbol];
    if (!q || !seed) continue;
    let g: number;
    [g, rng] = gaussianStep(rng);
    const sigma = seed.volatility * 0.12 * intensity;
    const beta = seed.type === 'etf' ? 0.9 : 0.5;
    const dayMove = q.price / q.previousClose - 1;
    // pull back towards previous close when moves get large
    const reversion = -dayMove * 0.04;
    let move = sigma * (beta * marketShock * 0.6 + g) + reversion;
    move = clamp(move, -MAX_TICK_MOVE, MAX_TICK_MOVE);
    let price = q.price * (1 + move);
    price = clamp(price, q.previousClose * (1 - MAX_DAILY_MOVE), q.previousClose * (1 + MAX_DAILY_MOVE));
    price = roundPrice(Math.max(price, 0.01));
    let r: number;
    [r, rng] = stepRng(rng);
    const avgVol = getAvgVolume(symbol);
    const volume = q.volume + Math.round((avgVol / 2500) * (0.3 + r * 1.4) * (1 + Math.abs(move) * 80));
    const ticks = [...q.ticks, { t: now, p: price }];
    if (ticks.length > MAX_TICKS_KEPT) ticks.splice(0, ticks.length - MAX_TICKS_KEPT);
    quotes[symbol] = {
      ...q,
      price,
      high: Math.max(q.high, price),
      low: Math.min(q.low, price),
      volume,
      change: roundPrice(price - q.previousClose),
      changePercent: pctChange(q.previousClose, price),
      updatedAt: now,
      ticks,
    };
  }

  return { ...state, quotes, lastTick: now, tickCount: state.tickCount + 1, rngState: rng };
}

/** Validates a persisted market state (e.g. from localStorage) and fills in any missing symbols. */
export function reconcileMarketState(raw: unknown, now = Date.now()): MarketState {
  const fresh = createInitialMarketState(now);
  if (!raw || typeof raw !== 'object') return fresh;
  const s = raw as Partial<MarketState>;
  if (s.version !== MARKET_STATE_VERSION || !s.quotes || typeof s.quotes !== 'object') return fresh;
  const quotes: Record<string, LiveQuote> = {};
  for (const [symbol, base] of Object.entries(fresh.quotes)) {
    const q = (s.quotes as Record<string, LiveQuote>)[symbol];
    const valid =
      q &&
      Number.isFinite(q.price) &&
      q.price > 0 &&
      Number.isFinite(q.previousClose) &&
      q.previousClose === base.previousClose &&
      Array.isArray(q.ticks);
    quotes[symbol] = valid ? { ...q, ticks: q.ticks.filter((t) => Number.isFinite(t?.p)).slice(-MAX_TICKS_KEPT) } : base;
  }
  return {
    version: MARKET_STATE_VERSION,
    quotes,
    lastTick: Number.isFinite(s.lastTick) ? (s.lastTick as number) : now,
    tickCount: Number.isFinite(s.tickCount) ? (s.tickCount as number) : 0,
    rngState: Number.isFinite(s.rngState) ? (s.rngState as number) >>> 0 : fresh.rngState,
  };
}

export function getQuotePrice(market: MarketState, symbol: string): number {
  const q = market.quotes[symbol];
  if (q) return q.price;
  return STOCKS_BY_SYMBOL[symbol]?.price ?? 0;
}

export function priceMap(market: MarketState): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, q] of Object.entries(market.quotes)) out[k] = q.price;
  return out;
}

export function getHistory(market: MarketState, symbol: string, range: HistoryRange, now = Date.now()): HistoryResult | null {
  const seed = STOCKS_BY_SYMBOL[symbol];
  const q = market.quotes[symbol];
  if (!seed || !q) return null;
  return buildHistory(
    {
      symbol,
      previousClose: seed.previousClose,
      open: q.open,
      price: q.price,
      volatility: seed.volatility,
      avgVolume: getAvgVolume(symbol),
      ticks: q.ticks,
      now,
    },
    range,
  );
}

// ---------------------------------------------------------------------------
// Market summary
// ---------------------------------------------------------------------------

export interface IndexSnapshot {
  key: string;
  name: string;
  proxy: string;
  value: number;
  change: number;
  changePercent: number;
  ticks: { t: number; p: number }[];
}

const INDEX_DEFS = [
  { key: 'SPX', name: 'S&P 500', proxy: 'SPY', factor: 10.02 },
  { key: 'NDX', name: 'Nasdaq 100', proxy: 'QQQ', factor: 41.12 },
  { key: 'DJI', name: 'Dow Jones', proxy: 'DIA', factor: 100.18 },
  { key: 'RUT', name: 'Russell 2000', proxy: 'IWM', factor: 9.98 },
];

export interface SectorPerformance {
  sector: Sector;
  changePercent: number;
  count: number;
}

export interface MarketSummary {
  indices: IndexSnapshot[];
  gainers: LiveQuote[];
  losers: LiveQuote[];
  mostActive: LiveQuote[];
  advancers: number;
  decliners: number;
  unchanged: number;
  sectors: SectorPerformance[];
  averageChangePercent: number;
  updatedAt: number;
  simulated: true;
}

export function getMarketSummary(market: MarketState, limit = 5): MarketSummary {
  const quotes = Object.values(market.quotes);
  const stocksOnly = quotes.filter((q) => STOCKS_BY_SYMBOL[q.symbol]?.type === 'stock');
  const sorted = [...stocksOnly].sort((a, b) => b.changePercent - a.changePercent);
  const indices: IndexSnapshot[] = INDEX_DEFS.map((def) => {
    const q = market.quotes[def.proxy];
    return {
      key: def.key,
      name: def.name,
      proxy: def.proxy,
      value: roundPrice(q.price * def.factor),
      change: roundPrice(q.change * def.factor),
      changePercent: q.changePercent,
      ticks: q.ticks.map((t) => ({ t: t.t, p: roundPrice(t.p * def.factor) })),
    };
  });
  const bySector = new Map<Sector, { total: number; count: number }>();
  for (const q of quotes) {
    const sector = STOCKS_BY_SYMBOL[q.symbol]?.sector;
    if (!sector) continue;
    const cur = bySector.get(sector) ?? { total: 0, count: 0 };
    cur.total += q.changePercent;
    cur.count += 1;
    bySector.set(sector, cur);
  }
  const avg = stocksOnly.reduce((a, q) => a + q.changePercent, 0) / Math.max(stocksOnly.length, 1);
  return {
    indices,
    gainers: sorted.slice(0, limit),
    losers: sorted.slice(-limit).reverse(),
    mostActive: [...stocksOnly].sort((a, b) => b.volume * b.price - a.volume * a.price).slice(0, limit),
    advancers: quotes.filter((q) => q.changePercent > 0).length,
    decliners: quotes.filter((q) => q.changePercent < 0).length,
    unchanged: quotes.filter((q) => q.changePercent === 0).length,
    sectors: Array.from(bySector.entries())
      .map(([sector, v]) => ({ sector, changePercent: Math.round((v.total / v.count) * 100) / 100, count: v.count }))
      .sort((a, b) => b.changePercent - a.changePercent),
    averageChangePercent: Math.round(avg * 100) / 100,
    updatedAt: market.lastTick,
    simulated: true,
  };
}

// ---------------------------------------------------------------------------
// US market hours (presentation only — independent from the simulator)
// ---------------------------------------------------------------------------

export interface MarketStatus {
  isOpen: boolean;
  label: 'Open' | 'Closed' | 'Pre-market' | 'After-hours';
  nyTime: string;
  nextChange: string;
}

/** Regular US market hours: Mon–Fri 09:30–16:00 America/New_York. Exchange holidays are ignored in this demo. */
export function getUsMarketStatus(now = new Date()): MarketStatus {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const weekday = get('weekday');
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  const mins = hour * 60 + minute;
  const weekend = weekday === 'Sat' || weekday === 'Sun';
  const nyTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ET`;
  if (weekend) return { isOpen: false, label: 'Closed', nyTime, nextChange: 'Opens Monday 09:30 ET' };
  if (mins >= 570 && mins < 960) return { isOpen: true, label: 'Open', nyTime, nextChange: 'Closes 16:00 ET' };
  if (mins >= 240 && mins < 570) return { isOpen: false, label: 'Pre-market', nyTime, nextChange: 'Opens 09:30 ET' };
  if (mins >= 960 && mins < 1200) return { isOpen: false, label: 'After-hours', nyTime, nextChange: 'Opens next weekday 09:30 ET' };
  return { isOpen: false, label: 'Closed', nyTime, nextChange: 'Opens 09:30 ET' };
}

export { clamp };
