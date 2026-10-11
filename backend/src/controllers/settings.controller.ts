import type { Request, Response } from 'express';
import { z } from 'zod';
import { updateSettings } from '@novafin/shared';
import { sessionService } from '../services/session.service';
import { tokenOf } from '../middleware/require-session';
import { ok } from '../utils/response';
import { currencySchema } from '../utils/schemas';

export const settingsPatchSchema = z
  .object({
    displayCurrency: currencySchema,
    secondaryCurrency: currencySchema,
    marketSimulation: z.boolean(),
    marketTickMs: z.number().int().min(3000).max(60000),
    notifyTransactions: z.boolean(),
    notifyMarket: z.boolean(),
    notifySecurity: z.boolean(),
    settlementSeconds: z.number().int().min(5).max(3600),
    hideBalances: z.boolean(),
  })
  .partial()
  .strict()
  .refine((b) => Object.keys(b).length > 0, { message: 'Provide at least one setting to update.' });

export function getSettings(req: Request, res: Response) {
  return ok(res, sessionService.getState(tokenOf(req)).settings);
}

export function patchSettings(req: Request, res: Response) {
  const patch = req.body as z.infer<typeof settingsPatchSchema>;
  const { result } = sessionService.withState(tokenOf(req), (s) => updateSettings(s, patch));
  return ok(res, result);
}
