'use client';

import * as React from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight, FlaskConical, Inbox, type LucideIcon } from 'lucide-react';
import { CURRENCIES, CURRENCY_CODES, getUsMarketStatus, type CurrencyCode, type TxStatus } from '@novafin/shared';
import { cn } from '@/lib/utils';
import { Badge, Card, NativeSelect } from '@/components/ui/primitives';
import { changeColor, formatMoney, formatPct } from '@/lib/format';
import { useDemoState } from '@/lib/store/demo-store';

// ---------------------------------------------------------------------------

export function AnimatedNumber({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const [display, setDisplay] = React.useState(() => format(value));
  const formatRef = React.useRef(format);
  formatRef.current = format;
  React.useEffect(() => {
    if (reduce) {
      setDisplay(formatRef.current(value));
      return;
    }
    const controls = animate(mv, value, {
      duration: 0.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setDisplay(formatRef.current(v)),
    });
    return () => controls.stop();
  }, [value, mv, reduce]);
  return <span className={cn('tabular', className)}>{display}</span>;
}

/** Money value that respects the "hide balances" privacy setting. */
export function Money({ amount, currency = 'USD', animated, className, sign }: { amount: number; currency?: CurrencyCode; animated?: boolean; className?: string; sign?: boolean }) {
  const state = useDemoState();
  if (state?.settings.hideBalances) return <span className={cn('tabular tracking-widest', className)}>••••••</span>;
  const fmt = (n: number) => formatMoney(currency === 'JPY' ? Math.round(n) : Math.round(n * 100) / 100, currency, { sign });
  if (animated) return <AnimatedNumber value={amount} format={fmt} className={className} />;
  return <span className={cn('tabular', className)}>{fmt(amount)}</span>;
}

// ---------------------------------------------------------------------------

export function SimulatedBadge({ label = 'SIMULATED MARKET DATA', className }: { label?: string; className?: string }) {
  return (
    <Badge variant="warning" className={cn('gap-1.5 uppercase', className)} title="All values are simulated demo data and not real financial quotes.">
      <FlaskConical className="size-3" />
      {label}
    </Badge>
  );
}

export function DemoBadge({ className }: { className?: string }) {
  return <SimulatedBadge label="Demo" className={className} />;
}

export function MarketStatusBadge() {
  // computed on the client only: the time-dependent label would otherwise differ from the prerendered HTML
  const [status, setStatus] = React.useState<ReturnType<typeof getUsMarketStatus> | null>(null);
  React.useEffect(() => {
    setStatus(getUsMarketStatus());
    const id = setInterval(() => setStatus(getUsMarketStatus()), 30_000);
    return () => clearInterval(id);
  }, []);
  if (!status) return <span className="inline-block h-7 w-48 rounded-full border" aria-hidden />;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium"
      title={`US market (presentation only): ${status.nextChange}. The simulated engine runs independently of real exchange hours.`}
    >
      <span className={cn('size-2 rounded-full', status.isOpen ? 'bg-gain animate-pulse-dot' : status.label === 'Closed' ? 'bg-loss' : 'bg-amber-500')} />
      US market {status.label.toLowerCase()} · {status.nyTime}
    </span>
  );
}

// ---------------------------------------------------------------------------

export function PageHeader({ title, description, actions, badge }: { title: string; description?: string; actions?: React.ReactNode; badge?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold tracking-tight min-[400px]:text-2xl sm:text-[1.7rem]">{title}</h1>
          {badge}
        </div>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  format,
  icon: Icon,
  delta,
  deltaLabel,
  accent = 'primary',
  hint,
  masked,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  icon?: LucideIcon;
  delta?: number;
  deltaLabel?: string;
  accent?: 'primary' | 'violet' | 'teal' | 'gain' | 'loss' | 'amber';
  hint?: string;
  masked?: boolean;
}) {
  const accentClass = {
    primary: 'bg-primary/12 text-primary',
    violet: 'bg-violet/12 text-violet',
    teal: 'bg-teal/12 text-teal',
    gain: 'bg-gain/12 text-gain',
    loss: 'bg-loss/12 text-loss',
    amber: 'bg-amber-500/12 text-amber-500',
  }[accent];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <Card className="h-full p-3.5 transition-colors hover:border-primary/40 sm:p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          {Icon && (
            <span className={cn('grid size-8 place-items-center rounded-lg', accentClass)}>
              <Icon className="size-4" />
            </span>
          )}
        </div>
        <div className="mt-2 truncate text-lg font-semibold tracking-tight min-[400px]:text-xl sm:text-2xl">
          {masked ? <span className="tracking-widest">••••••</span> : <AnimatedNumber value={value} format={format} />}
        </div>
        {(delta !== undefined || hint) && (
          <div className="mt-1 flex items-center gap-1.5 text-xs">
            {delta !== undefined && <ChangeText value={delta} suffix={deltaLabel} />}
            {hint && <span className="text-muted-foreground">{hint}</span>}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export function ChangeText({ value, suffix, percent = true, className }: { value: number; suffix?: string; percent?: boolean; className?: string }) {
  const Icon = value >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn('inline-flex items-center gap-0.5 font-medium tabular', changeColor(value), className)}>
      <Icon className="size-3.5" />
      {percent ? formatPct(value) : formatMoney(value, 'USD', { sign: true })}
      {suffix && <span className="ml-1 font-normal text-muted-foreground">{suffix}</span>}
    </span>
  );
}

export function ChangePill({ value, className }: { value: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex min-w-[3.75rem] shrink-0 items-center justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular sm:min-w-[4.5rem]',
        value > 0 ? 'bg-gain/12 text-gain' : value < 0 ? 'bg-loss/12 text-loss' : 'bg-muted text-muted-foreground',
        className,
      )}
    >
      {formatPct(value)}
    </span>
  );
}

const LOGO_COLORS = ['#3987e5', '#8b5cf6', '#14b8a6', '#f59e0b', '#ec4899', '#22c55e', '#0ea5e9', '#ef4444', '#6366f1'];

export function StockLogo({ symbol, size = 36 }: { symbol: string; size?: number }) {
  let h = 0;
  for (const c of symbol) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const color = LOGO_COLORS[h % LOGO_COLORS.length];
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg text-[10px] font-bold text-white shadow-sm"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, color-mix(in oklch, ${color} 60%, black))` }}
      aria-hidden
    >
      {symbol.replace('.', '').slice(0, 4)}
    </span>
  );
}

export function Avatar({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span className="grid shrink-0 place-items-center rounded-full text-xs font-semibold text-white" style={{ width: size, height: size, background: color ?? '#6366f1' }}>
      {initials}
    </span>
  );
}

export function EmptyState({ icon: Icon = Inbox, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" />
      </span>
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: TxStatus | string }) {
  const variant = (
    {
      completed: 'gain',
      filled: 'gain',
      verified: 'gain',
      processing: 'default',
      pending: 'warning',
      open: 'default',
      failed: 'loss',
      rejected: 'loss',
      cancelled: 'muted',
      expired: 'muted',
      paid: 'gain',
    } as const
  )[status as 'completed'] ?? 'secondary';
  return (
    <Badge variant={variant} className="capitalize">
      {(status === 'processing' || status === 'pending') && <span className="size-1.5 rounded-full bg-current animate-pulse-dot" />}
      {status}
    </Badge>
  );
}

export function CurrencySelect({
  value,
  onChange,
  exclude,
  id,
  className,
  ...rest
}: { value: CurrencyCode; onChange: (c: CurrencyCode) => void; exclude?: CurrencyCode[]; id?: string; className?: string } & Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  'value' | 'onChange'
>) {
  return (
    <NativeSelect id={id} value={value} onChange={(e) => onChange(e.target.value as CurrencyCode)} className={className} {...rest}>
      {CURRENCY_CODES.filter((c) => !exclude?.includes(c)).map((c) => (
        <option key={c} value={c}>
          {CURRENCIES[c].flag} {c} — {CURRENCIES[c].name}
        </option>
      ))}
    </NativeSelect>
  );
}

/** Key/value rows used on review & receipt screens. */
export function SummaryRows({ rows, className }: { rows: { label: string; value: React.ReactNode; strong?: boolean }[]; className?: string }) {
  return (
    <dl className={cn('divide-y rounded-xl border bg-muted/30 text-sm', className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-4">
          <dt className="shrink-0 text-muted-foreground">{r.label}</dt>
          <dd className={cn('min-w-0 break-words text-right tabular', r.strong && 'font-semibold')}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs font-medium text-destructive">
      {message}
    </p>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>
      {action}
    </div>
  );
}

export function Pagination({ page, pageCount, onPage, total, label = 'items' }: { page: number; pageCount: number; onPage: (p: number) => void; total?: number; label?: string }) {
  if (pageCount <= 1 && total === undefined) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-1 pt-3 text-sm">
      <span className="text-muted-foreground">
        Page {page} of {Math.max(pageCount, 1)}
        {total !== undefined && ` · ${total} ${label}`}
      </span>
      <div className="flex gap-1.5">
        <button className="min-h-9 rounded-md border px-3 py-1.5 disabled:opacity-40" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </button>
        <button className="min-h-9 rounded-md border px-3 py-1.5 disabled:opacity-40" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
