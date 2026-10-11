import { Router } from 'express';
import * as bank from '../controllers/bank-accounts.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../utils/schemas';

export const bankAccountsRouter = Router();
bankAccountsRouter.use(requireSession);
bankAccountsRouter.get('/', asyncHandler(bank.listBankAccounts));
bankAccountsRouter.post('/', validate({ body: bank.bankAccountSchema }), asyncHandler(bank.createBankAccount));
bankAccountsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: bank.bankAccountPatchSchema }),
  asyncHandler(bank.patchBankAccount),
);
bankAccountsRouter.delete('/:id', validate({ params: idParamSchema }), asyncHandler(bank.deleteBankAccount));
