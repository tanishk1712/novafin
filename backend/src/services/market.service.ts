import {
  createInitialMarketState,
  getQuotePrice,
  priceMap,
  tickMarket,
  type LiveQuote,
  type MarketState,
} from '@novafin/shared';

/**
 * Singleton SIMULATED market shared by every demo session.
 * Importing this module never starts a timer — call `start()` explicitly (server.ts does).
 */
class MarketService {
  private market: MarketState = createInitialMarketState();
  private timer: NodeJS.Timeout | null = null;

  getMarket(): MarketState {
    return this.market;
  }

  getQuote(symbol: string): LiveQuote | undefined {
    return this.market.quotes[symbol.toUpperCase()];
  }

  /** Server-side execution price. Clients never supply prices. */
  getPrice(symbol: string): number {
    return getQuotePrice(this.market, symbol.toUpperCase());
  }

  prices(): Record<string, number> {
    return priceMap(this.market);
  }

  tick(now = Date.now()): MarketState {
    this.market = tickMarket(this.market, now);
    return this.market;
  }

  start(intervalMs: number): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      try {
        this.tick();
      } catch (err) {
        console.error('[novafin] market tick failed', err);
      }
    }, intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  isRunning(): boolean {
    return this.timer !== null;
  }

  /** Resets the simulated market (used by tests). */
  reset(now = Date.now()): void {
    this.market = createInitialMarketState(now);
  }
}

export const marketService = new MarketService();
export type { MarketService };
