'use client';

import * as React from 'react';
import {
  balanceHistory,
  convert,
  exchangeVolumeByPair,
  getMarketSummary,
  monthlyCashflow,
  portfolioValueSeries,
  spendingByCategory,
  tradePerformance,
} from '@novafin/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, NativeSelect } from '@/components/ui/primitives';
import { PageHeader, SimulatedBadge } from '@/components/common';
import { DonutChart, GroupedBarChart, MultiLineChart, PolarityBarChart, TimeAreaChart } from '@/components/charts';
import { useDemo, useMarket } from '@/lib/store/demo-store';
import { useNetWorth, usePortfolio, useWalletTotals } from '@/lib/hooks/use-finance';
import { CATEGORY_LABELS, formatDate, formatPct, formatUsd } from '@/lib/format';

export default function AnalyticsPage() {
  const state = useDemo();
  const market = useMarket();
  const portfolio = usePortfolio();
  const netWorth = useNetWorth();
  const totals = useWalletTotals();
  const [months, setMonths] = React.useState(6);

  const balance = React.useMemo(() => balanceHistory(state, 'USD', 150).map((p) => ({ t: p.t, balance: p.balance })), [state]);
  const cash = React.useMemo(() => monthlyCashflow(state, months), [state, months]);
  const spending = React.useMemo(() => spendingByCategory(state, 90), [state]);
  const trades = React.useMemo(() => tradePerformance(state.orders), [state.orders]);
  const fx = React.useMemo(() => exchangeVolumeByPair(state), [state]);
  const perf = React.useMemo(
    () => portfolioValueSeries(state, market, '1Y').map((x) => ({ t: x.t, value: x.value, cost: x.cost })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.portfolio, market.tickCount],
  );
  const summary = React.useMemo(() => getMarketSummary(market), [market]);
  const assets = [
    { name: 'USD cash', value: netWorth.cashUsd },
    { name: 'Other currencies', value: netWorth.otherCashUsd },
    ...portfolio.positions.map((p) => ({ name: p.symbol, value: p.marketValue })),
  ];
  const fxHistory = [...state.exchangeHistory]
    .reverse()
    .map((r) => ({ label: `${formatDate(r.createdAt, 'MMM d')} ${r.from}→${r.to}`, volume: convert(r.fromAmount, r.from, 'USD') }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description="Charts derived live from your demo ledger, holdings and the simulated market."
        badge={<SimulatedBadge label="Demo analytics" />}
        actions={
          <NativeSelect value={months} onChange={(e) => setMonths(Number(e.target.value))} className="w-40" aria-label="Months">
            <option value={3}>Last 3 months</option>
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
          </NativeSelect>
        }
      />

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {[
          ['Net worth', formatUsd(netWorth.total)],
          ['Total deposits', formatUsd(totals.totalDeposits)],
          ['Total fees paid', formatUsd(totals.totalFees)],
          ['Portfolio return', `${formatUsd(portfolio.totalReturn, { sign: true })} (${formatPct(portfolio.totalReturnPercent)})`],
        ].map(([l, v]) => (
          <Card key={l} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{l}</p>
            <p className="mt-1 text-xl font-semibold tabular">{state.settings.hideBalances && l !== 'Portfolio return' ? '••••••' : v}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Wallet balance history</CardTitle>
            <CardDescription>USD cash, last 150 days</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeAreaChart data={balance} dataKey="balance" name="USD balance" tooltipLabel={(t) => new Date(Number(t)).toDateString()} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Portfolio performance</CardTitle>
            <CardDescription>Current holdings valued over the past year (synthetic history)</CardDescription>
          </CardHeader>
          <CardContent>
            <MultiLineChart
              data={perf}
              lines={[
                { key: 'value', name: 'Market value', color: 'var(--series-1)' },
                { key: 'cost', name: 'Cost basis', color: 'var(--color-muted-foreground)', dashed: true },
              ]}
              height={240}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Deposits vs withdrawals</CardTitle>
            <CardDescription>Monthly, USD equivalent</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupedBarChart
              data={cash.map((m) => ({ month: m.label, deposits: m.deposits, withdrawals: m.withdrawals }))}
              xKey="month"
              bars={[
                { key: 'deposits', name: 'Deposits', color: 'var(--series-1)' },
                { key: 'withdrawals', name: 'Withdrawals', color: 'var(--series-2)' },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Monthly spending</CardTitle>
            <CardDescription>Withdrawals, sent transfers, QR payments and fees (stacked)</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupedBarChart
              data={cash.map((m) => ({ month: m.label, spending: Math.max(0, m.expense - m.fees - m.withdrawals), withdrawals: m.withdrawals, fees: m.fees }))}
              xKey="month"
              stacked
              bars={[
                { key: 'withdrawals', name: 'Withdrawals', color: 'var(--series-1)' },
                { key: 'spending', name: 'Transfers & QR', color: 'var(--series-3)' },
                { key: 'fees', name: 'Fees', color: 'var(--series-4)' },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Asset allocation</CardTitle>
            <CardDescription>Cash and holdings in USD</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart data={assets} centerLabel="Net worth" centerValue={formatUsd(netWorth.total, { compact: true })} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Outflows by category</CardTitle>
            <CardDescription>Last 90 days (excluding currency exchanges)</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart data={spending.map((s) => ({ name: CATEGORY_LABELS[s.category] ?? s.category, value: s.amount }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Trade performance</CardTitle>
            <CardDescription>Realized P/L per closed trade</CardDescription>
          </CardHeader>
          <CardContent>
            <PolarityBarChart data={trades.map((t) => ({ label: `${t.symbol} ${t.date.slice(5)}`, pnl: t.pnl }))} xKey="label" dataKey="pnl" name="Realized P/L" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Currency conversion history</CardTitle>
            <CardDescription>Amount converted per exchange (USD equivalent at demo rates) and volume by pair</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GroupedBarChart data={fxHistory} xKey="label" bars={[{ key: 'volume', name: 'Converted (USD equiv.)', color: 'var(--series-3)' }]} height={200} />
            <ul className="grid gap-1 text-sm sm:grid-cols-2">
              {fx.map((p) => (
                <li key={p.pair} className="flex justify-between rounded-md bg-muted/40 px-3 py-1.5">
                  <span className="font-medium">{p.pair}</span>
                  <span className="tabular text-muted-foreground">
                    {p.count}× · {formatUsd(p.volumeUsd)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Daily market movement by sector</CardTitle>
            <CardDescription>Average simulated change today</CardDescription>
          </CardHeader>
          <CardContent>
            <PolarityBarChart
              data={summary.sectors.map((s) => ({ sector: s.sector.replace('Communication Services', 'Comm.').replace('Consumer ', 'Cons. '), change: s.changePercent }))}
              xKey="sector"
              dataKey="change"
              name="Avg change"
              valueFormat={(v) => formatPct(v)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
