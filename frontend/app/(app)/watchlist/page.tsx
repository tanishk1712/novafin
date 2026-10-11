'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Bell, Star, Trash2 } from 'lucide-react';
import { STOCKS_BY_SYMBOL } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/primitives';
import { ChangePill, EmptyState, PageHeader, SimulatedBadge, StockLogo } from '@/components/common';
import { Sparkline } from '@/components/charts';
import { StockSearch } from '@/components/trade/stock-search';
import { useDemo, useMarket } from '@/lib/store/demo-store';
import { tradeDialog } from '@/lib/hooks/use-finance';
import { demoApi } from '@/lib/api/demo-api';
import { formatNumber, formatPrice, formatUsd, relativeTime } from '@/lib/format';

export default function WatchlistPage() {
  const state = useDemo();
  const market = useMarket();
  const [sort, setSort] = React.useState<'added' | 'change'>('added');
  const items = [...state.watchlist].sort((a, b) =>
    sort === 'change' ? (market.quotes[b.symbol]?.changePercent ?? 0) - (market.quotes[a.symbol]?.changePercent ?? 0) : Date.parse(b.addedAt) - Date.parse(a.addedAt),
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Watchlist" description="Track simulated prices and get notified when your alert thresholds are crossed." badge={<SimulatedBadge />} />
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{state.watchlist.length} symbols</CardTitle>
              <CardDescription>Alerts are checked on every simulated market tick.</CardDescription>
            </div>
            <div className="flex gap-1 rounded-lg border p-0.5 text-xs">
              {(['added', 'change'] as const).map((s) => (
                <button key={s} onClick={() => setSort(s)} className={`rounded-md px-2.5 py-1 ${sort === s ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                  {s === 'added' ? 'Recently added' : 'Top movers'}
                </button>
              ))}
            </div>
          </div>
          <StockSearch
            placeholder="Add a symbol to your watchlist…"
            exclude={state.watchlist.map((w) => w.symbol)}
            onSelect={(s) => {
              demoApi.addToWatchlist(s);
              toast.success(`${s} added to watchlist`);
            }}
            className="max-w-md"
          />
        </CardHeader>
        <CardContent className="px-2 sm:px-5">
          {items.length === 0 ? (
            <EmptyState icon={Star} title="Your watchlist is empty" description="Search above to add stocks and ETFs." />
          ) : (
            <>
            <ul className="divide-y xl:hidden">
              {items.map((w) => {
                const q = market.quotes[w.symbol];
                const seed = STOCKS_BY_SYMBOL[w.symbol];
                if (!q || !seed) return null;
                return (
                  <li key={w.symbol} className="py-3">
                    <div className="flex items-center gap-3">
                      <Link href={`/market/${w.symbol}`} className="flex min-w-0 flex-1 items-center gap-3">
                        <StockLogo symbol={w.symbol} size={36} />
                        <span className="min-w-0">
                          <span className="block font-semibold">{w.symbol}</span>
                          <span className="block truncate text-xs text-muted-foreground">{seed.name}</span>
                        </span>
                      </Link>
                      <span className="hidden min-[400px]:block">
                        <Sparkline data={[q.previousClose, ...q.ticks.map((t) => t.p)]} width={56} height={26} />
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-sm font-medium tabular">{formatPrice(q.price)}</span>
                        <ChangePill value={q.changePercent} />
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-12">
                      {w.alertAbove && <Badge variant="gain">≥ {formatUsd(w.alertAbove)}</Badge>}
                      {w.alertBelow && <Badge variant="loss">≤ {formatUsd(w.alertBelow)}</Badge>}
                      <div className="ml-auto flex gap-1">
                        <Button size="sm" variant="secondary" onClick={() => tradeDialog.open('buy', w.symbol)}>
                          Buy
                        </Button>
                        <Button size="icon" variant="ghost" asChild aria-label={`Set alert for ${w.symbol}`}>
                          <Link href={`/market/${w.symbol}`}>
                            <Bell />
                          </Link>
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove ${w.symbol}`}
                          onClick={() => {
                            demoApi.removeFromWatchlist(w.symbol);
                            toast(`${w.symbol} removed from watchlist`, { action: { label: 'Undo', onClick: () => demoApi.addToWatchlist(w.symbol) } });
                          }}
                        >
                          <Trash2 className="text-muted-foreground" />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="hidden xl:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Symbol</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Change</TableHead>
                  <TableHead className="hidden sm:table-cell">Intraday</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Volume</TableHead>
                  <TableHead className="hidden lg:table-cell">Alerts</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((w) => {
                  const q = market.quotes[w.symbol];
                  const seed = STOCKS_BY_SYMBOL[w.symbol];
                  if (!q || !seed) return null;
                  return (
                    <TableRow key={w.symbol}>
                      <TableCell>
                        <Link href={`/market/${w.symbol}`} className="flex items-center gap-3">
                          <StockLogo symbol={w.symbol} size={32} />
                          <span>
                            <span className="block font-semibold">{w.symbol}</span>
                            <span className="block max-w-[12rem] truncate text-xs text-muted-foreground">{seed.name}</span>
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular">{formatPrice(q.price)}</TableCell>
                      <TableCell className="text-right">
                        <ChangePill value={q.changePercent} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Sparkline data={[q.previousClose, ...q.ticks.map((t) => t.p)]} width={90} height={28} />
                      </TableCell>
                      <TableCell className="hidden text-right tabular text-muted-foreground md:table-cell">{formatNumber(q.volume, { compact: true })}</TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {w.alertAbove && <Badge variant="gain">≥ {formatUsd(w.alertAbove)}</Badge>}
                          {w.alertBelow && <Badge variant="loss">≤ {formatUsd(w.alertBelow)}</Badge>}
                          {!w.alertAbove && !w.alertBelow && <span className="text-xs text-muted-foreground">Added {relativeTime(w.addedAt)}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="secondary" onClick={() => tradeDialog.open('buy', w.symbol)}>
                            Buy
                          </Button>
                          <Button size="icon" variant="ghost" asChild aria-label="Set alert">
                            <Link href={`/market/${w.symbol}`}>
                              <Bell />
                            </Link>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Remove ${w.symbol}`}
                            onClick={() => {
                              demoApi.removeFromWatchlist(w.symbol);
                              toast(`${w.symbol} removed from watchlist`, { action: { label: 'Undo', onClick: () => demoApi.addToWatchlist(w.symbol) } });
                            }}
                          >
                            <Trash2 className="text-muted-foreground" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
