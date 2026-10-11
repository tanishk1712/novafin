import type { Request, Response } from 'express';
import { getMarketSummary, getUsMarketStatus } from '@novafin/shared';
import { marketService } from '../services/market.service';
import { ok } from '../utils/response';

export function marketSummary(_req: Request, res: Response) {
  const market = marketService.getMarket();
  return ok(res, {
    ...getMarketSummary(market),
    status: getUsMarketStatus(),
    tickCount: market.tickCount,
    lastTick: market.lastTick,
    simulatorRunning: marketService.isRunning(),
  });
}
