'use client';

import * as React from 'react';
import { ArrowDownUp, Download, Search, SlidersHorizontal, X } from 'lucide-react';
import { TX_CATEGORIES, TX_STATUSES, convert } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, Input, Label, NativeSelect } from '@/components/ui/primitives';
import { EmptyState, PageHeader, Pagination, SimulatedBadge } from '@/components/common';
import { TransactionTable } from '@/components/transactions/transaction-table';
import { useDemo } from '@/lib/store/demo-store';
import { downloadText, toCsv } from '@/lib/csv';
import { CATEGORY_LABELS } from '@/lib/format';
import { cn } from '@/lib/utils';

const PAGE_SIZES = [10, 20, 50];

export default function TransactionsPage() {
  const state = useDemo();
  const [q, setQ] = React.useState('');
  const [category, setCategory] = React.useState('all');
  const [status, setStatus] = React.useState('all');
  const [source, setSource] = React.useState('all');
  const [from, setFrom] = React.useState('');
  const [to, setTo] = React.useState('');
  const [sort, setSort] = React.useState<'date-desc' | 'date-asc' | 'amount-desc' | 'amount-asc'>('date-desc');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [showFilters, setShowFilters] = React.useState(false);

  const filtered = React.useMemo(() => {
    const term = q.trim().toLowerCase();
    const fromT = from ? Date.parse(`${from}T00:00:00`) : -Infinity;
    const toT = to ? Date.parse(`${to}T23:59:59.999`) : Infinity;
    const rows = state.transactions.filter((t) => {
      if (category !== 'all' && t.category !== category) return false;
      if (status !== 'all' && t.status !== status) return false;
      if (source !== 'all' && t.source !== source) return false;
      const ts = Date.parse(t.createdAt);
      if (ts < fromT || ts > toT) return false;
      if (term) {
        const hay = `${t.description} ${t.reference} ${t.counterparty ?? ''} ${t.currency} ${t.amount} ${t.meta?.symbol ?? ''} ${t.meta?.note ?? ''}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
    const usd = (t: (typeof rows)[number]) => convert(t.amount, t.currency, 'USD');
    rows.sort((a, b) => {
      switch (sort) {
        case 'date-asc':
          return Date.parse(a.createdAt) - Date.parse(b.createdAt);
        case 'amount-desc':
          return usd(b) - usd(a);
        case 'amount-asc':
          return usd(a) - usd(b);
        default:
          return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }
    });
    return rows;
  }, [state.transactions, q, category, status, source, from, to, sort]);

  React.useEffect(() => setPage(1), [q, category, status, source, from, to, sort, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const active = q || category !== 'all' || status !== 'all' || source !== 'all' || from || to;
  const activeCount = [category !== 'all', status !== 'all', source !== 'all', !!from, !!to].filter(Boolean).length;

  const clear = () => {
    setQ('');
    setCategory('all');
    setStatus('all');
    setSource('all');
    setFrom('');
    setTo('');
  };

  const exportCsv = () => {
    const csv = toCsv(
      filtered.map((t) => ({
        date: t.createdAt,
        reference: t.reference,
        category: CATEGORY_LABELS[t.category],
        description: t.description,
        counterparty: t.counterparty ?? '',
        direction: t.direction,
        amount: t.amount,
        currency: t.currency,
        fee: t.fee,
        status: t.status,
        linked_to: t.linkedTo ?? '',
        origin: t.source === 'seed' ? 'historical demo example' : 'created by you',
      })),
    );
    downloadText(`novafin-transactions-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Unified ledger of deposits, withdrawals, exchanges, transfers, QR payments, trades and fees. Fees are separate records linked to their parent."
        badge={<SimulatedBadge label="Demo ledger" />}
        actions={
          <Button variant="outline" onClick={exportCsv} disabled={!filtered.length}>
            <Download /> Export CSV ({filtered.length})
          </Button>
        }
      />
      <Card>
        <CardHeader className="gap-3">
          <div className="flex gap-2 sm:hidden">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="pl-9" aria-label="Search transactions" />
            </div>
            <Button variant={showFilters ? 'secondary' : 'outline'} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters} aria-controls="tx-filters">
              <SlidersHorizontal /> Filters
              {activeCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">{activeCount}</span>}
            </Button>
          </div>
          <div id="tx-filters" className={cn('flex-col gap-3 sm:flex', showFilters ? 'flex' : 'hidden')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative hidden sm:col-span-2 sm:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search description, reference, recipient, symbol…" className="pl-9" aria-label="Search transactions" />
            </div>
            <NativeSelect value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
              <option value="all">All categories</option>
              {TX_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </NativeSelect>
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
              <option value="all">All statuses</option>
              {TX_STATUSES.map((s) => (
                <option key={s} value={s} className="capitalize">
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:items-end">
            <div className="space-y-1">
              <Label htmlFor="from" className="text-xs">
                From
              </Label>
              <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} max={to || undefined} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to" className="text-xs">
                To
              </Label>
              <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} min={from || undefined} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="origin" className="text-xs">
                Origin
              </Label>
              <NativeSelect id="origin" value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="all">All</option>
                <option value="user">Created by you</option>
                <option value="seed">Historical demo examples</option>
              </NativeSelect>
            </div>
            <div className="space-y-1">
              <Label htmlFor="sort" className="text-xs">
                <ArrowDownUp className="mr-1 inline size-3" /> Sort
              </Label>
              <NativeSelect id="sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="date-desc">Newest first</option>
                <option value="date-asc">Oldest first</option>
                <option value="amount-desc">Amount: high → low</option>
                <option value="amount-asc">Amount: low → high</option>
              </NativeSelect>
            </div>
            <Button variant="ghost" onClick={clear} disabled={!active}>
              <X /> Clear filters
            </Button>
          </div>
          </div>
        </CardHeader>
        <CardContent className="px-2 sm:px-5">
          {filtered.length === 0 ? (
            <EmptyState icon={Search} title="No transactions found" description="Adjust your filters or date range." />
          ) : (
            <TransactionTable transactions={filtered.slice((page - 1) * pageSize, page * pageSize)} />
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Pagination page={page} pageCount={pageCount} onPage={setPage} total={filtered.length} label="transactions" />
            <label className="flex items-center gap-2 pt-3 text-sm text-muted-foreground">
              Rows
              <NativeSelect value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="h-8 w-20">
                {PAGE_SIZES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </NativeSelect>
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
