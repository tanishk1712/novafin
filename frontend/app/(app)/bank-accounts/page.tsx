'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { BadgeCheck, Building2, History, Loader2, MoreVertical, Pencil, Plus, ShieldAlert, Star, Trash2 } from 'lucide-react';
import { DEMO_BANKS, DEMO_COUNTRIES, type BankAccount } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, Input, Label, NativeSelect, Switch } from '@/components/ui/primitives';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/overlays';
import { EmptyState, FieldError, PageHeader, SimulatedBadge, StatusBadge } from '@/components/common';
import { useDemo } from '@/lib/store/demo-store';
import { demoApi, errorMessage } from '@/lib/api/demo-api';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';

const ROUTING_HINT: Record<string, { label: string; placeholder: string; pattern: RegExp; message: string }> = {
  US: { label: 'ACH routing number', placeholder: '9 digits, e.g. 021000021', pattern: /^\d{9}$/, message: 'Routing number must be 9 digits' },
  IN: { label: 'IFSC code', placeholder: 'e.g. BUBK0001234', pattern: /^[A-Z]{4}0[A-Z0-9]{6}$/i, message: 'IFSC must look like ABCD0123456' },
  GB: { label: 'Sort code', placeholder: '6 digits, e.g. 040004', pattern: /^\d{6}$/, message: 'Sort code must be 6 digits' },
};
const DEFAULT_ROUTING = { label: 'IBAN / SWIFT', placeholder: 'e.g. DE89370400440532013000', pattern: /^[A-Z0-9]{8,34}$/i, message: '8–34 letters/digits' };

const schema = z
  .object({
    country: z.string().min(2),
    bankName: z.string().min(2, 'Choose a bank'),
    nickname: z.string().max(40).optional(),
    holderName: z.string().min(2, 'Enter the account holder name').max(60),
    accountType: z.enum(['checking', 'savings', 'current']),
    accountNumber: z.string().regex(/^\d{6,18}$/, 'Account number must be 6–18 digits'),
    routingCode: z.string().min(4, 'Required'),
    makeDefault: z.boolean(),
  })
  .superRefine((v, ctx) => {
    const r = ROUTING_HINT[v.country] ?? DEFAULT_ROUTING;
    if (!r.pattern.test(v.routingCode.replace(/\s/g, ''))) ctx.addIssue({ code: 'custom', path: ['routingCode'], message: r.message });
  });
type FormValues = z.infer<typeof schema>;

function AddBankDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const state = useDemo();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { country: 'US', bankName: DEMO_BANKS.US[0], nickname: '', holderName: state.user.name, accountType: 'checking', accountNumber: '', routingCode: '', makeDefault: false },
  });
  const country = form.watch('country');
  const banks = DEMO_BANKS[country] ?? [];
  const routing = ROUTING_HINT[country] ?? DEFAULT_ROUTING;
  const currency = DEMO_COUNTRIES.find((c) => c.code === country)?.currency ?? 'USD';
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    form.setValue('bankName', (DEMO_BANKS[country] ?? [''])[0]);
    form.setValue('accountType', country === 'IN' || country === 'GB' ? 'savings' : 'checking');
  }, [country, form]);

  const submit = form.handleSubmit(async (v) => {
    setBusy(true);
    try {
      const acc = await demoApi.addBankAccount({ ...v, nickname: v.nickname ?? '', currency, routingCode: v.routingCode.replace(/\s/g, '') });
      toast.success('Bank account added', { description: `${acc.bankName} •••• ${acc.last4} · verification pending` });
      form.reset();
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add demo bank account</DialogTitle>
          <DialogDescription>Fictional banks only. Only the last 4 digits are stored. Never enter real online-banking passwords, PINs or OTPs.</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={submit} noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="country">Country</Label>
            <NativeSelect id="country" {...form.register('country')}>
              {DEMO_COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.currency})
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bankName">Bank</Label>
            <NativeSelect id="bankName" {...form.register('bankName')}>
              {banks.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="holderName">Account holder</Label>
            <Input id="holderName" {...form.register('holderName')} aria-invalid={!!form.formState.errors.holderName} />
            <FieldError message={form.formState.errors.holderName?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountType">Account type</Label>
            <NativeSelect id="accountType" {...form.register('accountType')}>
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="current">Current</option>
            </NativeSelect>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nickname">Nickname (optional)</Label>
            <Input id="nickname" placeholder="e.g. Salary account" {...form.register('nickname')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="accountNumber">Account number (demo)</Label>
            <Input id="accountNumber" inputMode="numeric" autoComplete="off" placeholder="6–18 digits" {...form.register('accountNumber')} aria-invalid={!!form.formState.errors.accountNumber} />
            <FieldError message={form.formState.errors.accountNumber?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="routingCode">{routing.label}</Label>
            <Input id="routingCode" autoComplete="off" placeholder={routing.placeholder} {...form.register('routingCode')} aria-invalid={!!form.formState.errors.routingCode} />
            <FieldError message={form.formState.errors.routingCode?.message} />
          </div>
          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <Switch checked={form.watch('makeDefault')} onCheckedChange={(c) => form.setValue('makeDefault', c)} />
            Set as default withdrawal account
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <Loader2 className="animate-spin" />} Add account
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameDialog({ account, onClose }: { account: BankAccount | null; onClose: () => void }) {
  const [name, setName] = React.useState('');
  React.useEffect(() => setName(account?.nickname ?? ''), [account]);
  const valid = name.trim().length >= 2 && name.trim().length <= 40;
  return (
    <Dialog open={!!account} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit nickname</DialogTitle>
          <DialogDescription>
            {account?.bankName} •••• {account?.last4}
          </DialogDescription>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus aria-label="Nickname" />
        {!valid && <FieldError message="Nickname must be 2–40 characters" />}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              try {
                demoApi.renameBankAccount(account!.id, name);
                toast.success('Nickname updated');
                onClose();
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BankAccountsPage() {
  const state = useDemo();
  const [adding, setAdding] = React.useState(false);
  const [renaming, setRenaming] = React.useState<BankAccount | null>(null);
  const [removing, setRemoving] = React.useState<BankAccount | null>(null);
  const [historyFor, setHistoryFor] = React.useState<BankAccount | null>(null);
  const [verifying, setVerifying] = React.useState<string | null>(null);

  const historyTx = historyFor ? state.transactions.filter((t) => t.meta?.bankAccountId === historyFor.id) : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank accounts"
        description="Manage the fictional bank accounts linked to your demo wallet."
        badge={<SimulatedBadge label="Simulated accounts" />}
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus /> Add bank account
          </Button>
        }
      />
      {state.bankAccounts.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="No bank accounts" description="Add a demo account to enable withdrawals." action={<Button onClick={() => setAdding(true)}>Add bank account</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {state.bankAccounts.map((b) => {
            const count = state.transactions.filter((t) => t.meta?.bankAccountId === b.id).length;
            return (
              <Card key={b.id} className="relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--color-primary),var(--color-violet),var(--color-teal))]" />
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-primary/12 text-primary">
                        <Building2 className="size-5" />
                      </span>
                      <div>
                        <p className="font-semibold">{b.nickname}</p>
                        <p className="text-xs text-muted-foreground">{b.bankName}</p>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label="Account actions">
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setRenaming(b)}>
                          <Pencil /> Edit nickname
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          disabled={b.isDefault}
                          onSelect={() => {
                            demoApi.setDefaultBankAccount(b.id);
                            toast.success(`${b.nickname} is now your default account`);
                          }}
                        >
                          <Star /> Set as default
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => setHistoryFor(b)}>
                          <History /> Transfer history
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-loss focus:text-loss" onSelect={() => setRemoving(b)}>
                          <Trash2 /> Remove
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="rounded-xl bg-muted/40 p-3 font-mono text-sm">
                    <p>•••• •••• {b.last4}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {b.routingLabel} {b.routingMasked}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {b.isDefault && <Badge>Default</Badge>}
                    <Badge variant="secondary">{b.currency}</Badge>
                    <Badge variant="secondary" className="capitalize">
                      {b.accountType}
                    </Badge>
                    <Badge variant="outline">{DEMO_COUNTRIES.find((c) => c.code === b.country)?.name ?? b.country}</Badge>
                    <StatusBadge status={b.verification} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Added {formatDate(b.addedAt)}</span>
                    <button className="font-medium text-primary" onClick={() => setHistoryFor(b)}>
                      {count} transfer{count === 1 ? '' : 's'}
                    </button>
                  </div>
                  {b.verification !== 'verified' && (
                    <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
                      <ShieldAlert className="size-4 shrink-0 text-amber-500" />
                      <span className="flex-1">Verify with simulated micro-deposits to enable withdrawals.</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={verifying === b.id}
                        onClick={async () => {
                          setVerifying(b.id);
                          try {
                            await demoApi.verifyBankAccount(b.id);
                            toast.success('Bank account verified', { description: `${b.bankName} •••• ${b.last4}` });
                          } catch (e) {
                            toast.error(errorMessage(e));
                          } finally {
                            setVerifying(null);
                          }
                        }}
                      >
                        {verifying === b.id ? <Loader2 className="animate-spin" /> : <BadgeCheck />} Verify
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card className="p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Security note</p>
        NovaFin never asks for online-banking credentials, PINs or OTPs. Bank accounts here are fictional and stored masked in your browser. In production, accounts
        would be linked through an authorised open-banking provider and verified server-side.
      </Card>

      <AddBankDialog open={adding} onOpenChange={setAdding} />
      <RenameDialog account={renaming} onClose={() => setRenaming(null)} />

      <Dialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remove bank account?</DialogTitle>
            <DialogDescription>
              {removing?.bankName} •••• {removing?.last4} will be removed from your demo profile. Past transactions are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                try {
                  await demoApi.removeBankAccount(removing!.id);
                  toast.success('Bank account removed');
                  setRemoving(null);
                } catch (e) {
                  toast.error(errorMessage(e));
                }
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!historyFor} onOpenChange={(o) => !o && setHistoryFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transfer history</DialogTitle>
            <DialogDescription>
              {historyFor?.nickname} · {historyFor?.bankName} •••• {historyFor?.last4}
            </DialogDescription>
          </DialogHeader>
          {historyTx.length === 0 ? (
            <EmptyState icon={History} title="No transfers yet" description="Withdrawals to this account will appear here." />
          ) : (
            <ul className="divide-y rounded-xl border">
              {historyTx.map((t) => (
                <li key={t.id} className="flex items-center gap-3 p-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium tabular">{formatMoney(t.amount, t.currency)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(t.createdAt)} · <span className="font-mono">{t.reference}</span>
                    </p>
                  </div>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
