import { describe, expect, it } from 'vitest';
import {
  MAX_DAILY_MOVE,
  STOCKS_SEED,
  createInitialMarketState,
  getHistory,
  getMarketSummary,
  getUsMarketStatus,
  reconcileMarketState,
  tickMarket,
} from '../src';

describe('stock seed dataset', () => {
  it('contains at least 100 unique symbols with complete fields', () => {
    const symbols = new Set(STOCKS_SEED.map((s) => s.symbol));
    expect(symbols.size).toBe(STOCKS_SEED.length);
    expect(STOCKS_SEED.length).toBeGreaterThanOrEqual(100);
    for (const s of STOCKS_SEED) {
      expect(s.price).toBeGreaterThan(0);
      expect(s.high).toBeGreaterThanOrEqual(s.low);
      expect(s.history.length).toBe(90);
      expect(s.volumeHistory.length).toBe(90);
      expect(s.description.length).toBeGreaterThan(10);
    }
    for (const sym of ['AAPL', 'MSFT', 'NVDA', 'BRK.B', 'SPY', 'QQQ', 'DIA', 'IWM', 'VOO', 'SCHD']) expect(symbols.has(sym)).toBe(true);
  });

  it('has varied prices and changes', () => {
    expect(new Set(STOCKS_SEED.map((s) => s.price)).size).toBeGreaterThan(90);
    expect(STOCKS_SEED.some((s) => s.changePercent > 0)).toBe(true);
    expect(STOCKS_SEED.some((s) => s.changePercent < 0)).toBe(true);
  });
});

describe('market simulator', () => {
  it('produces bounded moves with consistent change fields', () => {
    let m = createInitialMarketState(1_000);
    for (let i = 0; i < 500; i++) m = tickMarket(m, 1_000 + i * 7000);
    for (const q of Object.values(m.quotes)) {
      expect(q.price).toBeGreaterThan(0);
      expect(Math.abs(q.price / q.previousClose - 1)).toBeLessThanOrEqual(MAX_DAILY_MOVE + 0.001);
      expect(q.change).toBeCloseTo(q.price - q.previousClose, 1);
      expect(q.ticks.length).toBeLessThanOrEqual(60);
    }
    const s = getMarketSummary(m);
    expect(s.advancers + s.decliners + s.unchanged).toBe(STOCKS_SEED.length);
  });

  it('is deterministic for the same rng state', () => {
    const a = tickMarket(createInitialMarketState(5), 10);
    const b = tickMarket(createInitialMarketState(5), 10);
    expect(a.quotes.AAPL.price).toBe(b.quotes.AAPL.price);
  });

  it('builds history ending at the current price for all ranges', () => {
    const m = createInitialMarketState();
    for (const r of ['1D', '1W', '1M', '3M', '1Y', '5Y'] as const) {
      const h = getHistory(m, 'AAPL', r)!;
      expect(h.prices.length).toBeGreaterThan(5);
      expect(h.prices[h.prices.length - 1].p).toBe(m.quotes.AAPL.price);
    }
    // stable across calls (no re-randomising)
    expect(getHistory(m, 'AAPL', '1Y')!.prices[10].p).toBe(getHistory(m, 'AAPL', '1Y')!.prices[10].p);
  });

  it('recovers from corrupted persisted market state', () => {
    expect(Object.keys(reconcileMarketState('garbage').quotes).length).toBe(STOCKS_SEED.length);
    const m = createInitialMarketState();
    const broken = { ...m, quotes: { ...m.quotes, AAPL: { ...m.quotes.AAPL, price: -5 } } };
    expect(reconcileMarketState(broken).quotes.AAPL.price).toBeGreaterThan(0);
  });

  it('reports US market hours', () => {
    expect(getUsMarketStatus(new Date('2026-06-17T15:00:00Z')).isOpen).toBe(true); // Wed 11:00 ET
    expect(getUsMarketStatus(new Date('2026-06-20T15:00:00Z')).isOpen).toBe(false); // Saturday
  });
});
