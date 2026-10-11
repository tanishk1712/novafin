'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Copy, Printer, XCircle } from 'lucide-react';
import { CURRENCIES, type Transaction } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent } from '@/components/ui/primitives';
import { EmptyState, StatusBadge, SummaryRows } from '@/components/common';
import { LogoMark } from '@/components/layout/logo';
import { TxAmount, TxIcon } from '@/components/transactions/transaction-table';
import { useDemo } from '@/lib/store/demo-store';
import { demoApi, errorMessage } from '@/lib/api/demo-api';
import { CATEGORY_LABELS, formatDateTime, formatMoney, formatPrice, formatShares } from '@/lib/format';

const META_LABELS: Record<string, string> = {
  method: 'Funding method',
  netCredited: 'Net credited',
  speed: 'Speed',
  arrival: 'Estimated arrival',
  handle: 'Recipient handle',
  kind: 'Recipient type',
  note: 'Note',
  toCurrency: 'Received currency',
  toAmount: 'Received amount',
  rate: 'Exchange rate',
  fromAmount: 'Total paid (incl. fee)',
  symbol: 'Symbol',
  quantity: 'Shares',
  price: 'Execution price',
  realizedPnl: 'Realized P/L',
  qrRequestId: 'QR request id',
  wallet: 'Payee wallet',
  reason: 'Reason',
  parentReference: 'Parent reference',
};
const HIDDEN_META = new Set(['settleAt', 'bankAccountId', 'recipientId', 'orderId']);

function metaValue(t: Transaction, key: string, value: string | number | boolean): string {
  if (key === 'toAmount') return formatMoney(Number(value), t.meta?.toCurrency as Transaction['currency']);
  if (key === 'netCredited' || key === 'fromAmount' || key === 'realizedPnl') return formatMoney(Number(value), t.currency);
  if (key === 'price') return formatPrice(Number(value));
  if (key === 'quantity') return formatShares(Number(value));
  if (key === 'method') return String(value).replace('_', ' ');
  return String(value);
}

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useDemo();
  const tx = state.transactions.find((t) => t.id === id || t.reference === id);
  const [cancelling, setCancelling] = React.useState(false);

  if (!tx) {
    return (
      <Card>
        <EmptyState
          title="Transaction not found"
          description="It may have been removed by a demo reset."
          action={
            <Button asChild>
              <Link href="/transactions">Back to transactions</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  const fees = state.transactions.filter((t) => t.linkedTo === tx.id);
  const parent = tx.linkedTo ? state.transactions.find((t) => t.id === tx.linkedTo) : undefined;
  const cancellable = ['withdrawal', 'transfer'].includes(tx.category) && ['pending', 'processing'].includes(tx.status);
  const settleAt = typeof tx.meta?.settleAt === 'number' ? tx.meta.settleAt : null;

  const cancel = async () => {
    setCancelling(true);
    try {
      await demoApi.cancelTransaction(tx.id);
      toast.success('Transaction cancelled', { description: 'The amount and fee were returned to your wallet.' });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="no-print flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/transactions">
            <ArrowLeft /> Transactions
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard?.writeText(tx.reference).then(() => toast.success('Reference copied'), () => toast.error('Clipboard unavailable'))}
          >
            <Copy /> Copy ref
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer /> Print receipt
          </Button>
          {cancellable && (
            <Button variant="destructive" size="sm" onClick={cancel} disabled={cancelling}>
              <XCircle /> Cancel
            </Button>
          )}
        </div>
      </div>

      <Card className="print-area">
        <CardContent className="space-y-6 p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-semibold">
              <LogoMark className="size-7" /> NovaFin receipt
            </div>
            <Badge variant="warning">DEMO · SIMULATED</Badge>
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <TxIcon category={tx.category} size={52} />
            <p className="text-sm text-muted-foreground">{tx.description}</p>
            <TxAmount tx={tx} className="text-4xl" />
            <div className="flex items-center gap-2">
              <StatusBadge status={tx.status} />
              <Badge variant="secondary">{CATEGORY_LABELS[tx.category]}</Badge>
              <Badge variant="outline">{tx.source === 'seed' ? 'Historical demo example' : 'Created by you'}</Badge>
            </div>
            {settleAt && (tx.status === 'processing' || tx.status === 'pending') && (
              <p className="text-xs text-muted-foreground">Simulated settlement around {new Date(settleAt).toLocaleTimeString()}</p>
            )}
          </div>
          <SummaryRows
            rows={[
              { label: 'Reference', value: <span className="font-mono">{tx.reference}</span> },
              { label: 'Transaction id', value: <span className="font-mono text-xs">{tx.id}</span> },
              { label: 'Created', value: formatDateTime(tx.createdAt) },
              { label: 'Last updated', value: formatDateTime(tx.updatedAt) },
              ...(tx.counterparty ? [{ label: tx.direction === 'credit' ? 'From' : 'To', value: tx.counterparty }] : []),
              { label: 'Currency', value: `${CURRENCIES[tx.currency].flag} ${tx.currency}` },
              { label: 'Amount', value: formatMoney(tx.amount, tx.currency) },
              { label: 'Fee', value: formatMoney(tx.fee, tx.currency) },
              ...Object.entries(tx.meta ?? {})
                .filter(([k]) => !HIDDEN_META.has(k))
                .map(([k, v]) => ({ label: META_LABELS[k] ?? k, value: metaValue(tx, k, v) })),
            ]}
          />
          {fees.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Linked fee records</p>
              {fees.map((f) => (
                <Link key={f.id} href={`/transactions/${f.id}`} className="flex justify-between rounded-lg border p-2.5 text-sm hover:bg-muted/50">
                  <span>
                    {f.description} · <span className="font-mono text-xs">{f.reference}</span>
                  </span>
                  <span className="tabular">−{formatMoney(f.amount, f.currency)}</span>
                </Link>
              ))}
            </div>
          )}
          {parent && (
            <Link href={`/transactions/${parent.id}`} className="block rounded-lg border p-2.5 text-sm hover:bg-muted/50">
              Fee for: {parent.description} · <span className="font-mono text-xs">{parent.reference}</span>
            </Link>
          )}
          <p className="text-center text-[11px] text-muted-foreground">
            This receipt documents a simulated operation in the NovaFin demo. No real funds were moved and it is not a valid financial record.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
