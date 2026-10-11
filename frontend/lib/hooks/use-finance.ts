'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { computeNetWorth, computePortfolio, walletTotals, type DemoState, type MarketState } from '@novafin/shared';
import { useDemo, useMarket } from '@/lib/store/demo-store';

/** Live portfolio valuation (recomputed whenever holdings or simulated prices change). */
export function usePortfolio(state?: DemoState, market?: MarketState) {
  const s = useDemo();
  const m = useMarket();
  const st = state ?? s;
  const mk = market ?? m;
  return useMemo(() => computePortfolio(st, mk), [st, mk]);
}

export function useNetWorth() {
  const s = useDemo();
  const p = usePortfolio();
  return useMemo(() => computeNetWorth(s, p.marketValue), [s, p.marketValue]);
}

export function useWalletTotals() {
  const s = useDemo();
  return useMemo(() => walletTotals(s), [s]);
}

// ---------------------------------------------------------------------------
// Global trade dialog store (opened from quick actions, tables, stock pages)
// ---------------------------------------------------------------------------

export interface TradeDialogState {
  open: boolean;
  side: 'buy' | 'sell';
  symbol?: string;
}

let tradeState: TradeDialogState = { open: false, side: 'buy' };
const tradeListeners = new Set<() => void>();

export const tradeDialog = {
  open(side: 'buy' | 'sell', symbol?: string) {
    tradeState = { open: true, side, symbol };
    tradeListeners.forEach((l) => l());
  },
  close() {
    tradeState = { ...tradeState, open: false };
    tradeListeners.forEach((l) => l());
  },
};

export function useTradeDialog(): TradeDialogState {
  return useSyncExternalStore(
    (l) => {
      tradeListeners.add(l);
      return () => tradeListeners.delete(l);
    },
    () => tradeState,
    () => tradeState,
  );
}
