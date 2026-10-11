import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { STOCKS_SEED } from '@novafin/shared';
import { createApp } from '../src/app';
import { sessionService } from '../src/services/session.service';
import { marketService } from '../src/services/market.service';

let app: Express;

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function login(name?: string): Promise<string> {
  const res = await request(app).post('/api/auth/demo-login').send(name ? { name } : {});
  expect(res.status).toBe(201);
  return res.body.data.token as string;
}

beforeAll(() => {
  app = createApp({
    port: 0,
    corsOrigins: ['http://localhost:3000'],
    marketTickMs: 7000,
    sessionTtlMinutes: 240,
    nodeEnv: 'test',
  });
});

afterAll(() => {
  sessionService.clear();
  marketService.stop();
});

describe('health & basics', () => {
  it('GET /api/health returns ok with the simulated header', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.simulated).toBe(true);
    expect(typeof res.body.data.uptime).toBe('number');
    expect(res.headers['x-novafin-demo']).toBe('simulated');
  });

  it('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('malformed JSON returns 400', async () => {
    const token = await login();
    const res = await request(app)
      .post('/api/wallet/deposit')
      .set(auth(token))
      .set('Content-Type', 'application/json')
      .send('{"amount": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('auth', () => {
  it('demo-login returns a token and user; protected routes need it', async () => {
    const res = await request(app).post('/api/auth/demo-login').send({ name: 'Test Pilot' });
    expect(res.status).toBe(201);
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user.name).toBe('Test Pilot');
    expect(res.body.data.user.walletId).toMatch(/^NVF-\d{4}-\d{4}$/);

    const noToken = await request(app).get('/api/wallet');
    expect(noToken.status).toBe(401);
    expect(noToken.body.error.code).toBe('UNAUTHORIZED');

    const badToken = await request(app).get('/api/wallet').set(auth('nope'));
    expect(badToken.status).toBe(401);

    const me = await request(app).get('/api/auth/me').set(auth(res.body.data.token));
    expect(me.status).toBe(200);
    expect(me.body.data.user.name).toBe('Test Pilot');
  });

  it('logout invalidates the token', async () => {
    const token = await login();
    const out = await request(app).post('/api/auth/logout').set(auth(token));
    expect(out.status).toBe(200);
    const after = await request(app).get('/api/auth/me').set(auth(token));
    expect(after.status).toBe(401);
  });
});

describe('wallet', () => {
  it('starts with USD 25,000 and deposits/withdrawals validate', async () => {
    const token = await login();
    const w = await request(app).get('/api/wallet').set(auth(token));
    expect(w.status).toBe(200);
    expect(w.body.data.wallet.balances.USD).toBe(25000);
    expect(w.body.data.netWorth.total).toBeGreaterThan(25000);
    expect(w.body.data.portfolioValue).toBeGreaterThan(0);
    expect(w.body.data.totals).toBeDefined();

    const dep = await request(app).post('/api/wallet/deposit').set(auth(token)).send({ amount: 500, method: 'bank_transfer' });
    expect(dep.status).toBe(201);
    expect(dep.body.data.wallet.balances.USD).toBe(25500);
    const w2 = await request(app).get('/api/wallet').set(auth(token));
    expect(w2.body.data.wallet.balances.USD).toBe(25500);

    const zero = await request(app).post('/api/wallet/deposit').set(auth(token)).send({ amount: 0, method: 'bank_transfer' });
    expect(zero.status).toBe(400);
    expect(zero.body.error.code).toBe('VALIDATION_ERROR');

    const badCurrency = await request(app)
      .post('/api/wallet/deposit')
      .set(auth(token))
      .send({ amount: 10, method: 'bank_transfer', currency: 'XXX' });
    expect(badCurrency.status).toBe(400);

    const accounts = await request(app).get('/api/bank-accounts').set(auth(token));
    expect(accounts.status).toBe(200);
    const usd = accounts.body.data.find((b: { currency: string; verification: string }) => b.currency === 'USD' && b.verification === 'verified');
    expect(usd).toBeDefined();

    // Drain most of the cash, then try to withdraw more than what is left.
    const first = await request(app)
      .post('/api/wallet/withdraw')
      .set(auth(token))
      .send({ amount: 20000, bankAccountId: usd.id, speed: 'standard' });
    expect(first.status).toBe(201);
    expect(first.body.data.transaction.status).toBe('processing');

    const over = await request(app)
      .post('/api/wallet/withdraw')
      .set(auth(token))
      .send({ amount: 6000, bankAccountId: usd.id, speed: 'standard' });
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe('INSUFFICIENT_FUNDS');

    // Pending withdrawal can be cancelled (refunds amount + fee)
    const cancel = await request(app).post(`/api/transactions/${first.body.data.transaction.id}/cancel`).set(auth(token));
    expect(cancel.status).toBe(200);
    expect(cancel.body.data.wallet.balances.USD).toBe(25500);
  });
});

describe('exchange', () => {
  it('public rates and quote', async () => {
    const rates = await request(app).get('/api/exchange/rates');
    expect(rates.status).toBe(200);
    expect(rates.body.data.base).toBe('USD');
    expect(rates.body.data.ratesPerUsd.INR).toBe(85);
    expect(rates.body.data.simulated).toBe(true);

    const quote = await request(app).get('/api/exchange/quote').query({ from: 'USD', to: 'INR', amount: 100 });
    expect(quote.status).toBe(200);
    expect(quote.body.data.toAmount).toBe(8415);

    const bad = await request(app).get('/api/exchange/quote').query({ from: 'USD', to: 'USD', amount: 100 });
    expect(bad.status).toBe(400);
  });

  it('100 USD → INR credits 8415 and appears in history', async () => {
    const token = await login();
    const res = await request(app).post('/api/exchange').set(auth(token)).send({ from: 'USD', to: 'INR', amount: 100 });
    expect(res.status).toBe(201);
    expect(res.body.data.record.toAmount).toBe(8415);
    const hist = await request(app).get('/api/exchange/history').set(auth(token));
    expect(hist.status).toBe(200);
    expect(hist.body.data[0].toAmount).toBe(8415);
  });
});

describe('stocks & market', () => {
  it('lists stocks with pagination and no history arrays', async () => {
    const res = await request(app).get('/api/stocks').query({ page: 2, pageSize: 10, sort: 'price', order: 'desc' });
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(10);
    expect(res.body.meta).toMatchObject({ total: STOCKS_SEED.length, page: 2, pageSize: 10 });
    expect(res.body.data[0].history).toBeUndefined();
    expect(res.body.data[0].volumeHistory).toBeUndefined();
    expect(res.body.data[0].price).toBeGreaterThanOrEqual(res.body.data[9].price);

    const tooBig = await request(app).get('/api/stocks').query({ pageSize: 500 });
    expect(tooBig.status).toBe(400);

    const search = await request(app).get('/api/stocks').query({ search: 'AAPL' });
    expect(search.body.data.some((s: { symbol: string }) => s.symbol === 'AAPL')).toBe(true);
  });

  it('stock detail, 404s and 1Y history', async () => {
    const detail = await request(app).get('/api/stocks/aapl');
    expect(detail.status).toBe(200);
    expect(detail.body.data.symbol).toBe('AAPL');
    expect(detail.body.data.quote.price).toBeGreaterThan(0);

    const missing = await request(app).get('/api/stocks/NOPE');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');

    const hist = await request(app).get('/api/stocks/AAPL/history').query({ range: '1Y' });
    expect(hist.status).toBe(200);
    expect(hist.body.data.range).toBe('1Y');
    expect(hist.body.data.prices.length).toBeGreaterThan(200);

    const badRange = await request(app).get('/api/stocks/AAPL/history').query({ range: '2Y' });
    expect(badRange.status).toBe(400);
  });

  it('symbols containing a dot resolve when present', async () => {
    const dotted = STOCKS_SEED.find((s) => s.symbol.includes('.'));
    if (!dotted) return;
    const res = await request(app).get(`/api/stocks/${dotted.symbol}`);
    expect(res.status).toBe(200);
    expect(res.body.data.symbol).toBe(dotted.symbol);
  });

  it('market summary includes status', async () => {
    const res = await request(app).get('/api/market/summary');
    expect(res.status).toBe(200);
    expect(res.body.data.indices.length).toBeGreaterThan(0);
    expect(res.body.data.status.label).toBeDefined();
    expect(res.body.data.simulated).toBe(true);
  });
});

describe('trading', () => {
  it('buy then sell updates the portfolio at the server price', async () => {
    const token = await login();
    const serverPrice = marketService.getPrice('MSFT');

    const before = await request(app).get('/api/portfolio').set(auth(token));
    const sharesBefore = before.body.data.positions.find((p: { symbol: string }) => p.symbol === 'MSFT')?.shares ?? 0;

    const buy = await request(app).post('/api/orders/buy').set(auth(token)).send({ symbol: 'MSFT', quantity: 2 });
    expect(buy.status).toBe(201);
    expect(buy.body.data.order.status).toBe('filled');
    expect(buy.body.data.order.price).toBe(serverPrice);

    const tampered = await request(app).post('/api/orders/buy').set(auth(token)).send({ symbol: 'MSFT', quantity: 1, price: 0.01 });
    expect(tampered.status).toBe(400);

    const mid = await request(app).get('/api/portfolio').set(auth(token));
    const sharesMid = mid.body.data.positions.find((p: { symbol: string }) => p.symbol === 'MSFT').shares;
    expect(sharesMid).toBeCloseTo(sharesBefore + 2, 6);

    const sell = await request(app).post('/api/orders/sell').set(auth(token)).send({ symbol: 'MSFT', quantity: 1 });
    expect(sell.status).toBe(201);
    const after = await request(app).get('/api/portfolio').set(auth(token));
    const sharesAfter = after.body.data.positions.find((p: { symbol: string }) => p.symbol === 'MSFT').shares;
    expect(sharesAfter).toBeCloseTo(sharesBefore + 1, 6);
  });

  it('selling more than owned → 422 and a rejected order is recorded', async () => {
    const token = await login();
    const res = await request(app).post('/api/orders/sell').set(auth(token)).send({ symbol: 'AAPL', quantity: 100000 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('INSUFFICIENT_SHARES');

    const orders = await request(app).get('/api/orders').query({ status: 'rejected' }).set(auth(token));
    expect(orders.status).toBe(200);
    expect(orders.body.data.length).toBeGreaterThanOrEqual(1);
    expect(orders.body.data[0]).toMatchObject({ symbol: 'AAPL', side: 'sell', status: 'rejected' });
  });

  it('watchlist add / alert / remove', async () => {
    const token = await login();
    const add = await request(app).post('/api/watchlist').set(auth(token)).send({ symbol: 'nvda' });
    expect([200, 201]).toContain(add.status);
    expect(add.body.data.some((w: { symbol: string }) => w.symbol === 'NVDA')).toBe(true);

    const alert = await request(app).patch('/api/watchlist/NVDA').set(auth(token)).send({ alertAbove: 99999 });
    expect(alert.status).toBe(200);
    expect(alert.body.data.alertAbove).toBe(99999);

    const del = await request(app).delete('/api/watchlist/NVDA').set(auth(token));
    expect(del.status).toBe(200);
    const again = await request(app).delete('/api/watchlist/NVDA').set(auth(token));
    expect(again.status).toBe(404);

    const unknown = await request(app).post('/api/watchlist').set(auth(token)).send({ symbol: 'NOPE' });
    expect(unknown.status).toBe(404);
  });
});

describe('transactions', () => {
  it('lists, filters, paginates and 404s', async () => {
    const token = await login();
    const list = await request(app).get('/api/transactions').query({ pageSize: 5 }).set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(5);
    expect(list.body.meta.total).toBeGreaterThan(5);

    const deposits = await request(app).get('/api/transactions').query({ category: 'deposit' }).set(auth(token));
    expect(deposits.body.data.every((t: { category: string }) => t.category === 'deposit')).toBe(true);

    const one = await request(app).get(`/api/transactions/${list.body.data[0].id}`).set(auth(token));
    expect(one.status).toBe(200);
    const missing = await request(app).get('/api/transactions/tx_missing').set(auth(token));
    expect(missing.status).toBe(404);
  });
});

describe('QR payments', () => {
  it('session A requests, session B validates and pays once; replay → 409', async () => {
    const a = await login('Alice Payee');
    const b = await login('Bob Payer');

    const created = await request(app)
      .post('/api/qr/payment-request')
      .set(auth(a))
      .send({ amount: 12.5, currency: 'USD', note: 'Lunch' });
    expect(created.status).toBe(201);
    const payload: string = created.body.data.payload;
    expect(typeof payload).toBe('string');

    const bBefore = (await request(app).get('/api/wallet').set(auth(b))).body.data.wallet.balances.USD;
    const aBefore = (await request(app).get('/api/wallet').set(auth(a))).body.data.wallet.balances.USD;

    const valid = await request(app).post('/api/qr/validate').set(auth(b)).send({ payload });
    expect(valid.status).toBe(200);
    expect(valid.body.data.valid).toBe(true);
    expect(valid.body.data.payment.amount).toBe(12.5);
    // validation never moves money
    expect((await request(app).get('/api/wallet').set(auth(b))).body.data.wallet.balances.USD).toBe(bBefore);

    const noConfirm = await request(app).post('/api/qr/pay').set(auth(b)).send({ payload });
    expect(noConfirm.status).toBe(400);
    const falseConfirm = await request(app).post('/api/qr/pay').set(auth(b)).send({ payload, confirm: 'true' });
    expect(falseConfirm.status).toBe(400);

    const paid = await request(app).post('/api/qr/pay').set(auth(b)).send({ payload, confirm: true });
    expect(paid.status).toBe(201);
    expect(paid.body.data.transaction.amount).toBe(12.5);
    expect(paid.body.data.wallet.balances.USD).toBeCloseTo(bBefore - 12.5, 2);
    expect(paid.body.data.payeeCredited).toBe(true);
    expect((await request(app).get('/api/wallet').set(auth(a))).body.data.wallet.balances.USD).toBeCloseTo(aBefore + 12.5, 2);

    const replay = await request(app).post('/api/qr/pay').set(auth(b)).send({ payload, confirm: true });
    expect(replay.status).toBe(409);
    expect(replay.body.error.code).toBe('DUPLICATE_PAYMENT');

    const self = await request(app).post('/api/qr/validate').set(auth(a)).send({ payload });
    expect(self.status).toBe(400);

    const tampered = await request(app)
      .post('/api/qr/validate')
      .set(auth(b))
      .send({ payload: payload.replace('12.5', '1.25') });
    expect(tampered.status).toBe(400);
    expect(tampered.body.error.code).toBe('QR_INVALID');
  });
});

describe('notifications, settings & reset', () => {
  it('read-all clears unread count', async () => {
    const token = await login();
    const before = await request(app).get('/api/notifications').set(auth(token));
    expect(before.status).toBe(200);
    expect(before.body.meta.unreadCount).toBeGreaterThan(0);

    const all = await request(app).post('/api/notifications/read-all').set(auth(token));
    expect(all.status).toBe(200);

    const unread = await request(app).get('/api/notifications').query({ filter: 'unread' }).set(auth(token));
    expect(unread.body.data).toHaveLength(0);
    expect(unread.body.meta.unreadCount).toBe(0);

    const id = before.body.data[0].id;
    const del = await request(app).delete(`/api/notifications/${id}`).set(auth(token));
    expect(del.status).toBe(200);
    const delAgain = await request(app).delete(`/api/notifications/${id}`).set(auth(token));
    expect(delAgain.status).toBe(404);
  });

  it('settings patch validates input', async () => {
    const token = await login();
    const ok = await request(app).patch('/api/settings').set(auth(token)).send({ displayCurrency: 'EUR', hideBalances: true });
    expect(ok.status).toBe(200);
    expect(ok.body.data.displayCurrency).toBe('EUR');
    const bad = await request(app).patch('/api/settings').set(auth(token)).send({ marketTickMs: 10 });
    expect(bad.status).toBe(400);
  });

  it('demo reset restores USD 25,000', async () => {
    const token = await login();
    await request(app).post('/api/wallet/deposit').set(auth(token)).send({ amount: 1000, method: 'bank_transfer' });
    const reset = await request(app).post('/api/demo/reset').set(auth(token));
    expect(reset.status).toBe(200);
    expect(reset.body.data.wallet.balances.USD).toBe(25000);
    const w = await request(app).get('/api/wallet').set(auth(token));
    expect(w.body.data.wallet.balances.USD).toBe(25000);
  });
});
