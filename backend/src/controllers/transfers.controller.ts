import type { Request, Response } from 'express';
import { z } from 'zod';
import { cancelTransaction, transfer } from '@novafin/shared';
import { sessionService } from '../services/session.service';
import { tokenOf } from '../middleware/require-session';
import { created, ok } from '../utils/response';
import { amountSchema, currencySchema } from '../utils/schemas';

export const transferSchema = z
  .object({
    recipientId: z.string().trim().min(1).optional(),
    newRecipient: z
      .object({
        name: z.string().trim().min(2).max(60),
        handle: z.string().trim().min(2).max(80),
        kind: z.enum(['novafin', 'external']),
        country: z.string().trim().min(2).max(3).optional(),
      })
      .strict()
      .optional(),
    saveRecipient: z.boolean().optional(),
    amount: amountSchema,
    currency: currencySchema,
    note: z.string().trim().max(140).optional(),
  })
  .strict()
  .refine((b) => Boolean(b.recipientId) !== Boolean(b.newRecipient), {
    message: 'Provide either recipientId or newRecipient (exactly one).',
    path: ['recipientId'],
  });

export function createTransfer(req: Request, res: Response) {
  const body = req.body as z.infer<typeof transferSchema>;
  const { state, result } = sessionService.withState(tokenOf(req), (s) => transfer(s, body));
  return created(res, { ...result, wallet: state.wallet });
}

export function listTransfers(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  const items = state.transactions.filter((t) => t.category === 'transfer');
  return ok(res, items, 200, { total: items.length });
}

export function listRecipients(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  return ok(res, state.recipients, 200, { total: state.recipients.length });
}

export function cancel(req: Request, res: Response) {
  const { state, result } = sessionService.withState(tokenOf(req), (s) => cancelTransaction(s, req.params.id));
  return ok(res, { transaction: result, wallet: state.wallet });
}
