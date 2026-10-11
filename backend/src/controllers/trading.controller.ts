import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  STOCKS_BY_SYMBOL,
  addToWatchlist,
  buyStock,
  computePortfolio,
  isDemoError,
  recordRejectedOrder,
  removeFromWatchlist,
  sellStock,
  setWatchlistAlert,
  type DemoState,
  type TradeInput,
  type TradeResult,
  type OperationResult,
} from '@novafin/shared';
import { sessionService } from '../services/session.service';
import { marketService } from '../services/market.service';
import { tokenOf } from '../middleware/require-session';
import { notFound } from '../utils/http-error';
import { created, ok } from '../utils/response';
import { symbolSchema } from '../utils/schemas';

export const orderSchema = z
  .object({
    symbol: symbolSchema,
    quantity: z
      .number({ required_error: 'Quantity is required.', invalid_type_error: 'Quantity must be a number.' })
      .finite()
      .positive('Quantity must be greater than zero.'),
  })
  .strict();

export const ordersQuerySchema = z.object({
  status: z.enum(['filled', 'rejected', 'cancelled', 'pending']).optional(),
  side: z.enum(['buy', 'sell']).optional(),
  symbol: symbolSchema.optional(),
});

export const watchlistAddSchema = z.object({ symbol: symbolSchema }).strict();

const alertValue = z.number().finite().positive('Alert prices must be positive.').nullable().optional();
export const watchlistAlertSchema = z
  .object({ alertAbove: alertValue, alertBelow: alertValue })
  .strict()
  .refine((b) => b.alertAbove !== undefined || b.alertBelow !== undefined, {
    message: 'Provide alertAbove and/or alertBelow (null clears an alert).',
  });

export function getPortfolio(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  const market = marketService.getMarket();
  return ok(res, computePortfolio(state, market), 200, { lastTick: market.lastTick, simulated: true });
}

type TradeOp = (state: DemoState, input: TradeInput) => OperationResult<TradeResult>;

/** Executes a market order at the SERVER's simulated price. Rejections are recorded in order history. */
function executeOrder(side: 'buy' | 'sell', op: TradeOp) {
  return (req: Request, res: Response) => {
    const token = tokenOf(req);
    const { symbol, quantity } = req.body as z.infer<typeof orderSchema>;
    const price = marketService.getPrice(symbol);
    try {
      const { state, result } = sessionService.withState(token, (s) => op(s, { symbol, quantity, price }));
      return created(res, { ...result, executionPrice: price, wallet: state.wallet }, { simulated: true, priceSource: 'server-simulated-market' });
    } catch (err) {
      if (isDemoError(err) && STOCKS_BY_SYMBOL[symbol]) {
        sessionService.withState(token, (s) => recordRejectedOrder(s, { symbol, side, quantity, price, reason: err.message }));
      }
      throw err;
    }
  };
}

export const buy = executeOrder('buy', buyStock);
export const sell = executeOrder('sell', sellStock);

export function listOrders(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  const q = res.locals.query as z.infer<typeof ordersQuerySchema>;
  const items = state.orders.filter(
    (o) => (!q.status || o.status === q.status) && (!q.side || o.side === q.side) && (!q.symbol || o.symbol === q.symbol),
  );
  return ok(res, items, 200, { total: items.length });
}

function enrichWatchlist(state: DemoState) {
  return state.watchlist.map((w) => {
    const seed = STOCKS_BY_SYMBOL[w.symbol];
    const quote = marketService.getQuote(w.symbol);
    return {
      ...w,
      name: seed?.name ?? w.symbol,
      sector: seed?.sector ?? null,
      type: seed?.type ?? null,
      price: quote?.price ?? seed?.price ?? null,
      change: quote?.change ?? null,
      changePercent: quote?.changePercent ?? null,
      quote: quote ?? null,
    };
  });
}

export function getWatchlist(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  const items = enrichWatchlist(state);
  return ok(res, items, 200, { total: items.length, simulated: true });
}

export function addWatchlist(req: Request, res: Response) {
  const { symbol } = req.body as z.infer<typeof watchlistAddSchema>;
  const token = tokenOf(req);
  const existed = sessionService.getState(token).watchlist.some((w) => w.symbol === symbol);
  const { state } = sessionService.withState(token, (s) => addToWatchlist(s, symbol));
  const items = enrichWatchlist(state);
  return ok(res, items, existed ? 200 : 201, { added: !existed, total: items.length });
}

export function removeWatchlist(req: Request, res: Response) {
  const symbol = String(res.locals.params?.symbol ?? req.params.symbol).toUpperCase();
  const token = tokenOf(req);
  if (!sessionService.getState(token).watchlist.some((w) => w.symbol === symbol)) {
    throw notFound(`${symbol} is not on your watchlist.`);
  }
  const { state } = sessionService.withState(token, (s) => removeFromWatchlist(s, symbol));
  const items = enrichWatchlist(state);
  return ok(res, items, 200, { removed: symbol, total: items.length });
}

export function updateWatchlistAlert(req: Request, res: Response) {
  const symbol = String(res.locals.params?.symbol ?? req.params.symbol).toUpperCase();
  const body = req.body as z.infer<typeof watchlistAlertSchema>;
  const { state } = sessionService.withState(tokenOf(req), (s) => {
    const item = s.watchlist.find((w) => w.symbol === symbol);
    // Omitted keys keep their current value; null clears.
    const above = body.alertAbove === undefined ? item?.alertAbove : body.alertAbove;
    const below = body.alertBelow === undefined ? item?.alertBelow : body.alertBelow;
    return setWatchlistAlert(s, symbol, { above, below }, marketService.getPrice(symbol) || undefined);
  });
  const items = enrichWatchlist(state);
  return ok(res, items.find((w) => w.symbol === symbol) ?? null, 200, { total: items.length });
}
