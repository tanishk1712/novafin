import { test } from 'vitest';
import { createSeedState, computePortfolio, createInitialMarketState, walletTotals, STOCKS_SEED, computeNetWorth, tickMarket } from '../src';
test('probe', () => {
  const s = createSeedState();
  const m = createInitialMarketState();
  const p = computePortfolio(s, m);
  console.log('stocks', STOCKS_SEED.length, 'tx', s.transactions.length, 'notif', s.notifications.length, 'watch', s.watchlist.length);
  console.log('balances', JSON.stringify(s.wallet.balances));
  console.log('invested', p.marketValue, 'cost', p.costBasis, 'realized', p.realizedPnl, 'day', p.dayPnl);
  console.log('positions', p.positions.map(x => `${x.symbol}:${x.shares}@${x.avgPrice}`).join(' '));
  console.log(JSON.stringify(walletTotals(s)), computeNetWorth(s, p.marketValue).total);
  console.log(s.transactions.slice(0,4).map(t => `${t.createdAt} ${t.category} ${t.status} ${t.amount}`).join('\n'));
  let mm = m; for (let i=0;i<100;i++) mm = tickMarket(mm, Date.now()+i*7000);
  console.log('after 100 ticks NVDA', mm.quotes.NVDA.price, mm.quotes.NVDA.changePercent, 'TSLA', mm.quotes.TSLA.changePercent);
});
