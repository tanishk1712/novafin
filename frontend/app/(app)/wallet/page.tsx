'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Copy, Send } from 'lucide-react';
import { CURRENCIES, CURRENCY_CODES, balanceHistory, getRate, type CurrencyCode } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives';
import { CurrencySelect, Money, PageHeader, SimulatedBadge } from '@/components/common';
import { TimeAreaChart } from '@/components/charts';
import { TransactionTable } from '@/components/transactions/transaction-table';
import { useDemo } from '@/lib/store/demo-store';
import { useNetWorth, usePortfolio } from '@/lib/hooks/use-finance';
import { formatMoney, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function WalletPage() {
  const state = useDemo();
  const netWorth = useNetWorth();
  const portfolio = usePortfolio();
  const [currency, setCurrency] = React.useState<CurrencyCode>('USD');
  const history = React.useMemo(() => balanceHistory(state, currency, 120).map((p) => ({ t: p.t, balance: p.balance })), [state, currency]);
  const walletTx = state.transactions.filter((t) => !['stock_buy', 'stock_sell'].includes(t.category) && t.category !== 'fee').slice(0, 10);
  const held = state.transactions
    .filter((t) => (t.status === 'processing' || t.status === 'pending') && t.direction === 'debit')
    .reduce((a, t) => a + (t.currency === 'USD' ? t.amount + t.fee : 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallet"
        description="Your multi-currency demo wallet. Available cash is separate from invested assets."
        badge={<SimulatedBadge label="Demo balances" />}
        actions={
          <>
            <Button asChild variant="gain">
              <Link href="/add-money">
                <ArrowDownToLine /> Add money
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/withdraw">
                <ArrowUpFromLine /> Withdraw
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden lg:col-span-2">
          <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-violet/20 blur-3xl" />
          <CardContent className="relative space-y-5 p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Available USD cash</p>
                <p className="text-[2rem] font-semibold leading-tight tracking-tight sm:text-4xl">
                  <Money amount={state.wallet.balances.USD} animated />
                </p>
                {held > 0 && <p className="mt-1 text-xs text-amber-500">{formatUsd(held)} held in processing transfers</p>}
              </div>
              <button
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs hover:bg-muted"
                onClick={() => {
                  navigator.clipboard?.writeText(state.user.walletId).then(
                    () => toast.success('Wallet ID copied'),
                    () => toast.error('Clipboard unavailable'),
                  );
                }}
              >
                <span>
                  <span className="block text-muted-foreground">Wallet ID</span>
                  <span className="font-mono font-semibold">{state.user.walletId}</span>
                </span>
                <Copy className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 text-sm min-[440px]:grid-cols-3 sm:gap-3">
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">All cash (USD equiv.)</p>
                <p className="font-semibold">
                  <Money amount={netWorth.totalCashUsd} />
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Invested</p>
                <p className="font-semibold">
                  <Money amount={portfolio.marketValue} />
                </p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Net worth</p>
                <p className="font-semibold">
                  <Money amount={netWorth.total} />
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="secondary">
                <Link href="/send-money">
                  <Send /> Send
                </Link>
              </Button>
              <Button asChild size="sm" variant="secondary">
                <Link href="/exchange">
                  <ArrowLeftRight /> Exchange
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Currency balances</CardTitle>
            <CardDescription>Converted to USD at illustrative demo rates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {CURRENCY_CODES.map((c) => {
              const bal = state.wallet.balances[c];
              const usd = netWorth.byCurrency.find((b) => b.currency === c)?.usdValue ?? 0;
              return (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={cn('flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60', currency === c && 'bg-primary/10', !bal && 'opacity-60')}
                >
                  <span className="text-xl">{CURRENCIES[c].flag}</span>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{c}</span>
                    <span className="block text-xs text-muted-foreground">{CURRENCIES[c].name}</span>
                  </span>
                  <span className="text-right text-sm">
                    <Money amount={bal} currency={c} className="block font-medium" />
                    {c !== 'USD' && <span className="block text-xs text-muted-foreground">≈ {state.settings.hideBalances ? '••••' : formatUsd(usd)}</span>}
                  </span>
                </button>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{currency} balance history</CardTitle>
            <CardDescription>
              120 days · 1 {currency} = {getRate(currency, 'USD')} USD (simulated rate)
            </CardDescription>
          </div>
          <CurrencySelect value={currency} onChange={setCurrency} className="w-full sm:w-56" aria-label="Currency" />
        </CardHeader>
        <CardContent>
          <TimeAreaChart
            data={history}
            dataKey="balance"
            name={`${currency} balance`}
            valueFormat={(v) => formatMoney(v, currency)}
            tooltipLabel={(t) => new Date(Number(t)).toDateString()}
            color="var(--series-3)"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between">
          <div>
            <CardTitle>Wallet activity</CardTitle>
            <CardDescription>Deposits, withdrawals, transfers, exchanges and QR payments</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/transactions">All transactions</Link>
          </Button>
        </CardHeader>
        <CardContent className="px-2 sm:px-5">
          <TransactionTable transactions={walletTx} />
        </CardContent>
      </Card>
    </div>
  );
}
