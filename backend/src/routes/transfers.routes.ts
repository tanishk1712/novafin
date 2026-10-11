import { Router } from 'express';
import * as transfers from '../controllers/transfers.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';
import { validate } from '../middleware/validate';

export const transfersRouter = Router();
transfersRouter.use(requireSession);
transfersRouter.get('/', asyncHandler(transfers.listTransfers));
transfersRouter.get('/recipients', asyncHandler(transfers.listRecipients));
transfersRouter.post('/', validate({ body: transfers.transferSchema }), asyncHandler(transfers.createTransfer));
