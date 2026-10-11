'use client';

/**
 * Tiny reactive store for the demo state (useSyncExternalStore based).
 * Every mutation goes through `applyOperation`, which runs a pure shared-engine
 * function, persists the changed slices to localStorage and notifies subscribers.
 * Other browser tabs are kept in sync through the `storage` event.
 */
import { useSyncExternalStore } from 'react';
import type { DemoState, MarketState, OperationResult } from '@novafin/shared';
import { createInitialMarketState, createSeedState, tickMarket } from '@novafin/shared';
import {
  DEMO_STATE_KEYS,
  STORAGE_KEYS,
  loadDemoState,
  loadMarketState,
  resetDemoStorage,
  saveDemoState,
  saveMarketState,
  type LoadStatus,
} from '@/lib/storage/storage';

type Listener = () => void;

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null; // storage disabled (e.g. privacy mode)
  }
}

// ---------------------------------------------------------------------------
// Demo state store
// ---------------------------------------------------------------------------

let demoState: DemoState | null = null;
let loadStatus: LoadStatus | null = null;
const demoListeners = new Set<Listener>();

function emitDemo() {
  for (const l of demoListeners) l();
}

export function initStores(): LoadStatus | null {
  if (typeof window === 'undefined' || demoState) return loadStatus;
  const storage = getStorage();
  if (storage) {
    const res = loadDemoState(storage);
    demoState = res.state;
    loadStatus = res.status;
    marketState = loadMarketState(storage);
    saveMarketState(storage, marketState);
  } else {
    // in-memory fallback when localStorage is unavailable
    demoState = createSeedState();
    loadStatus = 'seeded';
    marketState = createInitialMarketState();
  }
  window.addEventListener('storage', onStorageEvent);
  emitDemo();
  emitMarket();
  return loadStatus;
}

function onStorageEvent(e: StorageEvent) {
  const storage = getStorage();
  if (!storage || !e.key) {
    // `clear()` in another tab
    if (storage && e.key === null) {
      demoState = loadDemoState(storage).state;
      marketState = loadMarketState(storage);
      emitDemo();
      emitMarket();
    }
    return;
  }
  if (e.key === STORAGE_KEYS.market) {
    marketState = loadMarketState(storage);
    emitMarket();
  } else if (DEMO_STATE_KEYS.has(e.key)) {
    demoState = loadDemoState(storage).state;
    emitDemo();
  }
}

export function getDemoState(): DemoState | null {
  return demoState;
}

export function getLoadStatus(): LoadStatus | null {
  return loadStatus;
}

export function subscribeDemo(l: Listener): () => void {
  demoListeners.add(l);
  return () => demoListeners.delete(l);
}

/** Runs a pure engine operation against the current state, persists and broadcasts. Throws DemoError on rule violations. */
export function applyOperation<T>(op: (s: DemoState) => OperationResult<T>): T {
  if (!demoState) throw new Error('Demo state is not initialised yet.');
  const prev = demoState;
  const { state, result } = op(prev);
  if (state !== prev) {
    demoState = state;
    const storage = getStorage();
    if (storage) saveDemoState(storage, state, prev);
    emitDemo();
  }
  return result;
}

/** Applies a state transform without a result (e.g. housekeeping). */
export function updateState(fn: (s: DemoState) => DemoState): void {
  applyOperation((s) => ({ state: fn(s), result: undefined }));
}

export function resetDemo(): DemoState {
  const storage = getStorage();
  demoState = storage ? resetDemoStorage(storage) : createSeedState();
  marketState = storage ? loadMarketState(storage) : createInitialMarketState();
  loadStatus = 'reset';
  emitDemo();
  emitMarket();
  return demoState;
}

export function useDemoState(): DemoState | null {
  return useSyncExternalStore(subscribeDemo, getDemoState, () => null);
}

/** Use inside the hydrated app shell where the state is guaranteed to exist. */
export function useDemo(): DemoState {
  const s = useDemoState();
  if (!s) throw new Error('useDemo() used before the demo store was initialised');
  return s;
}

// ---------------------------------------------------------------------------
// Simulated market store
// ---------------------------------------------------------------------------

let marketState: MarketState | null = null;
const marketListeners = new Set<Listener>();

function emitMarket() {
  for (const l of marketListeners) l();
}

export function getMarketState(): MarketState | null {
  return marketState;
}

export function subscribeMarket(l: Listener): () => void {
  marketListeners.add(l);
  return () => marketListeners.delete(l);
}

export function advanceMarket(): MarketState | null {
  if (!marketState) return null;
  marketState = tickMarket(marketState, Date.now());
  const storage = getStorage();
  if (storage) saveMarketState(storage, marketState);
  emitMarket();
  return marketState;
}

export function useMarketState(): MarketState | null {
  return useSyncExternalStore(subscribeMarket, getMarketState, () => null);
}

export function useMarket(): MarketState {
  const m = useMarketState();
  if (!m) throw new Error('useMarket() used before the market store was initialised');
  return m;
}

export function currentPrice(symbol: string): number {
  return marketState?.quotes[symbol]?.price ?? 0;
}
