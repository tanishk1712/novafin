import { beforeEach, describe, expect, it } from 'vitest';
import { deposit, buyStock, createInitialMarketState, tickMarket } from '@novafin/shared';
import {
  STORAGE_KEYS,
  loadDemoState,
  loadMarketState,
  resetDemoStorage,
  saveDemoState,
  saveMarketState,
} from '@/lib/storage/storage';

describe('localStorage persistence', () => {
  beforeEach(() => localStorage.clear());

  it('seeds the demo account on first visit', () => {
    const { state, status } = loadDemoState(localStorage);
    expect(status).toBe('seeded');
    expect(state.wallet.balances.USD).toBe(25_000);
    for (const key of [STORAGE_KEYS.wallet, STORAGE_KEYS.transactions, STORAGE_KEYS.portfolio, STORAGE_KEYS.settings, STORAGE_KEYS.notifications]) {
      expect(localStorage.getItem(key)).not.toBeNull();
    }
  });

  it('restores completed operations after a "refresh"', () => {
    const first = loadDemoState(localStorage).state;
    let next = deposit(first, { amount: 1234.56, method: 'bank_transfer' }).state;
    next = buyStock(next, { symbol: 'MSFT', quantity: 1, price: 400 }).state;
    saveDemoState(localStorage, next, first);

    const reloaded = loadDemoState(localStorage);
    expect(reloaded.status).toBe('restored');
    expect(reloaded.state.wallet.balances.USD).toBe(next.wallet.balances.USD);
    expect(reloaded.state.transactions[0].id).toBe(next.transactions[0].id);
    expect(reloaded.state.portfolio.find((h) => h.symbol === 'MSFT')?.shares).toBe(next.portfolio.find((h) => h.symbol === 'MSFT')?.shares);
  });

  it('only rewrites changed slices', () => {
    const first = loadDemoState(localStorage).state;
    const before = localStorage.getItem(STORAGE_KEYS.watchlist);
    localStorage.setItem(STORAGE_KEYS.watchlist, before!.replace('[', '[ '));
    const next = deposit(first, { amount: 10, method: 'bank_transfer' }).state;
    saveDemoState(localStorage, next, first);
    // untouched slice keeps our marker whitespace
    expect(localStorage.getItem(STORAGE_KEYS.watchlist)!.startsWith('[ ')).toBe(true);
  });

  it('recovers non-critical slices from corrupted JSON', () => {
    loadDemoState(localStorage);
    localStorage.setItem(STORAGE_KEYS.settings, '{not json');
    const { state, status, problems } = loadDemoState(localStorage);
    expect(status).toBe('recovered');
    expect(problems).toContain('settings');
    expect(state.settings.displayCurrency).toBe('USD');
    expect(state.wallet.balances.USD).toBe(25_000);
  });

  it('reseeds everything when a ledger slice is corrupted', () => {
    const first = loadDemoState(localStorage).state;
    const changed = deposit(first, { amount: 50, method: 'bank_transfer' }).state;
    saveDemoState(localStorage, changed, first);
    localStorage.setItem(STORAGE_KEYS.wallet, JSON.stringify({ balances: { USD: -5 } }));
    const { state, status } = loadDemoState(localStorage);
    expect(status).toBe('recovered');
    expect(state.wallet.balances.USD).toBe(25_000);
  });

  it('reseeds when the stored schema version is from a newer build', () => {
    loadDemoState(localStorage);
    localStorage.setItem(STORAGE_KEYS.meta, JSON.stringify({ schemaVersion: 999 }));
    expect(loadDemoState(localStorage).status).toBe('recovered');
  });

  it('reset restores the original seed and clears market state', () => {
    const first = loadDemoState(localStorage).state;
    saveDemoState(localStorage, deposit(first, { amount: 999, method: 'bank_transfer' }).state, first);
    saveMarketState(localStorage, tickMarket(createInitialMarketState(), Date.now()));
    const fresh = resetDemoStorage(localStorage);
    expect(fresh.wallet.balances.USD).toBe(25_000);
    expect(localStorage.getItem(STORAGE_KEYS.market)).toBeNull();
  });

  it('persists and reloads the simulated market state', () => {
    const m = tickMarket(createInitialMarketState(), Date.now());
    saveMarketState(localStorage, m);
    const loaded = loadMarketState(localStorage);
    expect(loaded.quotes.AAPL.price).toBe(m.quotes.AAPL.price);
    expect(loaded.tickCount).toBe(1);
    localStorage.setItem(STORAGE_KEYS.market, '%%%');
    expect(loadMarketState(localStorage).tickCount).toBe(0);
  });
});
