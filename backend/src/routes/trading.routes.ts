import { Router } from 'express';
import * as trading from '../controllers/trading.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';
import { validate } from '../middleware/validate';
import { symbolParamSchema } from '../utils/schemas';

/** Mounted at /api: /portfolio, /orders, /watchlist. */
export const tradingRouter = Router();
tradingRouter.get('/portfolio', requireSession, asyncHandler(trading.getPortfolio));
tradingRouter.get('/orders', requireSession, validate({ query: trading.ordersQuerySchema }), asyncHandler(trading.listOrders));
tradingRouter.post('/orders/buy', requireSession, validate({ body: trading.orderSchema }), asyncHandler(trading.buy));
tradingRouter.post('/orders/sell', requireSession, validate({ body: trading.orderSchema }), asyncHandler(trading.sell));
tradingRouter.get('/watchlist', requireSession, asyncHandler(trading.getWatchlist));
tradingRouter.post('/watchlist', requireSession, validate({ body: trading.watchlistAddSchema }), asyncHandler(trading.addWatchlist));
tradingRouter.delete(
  '/watchlist/:symbol',
  requireSession,
  validate({ params: symbolParamSchema }),
  asyncHandler(trading.removeWatchlist),
);
tradingRouter.patch(
  '/watchlist/:symbol',
  requireSession,
  validate({ params: symbolParamSchema, body: trading.watchlistAlertSchema }),
  asyncHandler(trading.updateWatchlistAlert),
);
