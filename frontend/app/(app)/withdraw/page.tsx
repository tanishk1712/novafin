'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Loader2, XCircle } from 'lucide-react';
import { LIMITS, WITHDRAWAL_SPEEDS, convert, quoteWithdrawal, subMoney, type Transaction, type WithdrawalSpeed } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/ui/primitives';
import { EmptyState, FieldError, Money, PageHeader, SimulatedBadge, StatusBadge, SummaryRows } from '@/components/common';
import { Steps, SuccessPanel } from '@/components/common/flow';
import { useDemo } from '@/lib/store/demo-store';
import { demoApi, errorMessage } from '@/lib/api/demo-api';
import { formatMoney, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function WithdrawPage() {
  const state = useDemo();
  const verified = state.bankAccounts.filter((b) => b.verification === 'verified');
  const defaultId = (verified.find((b) => b.isDefault) ?? verified[0])?.id ?? '';
  const [accountId, setAccountId] = React.useState(defaultId);
  const [amountStr, setAmountStr] = React.useState('');
  const [speed, setSpeed] = React.useState<WithdrawalSpeed>('standard');
  const [step, setStep] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [resultId, setResultId] = React.useState<string | null>(null);

  const amount = Number(amountStr) || 0;
  const q = quoteWithdrawal(state, { amount, bankAccountId: accountId, speed });
  const cur = q.currency;
  const min = cur === 'USD' ? LIMITS.withdrawMin : convert(LIMITS.withdrawMin, 'USD', cur);
  const max = cur === 'USD' ? LIMITS.withdrawMax : convert(LIMITS.withdrawMax, 'USD', cur);

  const error = (() => {
    if (!q.account) return 'Select a verified bank account.';
    if (!amountStr) return undefined;
    if (!/^\d+(\.\d{1,2})?$/.test(amountStr) || amount <= 0) return 'Enter a valid amount greater than zero.';
    if (amount < min) return `Minimum withdrawal is ${formatMoney(min, cur)}.`;
    if (amount > max) return `Maximum demo withdrawal is ${formatMoney(max, cur)}.`;
    if (q.total > q.available) return `Insufficient ${cur} balance — you need ${formatMoney(q.total, cur)} including fees.`;
    return undefined;
  })();

  const live: Transaction | undefined = resultId ? state.transactions.find((t) => t.id === resultId) : undefined;
  const inFlight = state.transactions.filter((t) => t.category === 'withdrawal' && (t.status === 'processing' || t.status === 'pending'));

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await demoApi.withdraw({ amount, bankAccountId: accountId, speed });
      setResultId(res.transaction.id);
      setStep(2);
      toast.success('Withdrawal requested', { description: `${formatMoney(amount, cur)} is processing · ${res.transaction.reference}` });
    } catch (e) {
      toast.error('Withdrawal failed', { description: errorMessage(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const cancel = async (id: string) => {
    try {
      await demoApi.cancelTransaction(id);
      toast.success('Withdrawal cancelled — funds returned to your wallet');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <PageHeader title="Withdraw" description="Send demo funds to a saved bank account. Nothing is actually transferred." badge={<SimulatedBadge label="Simulated payout" />} />
        <Card>
          <CardContent className="p-4 sm:p-6">
            <Steps steps={['Details', 'Review', 'Status']} current={step} />
            {verified.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No verified bank account"
                description="Add and verify a demo bank account before withdrawing."
                action={
                  <Button asChild>
                    <Link href="/bank-accounts">Manage bank accounts</Link>
                  </Button>
                }
              />
            ) : step === 0 ? (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label>To bank account</Label>
                  <div className="grid gap-2">
                    {state.bankAccounts.map((b) => {
                      const disabled = b.verification !== 'verified';
                      return (
                        <button
                          key={b.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => setAccountId(b.id)}
                          className={cn(
                            'flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 disabled:cursor-not-allowed disabled:opacity-50',
                            accountId === b.id && 'border-primary bg-primary/5',
                          )}
                        >
                          <span className="grid size-9 place-items-center rounded-lg bg-muted">
                            <Building2 className="size-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{b.nickname}</span>
                            <span className="block text-xs text-muted-foreground">
                              {b.bankName} •••• {b.last4} · {b.currency}
                            </span>
                          </span>
                          {b.isDefault && <Badge>Default</Badge>}
                          {disabled && <Badge variant="warning">Unverified</Badge>}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="w-amount">Amount ({cur})</Label>
                  <Input id="w-amount" inputMode="decimal" placeholder="0.00" className="h-12 text-xl font-semibold" value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ''))} aria-invalid={!!error && !!amountStr} />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>
                      Available: <Money amount={q.available} currency={cur} />
                    </span>
                    <button type="button" className="font-medium text-primary" onClick={() => {
                      const fee = quoteWithdrawal(state, { amount: q.available, bankAccountId: accountId, speed }).fee;
                      setAmountStr(String(Math.max(0, subMoney(q.available, fee, cur))));
                    }}>
                      Withdraw max
                    </button>
                  </div>
                  {amountStr && <FieldError message={error} />}
                </div>
                <div className="space-y-2">
                  <Label>Speed</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(Object.keys(WITHDRAWAL_SPEEDS) as WithdrawalSpeed[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setSpeed(s)}
                        className={cn('rounded-xl border p-3 text-left transition-colors hover:bg-muted/50', speed === s && 'border-primary bg-primary/5')}
                      >
                        <span className="block text-sm font-medium">{WITHDRAWAL_SPEEDS[s].label}</span>
                        <span className="block text-xs text-muted-foreground">
                          {WITHDRAWAL_SPEEDS[s].arrival} · {WITHDRAWAL_SPEEDS[s].description}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                {amount > 0 && !error && (
                  <SummaryRows
                    rows={[
                      { label: 'Fee', value: formatMoney(q.fee, cur) },
                      { label: 'Total deducted', value: formatMoney(q.total, cur), strong: true },
                      { label: 'Estimated arrival', value: q.arrival },
                    ]}
                  />
                )}
                <Button className="w-full" size="lg" disabled={!amountStr || !!error} onClick={() => setStep(1)}>
                  Review withdrawal
                </Button>
              </div>
            ) : step === 1 ? (
              <div className="space-y-5">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">You are withdrawing</p>
                  <p className="text-4xl font-semibold tabular">{formatMoney(amount, cur)}</p>
                </div>
                <SummaryRows
                  rows={[
                    { label: 'To', value: `${q.account?.bankName} •••• ${q.account?.last4}` },
                    { label: 'Account holder', value: q.account?.holderName ?? '' },
                    { label: 'Speed', value: WITHDRAWAL_SPEEDS[speed].label },
                    { label: 'Fee', value: formatMoney(q.fee, cur) },
                    { label: 'Total deducted', value: formatMoney(q.total, cur), strong: true },
                    { label: 'Estimated arrival', value: q.arrival },
                  ]}
                />
                <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                  Simulated payout: the transfer moves to “processing” and completes after ~{state.settings.settlementSeconds}s in this demo.
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(0)} disabled={submitting}>
                    <ArrowLeft /> Back
                  </Button>
                  <Button className="flex-1" onClick={confirm} disabled={submitting}>
                    {submitting && <Loader2 className="animate-spin" />} Confirm withdrawal
                  </Button>
                </div>
              </div>
            ) : (
              live && (
                <SuccessPanel
                  title={live.status === 'completed' ? 'Withdrawal completed' : live.status === 'cancelled' ? 'Withdrawal cancelled' : 'Withdrawal processing'}
                  description={
                    <>
                      Transfer reference <span className="font-mono">{live.reference}</span>
                    </>
                  }
                  transaction={live}
                  onAgain={() => {
                    setStep(0);
                    setAmountStr('');
                    setResultId(null);
                  }}
                  againLabel="New withdrawal"
                >
                  <div className="flex items-center justify-center gap-2">
                    Status <StatusBadge status={live.status} />
                  </div>
                </SuccessPanel>
              )
            )}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4 lg:pt-[5.5rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">In-progress withdrawals</CardTitle>
            <CardDescription>Cancel before they settle to get a full refund.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {inFlight.length === 0 && <p className="text-sm text-muted-foreground">Nothing in progress.</p>}
            {inFlight.map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-lg border p-2.5 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium tabular">{formatMoney(t.amount, t.currency)}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.counterparty} · {relativeTime(t.createdAt)}
                  </p>
                </div>
                <StatusBadge status={t.status} />
                <Button size="icon" variant="ghost" aria-label="Cancel withdrawal" onClick={() => cancel(t.id)}>
                  <XCircle className="text-loss" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Fees & timing (demo)</CardTitle>
            <CardDescription>
              Standard: $1.50 flat, 1–3 business days. Instant: 1.5% (min $2.50, max $25). Fees for non-USD accounts are converted at demo rates. A real
              payout would require a banking partner (ACH / IMPS / SEPA).
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}
