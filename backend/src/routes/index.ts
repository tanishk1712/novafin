import { Router } from 'express';
import { ok } from '../utils/response';
import { authRouter } from './auth.routes';
import { walletRouter } from './wallet.routes';
import { bankAccountsRouter } from './bank-accounts.routes';
import { transfersRouter } from './transfers.routes';
import { exchangeRouter } from './exchange.routes';
import { stocksRouter } from './stocks.routes';
import { marketRouter } from './market.routes';
import { tradingRouter } from './trading.routes';
import { transactionsRouter } from './transactions.routes';
import { notificationsRouter } from './notifications.routes';
import { qrRouter } from './qr.routes';
import { settingsRouter } from './settings.routes';
import { demoRouter } from './demo.routes';

export function createApiRouter(): Router {
  const api = Router();
  api.get('/health', (_req, res) => {
    ok(res, {
      status: 'ok',
      uptime: Math.round(process.uptime() * 1000) / 1000,
      timestamp: new Date().toISOString(),
      simulated: true,
    });
  });
  api.use('/auth', authRouter);
  api.use('/wallet', walletRouter);
  api.use('/bank-accounts', bankAccountsRouter);
  api.use('/transfers', transfersRouter);
  api.use('/exchange', exchangeRouter);
  api.use('/stocks', stocksRouter);
  api.use('/market', marketRouter);
  api.use('/transactions', transactionsRouter);
  api.use('/notifications', notificationsRouter);
  api.use('/qr', qrRouter);
  api.use('/settings', settingsRouter);
  api.use('/demo', demoRouter);
  api.use('/', tradingRouter); // /portfolio, /orders, /watchlist
  return api;
}
