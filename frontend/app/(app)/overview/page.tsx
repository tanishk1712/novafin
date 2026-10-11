'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpFromLine,
  Banknote,
  Briefcase,
  CircleDollarSign,
  LineChart,
  QrCode,
  ScanLine,
  Send,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { balanceHistory, getHistory, getMarketSummary, monthlyCashflow, STOCKS_BY_SYMBOL } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/primitives';
import { ChangePill, ChangeText, Money, PageHeader, SimulatedBadge, StatCard, StockLogo } from '@/components/common';
import { DonutChart, GroupedBarChart, Sparkline, TimeAreaChart } from '@/components/charts';
import { TransactionTable } from '@/components/transactions/transaction-table';
import { useDemo, useMarket } from '@/lib/store/demo-store';
import { useNetWorth, usePortfolio, useWalletTotals, tradeDialog } from '@/lib/hooks/use-finance';
import { formatNumber, formatPct, formatPrice, formatUsd, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function OverviewPage() {
  const state = useDemo();
  const market = useMarket();
  const router = useRouter();
  const portfolio = usePortfolio();
  const netWorth = useNetWorth();
  const totals = useWalletTotals();
  const hidden = state.settings.hideBalances;
  const summary = React.useMemo(() => getMarketSummary(market, 5), [market]);
  const history = React.useMemo(() => balanceHistory(state, 'USD', 90).map((p) => ({ t: p.t, balance: p.balance })), [state]);
  const cashflow = React.useMemo(() => monthlyCashflow(state, 6), [state]);
  const spy = market.quotes.SPY;
  const spySession = React.useMemo(() => (getHistory(market, 'SPY', '1D')?.prices ?? []).map((x) => ({ t: x.t, p: x.p })), [market]);

  const quickActions = [
    { label: 'Add Money', icon: ArrowDownToLine, onClick: () => router.push('/add-money'), tint: 'text-gain' },
    { label: 'Withdraw', icon: ArrowUpFromLine, onClick: () => router.push('/withdraw'), tint: 'text-loss' },
    { label: 'Send Money', icon: Send, onClick: () => router.push('/send-money'), tint: 'text-primary' },
    { label: 'Exchange', icon: ArrowLeftRight, onClick: () => router.push('/exchange'), tint: 'text-teal' },
    { label: 'Scan QR', icon: ScanLine, onClick: () => router.push('/qr-payments?tab=scan'), tint: 'text-violet' },
    { label: 'Generate QR', icon: QrCode, onClick: () => router.push('/qr-payments?tab=generate'), tint: 'text-violet' },
    { label: 'Buy Stock', icon: TrendingUp, onClick: () => tradeDialog.open('buy'), tint: 'text-gain' },
    { label: 'Sell Stock', icon: TrendingDown, onClick: () => tradeDialog.open('sell'), tint: 'text-loss' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Good ${greeting()}, ${state.user.name.split(' ')[0]}`}
        description="Your simulated wallet, investments and activity at a glance. All figures are demo values."
        badge={<SimulatedBadge label="Demo" />}
      />

      {/* Hero net worth */}
      <Card className="relative overflow-hidden p-4 sm:p-6">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_200px_at_0%_0%,color-mix(in_oklch,var(--color-primary)_25%,transparent),transparent)]" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm text-muted-foreground">Total net worth (estimated)</p>
            <p className="mt-1 text-[2rem] font-semibold leading-tight tracking-tight min-[400px]:text-4xl sm:text-5xl">
              <Money amount={netWorth.total} animated />
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <ChangeText value={portfolio.dayPnl} percent={false} suffix="today (portfolio)" />
              <span className="text-muted-foreground">
                Cash {hidden ? '••••' : formatUsd(netWorth.totalCashUsd)} + Investments {hidden ? '••••' : formatUsd(netWorth.invested)}
              </span>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {quickActions.map((a) => (
              <button
                key={a.label}
                onClick={a.onClick}
                className="group flex flex-col items-center gap-1.5 rounded-xl p-2 text-center text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <span className="grid size-11 place-items-center rounded-full border bg-card transition-transform group-hover:scale-105">
                  <a.icon className={cn('size-5', a.tint)} />
                </span>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Available USD cash" value={netWorth.cashUsd} format={(n) => formatUsd(n)} icon={Wallet} accent="primary" masked={hidden} hint="Ready to spend or invest" />
        <StatCard label="Invested value" value={portfolio.marketValue} format={(n) => formatUsd(n)} icon={Briefcase} accent="violet" masked={hidden} delta={portfolio.dayPnlPercent} deltaLabel="today" />
        <StatCard label="Today's P/L (simulated)" value={portfolio.dayPnl} format={(n) => formatUsd(n, { sign: true })} icon={LineChart} accent={portfolio.dayPnl >= 0 ? 'gain' : 'loss'} />
        <StatCard
          label="Overall portfolio return"
          value={portfolio.totalReturn}
          format={(n) => formatUsd(n, { sign: true })}
          icon={TrendingUp}
          accent={portfolio.totalReturn >= 0 ? 'gain' : 'loss'}
          delta={portfolio.totalReturnPercent}
          deltaLabel="incl. realized"
        />
        <StatCard label="Total deposits" value={totals.totalDeposits} format={(n) => formatUsd(n)} icon={ArrowDownToLine} accent="teal" hint="All-time, USD equiv." />
        <StatCard label="Total withdrawals" value={totals.totalWithdrawals} format={(n) => formatUsd(n)} icon={ArrowUpFromLine} accent="amber" hint="All-time, USD equiv." />
        <StatCard label="Completed trades" value={totals.completedTrades} format={(n) => formatNumber(Math.round(n))} icon={CircleDollarSign} accent="primary" hint="Filled paper orders" />
        <StatCard label="Other currency cash" value={netWorth.otherCashUsd} format={(n) => formatUsd(n)} icon={Banknote} accent="teal" masked={hidden} hint="Converted at demo rates" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>USD wallet balance</CardTitle>
              <CardDescription>Last 90 days, reconstructed from your transaction ledger</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/wallet">
                Wallet <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <TimeAreaChart data={history} dataKey="balance" name="USD balance" height={260} tooltipLabel={(t) => new Date(Number(t)).toDateString()} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Portfolio allocation</CardTitle>
            <CardDescription>By current simulated market value</CardDescription>
          </CardHeader>
          <CardContent>
            <DonutChart
              data={portfolio.positions.map((p) => ({ name: p.symbol, value: p.marketValue }))}
              height={200}
              centerLabel="Invested"
              centerValue={hidden ? '••••' : formatUsd(portfolio.marketValue, { compact: true })}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Income vs expenses</CardTitle>
            <CardDescription>Monthly cash in (deposits, received transfers & QR) vs cash out (withdrawals, sent transfers, QR, fees)</CardDescription>
          </CardHeader>
          <CardContent>
            <GroupedBarChart
              data={cashflow.map((m) => ({ month: m.label, income: m.income, expense: m.expense }))}
              xKey="month"
              bars={[
                { key: 'income', name: 'Income', color: 'var(--series-1)' },
                { key: 'expense', name: 'Expenses', color: 'var(--series-2)' },
              ]}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Daily market movement</CardTitle>
              <CardDescription>S&P 500 proxy (SPY) · simulated ticks</CardDescription>
            </div>
            <ChangePill value={spy.changePercent} />
          </CardHeader>
          <CardContent>
            <TimeAreaChart
              data={spySession}
              dataKey="p"
              name="SPY"
              color={spy.changePercent >= 0 ? 'var(--color-gain)' : 'var(--color-loss)'}
              valueFormat={(v) => formatPrice(v)}
              xFormat={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              height={200}
              baseline={spy.previousClose}
              domainPadding={0.002}
            />
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-gain/10 p-2">
                <p className="text-lg font-semibold text-gain">{summary.advancers}</p>advancing
              </div>
              <div className="rounded-lg bg-loss/10 p-2">
                <p className="text-lg font-semibold text-loss">{summary.decliners}</p>declining
              </div>
              <div className="rounded-lg bg-muted p-2">
                <p className="text-lg font-semibold">{formatPct(summary.averageChangePercent)}</p>avg move
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Recent transactions</CardTitle>
              <CardDescription>Latest activity across all categories</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/transactions">
                View all <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            <TransactionTable transactions={state.transactions.filter((t) => t.category !== 'fee').slice(0, 7)} compact />
          </CardContent>
        </Card>
        <div className="grid gap-4">
          <MoversCard title="Top gainers" quotes={summary.gainers} />
          <MoversCard title="Top losers" quotes={summary.losers} />
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Watchlist</CardTitle>
              <CardDescription>Live simulated prices</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/watchlist">
                Manage <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {state.watchlist.slice(0, 8).map((w) => {
              const q = market.quotes[w.symbol];
              if (!q) return null;
              return (
                <Link key={w.symbol} href={`/market/${w.symbol}`} className="flex items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-muted/50">
                  <StockLogo symbol={w.symbol} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{w.symbol}</p>
                    <p className="truncate text-xs text-muted-foreground">{STOCKS_BY_SYMBOL[w.symbol]?.name}</p>
                  </div>
                  <span className="hidden min-[400px]:block">
                    <Sparkline data={[q.previousClose, ...q.ticks.map((t) => t.p)]} width={64} height={28} />
                  </span>
                  <div className="text-right">
                    <p className="text-sm tabular">{formatPrice(q.price)}</p>
                    <ChangePill value={q.changePercent} className="min-w-0" />
                  </div>
                </Link>
              );
            })}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>{state.notifications.filter((n) => !n.read).length} unread</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/notifications">
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {state.notifications.slice(0, 5).map((n) => (
              <Link key={n.id} href={n.link ?? '/notifications'} className="flex gap-3 rounded-lg p-2 hover:bg-muted/50">
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-muted' : 'bg-primary')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{n.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{n.message}</span>
                  <span className="text-[11px] text-muted-foreground/80">{relativeTime(n.createdAt)}</span>
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MoversCard({ title, quotes }: { title: string; quotes: { symbol: string; price: number; changePercent: number }[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {quotes.map((q) => (
          <Link key={q.symbol} href={`/market/${q.symbol}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-muted/50">
            <StockLogo symbol={q.symbol} size={28} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{q.symbol}</span>
            <span className="text-sm tabular text-muted-foreground">{formatPrice(q.price)}</span>
            <ChangePill value={q.changePercent} />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'evening';
}
