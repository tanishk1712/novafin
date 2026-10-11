import type { Request, Response } from 'express';
import { z } from 'zod';
import { deleteNotification, markAllNotificationsRead, markNotificationRead } from '@novafin/shared';
import { sessionService } from '../services/session.service';
import { tokenOf } from '../middleware/require-session';
import { ok } from '../utils/response';

export const notificationsQuerySchema = z.object({
  filter: z.enum(['all', 'unread', 'transaction', 'market', 'security', 'system']).default('all'),
});

export const markReadSchema = z.object({ read: z.boolean().default(true) }).strict();

export function listNotifications(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  const { filter } = res.locals.query as z.infer<typeof notificationsQuerySchema>;
  const items = state.notifications.filter((n) =>
    filter === 'all' ? true : filter === 'unread' ? !n.read : n.type === filter,
  );
  return ok(res, items, 200, {
    total: items.length,
    unreadCount: state.notifications.filter((n) => !n.read).length,
    filter,
  });
}

export function markRead(req: Request, res: Response) {
  const { read } = req.body as z.infer<typeof markReadSchema>;
  const { state, result } = sessionService.withState(tokenOf(req), (s) => markNotificationRead(s, req.params.id, read));
  return ok(res, result, 200, { unreadCount: state.notifications.filter((n) => !n.read).length });
}

export function markAllRead(req: Request, res: Response) {
  const { result } = sessionService.withState(tokenOf(req), (s) => markAllNotificationsRead(s));
  return ok(res, { marked: result }, 200, { unreadCount: 0 });
}

export function remove(req: Request, res: Response) {
  const { state } = sessionService.withState(tokenOf(req), (s) => deleteNotification(s, req.params.id));
  return ok(res, { deleted: req.params.id }, 200, { unreadCount: state.notifications.filter((n) => !n.read).length });
}
