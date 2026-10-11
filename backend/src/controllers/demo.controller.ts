import type { Request, Response } from 'express';
import { sessionService } from '../services/session.service';
import { tokenOf } from '../middleware/require-session';
import { ok } from '../utils/response';
import { walletOverview } from './wallet.controller';

/** Replaces the session's demo data with a freshly seeded state (identity is kept). */
export function reset(req: Request, res: Response) {
  const state = sessionService.reset(tokenOf(req));
  return ok(
    res,
    {
      user: state.user,
      ...walletOverview(state),
      counts: {
        transactions: state.transactions.length,
        bankAccounts: state.bankAccounts.length,
        holdings: state.portfolio.length,
        orders: state.orders.length,
        watchlist: state.watchlist.length,
        notifications: state.notifications.length,
      },
      settings: state.settings,
    },
    200,
    { simulated: true, reset: true },
  );
}
