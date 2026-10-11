'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowLeft, Building, CreditCard, Landmark, Loader2, Smartphone } from 'lucide-react';
import { FUNDING_METHODS, LIMITS, addMoney, depositFee, subMoney, type FundingMethod, type Transaction } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label } from '@/components/ui/primitives';
import { FieldError, Money, PageHeader, SimulatedBadge, SummaryRows } from '@/components/common';
import { Steps, SuccessPanel } from '@/components/common/flow';
import { useDemo } from '@/lib/store/demo-store';
import { demoApi, errorMessage } from '@/lib/api/demo-api';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

const METHOD_ICONS: Record<FundingMethod, typeof Landmark> = {
  bank_transfer: Landmark,
  debit_card: CreditCard,
  apple_pay: Smartphone,
  wire: Building,
};

const schema = z.object({
  amount: z
    .string()
    .min(1, 'Enter an amount')
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v), 'Use a valid amount with up to 2 decimals')
    .refine((v) => Number(v) > 0, 'Amount must be greater than zero')
    .refine((v) => Number(v) <= LIMITS.depositMax, `Maximum demo deposit is ${formatUsd(LIMITS.depositMax)}`),
  method: z.enum(['bank_transfer', 'debit_card', 'apple_pay', 'wire']),
});
type FormValues = z.infer<typeof schema>;

const PRESETS = [100, 500, 1000, 2500];

export default function AddMoneyPage() {
  const state = useDemo();
  const [step, setStep] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<Transaction | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { amount: '', method: 'bank_transfer' }, mode: 'onChange' });
  const amount = Number(form.watch('amount')) || 0;
  const method = form.watch('method');
  const fee = amount > 0 ? depositFee(amount, method) : 0;
  const net = subMoney(amount, fee);

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await demoApi.deposit({ amount, method });
      setResult(res.transaction);
      setStep(2);
      toast.success('Deposit completed', { description: `${formatUsd(amount)} demo deposit received · ${res.transaction.reference}` });
    } catch (e) {
      toast.error('Deposit failed', { description: errorMessage(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    form.reset({ amount: '', method });
    setResult(null);
    setStep(0);
  };

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Add money" description="Top up your demo USD wallet. No real funds are pulled from any account." badge={<SimulatedBadge label="Simulated deposit" />} />
      <Card>
        <CardContent className="p-4 sm:p-6">
          <Steps steps={['Amount & method', 'Review', 'Done']} current={step} />
          {step === 0 && (
            <form className="space-y-6" onSubmit={form.handleSubmit(() => setStep(1))} noValidate>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount (USD)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-2xl text-muted-foreground">$</span>
                  <Input id="amount" inputMode="decimal" placeholder="0.00" className="h-14 pl-8 text-2xl font-semibold" aria-invalid={!!form.formState.errors.amount} {...form.register('amount')} />
                </div>
                <FieldError message={form.formState.errors.amount?.message} />
                <div className="flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button key={p} type="button" className="rounded-full border px-3 py-1 text-xs hover:bg-muted" onClick={() => form.setValue('amount', String(p), { shouldValidate: true })}>
                      {formatUsd(p)}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Current balance: <Money amount={state.wallet.balances.USD} />
                </p>
              </div>
              <div className="space-y-2">
                <Label>Funding method</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(FUNDING_METHODS) as FundingMethod[]).map((m) => {
                    const Icon = METHOD_ICONS[m];
                    return (
                      <label
                        key={m}
                        className={cn('flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50', method === m && 'border-primary bg-primary/5')}
                      >
                        <input type="radio" value={m} className="sr-only" {...form.register('method')} />
                        <span className="grid size-9 place-items-center rounded-lg bg-muted">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium">{FUNDING_METHODS[m].label}</span>
                          <span className="block text-xs text-muted-foreground">{FUNDING_METHODS[m].description}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={!form.formState.isValid}>
                Review deposit
              </Button>
            </form>
          )}
          {step === 1 && (
            <div className="space-y-5">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">You are depositing</p>
                <p className="text-4xl font-semibold tabular">{formatUsd(amount)}</p>
              </div>
              <SummaryRows
                rows={[
                  { label: 'Funding method', value: FUNDING_METHODS[method].label },
                  { label: 'Funding fee', value: formatUsd(fee) },
                  { label: 'Arrival', value: FUNDING_METHODS[method].arrival },
                  { label: 'You will receive', value: formatUsd(net), strong: true },
                  { label: 'New USD balance', value: formatUsd(addMoney(state.wallet.balances.USD, net)) },
                ]}
              />
              <p className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                This is a simulated deposit. Confirming only updates your browser-local demo ledger.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(0)} disabled={submitting}>
                  <ArrowLeft /> Back
                </Button>
                <Button className="flex-1" variant="gain" onClick={confirm} disabled={submitting}>
                  {submitting && <Loader2 className="animate-spin" />} Confirm deposit
                </Button>
              </div>
            </div>
          )}
          {step === 2 && result && (
            <SuccessPanel
              title="Deposit completed"
              description={
                <>
                  {formatUsd(result.amount)} was added to your demo wallet. Reference <span className="font-mono">{result.reference}</span>
                </>
              }
              transaction={result}
              onAgain={reset}
              againLabel="Add more money"
            >
              <p className="text-sm">
                New balance: <Money amount={state.wallet.balances.USD} className="font-semibold" />
              </p>
            </SuccessPanel>
          )}
        </CardContent>
      </Card>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-sm">How demo deposits work</CardTitle>
          <CardDescription>
            Deposits instantly credit the simulated ledger. Card and wallet methods deduct a demo funding fee recorded as a separate “Fee” transaction. In production
            this would require a licensed payment processor and KYC.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
