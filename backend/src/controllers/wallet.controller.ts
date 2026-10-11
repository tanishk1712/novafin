import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  FUNDING_METHODS,
  computeNetWorth,
  computePortfolio,
  deposit as depositOp,
  walletTotals,
  withdraw as withdrawOp,
  type DemoState,
  type FundingMethod,
} from '@novafin/shared';
import { sessionService } from '../services/session.service';
import { marketService } from '../services/market.service';
import { tokenOf } from '../middleware/require-session';
import { created, ok } from '../utils/response';
import { amountSchema, currencySchema } from '../utils/schemas';

const FUNDING_METHOD_KEYS = Object.keys(FUNDING_METHODS) as [FundingMethod, ...FundingMethod[]];

export const depositSchema = z
  .object({
    amount: amountSchema,
    method: z.enum(FUNDING_METHOD_KEYS),
    currency: currencySchema.optional(),
  })
  .strict();

export const withdrawSchema = z
  .object({
    amount: amountSchema,
    bankAccountId: z.string().trim().min(1, 'bankAccountId is required.'),
    speed: z.enum(['standard', 'instant']),
  })
  .strict();

export function walletOverview(state: DemoState) {
  const portfolio = computePortfolio(state, marketService.getMarket());
  return {
    wallet: state.wallet,
    netWorth: computeNetWorth(state, portfolio.marketValue),
    totals: walletTotals(state),
    portfolioValue: portfolio.marketValue,
  };
}

export function getWallet(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  return ok(res, walletOverview(state));
}

export function deposit(req: Request, res: Response) {
  const body = req.body as z.infer<typeof depositSchema>;
  const { state, result } = sessionService.withState(tokenOf(req), (s) => depositOp(s, body));
  return created(res, { ...result, wallet: state.wallet });
}

export function withdraw(req: Request, res: Response) {
  const body = req.body as z.infer<typeof withdrawSchema>;
  const { state, result } = sessionService.withState(tokenOf(req), (s) => withdrawOp(s, body));
  return created(res, { ...result, wallet: state.wallet });
}
