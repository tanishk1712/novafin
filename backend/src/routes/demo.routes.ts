import { Router } from 'express';
import * as demo from '../controllers/demo.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';

export const demoRouter = Router();
demoRouter.post('/reset', requireSession, asyncHandler(demo.reset));
