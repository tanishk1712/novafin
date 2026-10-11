'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, ClipboardCopy, Download, Loader2, QrCode, ScanLine, Share2, ShieldCheck, Store, Timer, XCircle } from 'lucide-react';
import {
  DEMO_MERCHANTS,
  LIMITS,
  buildMerchantRequest,
  convert,
  encodeQrPayload,
  minorUnits,
  subMoney,
  type CurrencyCode,
  type QrPayload,
  type QrPaymentRequest,
  type Transaction,
} from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Input, Label, NativeSelect, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/components/ui/primitives';
import { CurrencySelect, EmptyState, FieldError, Money, PageHeader, SimulatedBadge, StatusBadge, SummaryRows } from '@/components/common';
import { QrScanner } from '@/components/qr/qr-scanner';
import { useDemo } from '@/lib/store/demo-store';
import { demoApi, errorMessage } from '@/lib/api/demo-api';
import { formatDateTime, formatMoney, relativeTime } from '@/lib/format';

function downloadCanvas(id: string, filename: string) {
  const canvas = document.getElementById(id) as HTMLCanvasElement | null;
  if (!canvas) return toast.error('QR not ready');
  const a = document.createElement('a');
  a.href = canvas.toDataURL('image/png');
  a.download = filename;
  a.click();
}

function describe(req: Pick<QrPaymentRequest, 'id' | 'payeeName' | 'amount' | 'currency' | 'note' | 'expiresAt' | 'walletId'>) {
  return `NovaFin DEMO payment request ${req.id}\nPay ${req.payeeName} (${req.walletId}) ${formatMoney(req.amount, req.currency)}${req.note ? `\nNote: ${req.note}` : ''}\nExpires ${formatDateTime(req.expiresAt)}\n(Simulated — not a UPI/ACH/wire instruction)`;
}

// ---------------------------------------------------------------------------

function GenerateTab() {
  const state = useDemo();
  const [amountStr, setAmountStr] = React.useState('25.00');
  const [currency, setCurrency] = React.useState<CurrencyCode>('USD');
  const [note, setNote] = React.useState('');
  const [expiry, setExpiry] = React.useState('30');
  const [busy, setBusy] = React.useState(false);
  const [activeId, setActiveId] = React.useState<string | null>(state.qr.requests.find((r) => r.status === 'open')?.id ?? null);
  const active = state.qr.requests.find((r) => r.id === activeId) ?? null;
  const payload = active ? encodeQrPayload(active) : '';

  const amount = Number(amountStr);
  const max = currency === 'USD' ? LIMITS.qrMax : convert(LIMITS.qrMax, 'USD', currency);
  const decimals = minorUnits(currency);
  const error =
    !amountStr || !new RegExp(`^\\d+${decimals ? `(\\.\\d{1,${decimals}})?` : ''}$`).test(amountStr) || amount <= 0
      ? 'Enter a valid amount greater than zero'
      : amount > max
        ? `Maximum demo request is ${formatMoney(max, currency)}`
        : undefined;

  const create = async () => {
    setBusy(true);
    try {
      const res = await demoApi.createQrRequest({ amount, currency, note, expiresInMinutes: Number(expiry) });
      setActiveId(res.request.id);
      toast.success('QR payment request created', { description: `${formatMoney(amount, currency)} · ${res.request.id}` });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    if (!active) return;
    const text = describe(active);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'NovaFin demo payment request', text });
        return;
      } catch {
        /* cancelled — fall through to clipboard */
      }
    }
    await copy(text, 'Payment request text copied');
  };

  const copy = async (text: string, msg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(msg);
    } catch {
      toast.error('Clipboard unavailable in this browser');
    }
  };

  const simulate = async () => {
    if (!active) return;
    try {
      await demoApi.simulateIncomingQr(active.id, 'Jamie Rivera (demo payer)');
      toast.success('QR payment received', { description: `${formatMoney(active.amount, active.currency)} credited to your wallet` });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Request a payment</CardTitle>
          <CardDescription>Creates an application-specific NovaFin QR payload with a unique id and expiry.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="qr-amount">Amount</Label>
              <Input id="qr-amount" inputMode="decimal" value={amountStr} onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.]/g, ''))} aria-invalid={!!error} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="qr-currency">Currency</Label>
              <CurrencySelect id="qr-currency" value={currency} onChange={setCurrency} />
            </div>
          </div>
          <FieldError message={amountStr ? error : undefined} />
          <div className="space-y-1.5">
            <Label htmlFor="qr-note">Payment note (optional)</Label>
            <Textarea id="qr-note" value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Pizza night split" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qr-expiry">Expires in</Label>
            <NativeSelect id="qr-expiry" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
              <option value="5">5 minutes</option>
              <option value="30">30 minutes</option>
              <option value="120">2 hours</option>
              <option value="1440">24 hours</option>
              <option value="10080">7 days</option>
            </NativeSelect>
          </div>
          <SummaryRows
            rows={[
              { label: 'Payee', value: state.user.name },
              { label: 'Wallet', value: <span className="font-mono">{state.user.walletId}</span> },
            ]}
          />
          <Button className="w-full" variant="gradient" disabled={!!error || busy} onClick={create}>
            {busy ? <Loader2 className="animate-spin" /> : <QrCode />} Generate QR code
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>QR preview</CardTitle>
          <CardDescription>Simulated request — not bank-compatible (UPI / ACH / wire).</CardDescription>
        </CardHeader>
        <CardContent>
          {!active ? (
            <EmptyState icon={QrCode} title="No active request" description="Generate a request to see its QR code here." />
          ) : (
            <div className="space-y-4">
              <div className="mx-auto w-fit rounded-2xl bg-white p-4 shadow-lg">
                <QRCodeCanvas id="novafin-qr-canvas" value={payload} size={220} level="M" marginSize={1} />
              </div>
              <div className="text-center">
                <p className="text-2xl font-semibold tabular">{formatMoney(active.amount, active.currency)}</p>
                <p className="text-sm text-muted-foreground">{active.note || 'No note'}</p>
                <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <StatusBadge status={active.status} /> <span className="font-mono">{active.id}</span>
                </div>
                <p className="mt-1 flex items-center justify-center gap-1 text-xs text-muted-foreground">
                  <Timer className="size-3" /> {active.status === 'open' ? `Expires ${relativeTime(active.expiresAt)}` : `Expired/closed ${relativeTime(active.expiresAt)}`}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <Button variant="outline" size="sm" onClick={() => downloadCanvas('novafin-qr-canvas', `${active.id}.png`)}>
                  <Download /> PNG
                </Button>
                <Button variant="outline" size="sm" onClick={() => copy(describe(active), 'Request details copied')}>
                  <ClipboardCopy /> Copy
                </Button>
                <Button variant="outline" size="sm" onClick={share}>
                  <Share2 /> Share
                </Button>
              </div>
              <details className="rounded-lg border p-3 text-xs">
                <summary className="cursor-pointer font-medium">Raw payload (JSON)</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">{JSON.stringify(JSON.parse(payload), null, 2)}</pre>
                <Button variant="ghost" size="sm" className="mt-1" onClick={() => copy(payload, 'Raw payload copied')}>
                  Copy payload
                </Button>
              </details>
              {active.status === 'open' && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  <span className="flex-1">No second device? Simulate another demo user paying this request.</span>
                  <Button size="sm" variant="secondary" onClick={simulate}>
                    Simulate payer
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => demoApi.cancelQrRequest(active.id)}>
                    Cancel request
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>My payment requests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {state.qr.requests.length === 0 && <p className="text-sm text-muted-foreground">No requests yet.</p>}
          {state.qr.requests.slice(0, 10).map((r) => (
            <button key={r.id} onClick={() => setActiveId(r.id)} className="flex w-full items-center gap-3 rounded-lg border p-2.5 text-left text-sm hover:bg-muted/50">
              <QrCode className="size-4 text-muted-foreground" />
              <span className="font-mono text-xs">{r.id}</span>
              <span className="flex-1 truncate text-muted-foreground">{r.note}</span>
              <span className="tabular">{formatMoney(r.amount, r.currency)}</span>
              <StatusBadge status={r.status} />
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ScanTab({ initialRaw }: { initialRaw: string | null }) {
  const state = useDemo();
  const [raw, setRaw] = React.useState<string | null>(null);
  const [payment, setPayment] = React.useState<QrPayload | null>(null);
  const [error, setError] = React.useState<string>();
  const [paying, setPaying] = React.useState(false);
  const [paid, setPaid] = React.useState<Transaction | null>(null);
  const [pasted, setPasted] = React.useState('');

  const handle = (text: string) => {
    setPaid(null);
    setRaw(text);
    try {
      const p = demoApi.validateQr(text);
      setPayment(p);
      setError(undefined);
    } catch (e) {
      setPayment(null);
      setError(errorMessage(e));
    }
  };

  React.useEffect(() => {
    if (initialRaw) handle(initialRaw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRaw]);

  const pay = async () => {
    if (!raw || paying) return;
    setPaying(true);
    try {
      const res = await demoApi.payQr(raw);
      setPaid(res.transaction);
      setPayment(null);
      toast.success('QR payment sent', { description: `${formatMoney(res.payload.amount, res.payload.currency)} to ${res.payload.name}` });
    } catch (e) {
      setError(errorMessage(e));
      toast.error('Payment failed', { description: errorMessage(e) });
    } finally {
      setPaying(false);
    }
  };

  const reset = () => {
    setRaw(null);
    setPayment(null);
    setError(undefined);
    setPaid(null);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Scan a payment QR</CardTitle>
          <CardDescription>Scanning never moves money. You will always see a confirmation screen first.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QrScanner onDecoded={handle} />
          <details className="rounded-lg border p-3 text-sm">
            <summary className="cursor-pointer font-medium">Paste a payload instead</summary>
            <Textarea className="mt-2 font-mono text-xs" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder='{"type":"novafin.payment-request",…}' />
            <Button size="sm" className="mt-2" disabled={!pasted.trim()} onClick={() => handle(pasted.trim())}>
              Validate payload
            </Button>
          </details>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Payment confirmation</CardTitle>
          <CardDescription>Validated against the NovaFin payload schema, expiry, replay protection and your balance.</CardDescription>
        </CardHeader>
        <CardContent>
          {paid ? (
            <div className="space-y-4 text-center">
              <CheckCircle2 className="mx-auto size-14 text-gain" />
              <p className="text-lg font-semibold">Payment sent</p>
              <SummaryRows
                rows={[
                  { label: 'Paid to', value: paid.counterparty ?? '' },
                  { label: 'Amount', value: formatMoney(paid.amount, paid.currency), strong: true },
                  { label: 'Reference', value: <span className="font-mono">{paid.reference}</span> },
                  { label: 'New balance', value: <Money amount={state.wallet.balances[paid.currency]} currency={paid.currency} /> },
                ]}
              />
              <Button onClick={reset}>Scan another</Button>
            </div>
          ) : error ? (
            <div className="space-y-4 text-center">
              <XCircle className="mx-auto size-12 text-loss" />
              <p className="font-semibold">Payment request rejected</p>
              <p className="rounded-lg bg-loss/10 p-3 text-sm text-loss">{error}</p>
              <Button variant="outline" onClick={reset}>
                Try again
              </Button>
            </div>
          ) : payment ? (
            <div className="space-y-4">
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Pay {payment.name}</p>
                <p className="text-4xl font-semibold tabular">{formatMoney(payment.amount, payment.currency)}</p>
              </div>
              <SummaryRows
                rows={[
                  { label: 'Recipient', value: payment.name },
                  { label: 'Wallet', value: <span className="font-mono">{payment.wallet}</span> },
                  { label: 'Request id', value: <span className="font-mono text-xs">{payment.id}</span> },
                  { label: 'Note', value: payment.note || '—' },
                  { label: 'Expires', value: relativeTime(payment.exp) },
                  { label: 'Fee', value: formatMoney(0, payment.currency) },
                  {
                    label: `${payment.currency} balance after`,
                    value: formatMoney(subMoney(state.wallet.balances[payment.currency], payment.amount, payment.currency), payment.currency),
                    strong: true,
                  },
                ]}
              />
              <p className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Simulated QR payment. Confirm only if you recognise the recipient.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} disabled={paying}>
                  Cancel
                </Button>
                <Button className="flex-1" variant="gain" onClick={pay} disabled={paying}>
                  {paying ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Confirm & pay
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState icon={ScanLine} title="Waiting for a QR code" description="Start the camera, upload an image, or use a test merchant QR from the Test codes tab." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TestCodesTab({ onPay }: { onPay: (raw: string) => void }) {
  const [now] = React.useState(() => Date.now());
  const state = useDemo();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Fictional demo merchants. Download a QR and upload it in the Scan tab (or scan it from another screen) to test the full flow. Each code can be paid only
        once — a second attempt is blocked by replay protection.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {DEMO_MERCHANTS.map((m, i) => {
          const req = buildMerchantRequest(i, now);
          const raw = encodeQrPayload(req);
          const used = state.qr.paidRequestIds.includes(req.id);
          return (
            <Card key={m.walletId}>
              <CardContent className="space-y-3 p-4 text-center">
                <div className="mx-auto w-fit rounded-xl bg-white p-2">
                  <QRCodeCanvas id={`merchant-qr-${i}`} value={raw} size={150} level="M" marginSize={1} />
                </div>
                <div>
                  <p className="flex items-center justify-center gap-1.5 font-semibold">
                    <Store className="size-4" /> {m.name}
                  </p>
                  <p className="text-sm tabular">{formatMoney(m.amount, m.currency)}</p>
                  <p className="text-xs text-muted-foreground">{m.note}</p>
                </div>
                {used && <Badge variant="muted">Already paid</Badge>}
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="outline" onClick={() => downloadCanvas(`merchant-qr-${i}`, `${m.name.replace(/\W+/g, '-')}-qr.png`)}>
                    <Download /> PNG
                  </Button>
                  <Button size="sm" onClick={() => onPay(raw)}>
                    <ScanLine /> Pay
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function QrPageInner() {
  const params = useSearchParams();
  const initial = params.get('tab');
  const [tab, setTab] = React.useState(initial === 'scan' || initial === 'test' ? initial : 'generate');
  // A payload chosen in "Test codes" is handed to the scan flow as if it had been scanned.
  const [injected, setInjected] = React.useState<{ raw: string; n: number } | null>(null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="QR payments"
        description="Generate NovaFin payment requests and pay requests by scanning. QR payments are simulated and use an app-specific format."
        badge={<SimulatedBadge label="Simulated QR" />}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="generate">
            <QrCode className="size-4" /> Generate
          </TabsTrigger>
          <TabsTrigger value="scan">
            <ScanLine className="size-4" /> Scan & pay
          </TabsTrigger>
          <TabsTrigger value="test">
            <Store className="size-4" /> Test codes
          </TabsTrigger>
        </TabsList>
        <TabsContent value="generate">
          <GenerateTab />
        </TabsContent>
        <TabsContent value="scan">
          <ScanTab key={injected?.n ?? 0} initialRaw={injected?.raw ?? null} />
        </TabsContent>
        <TabsContent value="test">
          <TestCodesTab
            onPay={(raw) => {
              setInjected((prev) => ({ raw, n: (prev?.n ?? 0) + 1 }));
              setTab('scan');
            }}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function QrPaymentsPage() {
  return (
    <React.Suspense fallback={null}>
      <QrPageInner />
    </React.Suspense>
  );
}
