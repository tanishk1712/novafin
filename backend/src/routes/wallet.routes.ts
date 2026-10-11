import { Router } from 'express';
import * as wallet from '../controllers/wallet.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';
import { validate } from '../middleware/validate';

export const walletRouter = Router();
walletRouter.use(requireSession);
walletRouter.get('/', asyncHandler(wallet.getWallet));
walletRouter.post('/deposit', validate({ body: wallet.depositSchema }), asyncHandler(wallet.deposit));
walletRouter.post('/withdraw', validate({ body: wallet.withdrawSchema }), asyncHandler(wallet.withdraw));
