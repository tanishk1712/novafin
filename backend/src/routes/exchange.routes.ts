import { Router } from 'express';
import * as fx from '../controllers/exchange.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';
import { validate } from '../middleware/validate';

export const exchangeRouter = Router();
// Public (simulated, illustrative rates)
exchangeRouter.get('/rates', asyncHandler(fx.getRates));
exchangeRouter.get('/rates/history', validate({ query: fx.rateHistoryQuerySchema }), asyncHandler(fx.getRateHistoryHandler));
exchangeRouter.get('/quote', validate({ query: fx.quoteQuerySchema }), asyncHandler(fx.getQuote));
// Session
exchangeRouter.get('/history', requireSession, asyncHandler(fx.exchangeHistory));
exchangeRouter.post('/', requireSession, validate({ body: fx.exchangeSchema }), asyncHandler(fx.createExchange));
