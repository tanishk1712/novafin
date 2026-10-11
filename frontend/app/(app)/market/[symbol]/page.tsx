'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Bell, Star } from 'lucide-react';
import { STOCKS_BY_SYMBOL, getHistory, pctChange, type HistoryRange } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { ChangeText, EmptyState, MarketStatusBadge, SimulatedBadge, StatusBadge, StockLogo, SummaryRows } from '@/components/common';
import { TimeAreaChart, VolumeBars } from '@/components/charts';
import { useDemo, useMarket } from '@/lib/store/demo-store';
import { usePortfolio, tradeDialog } from '@/lib/hooks/use-finance';
import { demoApi, errorMessage } from '@/lib/api/demo-api';
import { changeColor, formatDate, formatDateTime, formatMarketCap, formatNumber, formatPct, formatPrice, formatShares, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const RANGES: HistoryRange[] = ['1D', '1W', '1M', '3M', '1Y', '5Y'];

export default function StockDetailPage() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(String(params.symbol ?? '')).toUpperCase();
  const seed = STOCKS_BY_SYMBOL[symbol];
  const market = useMarket();
  const state = useDemo();
  const portfolio = usePortfolio();
  const [range, setRange] = React.useState<HistoryRange>('1D');
  const quote = market.quotes[symbol];
  const watchItem = state.watchlist.find((w) => w.symbol === symbol);
  const position = portfolio.positions.find((p) => p.symbol === symbol);
  const orders = state.orders.filter((o) => o.symbol === symbol).slice(0, 6);

  // 1D depends on live ticks; longer ranges only need the latest price as the final point.
  const historyDep = range === '1D' ? market : quote?.price;
  const history = React.useMemo(
    () => (seed ? getHistory(market, symbol, range) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [symbol, range, historyDep],
  );

  if (!seed || !quote) {
    return (
      <Card>
        <EmptyState
          title={`Unknown symbol “${symbol}”`}
          description="This symbol is not part of the NovaFin demo dataset."
          action={
            <Button asChild>
              <Link href="/market">Back to market</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const first = history?.prices[0]?.p ?? quote.previousClose;
  const rangeChange = range === '1D' ? quote.changePercent : pctChange(first, quote.price);
  const color = rangeChange >= 0 ? 'var(--color-gain)' : 'var(--color-loss)';
  const intraday = range === '1D' || range === '1W';

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/market">
          <ArrowLeft /> Market
        </Link>
      </Button>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
          <StockLogo symbol={symbol} size={48} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{seed.name}</h1>
              <Badge variant="secondary">{symbol}</Badge>
              <Badge variant="outline">{seed.exchange}</Badge>
              {seed.type === 'etf' && <Badge variant="violet">ETF</Badge>}
            </div>
            <div className="mt-1 flex flex-wrap items-baseline gap-3">
              <span className="text-2xl font-semibold tabular sm:text-3xl">{formatPrice(quote.price)}</span>
              <span className={cn('font-medium tabular', changeColor(quote.change))}>
                {quote.change >= 0 ? '+' : ''}
                {formatUsd(quote.change)} ({formatPct(quote.changePercent)}) today
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Simulated price · updated {new Date(quote.updatedAt).toLocaleTimeString()}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SimulatedBadge />
          <MarketStatusBadge />
          <Button
            variant="outline"
            onClick={() => {
              const added = demoApi.toggleWatchlist(symbol);
              toast.success(added ? `${symbol} added to watchlist` : `${symbol} removed from watchlist`);
            }}
          >
            <Star className={cn(watchItem && 'fill-amber-400 text-amber-400')} /> {watchItem ? 'Watching' : 'Watch'}
          </Button>
          <Button variant="gain" onClick={() => tradeDialog.open('buy', symbol)}>
            Buy
          </Button>
          <Button variant="loss" onClick={() => tradeDialog.open('sell', symbol)} disabled={!position}>
            Sell
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Price chart</CardTitle>
              <CardDescription>
                Synthetic demonstration series · <ChangeText value={rangeChange} suffix={`over ${range}`} />
              </CardDescription>
            </div>
            <Tabs value={range} onValueChange={(v) => setRange(v as HistoryRange)}>
              <TabsList>
                {RANGES.map((r) => (
                  <TabsTrigger key={r} value={r} className="px-2 sm:px-2.5">
                    {r}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            <TimeAreaChart
              data={(history?.prices ?? []).map((p) => ({ t: p.t, price: p.p }))}
              dataKey="price"
              name={symbol}
              color={color}
              valueFormat={(v) => formatPrice(v)}
              xFormat={(t) => (intraday ? new Date(t).toLocaleString([], range === '1D' ? { hour: '2-digit', minute: '2-digit' } : { weekday: 'short' }) : formatDate(t, range === '5Y' ? 'MMM yyyy' : 'MMM d'))}
              tooltipLabel={(t) => formatDateTime(Number(t))}
              baseline={range === '1D' ? quote.previousClose : undefined}
              domainPadding={0.01}
              height={300}
            />
            <p className="mb-1 mt-3 text-xs font-medium text-muted-foreground">Volume</p>
            <VolumeBars data={history?.volumes ?? []} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Key statistics (simulated)</CardTitle>
            </CardHeader>
            <CardContent>
              <SummaryRows
                rows={[
                  { label: 'Open', value: formatPrice(quote.open) },
                  { label: 'Day high', value: formatPrice(quote.high) },
                  { label: 'Day low', value: formatPrice(quote.low) },
                  { label: 'Previous close', value: formatPrice(quote.previousClose) },
                  { label: 'Volume', value: formatNumber(quote.volume, { compact: true }) },
                  { label: seed.type === 'etf' ? 'Assets (AUM)' : 'Market cap', value: formatMarketCap(seed.marketCap) },
                  { label: 'Sector', value: seed.sector },
                  { label: 'Daily volatility', value: `${(seed.volatility * 100).toFixed(1)}%` },
                ]}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Your position</CardTitle>
            </CardHeader>
            <CardContent>
              {position ? (
                <SummaryRows
                  rows={[
                    { label: 'Shares', value: formatShares(position.shares) },
                    { label: 'Avg. price', value: formatPrice(position.avgPrice) },
                    { label: 'Market value', value: formatUsd(position.marketValue), strong: true },
                    {
                      label: 'Unrealized P/L',
                      value: (
                        <span className={changeColor(position.unrealizedPnl)}>
                          {formatUsd(position.unrealizedPnl, { sign: true })} ({formatPct(position.unrealizedPnlPercent)})
                        </span>
                      ),
                    },
                    { label: 'Portfolio weight', value: `${position.allocationPercent.toFixed(1)}%` },
                  ]}
                />
              ) : (
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>You don&apos;t own {symbol} yet.</p>
                  <Button variant="gain" className="w-full" onClick={() => tradeDialog.open('buy', symbol)}>
                    Buy {symbol}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>About {seed.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>{seed.description}</p>
            <p className="text-xs">
              Listed on {seed.exchange} · {seed.sector}. All figures on this page are synthetic demo values generated by the NovaFin market simulator and are not real
              market data, investment research or advice.
            </p>
          </CardContent>
        </Card>
        <AlertCard symbol={symbol} price={quote.price} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your {symbol} orders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {orders.length === 0 && <p className="text-sm text-muted-foreground">No orders for {symbol} yet.</p>}
          {orders.map((o) => (
            <div key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-2.5 text-sm">
              <Badge variant={o.side === 'buy' ? 'gain' : 'loss'} className="uppercase">
                {o.side}
              </Badge>
              <span className="tabular">
                {formatShares(o.quantity)} @ {formatPrice(o.price)}
              </span>
              <span className="text-xs text-muted-foreground">{formatDateTime(o.createdAt)}</span>
              <span className="ml-auto font-medium tabular">{formatUsd(o.value)}</span>
              <StatusBadge status={o.status} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function AlertCard({ symbol, price }: { symbol: string; price: number }) {
  const state = useDemo();
  const item = state.watchlist.find((w) => w.symbol === symbol);
  const [above, setAbove] = React.useState(item?.alertAbove?.toString() ?? '');
  const [below, setBelow] = React.useState(item?.alertBelow?.toString() ?? '');
  React.useEffect(() => {
    setAbove(item?.alertAbove?.toString() ?? '');
    setBelow(item?.alertBelow?.toString() ?? '');
  }, [item?.alertAbove, item?.alertBelow]);

  const save = () => {
    try {
      if (!item) demoApi.addToWatchlist(symbol);
      demoApi.setWatchlistAlert(symbol, { above: above ? Number(above) : null, below: below ? Number(below) : null });
      toast.success('Price alert saved', { description: 'You will be notified when the simulated price crosses a threshold.' });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Bell className="size-4" /> Price alerts
        </CardTitle>
        <CardDescription>Current simulated price {formatPrice(price)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label htmlFor="alert-above" className="text-xs">
              Notify above ($)
            </Label>
            <Input id="alert-above" inputMode="decimal" value={above} onChange={(e) => setAbove(e.target.value.replace(/[^\d.]/g, ''))} placeholder={(price * 1.02).toFixed(2)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="alert-below" className="text-xs">
              Notify below ($)
            </Label>
            <Input id="alert-below" inputMode="decimal" value={below} onChange={(e) => setBelow(e.target.value.replace(/[^\d.]/g, ''))} placeholder={(price * 0.98).toFixed(2)} />
          </div>
        </div>
        <Button className="w-full" variant="secondary" onClick={save}>
          Save alert{!item && ' & watch'}
        </Button>
      </CardContent>
    </Card>
  );
}
