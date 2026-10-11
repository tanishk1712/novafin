'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { CheckCircle2, Clock } from 'lucide-react';
import type { Transaction } from '@novafin/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Step indicator for multi-step money flows (Details → Review → Done). */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs font-medium">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2">
          <span
            className={cn(
              'grid size-6 shrink-0 place-items-center rounded-full border text-[11px]',
              i < current ? 'border-gain bg-gain text-white' : i === current ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {i < current ? '✓' : i + 1}
          </span>
          <span className={cn('hidden sm:inline', i === current ? 'text-foreground' : 'text-muted-foreground')}>{s}</span>
          {i < steps.length - 1 && <span className={cn('h-px flex-1', i < current ? 'bg-gain' : 'bg-border')} />}
        </li>
      ))}
    </ol>
  );
}

/** Success screen shown after a completed demo operation. */
export function SuccessPanel({
  title,
  description,
  transaction,
  children,
  onAgain,
  againLabel = 'Make another',
}: {
  title: string;
  description?: React.ReactNode;
  transaction?: Transaction;
  children?: React.ReactNode;
  onAgain: () => void;
  againLabel?: string;
}) {
  const pending = transaction && (transaction.status === 'processing' || transaction.status === 'pending');
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="space-y-5 text-center">
      <motion.div initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 16 }}>
        {pending ? <Clock className="mx-auto size-14 text-primary" /> : <CheckCircle2 className="mx-auto size-14 text-gain" />}
      </motion.div>
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
      <div className="flex flex-col justify-center gap-2 sm:flex-row">
        {transaction && (
          <Button asChild variant="outline">
            <Link href={`/transactions/${transaction.id}`}>View receipt</Link>
          </Button>
        )}
        <Button onClick={onAgain}>{againLabel}</Button>
      </div>
    </motion.div>
  );
}
