'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowRight, Building2, CandlestickChart, FlaskConical, Globe2, QrCode, ShieldCheck, Wallet } from 'lucide-react';
import { INITIAL_USD_CASH, INITIAL_INVESTED_TARGET } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { LogoMark } from '@/components/layout/logo';
import { demoApi } from '@/lib/api/demo-api';
import { initStores, useDemoState } from '@/lib/store/demo-store';
import { formatUsd } from '@/lib/format';

const FEATURES = [
  { icon: Wallet, title: 'Multi-currency wallet', text: 'Add money, withdraw and send in 10 currencies.' },
  { icon: Globe2, title: 'Currency exchange', text: 'Convert at illustrative demo rates with a transparent 1% fee.' },
  { icon: CandlestickChart, title: 'US paper trading', text: '150+ stocks & ETFs with a live-feeling simulated market.' },
  { icon: QrCode, title: 'QR payments', text: 'Generate, scan and pay NovaFin demo payment requests.' },
  { icon: Building2, title: 'Bank accounts', text: 'Manage fictional linked accounts with masked numbers.' },
  { icon: ShieldCheck, title: 'Safe by design', text: 'No real credentials, no real money, nothing leaves your browser.' },
];

export default function WelcomePage() {
  const router = useRouter();
  const state = useDemoState();
  const [entering, setEntering] = React.useState(false);

  React.useEffect(() => {
    initStores();
  }, []);

  const enter = () => {
    setEntering(true);
    demoApi.completeOnboarding();
    router.push('/overview');
  };

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-hero" aria-hidden />
      <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-10 px-4 py-12 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="space-y-6 text-center">
          <LogoMark className="mx-auto size-14" />
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
            <FlaskConical className="size-3.5" /> Simulated financial environment
          </div>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
            Welcome to <span className="text-gradient">NovaFin</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-lg">
            You are entering a <strong className="text-foreground">demo</strong> fintech app. Every balance, exchange rate, stock price, transfer and bank account here is
            simulated. No actual deposit, withdrawal, payment or trade will ever take place.
          </p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <Card className="glass mx-auto max-w-3xl p-6">
            <div className="grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Demo account</p>
                <p className="mt-1 font-semibold">{state?.user.name ?? 'Alex Morgan'}</p>
                <p className="text-xs text-muted-foreground">Wallet {state?.user.walletId ?? 'NVF-4821-7730'}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Available cash</p>
                <p className="mt-1 text-2xl font-semibold tabular">{formatUsd(INITIAL_USD_CASH)}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Invested (paper)</p>
                <p className="mt-1 text-2xl font-semibold tabular">{formatUsd(INITIAL_INVESTED_TARGET)}</p>
              </div>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Your demo data is stored only in this browser&apos;s localStorage. You can restore the original data any time with <em>Reset demo</em> in Settings.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-gain" />
                Never enter real passwords, PINs, OTPs or card numbers in this demo.
              </label>
              <Button size="lg" variant="gradient" onClick={enter} disabled={!state || entering}>
                Enter demo <ArrowRight />
              </Button>
            </div>
          </Card>
        </motion.div>

        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          {FEATURES.map((f) => (
            <li key={f.title} className="flex gap-3 rounded-xl border bg-card/60 p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/12 text-primary">
                <f.icon className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold">{f.title}</p>
                <p className="text-xs text-muted-foreground">{f.text}</p>
              </div>
            </li>
          ))}
        </motion.ul>
      </div>
    </div>
  );
}
