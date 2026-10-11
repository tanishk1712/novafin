import { Router } from 'express';
import * as qr from '../controllers/qr.controller';
import { asyncHandler } from '../middleware/async-handler';
import { requireSession } from '../middleware/require-session';
import { validate } from '../middleware/validate';
import { idParamSchema } from '../utils/schemas';

export const qrRouter = Router();
qrRouter.use(requireSession);
qrRouter.get('/requests', asyncHandler(qr.listRequests));
qrRouter.post('/requests/:id/cancel', validate({ params: idParamSchema }), asyncHandler(qr.cancelRequest));
qrRouter.post('/payment-request', validate({ body: qr.qrRequestSchema }), asyncHandler(qr.createRequest));
qrRouter.post('/validate', validate({ body: qr.qrValidateSchema }), asyncHandler(qr.validate));
qrRouter.post('/pay', validate({ body: qr.qrPaySchema }), asyncHandler(qr.pay));
