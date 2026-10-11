import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  CURRENCIES,
  DEMO_RATES_AS_OF,
  DEMO_RATES_PER_USD,
  EXCHANGE_FEE_PERCENT,
  exchange,
  getRateHistory,
  getRateMatrix,
  quoteExchange,
} from '@novafin/shared';
import { sessionService } from '../services/session.service';
import { tokenOf } from '../middleware/require-session';
import { created, ok } from '../utils/response';
import { amountSchema, currencySchema } from '../utils/schemas';

const differentCurrencies = (v: { from: string; to: string }) => v.from !== v.to;
const sameCurrencyMessage = { message: 'Source and target currencies must differ.', path: ['to'] };

export const exchangeSchema = z
  .object({ from: currencySchema, to: currencySchema, amount: amountSchema })
  .strict()
  .refine(differentCurrencies, sameCurrencyMessage);

export const quoteQuerySchema = z
  .object({ from: currencySchema, to: currencySchema, amount: z.coerce.number().finite().positive('Amount must be greater than zero.') })
  .refine(differentCurrencies, sameCurrencyMessage);

export const rateHistoryQuerySchema = z.object({
  currency: currencySchema,
  days: z.coerce.number().int().min(2).max(365).default(180),
});

export function getRates(_req: Request, res: Response) {
  return ok(res, {
    base: 'USD',
    ratesPerUsd: DEMO_RATES_PER_USD,
    matrix: getRateMatrix(),
    feePercent: EXCHANGE_FEE_PERCENT,
    asOf: DEMO_RATES_AS_OF,
    currencies: CURRENCIES,
    simulated: true,
  });
}

export function getQuote(_req: Request, res: Response) {
  const q = res.locals.query as z.infer<typeof quoteQuerySchema>;
  return ok(res, { ...quoteExchange(q.from, q.to, q.amount), simulated: true });
}

export function getRateHistoryHandler(_req: Request, res: Response) {
  const q = res.locals.query as z.infer<typeof rateHistoryQuerySchema>;
  return ok(res, { currency: q.currency, base: 'USD', points: getRateHistory(q.currency, q.days), simulated: true });
}

export function createExchange(req: Request, res: Response) {
  const body = req.body as z.infer<typeof exchangeSchema>;
  const { state, result } = sessionService.withState(tokenOf(req), (s) => exchange(s, body));
  return created(res, { ...result, wallet: state.wallet });
}

export function exchangeHistory(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  return ok(res, state.exchangeHistory, 200, { total: state.exchangeHistory.length });
}
