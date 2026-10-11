'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, UserPlus, Users } from 'lucide-react';
import { CURRENCIES, LIMITS, convert, minorUnits, quoteTransfer, type CurrencyCode, type Recipient, type Transaction } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, NativeSelect, Switch, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui/primitives';
import { Avatar, CurrencySelect, FieldError, Money, PageHeader, SimulatedBadge, StatusBadge, SummaryRows } from '@/components/common';
import { Steps, SuccessPanel } from '@/components/common/flow';
import { useDemo } from '@/lib/store/demo-store';
import { demoApi, errorMessage } from '@/lib/api/demo-api';
import { formatMoney, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function SendMoneyPage() {
  const state = useDemo();
  const [tab, setTab] = React.useState<'saved' | 'new'>('saved');
  const [recipientId, setRecipientId] = React.useState(state.recipients[0]?.id ?? '');
  const [newName, setNewName] = React.useState('');
  const [newHandle, setNewHandle] = React.useState('');
  const [newKind, setNewKind] = React.useState<'novafin' | 'external'>('novafin');
  const [save, setSave] = React.useState(true);
  const [currency, setCurrency] = React.useState<CurrencyCode>('USD');
  const [amountStr, setAmountStr] = React.useState('');
  const [note, setNote] = React.useState('');
  const [step, setStep] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [resultId, setResultId] = React.useState<string | null>(null);

  const recipient: Pick<Recipient, 'name' | 'handle' | 'kind'> | undefined =
    tab === 'saved' ? state.recipients.find((r) => r.id === recipientId) : newName.trim() ? { name: newName.trim(), handle: newHandle.trim(), kind: newKind } : undefined;
  const amount = Number(amountStr) || 0;
  const q = quoteTransfer(recipient?.kind ?? 'novafin', amount, currency);
  const balance = state.wallet.balances[currency];
  const max = currency === 'USD' ? LIMITS.transferMax : convert(LIMITS.transferMax, 'USD', currency);
  const decimals = minorUnits(currency);

  const recipientError =
    tab === 'new'
      ? newName.trim().length < 2
        ? 'Enter the recipient name'
        : newHandle.trim().length < 3
          ? 'Enter an email, @handle or IBAN'
          : newKind === 'novafin' && !/^@[\w.]{2,}$|^\S+@\S+\.\S+$/.test(newHandle.trim())
            ? 'NovaFin users need an @handle or email'
            : undefined
      : !recipient
        ? 'Choose a recipient'
        : undefined;
  const amountError = !amountStr
    ? undefined
    : !new RegExp(`^\\d+${decimals ? `(\\.\\d{1,${decimals}})?` : ''}$`).test(amountStr) || amount <= 0
      ? `Enter a valid amount${decimals ? ' with up to 2 decimals' : ''}`
      : amount > max
        ? `Maximum demo transfer is ${formatMoney(max, currency)}`
        : q.total > balance
          ? `Insufficient ${currency} balance (${formatMoney(balance, currency)} available incl. fees)`
          : undefined;
  const canReview = !recipientError && !!amountStr && !amountError;

  const confirm = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await demoApi.transfer({
        ...(tab === 'saved' ? { recipientId } : { newRecipient: { name: newName, handle: newHandle, kind: newKind }, saveRecipient: save }),
        amount,
        currency,
        note: note || undefined,
      });
      setResultId(res.transaction.id);
      setStep(2);
      toast.success(res.transaction.status === 'completed' ? 'Money sent' : 'Transfer processing', {
        description: `${formatMoney(amount, currency)} to ${res.recipient.name} · ${res.transaction.reference}`,
      });
    } catch (e) {
      toast.error('Transfer failed', { description: errorMessage(e) });
    } finally {
      setSubmitting(false);
    }
  };

  const live: Transaction | undefined = resultId ? state.transactions.find((t) => t.id === resultId) : undefined;
  const recent = state.transactions.filter((t) => t.category === 'transfer').slice(0, 6);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <PageHeader title="Send money" description="Transfer demo funds to NovaFin users (free, instant) or external recipients (0.5% fee)." badge={<SimulatedBadge label="Simulated transfer" />} />
        <Card>
          <CardContent className="p-4 sm:p-6">
            <Steps steps={['Recipient & amount', 'Review', 'Done']} current={step} />
            {step === 0 && (
              <div className="space-y-6">
                <Tabs value={tab} onValueChange={(v) => setTab(v as 'saved' | 'new')}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="saved">
                      <Users className="size-4" /> <span className="sm:hidden">Saved</span>
                      <span className="hidden sm:inline">Saved recipients</span>
                    </TabsTrigger>
                    <TabsTrigger value="new">
                      <UserPlus className="size-4" /> <span className="sm:hidden">New</span>
                      <span className="hidden sm:inline">New recipient</span>
                    </TabsTrigger>
                  </TabsList>
                  <TabsContent value="saved">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {state.recipients.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setRecipientId(r.id);
                            if (state.wallet.balances[r.currency] > 0) setCurrency(r.currency);
                          }}
                          className={cn('flex items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50', recipientId === r.id && 'border-primary bg-primary/5')}
                        >
                          <Avatar name={r.name} color={r.avatarColor} />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{r.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{r.handle}</span>
                          </span>
                          <Badge variant={r.kind === 'novafin' ? 'default' : 'secondary'}>{r.kind === 'novafin' ? 'NovaFin' : 'External'}</Badge>
                        </button>
                      ))}
                    </div>
                  </TabsContent>
                  <TabsContent value="new" className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="r-name">Full name</Label>
                      <Input id="r-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jordan Lee" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="r-type">Recipient type</Label>
                      <NativeSelect id="r-type" value={newKind} onChange={(e) => setNewKind(e.target.value as 'novafin' | 'external')}>
                        <option value="novafin">NovaFin user (free, instant)</option>
                        <option value="external">External bank (0.5% fee)</option>
                      </NativeSelect>
                    </div>
                    <div className="space-y-1.5 sm:col-span-2">
                      <Label htmlFor="r-handle">{newKind === 'novafin' ? '@handle or email' : 'Email, IBAN or account reference (demo)'}</Label>
                      <Input id="r-handle" value={newHandle} onChange={(e) => setNewHandle(e.target.value)} placeholder={newKind === 'novafin' ? '@jordan.lee' : 'GB33 DEMO 0000 1111'} />
                    </div>
                    <label className="flex items-center gap-3 text-sm sm:col-span-2">
                      <Switch checked={save} onCheckedChange={setSave} /> Save to recipients
                    </label>
                  </TabsContent>
                </Tabs>
                {tab === 'new' && (newName || newHandle) && <FieldError message={recipientError} />}

                <div className="grid gap-4 sm:grid-cols-[1fr_220px]">
                  <div className="space-y-1.5">
                    <Label htmlFor="s-amount">Amount</Label>
                    <Input id="s-amount" inputMode="decimal" className="h-12 text-xl font-semibold" placeholder="0.00" value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ''))} aria-invalid={!!amountError} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="s-currency">Currency</Label>
                    <CurrencySelect id="s-currency" value={currency} onChange={setCurrency} className="h-12" />
                  </div>
                </div>
                <p className="-mt-3 text-xs text-muted-foreground">
                  {CURRENCIES[currency].flag} {currency} balance: <Money amount={balance} currency={currency} />
                </p>
                <FieldError message={amountError} />
                <div className="space-y-1.5">
                  <Label htmlFor="s-note">Note (optional)</Label>
                  <Textarea id="s-note" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What's it for?" />
                </div>
                {canReview && (
                  <SummaryRows
                    rows={[
                      { label: 'Fee', value: formatMoney(q.fee, currency) },
                      { label: 'Total deducted', value: formatMoney(q.total, currency), strong: true },
                    ]}
                  />
                )}
                <Button className="w-full" size="lg" disabled={!canReview} onClick={() => setStep(1)}>
                  Review transfer
                </Button>
              </div>
            )}
            {step === 1 && recipient && (
              <div className="space-y-5">
                <div className="flex flex-col items-center gap-2 text-center">
                  <Avatar name={recipient.name} size={52} color="#6366f1" />
                  <p className="text-sm text-muted-foreground">Sending to {recipient.name}</p>
                  <p className="text-4xl font-semibold tabular">{formatMoney(amount, currency)}</p>
                </div>
                <SummaryRows
                  rows={[
                    { label: 'Recipient', value: `${recipient.name} (${recipient.handle})` },
                    { label: 'Type', value: recipient.kind === 'novafin' ? 'NovaFin user · instant' : 'External · processing' },
                    { label: 'Fee', value: formatMoney(q.fee, currency) },
                    { label: 'Total deducted', value: formatMoney(q.total, currency), strong: true },
                    ...(note ? [{ label: 'Note', value: note }] : []),
                  ]}
                />
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(0)} disabled={submitting}>
                    <ArrowLeft /> Back
                  </Button>
                  <Button className="flex-1" onClick={confirm} disabled={submitting}>
                    {submitting && <Loader2 className="animate-spin" />} Send {formatMoney(amount, currency)}
                  </Button>
                </div>
              </div>
            )}
            {step === 2 && live && (
              <SuccessPanel
                title={live.status === 'completed' ? 'Money sent' : 'Transfer processing'}
                description={
                  <>
                    {formatMoney(live.amount, live.currency)} to {live.counterparty} · <span className="font-mono">{live.reference}</span>
                  </>
                }
                transaction={live}
                onAgain={() => {
                  setStep(0);
                  setAmountStr('');
                  setNote('');
                  setResultId(null);
                }}
                againLabel="Send another"
              >
                <div className="flex items-center justify-center gap-2">
                  Status <StatusBadge status={live.status} />
                </div>
              </SuccessPanel>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="space-y-4 lg:pt-[5.5rem]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Recent transfers</CardTitle>
            <CardDescription>Your latest outgoing demo transfers</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.map((t) => (
              <div key={t.id} className="flex items-center gap-3 text-sm">
                <Avatar name={t.counterparty ?? '?'} size={30} color="#64748b" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.counterparty}</p>
                  <p className="text-xs text-muted-foreground">{relativeTime(t.createdAt)}</p>
                </div>
                <div className="text-right">
                  <p className="tabular">−{formatMoney(t.amount, t.currency)}</p>
                  <StatusBadge status={t.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
