'use client';

import * as React from 'react';
import Link from 'next/link';
import { Download, ListOrdered, Plus } from 'lucide-react';
import { tradePerformance } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, NativeSelect, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/primitives';
import { EmptyState, PageHeader, Pagination, SimulatedBadge, StatusBadge, StockLogo } from '@/components/common';
import { PolarityBarChart } from '@/components/charts';
import { useDemo } from '@/lib/store/demo-store';
import { tradeDialog } from '@/lib/hooks/use-finance';
import { toCsv, downloadText } from '@/lib/csv';
import { changeColor, formatDateTime, formatPrice, formatShares, formatUsd } from '@/lib/format';

const PAGE = 12;

export default function OrdersPage() {
  const state = useDemo();
  const [side, setSide] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [page, setPage] = React.useState(1);
  const orders = state.orders.filter((o) => (side === 'all' || o.side === side) && (status === 'all' || o.status === status));
  React.useEffect(() => setPage(1), [side, status]);
  const pageCount = Math.max(1, Math.ceil(orders.length / PAGE));
  const perf = React.useMemo(() => tradePerformance(state.orders), [state.orders]);
  const filled = state.orders.filter((o) => o.status === 'filled');
  const buys = filled.filter((o) => o.side === 'buy');
  const sells = filled.filter((o) => o.side === 'sell');
  const wins = sells.filter((o) => (o.realizedPnl ?? 0) > 0).length;

  const exportCsv = () => {
    downloadText(
      `novafin-orders-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        orders.map((o) => ({
          date: o.createdAt,
          reference: o.reference,
          symbol: o.symbol,
          side: o.side,
          type: o.type,
          quantity: o.quantity,
          price: o.price,
          value: o.value,
          fee: o.fee,
          realized_pnl: o.realizedPnl ?? '',
          status: o.status,
          reject_reason: o.rejectReason ?? '',
          source: o.source === 'seed' ? 'historical demo' : 'user',
        })),
      ),
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Orders & trades"
        description="Every simulated market order, including rejected attempts."
        badge={<SimulatedBadge label="Paper trading" />}
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!orders.length}>
              <Download /> Export CSV
            </Button>
            <Button onClick={() => tradeDialog.open('buy')}>
              <Plus /> New order
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        {[
          ['Filled orders', filled.length],
          ['Buys', buys.length],
          ['Sells', sells.length],
          ['Winning sells', `${wins}/${sells.length}`],
        ].map(([l, v]) => (
          <Card key={l} className="p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{l}</p>
            <p className="mt-1 text-2xl font-semibold tabular">{v}</p>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Realized trade performance</CardTitle>
          <CardDescription>Realized P/L per sell order (before commissions)</CardDescription>
        </CardHeader>
        <CardContent>
          <PolarityBarChart data={perf.map((x) => ({ label: `${x.symbol} ${x.date.slice(5)}`, pnl: x.pnl }))} xKey="label" dataKey="pnl" name="Realized P/L" />
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex-row flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle>Order history</CardTitle>
            <CardDescription>{orders.length} orders</CardDescription>
          </div>
          <div className="flex gap-2">
            <NativeSelect value={side} onChange={(e) => setSide(e.target.value)} className="w-32" aria-label="Side">
              <option value="all">All sides</option>
              <option value="buy">Buys</option>
              <option value="sell">Sells</option>
            </NativeSelect>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} className="w-36" aria-label="Status">
              <option value="all">All statuses</option>
              <option value="filled">Filled</option>
              <option value="rejected">Rejected</option>
            </NativeSelect>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-5">
          {orders.length === 0 ? (
            <EmptyState icon={ListOrdered} title="No orders" description="Orders you place appear here." />
          ) : (
            <>
            <ul className="divide-y xl:hidden">
              {orders.slice((page - 1) * PAGE, page * PAGE).map((o) => (
                <li key={o.id} className="flex items-start gap-3 py-3">
                  <StockLogo symbol={o.symbol} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Link href={`/market/${o.symbol}`} className="font-semibold">
                        {o.symbol}
                      </Link>
                      <Badge variant={o.side === 'buy' ? 'gain' : 'loss'} className="uppercase">
                        {o.side}
                      </Badge>
                      <StatusBadge status={o.status} />
                    </div>
                    <p className="text-xs text-muted-foreground tabular">
                      {formatShares(o.quantity)} @ {formatPrice(o.price)} · fee {formatUsd(o.fee)}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {formatDateTime(o.createdAt)} · <span className="font-mono">{o.reference}</span>
                    </p>
                    {o.rejectReason && <p className="mt-1 text-xs text-loss">{o.rejectReason}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium tabular">{formatUsd(o.value)}</p>
                    {o.realizedPnl !== undefined && <p className={`text-xs tabular ${changeColor(o.realizedPnl)}`}>{formatUsd(o.realizedPnl, { sign: true })}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden xl:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="hidden text-right xl:table-cell">Fee</TableHead>
                  <TableHead className="text-right">Realized P/L</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.slice((page - 1) * PAGE, page * PAGE).map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTime(o.createdAt)}
                      <span className="block font-mono">{o.reference}</span>
                    </TableCell>
                    <TableCell>
                      <Link href={`/market/${o.symbol}`} className="flex items-center gap-2 font-semibold">
                        <StockLogo symbol={o.symbol} size={26} /> {o.symbol}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.side === 'buy' ? 'gain' : 'loss'} className="uppercase">
                        {o.side}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular">{formatShares(o.quantity)}</TableCell>
                    <TableCell className="text-right tabular">{formatPrice(o.price)}</TableCell>
                    <TableCell className="text-right tabular">{formatUsd(o.value)}</TableCell>
                    <TableCell className="hidden text-right tabular text-muted-foreground xl:table-cell">{formatUsd(o.fee)}</TableCell>
                    <TableCell className={`text-right tabular ${changeColor(o.realizedPnl ?? 0)}`}>{o.realizedPnl !== undefined ? formatUsd(o.realizedPnl, { sign: true }) : '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={o.status} />
                      {o.rejectReason && <span className="mt-1 block max-w-[14rem] text-xs text-loss">{o.rejectReason}</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
            </>
          )}
          <Pagination page={page} pageCount={pageCount} onPage={setPage} total={orders.length} label="orders" />
        </CardContent>
      </Card>
    </div>
  );
}
