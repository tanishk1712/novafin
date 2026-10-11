import type { Request, Response } from 'express';
import { z } from 'zod';
import { TX_CATEGORIES, TX_STATUSES } from '@novafin/shared';
import { sessionService } from '../services/session.service';
import { tokenOf } from '../middleware/require-session';
import { notFound } from '../utils/http-error';
import { ok } from '../utils/response';
import { isoDateSchema, orderSchema, pageSchema, pageSizeSchema } from '../utils/schemas';

export const transactionsQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  category: z.enum(TX_CATEGORIES).optional(),
  status: z.enum(TX_STATUSES).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  sort: z.enum(['date', 'amount']).default('date'),
  order: orderSchema,
  page: pageSchema,
  pageSize: pageSizeSchema(20, 200),
});

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function listTransactions(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  const q = res.locals.query as z.infer<typeof transactionsQuerySchema>;
  const fromMs = q.from ? Date.parse(q.from) : undefined;
  // A date-only "to" includes the whole day.
  const toMs = q.to ? Date.parse(q.to) + (DATE_ONLY.test(q.to) ? 86_400_000 - 1 : 0) : undefined;
  const term = q.search?.toLowerCase();

  let items = state.transactions.filter((t) => {
    if (q.category && t.category !== q.category) return false;
    if (q.status && t.status !== q.status) return false;
    const at = Date.parse(t.createdAt);
    if (fromMs !== undefined && at < fromMs) return false;
    if (toMs !== undefined && at > toMs) return false;
    if (term) {
      const hay = `${t.description} ${t.reference} ${t.counterparty ?? ''} ${t.category} ${t.currency}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  });

  const dir = q.order === 'asc' ? 1 : -1;
  items = [...items].sort((a, b) =>
    q.sort === 'amount' ? (a.amount - b.amount) * dir : (Date.parse(a.createdAt) - Date.parse(b.createdAt)) * dir,
  );

  const total = items.length;
  const start = (q.page - 1) * q.pageSize;
  return ok(res, items.slice(start, start + q.pageSize), 200, {
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
  });
}

export function getTransaction(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  const tx = state.transactions.find((t) => t.id === req.params.id || t.reference === req.params.id);
  if (!tx) throw notFound('Transaction not found.');
  const related = state.transactions.filter((t) => t.linkedTo === tx.id || (tx.linkedTo && t.id === tx.linkedTo));
  return ok(res, { ...tx, related });
}
