import { Router } from 'express';
import * as settings from '../controllers/settings.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';
import { validate } from '../middleware/validate';

export const settingsRouter = Router();
settingsRouter.use(requireSession);
settingsRouter.get('/', asyncHandler(settings.getSettings));
settingsRouter.patch('/', validate({ body: settings.settingsPatchSchema }), asyncHandler(settings.patchSettings));
