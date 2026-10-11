'use client';

import * as React from 'react';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import { Database, Loader2, Monitor, Moon, RefreshCw, RotateCcw, Server, Sun } from 'lucide-react';
import { SCHEMA_VERSION, type DemoSettings } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, Label, NativeSelect, Switch } from '@/components/ui/primitives';
import { CurrencySelect, PageHeader, SimulatedBadge, SummaryRows } from '@/components/common';
import { ResetDemoDialog } from '@/components/layout/reset-demo';
import { useDemo, useMarket } from '@/lib/store/demo-store';
import { STORAGE_KEYS } from '@/lib/storage/storage';
import { demoApi, errorMessage } from '@/lib/api/demo-api';
import { API_URL, backendApi } from '@/lib/api/backend';
import { formatNumber, formatPct, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="w-full sm:w-auto sm:shrink-0">{children}</div>
    </div>
  );
}

function storageUsage(): { keys: number; bytes: number } {
  let bytes = 0;
  let keys = 0;
  try {
    for (const k of Object.values(STORAGE_KEYS)) {
      const v = localStorage.getItem(k);
      if (v !== null) {
        keys++;
        bytes += (k.length + v.length) * 2;
      }
    }
  } catch {
    /* storage unavailable */
  }
  return { keys, bytes };
}

type BackendStatus =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'online'; uptime: number; indices?: { name: string; value: number; changePercent: number }[]; status?: string; rateInr?: number }
  | { state: 'offline'; error: string };

export default function SettingsPage() {
  const state = useDemo();
  const market = useMarket();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);
  const [backend, setBackend] = React.useState<BackendStatus>({ state: 'idle' });
  const [usage, setUsage] = React.useState({ keys: 0, bytes: 0 });
  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => setUsage(storageUsage()), [state, market]);

  const s = state.settings;
  const update = (patch: Partial<DemoSettings>, msg = 'Settings saved') => {
    try {
      demoApi.updateSettings(patch);
      toast.success(msg);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const checkBackend = async () => {
    setBackend({ state: 'checking' });
    try {
      const [h, m, r] = await Promise.all([backendApi.health(), backendApi.marketSummary(), backendApi.rates()]);
      setBackend({
        state: 'online',
        uptime: h.data.uptime,
        indices: m.data.indices,
        status: m.data.status?.label,
        rateInr: r.data.ratesPerUsd?.INR,
      });
    } catch (e) {
      setBackend({ state: 'offline', error: e instanceof Error ? e.message : 'Unreachable' });
    }
  };

  React.useEffect(() => {
    void checkBackend();
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" description="Preferences for your demo account. Saved to this browser's localStorage." badge={<SimulatedBadge label="Demo" />} />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>Demo identity — not a real customer record.</CardDescription>
        </CardHeader>
        <CardContent>
          <SummaryRows
            rows={[
              { label: 'Name', value: state.user.name },
              { label: 'Email', value: state.user.email },
              { label: 'Wallet id', value: <span className="font-mono">{state.user.walletId}</span> },
              { label: 'Plan', value: state.user.tier },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          <Row title="Theme" description="Dark navy is the default NovaFin look.">
            <div className="flex w-full rounded-lg border p-0.5 sm:w-auto">
              {[
                { v: 'dark', icon: Moon, l: 'Dark' },
                { v: 'light', icon: Sun, l: 'Light' },
                { v: 'system', icon: Monitor, l: 'System' },
              ].map((t) => (
                <button
                  key={t.v}
                  onClick={() => setTheme(t.v)}
                  className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs sm:flex-none', mounted && theme === t.v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground')}
                >
                  <t.icon className="size-3.5" /> {t.l}
                </button>
              ))}
            </div>
          </Row>
          <Row title="Display currency" description="Default currency for amounts.">
            <CurrencySelect value={s.displayCurrency} onChange={(c) => update({ displayCurrency: c })} className="w-full sm:w-64" />
          </Row>
          <Row title="Secondary currency" description="Default destination for currency exchange.">
            <CurrencySelect value={s.secondaryCurrency} onChange={(c) => update({ secondaryCurrency: c })} className="w-full sm:w-64" />
          </Row>
          <Row title="Hide balances" description="Mask balances on screen (privacy mode).">
            <Switch checked={s.hideBalances} onCheckedChange={(v) => update({ hideBalances: v }, v ? 'Balances hidden' : 'Balances visible')} />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Simulation</CardTitle>
          <CardDescription>Controls for the simulated market and settlement engine.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <Row title="Simulated market updates" description="Generate bounded random price moves. Updates pause automatically when the tab is hidden.">
            <Switch checked={s.marketSimulation} onCheckedChange={(v) => update({ marketSimulation: v }, v ? 'Market simulation resumed' : 'Market simulation paused')} />
          </Row>
          <Row title="Market update interval">
            <NativeSelect value={s.marketTickMs} onChange={(e) => update({ marketTickMs: Number(e.target.value) })} className="w-full sm:w-40">
              {[5000, 7000, 10000, 15000, 30000].map((ms) => (
                <option key={ms} value={ms}>
                  Every {ms / 1000}s
                </option>
              ))}
            </NativeSelect>
          </Row>
          <Row title="Transfer settlement time" description="How long processing withdrawals & external transfers take to complete.">
            <NativeSelect value={s.settlementSeconds} onChange={(e) => update({ settlementSeconds: Number(e.target.value) })} className="w-full sm:w-40">
              {[15, 45, 120, 300, 900].map((sec) => (
                <option key={sec} value={sec}>
                  {sec < 60 ? `${sec} seconds` : `${sec / 60} minutes`}
                </option>
              ))}
            </NativeSelect>
          </Row>
          <Row title="Simulator status">
            <span className="text-xs text-muted-foreground">
              {formatNumber(market.tickCount)} ticks · last {relativeTime(market.lastTick)}
            </span>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>Choose which demo events create notifications.</CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          <Row title="Transactions" description="Deposits, withdrawals, exchanges, transfers, QR payments and trades.">
            <Switch checked={s.notifyTransactions} onCheckedChange={(v) => update({ notifyTransactions: v })} />
          </Row>
          <Row title="Market" description="Watchlist price alerts.">
            <Switch checked={s.notifyMarket} onCheckedChange={(v) => update({ notifyMarket: v })} />
          </Row>
          <Row title="Security" description="Bank account changes and sign-ins.">
            <Switch checked={s.notifySecurity} onCheckedChange={(v) => update({ notifySecurity: v })} />
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-4" /> Backend API
            </CardTitle>
            <CardDescription>
              Optional Express demo API at <span className="font-mono">{API_URL}</span>. The UI runs fully in localStorage demo mode; the API provides the same engine,
              seed data and simulated market over REST.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={checkBackend} disabled={backend.state === 'checking'}>
            {backend.state === 'checking' ? <Loader2 className="animate-spin" /> : <RefreshCw />} Check
          </Button>
        </CardHeader>
        <CardContent>
          {backend.state === 'online' ? (
            <div className="space-y-3 text-sm">
              <Badge variant="gain">Online · uptime {Math.round(backend.uptime)}s</Badge>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {backend.indices?.map((i) => (
                  <div key={i.name} className="rounded-lg bg-muted/40 p-2">
                    <p className="text-xs text-muted-foreground">{i.name} (server sim)</p>
                    <p className="font-medium tabular">{formatNumber(i.value)}</p>
                    <p className="text-xs tabular">{formatPct(i.changePercent)}</p>
                  </div>
                ))}
              </div>
              {backend.rateInr && <p className="text-xs text-muted-foreground">Server demo rate: 1 USD = {backend.rateInr} INR · market {backend.status ?? 'n/a'}</p>}
            </div>
          ) : backend.state === 'offline' ? (
            <p className="text-sm text-muted-foreground">
              <Badge variant="muted" className="mr-2">
                Offline
              </Badge>
              Not reachable ({backend.error}). Start it with <code className="rounded bg-muted px-1">npm run dev</code> from the project root. The app keeps working without it.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Checking…</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="size-4" /> Demo data
          </CardTitle>
          <CardDescription>
            Stored in this browser only (localStorage, schema v{SCHEMA_VERSION}) — it is not a production database and is not shared with the backend or other devices.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SummaryRows
            rows={[
              { label: 'Storage keys in use', value: usage.keys },
              { label: 'Approx. size', value: `${(usage.bytes / 1024).toFixed(1)} KB` },
              { label: 'Transactions', value: state.transactions.length },
              { label: 'Notifications', value: state.notifications.length },
            ]}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-loss/40 bg-loss/5 p-4">
            <div>
              <p className="text-sm font-medium">Reset demo</p>
              <p className="text-xs text-muted-foreground">Restore $25,000 cash, the seeded portfolio and history.</p>
            </div>
            <Button variant="destructive" onClick={() => setResetOpen(true)}>
              <RotateCcw /> Reset demo data
            </Button>
          </div>
        </CardContent>
      </Card>

      <ResetDemoDialog open={resetOpen} onOpenChange={setResetOpen} />
    </div>
  );
}
