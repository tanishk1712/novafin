'use client';

import Link from 'next/link';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Percent,
  QrCode,
  Send,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import type { Transaction, TxCategory } from '@novafin/shared';
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/primitives';
import { StatusBadge } from '@/components/common';
import { CATEGORY_LABELS, formatDateTime, formatMoney, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export const CATEGORY_ICONS: Record<TxCategory, LucideIcon> = {
  deposit: ArrowDownToLine,
  withdrawal: ArrowUpFromLine,
  exchange: ArrowLeftRight,
  transfer: Send,
  qr_payment: QrCode,
  stock_buy: TrendingUp,
  stock_sell: TrendingDown,
  fee: Percent,
};

const CATEGORY_TINT: Record<TxCategory, string> = {
  deposit: 'bg-gain/12 text-gain',
  withdrawal: 'bg-loss/12 text-loss',
  exchange: 'bg-teal/12 text-teal',
  transfer: 'bg-primary/12 text-primary',
  qr_payment: 'bg-violet/12 text-violet',
  stock_buy: 'bg-primary/12 text-primary',
  stock_sell: 'bg-amber-500/12 text-amber-500',
  fee: 'bg-muted text-muted-foreground',
};

export function TxIcon({ category, size = 36 }: { category: TxCategory; size?: number }) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full', CATEGORY_TINT[category])} style={{ width: size, height: size }}>
      <Icon className="size-4" />
    </span>
  );
}

export function TxAmount({ tx, className }: { tx: Transaction; className?: string }) {
  const inactive = tx.status === 'failed' || tx.status === 'cancelled';
  const credit = tx.direction === 'credit';
  return (
    <span className={cn('font-semibold tabular whitespace-nowrap', inactive ? 'text-muted-foreground line-through' : credit ? 'text-gain' : 'text-foreground', className)}>
      {credit ? '+' : '−'}
      {formatMoney(tx.amount, tx.currency)}
    </span>
  );
}

export function TransactionTable({ transactions, compact }: { transactions: Transaction[]; compact?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Transaction</TableHead>
          {!compact && <TableHead className="hidden lg:table-cell">Category</TableHead>}
          {!compact && <TableHead className="hidden xl:table-cell">Reference</TableHead>}
          <TableHead className="hidden lg:table-cell">Status</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {transactions.map((t) => (
          <TableRow key={t.id} className="cursor-pointer">
            <TableCell>
              <Link href={`/transactions/${t.id}`} className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                <TxIcon category={t.category} size={34} />
                <span className="min-w-0">
                  <span className="block max-w-[6.5rem] truncate font-medium min-[360px]:max-w-[8.5rem] min-[400px]:max-w-[11rem] sm:max-w-[16rem]">{t.description}</span>
                  <span className="block text-xs text-muted-foreground" title={formatDateTime(t.createdAt)}>
                    {compact ? relativeTime(t.createdAt) : formatDateTime(t.createdAt)}
                    {t.source === 'seed' && !compact && <span className="ml-1.5 opacity-70">· historical demo</span>}
                  </span>
                </span>
              </Link>
            </TableCell>
            {!compact && (
              <TableCell className="hidden lg:table-cell">
                <Badge variant="secondary">{CATEGORY_LABELS[t.category]}</Badge>
              </TableCell>
            )}
            {!compact && <TableCell className="hidden font-mono text-xs text-muted-foreground xl:table-cell">{t.reference}</TableCell>}
            <TableCell className="hidden lg:table-cell">
              <StatusBadge status={t.status} />
            </TableCell>
            <TableCell className="text-right">
              <Link href={`/transactions/${t.id}`}>
                <TxAmount tx={t} />
                {t.category === 'exchange' && t.meta?.toAmount !== undefined && (
                  <span className="block text-xs text-gain tabular">+{formatMoney(Number(t.meta.toAmount), t.meta.toCurrency as Transaction['currency'])}</span>
                )}
                {t.status !== 'completed' && (
                  <span className="mt-1 block lg:hidden">
                    <StatusBadge status={t.status} />
                  </span>
                )}
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
