import type { HistoryRange, PricePoint, VolumePoint } from '../types';
import { clamp, gaussian, hashString, mulberry32 } from '../random';
import { roundPrice } from '../money';

/**
 * Synthetic historical series generator.
 *
 * All charts in NovaFin use DETERMINISTIC SYNTHETIC data generated from each
 * symbol's seed. These are demonstration values, not actual market records.
 * Because the generator is seeded by symbol, the same chart is produced on
 * every render / reload — nothing is re-randomised on React renders.
 */

const DAY = 86_400_000;
export const FIVE_YEARS_TRADING_DAYS = 1260;

/** Returns the timestamps (local midnight + 16:00 close) of the last `count` weekdays ending before `endTime`. */
export function tradingDaysBack(count: number, endTime: number): number[] {
  const out: number[] = [];
  const cursor = new Date(endTime);
  cursor.setHours(16, 0, 0, 0);
  // the previous close is "yesterday" (or the last weekday)
  cursor.setTime(cursor.getTime() - DAY);
  while (out.length < count) {
    const dow = cursor.getDay();
    if (dow !== 0 && dow !== 6) out.push(cursor.getTime());
    cursor.setTime(cursor.getTime() - DAY);
  }
  return out.reverse();
}

interface SeriesOptions {
  symbol: string;
  endPrice: number;
  count: number;
  volatility: number;
  salt?: string;
}

/**
 * Random walk generated backwards from `endPrice` so the series always ends at the anchor.
 * A per-symbol drift gives each stock its own long-term trend.
 */
export function generateCloses({ symbol, endPrice, count, volatility, salt = 'daily' }: SeriesOptions): number[] {
  const rand = mulberry32(hashString(`${salt}:${symbol}`));
  // long-term annualised drift between -10% and +35%
  const annualDrift = -0.1 + rand() * 0.45;
  const dailyDrift = annualDrift / 252;
  const values: number[] = new Array(count);
  values[count - 1] = endPrice;
  let regime = 1;
  for (let i = count - 2; i >= 0; i--) {
    if (rand() < 0.01) regime = 0.6 + rand() * 1.2; // occasional volatility regime change
    const shock = clamp(gaussian(rand) * volatility * regime, -volatility * 4, volatility * 4);
    const next = values[i + 1];
    let prev = next / (1 + dailyDrift + shock);
    prev = Math.max(prev, endPrice * 0.05);
    values[i] = prev;
  }
  return values.map((v) => roundPrice(v));
}

export function generateVolumes(symbol: string, avgVolume: number, count: number, salt = 'volume'): number[] {
  const rand = mulberry32(hashString(`${salt}:${symbol}`));
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const spike = rand() < 0.06 ? 1.8 + rand() * 1.5 : 1;
    out.push(Math.round(avgVolume * (0.55 + rand() * 0.9) * spike));
  }
  return out;
}

/** Brownian bridge between two values with `steps` points (inclusive of both ends). */
export function bridge(from: number, to: number, steps: number, volatility: number, seed: string): number[] {
  const rand = mulberry32(hashString(seed));
  const walk: number[] = [0];
  for (let i = 1; i < steps; i++) walk.push(walk[i - 1] + gaussian(rand));
  const last = walk[steps - 1];
  const scale = from * volatility * 0.35;
  return walk.map((w, i) => {
    const frac = steps === 1 ? 1 : i / (steps - 1);
    const linear = from + (to - from) * frac;
    const noise = (w - last * frac) * scale / Math.sqrt(steps);
    return roundPrice(Math.max(linear + noise, Math.min(from, to) * 0.5));
  });
}

const dailyCache = new Map<string, number[]>();

/** 5 years of deterministic daily closes ending at `anchorClose`. Cached per symbol. */
export function getDailyCloses(symbol: string, anchorClose: number, volatility: number): number[] {
  const key = `${symbol}:${anchorClose}:${volatility}`;
  let cached = dailyCache.get(key);
  if (!cached) {
    cached = generateCloses({ symbol, endPrice: anchorClose, count: FIVE_YEARS_TRADING_DAYS, volatility });
    dailyCache.set(key, cached);
  }
  return cached;
}

export interface HistoryInput {
  symbol: string;
  previousClose: number;
  open: number;
  price: number;
  volatility: number;
  avgVolume: number;
  ticks?: PricePoint[];
  now?: number;
}

export interface HistoryResult {
  range: HistoryRange;
  prices: PricePoint[];
  volumes: VolumePoint[];
}

const RANGE_DAYS: Record<Exclude<HistoryRange, '1D' | '1W'>, number> = {
  '1M': 22,
  '3M': 63,
  '1Y': 252,
  '5Y': FIVE_YEARS_TRADING_DAYS,
};

/**
 * Builds a chart series for a symbol & range. The last point always equals the
 * current simulated price so the chart and the quote stay consistent.
 */
export function buildHistory(input: HistoryInput, range: HistoryRange): HistoryResult {
  const now = input.now ?? Date.now();
  const closes = getDailyCloses(input.symbol, input.previousClose, input.volatility);
  const dayTimes = tradingDaysBack(FIVE_YEARS_TRADING_DAYS, now);
  const vols = generateVolumes(input.symbol, input.avgVolume, FIVE_YEARS_TRADING_DAYS);

  if (range === '1D') {
    const ticks = input.ticks ?? [];
    const firstLive = ticks.length ? ticks[0].p : input.price;
    const sessionStart = now - 6.5 * 3_600_000;
    const firstTickTime = ticks.length ? ticks[0].t : now;
    const n = 60;
    const base = bridge(input.open, firstLive, n, input.volatility, `intraday:${input.symbol}:${input.previousClose}`);
    const span = Math.max(firstTickTime - sessionStart, 60_000);
    const prices: PricePoint[] = base.map((p, i) => ({ t: Math.round(sessionStart + (span * i) / n), p }));
    prices.push(...ticks);
    if (!ticks.length || ticks[ticks.length - 1].p !== input.price) prices.push({ t: now, p: input.price });
    const volRand = mulberry32(hashString(`ivol:${input.symbol}`));
    const per = input.avgVolume / 78;
    const volumes: VolumePoint[] = prices.map((pt, i) => ({
      t: pt.t,
      // U-shaped intraday volume profile
      v: Math.round(per * (0.5 + volRand()) * (1 + 1.2 * Math.abs(i / prices.length - 0.5) * 2)),
    }));
    return { range, prices, volumes };
  }

  if (range === '1W') {
    const days = 5;
    const lastCloses = closes.slice(-days);
    const lastTimes = dayTimes.slice(-days);
    const points: PricePoint[] = [];
    const perDay = 8;
    for (let i = 0; i < days; i++) {
      const from = i === 0 ? closes[closes.length - days - 1] : lastCloses[i - 1];
      const seg = bridge(from, lastCloses[i], perDay, input.volatility, `week:${input.symbol}:${i}:${input.previousClose}`);
      seg.forEach((p, j) => points.push({ t: lastTimes[i] - (perDay - 1 - j) * 3_000_000, p }));
    }
    points.push({ t: now, p: input.price });
    const volumes: VolumePoint[] = points.map((pt, i) => ({ t: pt.t, v: Math.round(vols[vols.length - 1 - (i % 5)] / perDay) }));
    return { range, prices: points, volumes };
  }

  const count = RANGE_DAYS[range];
  const step = range === '5Y' ? 5 : 1;
  const prices: PricePoint[] = [];
  const volumes: VolumePoint[] = [];
  for (let i = FIVE_YEARS_TRADING_DAYS - count; i < FIVE_YEARS_TRADING_DAYS; i += step) {
    prices.push({ t: dayTimes[i], p: closes[i] });
    let v = 0;
    for (let k = 0; k < step && i + k < FIVE_YEARS_TRADING_DAYS; k++) v += vols[i + k];
    volumes.push({ t: dayTimes[i], v });
  }
  prices.push({ t: now, p: input.price });
  volumes.push({ t: now, v: Math.round(input.avgVolume * 0.6) });
  return { range, prices, volumes };
}
