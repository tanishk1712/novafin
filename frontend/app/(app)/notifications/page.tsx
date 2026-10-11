'use client';

import * as React from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Bell, BellOff, CheckCheck, Circle, LineChart, Mail, MailOpen, Receipt, Shield, Sparkles, Trash2 } from 'lucide-react';
import type { AppNotification, NotificationType } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, Tabs, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { EmptyState, PageHeader, Pagination } from '@/components/common';
import { useDemo } from '@/lib/store/demo-store';
import { demoApi } from '@/lib/api/demo-api';
import { formatDateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'unread' | 'transaction' | 'market' | 'security';

const TYPE_META: Record<NotificationType, { icon: typeof Bell; tint: string; label: string }> = {
  transaction: { icon: Receipt, tint: 'bg-primary/12 text-primary', label: 'Transaction' },
  market: { icon: LineChart, tint: 'bg-teal/12 text-teal', label: 'Market' },
  security: { icon: Shield, tint: 'bg-amber-500/12 text-amber-500', label: 'Security' },
  system: { icon: Sparkles, tint: 'bg-violet/12 text-violet', label: 'System' },
};

const PAGE = 15;

export default function NotificationsPage() {
  const state = useDemo();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [page, setPage] = React.useState(1);
  const list = state.notifications.filter((n) => (filter === 'all' ? true : filter === 'unread' ? !n.read : n.type === filter));
  const unread = state.notifications.filter((n) => !n.read).length;
  React.useEffect(() => setPage(1), [filter]);
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE));
  const counts: Record<Filter, number> = {
    all: state.notifications.length,
    unread,
    transaction: state.notifications.filter((n) => n.type === 'transaction').length,
    market: state.notifications.filter((n) => n.type === 'market').length,
    security: state.notifications.filter((n) => n.type === 'security').length,
  };

  const remove = (n: AppNotification) => {
    demoApi.deleteNotification(n.id);
    toast('Notification deleted');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title="Notifications"
        description="Generated automatically from your demo activity — deposits, withdrawals, exchanges, transfers, QR payments, trades and price alerts."
        actions={
          <Button
            variant="outline"
            disabled={!unread}
            onClick={() => {
              const n = demoApi.markAllRead();
              toast.success(`Marked ${n} notification${n === 1 ? '' : 's'} as read`);
            }}
          >
            <CheckCheck /> Mark all as read
          </Button>
        }
      />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList className="h-auto flex-wrap justify-start">
          {(['all', 'unread', 'transaction', 'market', 'security'] as Filter[]).map((f) => (
            <TabsTrigger key={f} value={f} className="capitalize">
              {f === 'transaction' ? 'Transactions' : f} <span className="ml-1 rounded-full bg-muted px-1.5 text-[10px]">{counts[f]}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Card>
        <CardContent className="p-0">
          {list.length === 0 ? (
            <EmptyState icon={BellOff} title="No notifications" description={filter === 'unread' ? "You're all caught up." : 'Nothing in this category yet.'} />
          ) : (
            <ul className="divide-y">
              {list.slice((page - 1) * PAGE, page * PAGE).map((n) => {
                const meta = TYPE_META[n.type];
                return (
                  <li key={n.id} className={cn('flex gap-3 p-3 transition-colors sm:gap-4 sm:p-4', !n.read && 'bg-primary/5')}>
                    <span className={cn('grid size-9 shrink-0 place-items-center rounded-full sm:size-10', meta.tint)}>
                      <meta.icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{n.title}</p>
                        {!n.read && <Circle className="size-2 fill-primary text-primary" />}
                        <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{meta.label}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{n.message}</p>
                      <p className="mt-1 text-xs text-muted-foreground/80" title={formatDateTime(n.createdAt)}>
                        {relativeTime(n.createdAt)}
                        {n.link && (
                          <>
                            {' · '}
                            <Link href={n.link} className="text-primary hover:underline" onClick={() => !n.read && demoApi.markRead(n.id)}>
                              View
                            </Link>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-center gap-1 sm:flex-row sm:items-start">
                      <Button size="icon" variant="ghost" title={n.read ? 'Mark unread' : 'Mark read'} aria-label={n.read ? 'Mark unread' : 'Mark read'} onClick={() => demoApi.markRead(n.id, !n.read)}>
                        {n.read ? <Mail className="text-muted-foreground" /> : <MailOpen className="text-primary" />}
                      </Button>
                      <Button size="icon" variant="ghost" aria-label="Delete notification" onClick={() => remove(n)}>
                        <Trash2 className="text-muted-foreground" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="px-4 pb-4">
            <Pagination page={page} pageCount={pageCount} onPage={setPage} total={list.length} label="notifications" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
