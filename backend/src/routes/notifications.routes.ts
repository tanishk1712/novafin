import { Router } from 'express';
import * as notifications from '../controllers/notifications.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../utils/schemas';

export const notificationsRouter = Router();
notificationsRouter.use(requireSession);
notificationsRouter.get(
  '/',
  validate({ query: notifications.notificationsQuerySchema }),
  asyncHandler(notifications.listNotifications),
);
notificationsRouter.post('/read-all', asyncHandler(notifications.markAllRead));
notificationsRouter.patch(
  '/:id/read',
  validate({ params: idParamSchema, body: notifications.markReadSchema }),
  asyncHandler(notifications.markRead),
);
notificationsRouter.delete('/:id', validate({ params: idParamSchema }), asyncHandler(notifications.remove));
