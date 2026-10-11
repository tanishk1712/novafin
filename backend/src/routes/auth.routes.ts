import { Router } from 'express';
import * as auth from '../controllers/auth.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';
import { validate } from '../middleware/validate';

export const authRouter = Router();
authRouter.post('/demo-login', validate({ body: auth.demoLoginSchema }), asyncHandler(auth.demoLogin));
authRouter.post('/logout', requireSession, asyncHandler(auth.logout));
authRouter.get('/me', requireSession, asyncHandler(auth.me));
