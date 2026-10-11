'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, Star } from 'lucide-react';
import { SECTORS, STOCKS_SEED, getMarketSummary, type LiveQuote } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, NativeSelect, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/primitives';
import { ChangePill, EmptyState, MarketStatusBadge, PageHeader, Pagination, SimulatedBadge, StockLogo } from '@/components/common';
import { GroupedBarChart, TimeAreaChart, Sparkline } from '@/components/charts';
import { useDemo, useMarket } from '@/lib/store/demo-store';
import { tradeDialog } from '@/lib/hooks/use-finance';
import { demoApi } from '@/lib/api/demo-api';
import { changeColor, formatMarketCap, formatNumber, formatPct, formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

type SortKey = 'symbol' | 'price' | 'changePercent' | 'volume' | 'marketCap';
const PAGE_SIZE = 15;

export default function MarketPage() {
  const market = useMarket();
  const state = useDemo();
  const router = useRouter();
  const summary = React.useMemo(() => getMarketSummary(market, 5), [market]);
  const [query, setQuery] = React.useState('');
  const [sector, setSector] = React.useState('all');
  const [change, setChange] = React.useState('all');
  const [type, setType] = React.useState('all');
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'marketCap', dir: 'desc' });
  const [page, setPage] = React.useState(1);
  const [indexKey, setIndexKey] = React.useState('SPX');
  const watch = new Set(state.watchlist.map((w) => w.symbol));

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = STOCKS_SEED.filter((s) => {
      const quote = market.quotes[s.symbol];
      if (q && !s.symbol.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
      if (sector !== 'all' && s.sector !== sector) return false;
      if (type !== 'all' && s.type !== type) return false;
      const c = quote.changePercent;
      if (change === 'up' && c <= 0) return false;
      if (change === 'down' && c >= 0) return false;
      if (change === 'big-up' && c < 2) return false;
      if (change === 'big-down' && c > -2) return false;
      return true;
    }).map((s) => ({ seed: s, quote: market.quotes[s.symbol] }));
    const dir = sort.dir === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      switch (sort.key) {
        case 'symbol':
          return a.seed.symbol.localeCompare(b.seed.symbol) * dir;
        case 'price':
          return (a.quote.price - b.quote.price) * dir;
        case 'changePercent':
          return (a.quote.changePercent - b.quote.changePercent) * dir;
        case 'volume':
          return (a.quote.volume - b.quote.volume) * dir;
        default:
          return (a.seed.marketCap - b.seed.marketCap) * dir;
      }
    });
    return filtered;
  }, [market, query, sector, change, type, sort]);

  React.useEffect(() => setPage(1), [query, sector, change, type, sort]);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const index = summary.indices.find((i) => i.key === indexKey) ?? summary.indices[0];

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'symbol' ? 'asc' : 'desc' }));
  const SortIcon = ({ k }: { k: SortKey }) => (sort.key !== k ? <ArrowUpDown className="size-3 opacity-50" /> : sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />);

  return (
    <div className="space-y-6">
      <PageHeader
        title="US stock market"
        description={`${STOCKS_SEED.length} US-listed stocks & ETFs with a simulated price engine. Prices update every ${state.settings.marketTickMs / 1000}s while this tab is active.`}
        badge={<SimulatedBadge />}
        actions={<MarketStatusBadge />}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summary.indices.map((i) => (
          <button key={i.key} onClick={() => setIndexKey(i.key)} className="text-left">
            <Card className={cn('p-4 transition-colors hover:border-primary/50', indexKey === i.key && 'border-primary/70 ring-1 ring-primary/30')}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {i.name} <span className="opacity-70">· via {i.proxy}</span>
                  </p>
                  <p className="mt-1 text-xl font-semibold tabular">{formatNumber(i.value, { decimals: 2 })}</p>
                  <p className={cn('text-xs font-medium tabular', changeColor(i.changePercent))}>
                    {i.change >= 0 ? '+' : ''}
                    {formatNumber(i.change, { decimals: 2 })} ({formatPct(i.changePercent)})
                  </p>
                </div>
                <Sparkline data={[i.value - i.change, ...i.ticks.map((t) => t.p)]} width={80} height={40} />
              </div>
            </Card>
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>{index.name} — simulated session</CardTitle>
            <CardDescription>Synthetic index level derived from the {index.proxy} ETF simulation. Not a real index quote.</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeAreaChart
              data={[{ t: (index.ticks[0]?.t ?? market.lastTick) - 60_000, v: index.value - index.change }, ...index.ticks.map((x) => ({ t: x.t, v: x.p }))]}
              dataKey="v"
              name={index.name}
              color={index.changePercent >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'}
              valueFormat={(v) => formatNumber(v, { decimals: 2 })}
              xFormat={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              domainPadding={0.002}
              baseline={index.value - index.change}
              height={250}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Sector performance</CardTitle>
            <CardDescription>Average simulated daily change</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {summary.sectors.map((s) => (
              <button key={s.sector} onClick={() => setSector(s.sector)} className="flex w-full items-center gap-2 text-left text-sm">
                <span className="w-28 shrink-0 truncate text-muted-foreground sm:w-40">{s.sector}</span>
                <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <span
                    className={cn('absolute inset-y-0 rounded-full', s.changePercent >= 0 ? 'left-1/2 bg-gain' : 'right-1/2 bg-loss')}
                    style={{ width: `${Math.min(50, Math.abs(s.changePercent) * 12)}%` }}
                  />
                </span>
                <span className={cn('w-16 text-right text-xs font-medium tabular', changeColor(s.changePercent))}>{formatPct(s.changePercent)}</span>
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(
          [
            ['Top gainers', summary.gainers],
            ['Top losers', summary.losers],
            ['Most active ($ volume)', summary.mostActive],
          ] as [string, LiveQuote[]][]
        ).map(([title, list]) => (
          <Card key={title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {list.map((q) => (
                <Link key={q.symbol} href={`/market/${q.symbol}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-muted/50">
                  <StockLogo symbol={q.symbol} size={28} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{q.symbol}</span>
                  {title.startsWith('Most') && <span className="hidden text-xs text-muted-foreground min-[400px]:inline lg:hidden xl:inline">{formatNumber(q.volume, { compact: true })}</span>}
                  <span className="shrink-0 text-sm tabular">{formatPrice(q.price)}</span>
                  <ChangePill value={q.changePercent} />
                </Link>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <CardTitle>All symbols</CardTitle>
              <CardDescription>{rows.length} matching · click a row for details</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setQuery(''); setSector('all'); setChange('all'); setType('all'); }}>
              Clear filters
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol or company" className="pl-9" aria-label="Search stocks" />
            </div>
            <NativeSelect value={sector} onChange={(e) => setSector(e.target.value)} aria-label="Sector filter">
              <option value="all">All sectors</option>
              {SECTORS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </NativeSelect>
            <NativeSelect value={change} onChange={(e) => setChange(e.target.value)} aria-label="Price change filter">
              <option value="all">Any price change</option>
              <option value="up">Gainers (&gt; 0%)</option>
              <option value="down">Losers (&lt; 0%)</option>
              <option value="big-up">Up more than 2%</option>
              <option value="big-down">Down more than 2%</option>
            </NativeSelect>
            <NativeSelect value={type} onChange={(e) => setType(e.target.value)} aria-label="Type filter">
              <option value="all">Stocks & ETFs</option>
              <option value="stock">Stocks only</option>
              <option value="etf">ETFs only</option>
            </NativeSelect>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-5">
          {visible.length === 0 ? (
            <EmptyState icon={Search} title="No symbols match" description="Try a different search or clear the filters." />
          ) : (
            <>
            <ul className="divide-y xl:hidden">
              {visible.map(({ seed, quote }) => (
                <li key={seed.symbol} className="flex items-center gap-1.5 py-2 sm:gap-2.5">
                  <button
                    className="grid size-9 shrink-0 place-items-center rounded-md hover:bg-muted"
                    aria-label={watch.has(seed.symbol) ? `Remove ${seed.symbol} from watchlist` : `Add ${seed.symbol} to watchlist`}
                    onClick={() => demoApi.toggleWatchlist(seed.symbol)}
                  >
                    <Star className={cn('size-4', watch.has(seed.symbol) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
                  </button>
                  <Link href={`/market/${seed.symbol}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                    <StockLogo symbol={seed.symbol} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{seed.symbol}</span>
                      <span className="block truncate text-xs text-muted-foreground">{seed.name}</span>
                    </span>
                    <span className="hidden min-[420px]:block">
                      <Sparkline data={[quote.previousClose, ...quote.ticks.map((t) => t.p)]} width={56} height={24} />
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-medium tabular">
                        <PriceFlash price={quote.price} />
                      </span>
                      <ChangePill value={quote.changePercent} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="hidden xl:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('symbol')}>
                      Symbol <SortIcon k="symbol" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">Sector</TableHead>
                  <TableHead className="text-right">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('price')}>
                      Price <SortIcon k="price" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('changePercent')}>
                      Change <SortIcon k="changePercent" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden text-right xl:table-cell">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('volume')}>
                      Volume <SortIcon k="volume" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden text-right xl:table-cell">
                    <button className="inline-flex items-center gap-1" onClick={() => toggleSort('marketCap')}>
                      Mkt cap <SortIcon k="marketCap" />
                    </button>
                  </TableHead>
                  <TableHead className="hidden xl:table-cell">Intraday</TableHead>
                  <TableHead className="text-right">Trade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map(({ seed, quote }) => (
                  <TableRow key={seed.symbol} className="cursor-pointer" onClick={() => router.push(`/market/${seed.symbol}`)}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <button
                          aria-label={watch.has(seed.symbol) ? 'Remove from watchlist' : 'Add to watchlist'}
                          onClick={(e) => {
                            e.stopPropagation();
                            demoApi.toggleWatchlist(seed.symbol);
                          }}
                        >
                          <Star className={cn('size-4', watch.has(seed.symbol) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
                        </button>
                        <StockLogo symbol={seed.symbol} size={30} />
                        <div className="min-w-0">
                          <p className="font-semibold">{seed.symbol}</p>
                          <p className="max-w-[12rem] truncate text-xs text-muted-foreground">{seed.name}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{seed.sector}</TableCell>
                    <TableCell className="text-right font-medium tabular">
                      <PriceFlash price={quote.price} />
                    </TableCell>
                    <TableCell className="text-right">
                      <ChangePill value={quote.changePercent} />
                    </TableCell>
                    <TableCell className="hidden text-right tabular text-muted-foreground xl:table-cell">{formatNumber(quote.volume, { compact: true })}</TableCell>
                    <TableCell className="hidden text-right tabular text-muted-foreground xl:table-cell">{formatMarketCap(seed.marketCap)}</TableCell>
                    <TableCell className="hidden xl:table-cell">
                      <Sparkline data={[quote.previousClose, ...quote.ticks.map((t) => t.p)]} width={80} height={26} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          tradeDialog.open('buy', seed.symbol);
                        }}
                      >
                        Trade
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
          <Pagination page={page} pageCount={pageCount} onPage={setPage} total={rows.length} label="symbols" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Market breadth</CardTitle>
          <CardDescription>Number of advancing vs declining symbols by sector (simulated)</CardDescription>
        </CardHeader>
        <CardContent>
          <GroupedBarChart
            xKey="sector"
            valueFormat={(v) => String(Math.round(v))}
            stacked
            data={SECTORS.map((sec) => {
              const qs = STOCKS_SEED.filter((s) => s.sector === sec).map((s) => market.quotes[s.symbol]);
              return { sector: sec.replace('Communication Services', 'Comm.').replace('Consumer ', 'Cons. '), advancing: qs.filter((q) => q.changePercent > 0).length, declining: qs.filter((q) => q.changePercent < 0).length };
            })}
            bars={[
              { key: 'advancing', name: 'Advancing', color: 'var(--series-1)' },
              { key: 'declining', name: 'Declining', color: 'var(--series-2)' },
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function PriceFlash({ price }: { price: number }) {
  const prev = React.useRef(price);
  const [cls, setCls] = React.useState('');
  React.useEffect(() => {
    if (price !== prev.current) {
      setCls(price > prev.current ? 'flash-up' : 'flash-down');
      prev.current = price;
      const t = setTimeout(() => setCls(''), 1200);
      return () => clearTimeout(t);
    }
  }, [price]);
  return <span className={cn('rounded px-1', cls)}>{formatPrice(price)}</span>;
}
