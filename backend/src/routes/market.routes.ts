import { Router } from 'express';
import * as market from '../controllers/market.controller';
import { asyncHandler } from '../middleware/async-handler';

export const marketRouter = Router();
marketRouter.get('/summary', asyncHandler(market.marketSummary));
