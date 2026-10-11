'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ArrowDownUp, Loader2 } from 'lucide-react';
import {
  CURRENCIES,
  CURRENCY_CODES,
  DEMO_RATES_PER_USD,
  EXCHANGE_FEE_PERCENT,
  getPairHistory,
  getRate,
  minorUnits,
  quoteExchange,
  subMoney,
  type CurrencyCode,
} from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/primitives';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/overlays';
import { CurrencySelect, EmptyState, FieldError, Money, PageHeader, SimulatedBadge, SummaryRows } from '@/components/common';
import { TimeAreaChart } from '@/components/charts';
import { useDemo } from '@/lib/store/demo-store';
import { demoApi, errorMessage } from '@/lib/api/demo-api';
import { formatDateTime, formatMoney } from '@/lib/format';

export default function ExchangePage() {
  const state = useDemo();
  const [from, setFrom] = React.useState<CurrencyCode>('USD');
  const [to, setTo] = React.useState<CurrencyCode>(state.settings.secondaryCurrency === 'USD' ? 'INR' : state.settings.secondaryCurrency);
  const [amountStr, setAmountStr] = React.useState('100');
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const amount = Number(amountStr) || 0;
  const q = quoteExchange(from, to, amount);
  const balance = state.wallet.balances[from];
  const decimals = minorUnits(from);
  const error = !amountStr
    ? undefined
    : !new RegExp(`^\\d+${decimals ? `(\\.\\d{1,${decimals}})?` : ''}$`).test(amountStr) || amount <= 0
      ? 'Enter a valid amount greater than zero'
      : from === to
        ? 'Choose two different currencies'
        : amount > balance
          ? `Insufficient ${from} balance (${formatMoney(balance, from)} available)`
          : q.toAmount <= 0
            ? 'Amount too small to convert'
            : undefined;
  const history = React.useMemo(() => getPairHistory(from, to, 90).map((p) => ({ t: p.t, rate: p.p })), [from, to]);

  const swap = () => {
    setFrom(to);
    setTo(from);
  };

  const execute = async () => {
    setSubmitting(true);
    try {
      const res = await demoApi.exchange({ from, to, amount });
      toast.success('Currency exchange completed', {
        description: `${formatMoney(res.record.fromAmount, from)} → ${formatMoney(res.record.toAmount, to)} · ${res.transaction.reference}`,
      });
      setConfirmOpen(false);
      setAmountStr('');
    } catch (e) {
      toast.error('Exchange failed', { description: errorMessage(e) });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Currency exchange"
        description={`Convert between 10 currencies at illustrative demo rates. A ${EXCHANGE_FEE_PERCENT}% conversion fee is deducted from the source amount.`}
        badge={<SimulatedBadge label="Simulated rates — not live quotes" />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="rounded-xl border bg-muted/30 p-4">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <Label htmlFor="fx-from-amount">You pay</Label>
                <button className="font-medium text-primary" onClick={() => setAmountStr(String(balance))}>
                  Balance: <Money amount={balance} currency={from} />
                </button>
              </div>
              <div className="mt-2 flex gap-2">
                <Input id="fx-from-amount" inputMode="decimal" value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ''))} className="h-12 flex-1 border-0 bg-transparent px-0 text-xl font-semibold focus-visible:ring-0 sm:text-2xl" aria-invalid={!!error} />
                <CurrencySelect value={from} onChange={setFrom} className="h-12 w-28 shrink-0 sm:w-36" aria-label="From currency" />
              </div>
            </div>
            <div className="-my-2 flex justify-center">
              <Button variant="outline" size="icon" className="rounded-full bg-card" onClick={swap} aria-label="Swap currencies">
                <ArrowDownUp />
              </Button>
            </div>
            <div className="rounded-xl border bg-muted/30 p-4">
              <p className="text-xs text-muted-foreground">You receive</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="h-12 min-w-0 flex-1 truncate text-xl font-semibold leading-[3rem] tabular text-gain sm:text-2xl">{formatMoney(error ? 0 : q.toAmount, to)}</p>
                <CurrencySelect value={to} onChange={setTo} className="h-12 w-28 shrink-0 sm:w-36" aria-label="To currency" />
              </div>
            </div>
            <FieldError message={error} />
            <SummaryRows
              rows={[
                { label: 'Exchange rate (simulated)', value: `1 ${from} = ${getRate(from, to)} ${to}` },
                { label: `Conversion fee (${EXCHANGE_FEE_PERCENT}%)`, value: formatMoney(q.fee, from) },
                { label: 'Amount converted', value: formatMoney(q.convertedAmount, from) },
                { label: 'You receive', value: formatMoney(q.toAmount, to), strong: true },
              ]}
            />
            <Button className="w-full" size="lg" variant="gradient" disabled={!amountStr || !!error} onClick={() => setConfirmOpen(true)}>
              Exchange {from} → {to}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>
              {from}/{to} — 90 day simulated history
            </CardTitle>
            <CardDescription>Synthetic illustrative series ending at the current demo rate. Not real FX data.</CardDescription>
          </CardHeader>
          <CardContent>
            <TimeAreaChart
              data={history}
              dataKey="rate"
              name={`${from}/${to}`}
              color="var(--series-3)"
              valueFormat={(v) => v.toLocaleString('en-US', { maximumSignificantDigits: 6 })}
              tooltipLabel={(t) => new Date(Number(t)).toDateString()}
              domainPadding={0.01}
              height={300}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Demo rate table</CardTitle>
            <CardDescription>Illustrative rates per 1 USD and per 1 {to === 'USD' ? 'EUR' : to}. Static demo values — never live quotes.</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Per 1 USD</TableHead>
                  <TableHead className="text-right">USD per unit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {CURRENCY_CODES.filter((c) => c !== 'USD').map((c) => (
                  <TableRow key={c}>
                    <TableCell>
                      {CURRENCIES[c].flag} <span className="font-medium">{c}</span> <span className="text-xs text-muted-foreground">{CURRENCIES[c].name}</span>
                    </TableCell>
                    <TableCell className="text-right tabular">{DEMO_RATES_PER_USD[c]}</TableCell>
                    <TableCell className="text-right tabular">{getRate(c, 'USD')}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Conversion history</CardTitle>
            <CardDescription>{state.exchangeHistory.length} exchanges</CardDescription>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            {state.exchangeHistory.length === 0 ? (
              <EmptyState title="No conversions yet" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="hidden sm:table-cell">Date</TableHead>
                    <TableHead>Pair</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {state.exchangeHistory.slice(0, 12).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground sm:table-cell">{formatDateTime(r.createdAt)}</TableCell>
                      <TableCell className="font-medium">
                        {r.from}→{r.to}
                        <span className="block text-[11px] font-normal text-muted-foreground sm:hidden">{formatDateTime(r.createdAt)}</span>
                      </TableCell>
                      <TableCell className="text-right tabular">{formatMoney(r.fromAmount, r.from)}</TableCell>
                      <TableCell className="text-right tabular text-gain">{formatMoney(r.toAmount, r.to)}</TableCell>
                      <TableCell className="hidden text-right tabular text-xs sm:table-cell">{r.rate}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm exchange</DialogTitle>
            <DialogDescription>Simulated conversion at an illustrative demo rate.</DialogDescription>
          </DialogHeader>
          <div className="text-center">
            <p className="text-2xl font-semibold tabular">{formatMoney(q.fromAmount, from)}</p>
            <p className="text-muted-foreground">↓</p>
            <p className="text-2xl font-semibold tabular text-gain">{formatMoney(q.toAmount, to)}</p>
          </div>
          <SummaryRows
            rows={[
              { label: 'Rate', value: `1 ${from} = ${q.rate} ${to}` },
              { label: 'Fee', value: formatMoney(q.fee, from) },
              { label: `New ${from} balance`, value: formatMoney(Math.max(0, subMoney(balance, q.fromAmount, from)), from) },
            ]}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={execute} disabled={submitting}>
              {submitting && <Loader2 className="animate-spin" />} Confirm exchange
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
