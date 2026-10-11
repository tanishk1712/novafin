'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import {
  Bell,
  CheckCheck,
  EyeOff,
  Eye,
  LogOut,
  Menu,
  Moon,
  MoreHorizontal,
  RotateCcw,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { checkWatchlistAlerts, expireQrRequests, priceMap, settlePending } from '@novafin/shared';
import { cn } from '@/lib/utils';
import { NAV, MOBILE_NAV, isActive } from './nav';
import { Logo } from './logo';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/primitives';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/overlays';
import { Avatar, MarketStatusBadge, SimulatedBadge } from '@/components/common';
import {
  advanceMarket,
  applyOperation,
  getDemoState,
  getLoadStatus,
  initStores,
  updateState,
  useDemoState,
  useMarketState,
} from '@/lib/store/demo-store';
import { demoApi } from '@/lib/api/demo-api';
import { relativeTime } from '@/lib/format';
import { TradeDialog } from '@/components/trade/trade-dialog';
import { ResetDemoDialog } from '@/components/layout/reset-demo';

// ---------------------------------------------------------------------------
// Background jobs: simulated market ticks, settlement of processing transfers,
// QR expiry and watchlist threshold alerts.
// ---------------------------------------------------------------------------

function BackgroundJobs() {
  const state = useDemoState();
  const tickMs = state?.settings.marketTickMs ?? 7000;
  const simulate = state?.settings.marketSimulation ?? true;

  React.useEffect(() => {
    if (!simulate) return;
    const tick = () => {
      if (document.hidden) return; // pause while the tab is inactive
      const m = advanceMarket();
      if (!m || !getDemoState()) return;
      const fired = applyOperation((s) => checkWatchlistAlerts(s, priceMap(m)));
      for (const f of fired) {
        const [symbol, side] = f.split(':');
        toast.info(`${symbol} price alert`, { description: `${symbol} moved ${side} your alert threshold (simulated).` });
      }
    };
    const id = window.setInterval(tick, tickMs);
    const onVis = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [tickMs, simulate]);

  React.useEffect(() => {
    const housekeeping = () => {
      if (!getDemoState()) return;
      const settled = applyOperation((s) => settlePending(s));
      for (const t of settled) {
        toast.success(t.category === 'withdrawal' ? 'Withdrawal completed' : 'Transfer completed', {
          description: `${t.reference} · ${t.description}`,
        });
      }
      updateState((s) => expireQrRequests(s));
    };
    housekeeping();
    const id = window.setInterval(housekeeping, 3000);
    return () => window.clearInterval(id);
  }, []);

  return null;
}

// ---------------------------------------------------------------------------

function NotificationBell() {
  const state = useDemoState();
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  if (!state) return null;
  const unread = state.notifications.filter((n) => !n.read).length;
  const recent = state.notifications.slice(0, 6);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications (${unread} unread)`}>
          <Bell className="size-5" />
          {unread > 0 && (
            <motion.span
              key={unread}
              initial={{ scale: 0.4 }}
              animate={{ scale: 1 }}
              className="absolute -right-0.5 -top-0.5 grid min-w-[18px] place-items-center rounded-full bg-loss px-1 text-[10px] font-bold leading-[18px] text-white"
            >
              {unread > 99 ? '99+' : unread}
            </motion.span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[22rem] max-w-[calc(100vw-1.5rem)]">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" disabled={!unread} onClick={() => demoApi.markAllRead()}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <ul className="max-h-96 divide-y overflow-y-auto scroll-thin">
          {recent.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">You&apos;re all caught up.</li>}
          {recent.map((n) => (
            <li key={n.id}>
              <button
                className={cn('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50', !n.read && 'bg-primary/5')}
                onClick={() => {
                  demoApi.markRead(n.id);
                  setOpen(false);
                  if (n.link) router.push(n.link);
                }}
              >
                <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-primary')} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{n.title}</span>
                  <span className="line-clamp-2 block text-xs text-muted-foreground">{n.message}</span>
                  <span className="mt-0.5 block text-[11px] text-muted-foreground/80">{relativeTime(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="border-t p-2">
          <Button asChild variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            <Link href="/notifications">View all notifications</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const dark = mounted ? resolvedTheme !== 'light' : true;
  return (
    <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </Button>
  );
}

function UserMenu({ onReset }: { onReset: () => void }) {
  const state = useDemoState();
  const router = useRouter();
  if (!state) return null;
  const hidden = state.settings.hideBalances;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-muted" aria-label="Account menu">
          <Avatar name={state.user.name} color="#6366f1" size={32} />
          <span className="hidden text-sm font-medium lg:inline">{state.user.name.split(' ')[0]}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-semibold text-foreground">{state.user.name}</p>
          <p className="text-xs">{state.user.email}</p>
          <p className="mt-1 text-[11px]">Wallet {state.user.walletId} · {state.user.tier}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => demoApi.updateSettings({ hideBalances: !hidden })}>
          {hidden ? <Eye /> : <EyeOff />} {hidden ? 'Show balances' : 'Hide balances'}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/settings')}>
          <Settings /> Settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onReset}>
          <RotateCcw /> Reset demo data
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/welcome')}>
          <LogOut /> Exit to welcome screen
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const state = useDemoState();
  const unread = state?.notifications.filter((n) => !n.read).length ?? 0;
  const groups = ['Money', 'Invest', 'Activity', 'Account'] as const;
  return (
    <nav className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">{g}</p>
          <ul className="space-y-0.5">
            {NAV.filter((n) => n.group === g).map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                      active ? 'bg-primary/12 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {active && <motion.span layoutId="nav-active" className="absolute inset-y-1.5 left-0 w-1 rounded-full bg-primary" />}
                    <item.icon className={cn('size-[18px]', active ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground')} />
                    <span className="flex-1">{item.label}</span>
                    {item.href === '/notifications' && unread > 0 && (
                      <span className="rounded-full bg-primary/15 px-1.5 text-[11px] font-semibold text-primary">{unread}</span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function MobileNav({ onMore }: { onMore: () => void }) {
  const pathname = usePathname();
  const items = NAV.filter((n) => MOBILE_NAV.includes(n.href));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t glass pb-[env(safe-area-inset-bottom)] md:hidden">
      <ul className="grid grid-cols-5">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', active ? 'text-primary' : 'text-muted-foreground')}>
                <item.icon className="size-5" />
                {item.label.replace('US Stock ', '').replace('My ', '')}
              </Link>
            </li>
          );
        })}
        <li>
          <button onClick={onMore} className="flex w-full flex-col items-center gap-0.5 py-2 text-[11px] font-medium text-muted-foreground">
            <MoreHorizontal className="size-5" />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}

function LoadingShell() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-72" />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const state = useDemoState();
  const market = useMarketState();
  const router = useRouter();
  const pathname = usePathname();
  const [drawer, setDrawer] = React.useState(false);
  const [resetOpen, setResetOpen] = React.useState(false);

  React.useEffect(() => {
    const status = initStores();
    if (status === 'recovered') toast.warning('Demo data was corrupted and has been restored', { description: 'Your browser storage contained invalid data.' });
  }, []);

  React.useEffect(() => {
    if (state && !state.user.onboarded) router.replace('/welcome');
  }, [state, router]);

  React.useEffect(() => setDrawer(false), [pathname]);

  const ready = !!state && !!market && state.user.onboarded;

  return (
    <div className="min-h-dvh bg-background">
      <div className="pointer-events-none fixed inset-0 bg-hero opacity-70" aria-hidden />
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar/95 md:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6 scroll-thin">{ready && <SidebarNav />}</div>
        <div className="border-t p-3 text-[11px] leading-relaxed text-muted-foreground">
          <SimulatedBadge label="Demo environment" className="mb-1.5" />
          <p>All balances, prices and transfers are simulated. No real money moves.</p>
        </div>
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDrawer(false)} />
          <motion.div
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            className="absolute inset-y-0 left-0 flex w-72 flex-col border-r bg-sidebar"
          >
            <div className="flex h-16 items-center justify-between px-5">
              <Logo />
              <Button variant="ghost" size="icon" onClick={() => setDrawer(false)} aria-label="Close menu">
                <X />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 pb-6">{ready && <SidebarNav onNavigate={() => setDrawer(false)} />}</div>
          </motion.div>
        </div>
      )}

      <div className="relative md:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b glass px-4 sm:px-6">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setDrawer(true)} aria-label="Open menu">
            <Menu />
          </Button>
          <div className="md:hidden">
            <Logo />
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <MarketStatusBadge />
            <SimulatedBadge />
          </div>
          <div className="ml-auto flex items-center gap-1">
            {ready && <NotificationBell />}
            <ThemeToggle />
            {ready && <UserMenu onReset={() => setResetOpen(true)} />}
          </div>
        </header>
        <main className="relative mx-auto w-full max-w-[1400px] px-4 pb-28 pt-6 sm:px-6 md:pb-10">
          {ready ? (
            <motion.div key={pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
              {children}
            </motion.div>
          ) : (
            <LoadingShell />
          )}
        </main>
      </div>

      {ready && (
        <>
          <MobileNav onMore={() => setDrawer(true)} />
          <BackgroundJobs />
          <TradeDialog />
          <ResetDemoDialog open={resetOpen} onOpenChange={setResetOpen} />
        </>
      )}
    </div>
  );
}

export { getLoadStatus };
