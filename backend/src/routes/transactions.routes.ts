import { Router } from 'express';
import * as transactions from '../controllers/transactions.controller';
import { cancel } from '../controllers/transfers.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../utils/schemas';

export const transactionsRouter = Router();
transactionsRouter.use(requireSession);
transactionsRouter.get('/', validate({ query: transactions.transactionsQuerySchema }), asyncHandler(transactions.listTransactions));
transactionsRouter.get('/:id', validate({ params: idParamSchema }), asyncHandler(transactions.getTransaction));
transactionsRouter.post('/:id/cancel', validate({ params: idParamSchema }), asyncHandler(cancel));
