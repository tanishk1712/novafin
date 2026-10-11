import { Router } from 'express';
import * as stocks from '../controllers/stocks.controller';
import { asyncHandler } from '../middleware/async-handler';
import { validate } from '../middleware/validate';
import { symbolParamSchema } from '../utils/schemas';

export const stocksRouter = Router();
stocksRouter.get('/', validate({ query: stocks.stocksQuerySchema }), asyncHandler(stocks.listStocks));
stocksRouter.get('/:symbol', validate({ params: symbolParamSchema }), asyncHandler(stocks.getStock));
stocksRouter.get(
  '/:symbol/history',
  validate({ params: symbolParamSchema, query: stocks.historyQuerySchema }),
  asyncHandler(stocks.getStockHistory),
);
