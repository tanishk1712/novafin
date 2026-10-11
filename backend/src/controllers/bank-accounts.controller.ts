import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  addBankAccount,
  removeBankAccount,
  setDefaultBankAccount,
  updateBankAccount,
  verifyBankAccount,
  type DemoState,
} from '@novafin/shared';
import { sessionService } from '../services/session.service';
import { tokenOf } from '../middleware/require-session';
import { created, ok } from '../utils/response';
import { currencySchema } from '../utils/schemas';

export const bankAccountSchema = z
  .object({
    nickname: z.string().trim().min(2).max(40),
    bankName: z.string().trim().min(2).max(80),
    holderName: z.string().trim().min(2).max(80),
    country: z.string().trim().min(2).max(3).transform((s) => s.toUpperCase()),
    currency: currencySchema,
    accountType: z.enum(['checking', 'savings', 'current']),
    accountNumber: z.string().trim().min(4).max(34),
    routingCode: z.string().trim().min(4).max(34),
    makeDefault: z.boolean().optional(),
  })
  .strict();

export const bankAccountPatchSchema = z
  .object({
    nickname: z.string().trim().min(2).max(40).optional(),
    isDefault: z.literal(true).optional(),
    verify: z.literal(true).optional(),
  })
  .strict()
  .refine((b) => b.nickname !== undefined || b.isDefault || b.verify, {
    message: 'Provide at least one of nickname, isDefault: true or verify: true.',
  });

export function listBankAccounts(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  return ok(res, state.bankAccounts, 200, { total: state.bankAccounts.length });
}

export function createBankAccount(req: Request, res: Response) {
  const body = req.body as z.infer<typeof bankAccountSchema>;
  const { result } = sessionService.withState(tokenOf(req), (s) => addBankAccount(s, body));
  return created(res, result);
}

export function patchBankAccount(req: Request, res: Response) {
  const { id } = req.params;
  const body = req.body as z.infer<typeof bankAccountPatchSchema>;
  const { result } = sessionService.withState(tokenOf(req), (s) => {
    let next: DemoState = s;
    if (body.nickname !== undefined) next = updateBankAccount(next, id, { nickname: body.nickname }).state;
    if (body.verify) next = verifyBankAccount(next, id).state;
    if (body.isDefault) next = setDefaultBankAccount(next, id).state;
    return { state: next, result: next.bankAccounts.find((b) => b.id === id)! };
  });
  return ok(res, result);
}

export function deleteBankAccount(req: Request, res: Response) {
  const { result, state } = sessionService.withState(tokenOf(req), (s) => removeBankAccount(s, req.params.id));
  return ok(res, { removed: result, bankAccounts: state.bankAccounts });
}
