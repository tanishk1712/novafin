'use client';

import * as React from 'react';
import Link from 'next/link';
import { Briefcase, Coins, LineChart, PiggyBank, Plus, TrendingUp } from 'lucide-react';
import { portfolioValueSeries } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { ChangePill, EmptyState, PageHeader, SimulatedBadge, StatCard, StockLogo } from '@/components/common';
import { DonutChart, MultiLineChart } from '@/components/charts';
import { useDemo, useMarket } from '@/lib/store/demo-store';
import { usePortfolio, tradeDialog } from '@/lib/hooks/use-finance';
import { changeColor, formatPct, formatPrice, formatShares, formatUsd } from '@/lib/format';

export default function PortfolioPage() {
  const state = useDemo();
  const market = useMarket();
  const p = usePortfolio();
  const [range, setRange] = React.useState<'1M' | '3M' | '1Y'>('3M');
  // depend on holdings + latest SPY tick so the last point tracks live prices without recomputing every render
  const series = React.useMemo(
    () => portfolioValueSeries(state, market, range).map((x) => ({ t: x.t, value: x.value, cost: x.cost })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.portfolio, range, market.tickCount],
  );
  const sectors = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const pos of p.positions) m.set(pos.sector, (m.get(pos.sector) ?? 0) + pos.marketValue);
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [p.positions]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My portfolio"
        description="Paper-trading positions valued at simulated market prices."
        badge={<SimulatedBadge label="Paper portfolio" />}
        actions={
          <Button variant="gain" onClick={() => tradeDialog.open('buy')}>
            <Plus /> Buy stock
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Market value" value={p.marketValue} format={(n) => formatUsd(n)} icon={Briefcase} accent="violet" masked={state.settings.hideBalances} />
        <StatCard label="Cost basis" value={p.costBasis} format={(n) => formatUsd(n)} icon={PiggyBank} accent="primary" hint="Excludes commissions" />
        <StatCard label="Unrealized P/L" value={p.unrealizedPnl} format={(n) => formatUsd(n, { sign: true })} icon={LineChart} accent={p.unrealizedPnl >= 0 ? 'gain' : 'loss'} delta={p.unrealizedPnlPercent} />
        <StatCard label="Realized P/L" value={p.realizedPnl} format={(n) => formatUsd(n, { sign: true })} icon={Coins} accent={p.realizedPnl >= 0 ? 'gain' : 'loss'} hint="From closed sells" />
        <StatCard label="Today's P/L" value={p.dayPnl} format={(n) => formatUsd(n, { sign: true })} icon={TrendingUp} accent={p.dayPnl >= 0 ? 'gain' : 'loss'} delta={p.dayPnlPercent} />
        <StatCard label="Total return" value={p.totalReturn} format={(n) => formatUsd(n, { sign: true })} icon={TrendingUp} accent={p.totalReturn >= 0 ? 'gain' : 'loss'} delta={p.totalReturnPercent} />
        <StatCard label="Positions" value={p.positions.length} format={(n) => String(Math.round(n))} icon={Briefcase} accent="teal" />
        <StatCard label="Cash to invest" value={state.wallet.balances.USD} format={(n) => formatUsd(n)} icon={PiggyBank} accent="teal" masked={state.settings.hideBalances} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Positions</CardTitle>
          <CardDescription>Average entry price and cost basis are recalculated on every buy; sells use proportional cost basis.</CardDescription>
        </CardHeader>
        <CardContent className="px-2 sm:px-5">
          {p.positions.length === 0 ? (
            <EmptyState icon={Briefcase} title="No positions" description="Buy a stock to start your paper portfolio." action={<Button onClick={() => tradeDialog.open('buy')}>Buy stock</Button>} />
          ) : (
            <>
            <ul className="divide-y xl:hidden">
              {p.positions.map((pos) => (
                <li key={pos.symbol} className="py-3">
                  <Link href={`/market/${pos.symbol}`} className="flex items-center gap-3">
                    <StockLogo symbol={pos.symbol} size={36} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{pos.symbol}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {formatShares(pos.shares)} sh · avg {formatPrice(pos.avgPrice)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-medium tabular">{formatUsd(pos.marketValue)}</span>
                      <span className={`block text-xs tabular ${changeColor(pos.unrealizedPnl)}`}>
                        {formatUsd(pos.unrealizedPnl, { sign: true })} ({formatPct(pos.unrealizedPnlPercent)})
                      </span>
                    </span>
                  </Link>
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-12">
                    <ChangePill value={pos.dayChangePercent} />
                    <span className="text-xs text-muted-foreground">{pos.allocationPercent.toFixed(1)}% weight</span>
                    <div className="ml-auto flex gap-1.5">
                      <Button size="sm" variant="secondary" onClick={() => tradeDialog.open('buy', pos.symbol)}>
                        Buy
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => tradeDialog.open('sell', pos.symbol)}>
                        Sell
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden xl:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Holding</TableHead>
                  <TableHead className="text-right">Shares</TableHead>
                  <TableHead className="text-right">Avg price</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Unrealized P/L</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Today</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Weight</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.positions.map((pos) => (
                  <TableRow key={pos.symbol}>
                    <TableCell>
                      <Link href={`/market/${pos.symbol}`} className="flex items-center gap-3">
                        <StockLogo symbol={pos.symbol} size={32} />
                        <span>
                          <span className="block font-semibold">{pos.symbol}</span>
                          <span className="block max-w-[10rem] truncate text-xs text-muted-foreground">{pos.name}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatShares(pos.shares)}</TableCell>
                    <TableCell className="text-right tabular">{formatPrice(pos.avgPrice)}</TableCell>
                    <TableCell className="text-right tabular">{formatPrice(pos.price)}</TableCell>
                    <TableCell className="text-right font-medium tabular">{formatUsd(pos.marketValue)}</TableCell>
                    <TableCell className={`text-right tabular ${changeColor(pos.unrealizedPnl)}`}>
                      {formatUsd(pos.unrealizedPnl, { sign: true })}
                      <span className="block text-xs">{formatPct(pos.unrealizedPnlPercent)}</span>
                    </TableCell>
                    <TableCell className="hidden text-right xl:table-cell">
                      <ChangePill value={pos.dayChangePercent} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular text-muted-foreground xl:table-cell">{pos.allocationPercent.toFixed(1)}%</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="secondary" onClick={() => tradeDialog.open('buy', pos.symbol)}>
                          Buy
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => tradeDialog.open('sell', pos.symbol)}>
                          Sell
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle>Portfolio performance</CardTitle>
              <CardDescription>Simulated value of your current holdings over time vs. their cost basis</CardDescription>
            </div>
            <Tabs value={range} onValueChange={(v) => setRange(v as '1M' | '3M' | '1Y')}>
              <TabsList>
                <TabsTrigger value="1M">1M</TabsTrigger>
                <TabsTrigger value="3M">3M</TabsTrigger>
                <TabsTrigger value="1Y">1Y</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <MultiLineChart
              data={series}
              lines={[
                { key: 'value', name: 'Market value', color: 'var(--series-1)' },
                { key: 'cost', name: 'Cost basis', color: 'var(--color-muted-foreground)', dashed: true },
              ]}
              height={280}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Allocation</CardTitle>
            <CardDescription>By holding and by sector</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <DonutChart data={p.positions.map((x) => ({ name: x.symbol, value: x.marketValue }))} height={170} />
            <DonutChart data={sectors} height={170} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
