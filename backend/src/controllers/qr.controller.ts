import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  DemoError,
  cancelQrRequest,
  createQrRequest,
  parseQrPayload,
  payQr,
  simulateIncomingQrPayment,
  validateQrForPayment,
} from '@novafin/shared';
import { sessionService } from '../services/session.service';
import { tokenOf } from '../middleware/require-session';
import { created, ok } from '../utils/response';
import { amountSchema, currencySchema } from '../utils/schemas';

export const qrRequestSchema = z
  .object({
    amount: amountSchema,
    currency: currencySchema,
    note: z.string().trim().max(140).optional(),
    expiresInMinutes: z.number().int().min(1).max(7 * 24 * 60).optional(),
  })
  .strict();

const payloadField = z.string({ required_error: 'payload is required.' }).min(1, 'payload is required.').max(2000);

export const qrValidateSchema = z.object({ payload: payloadField }).strict();

export const qrPaySchema = z
  .object({
    payload: payloadField,
    confirm: z.literal(true, {
      errorMap: () => ({ message: 'Payment must be explicitly confirmed with confirm: true.' }),
    }),
  })
  .strict();

/**
 * Cross-session guard: if the payee is another live demo session, its request
 * must still be open. Blocks a second payer from paying an already-paid request.
 */
function assertPayeeRequestOpen(raw: string): void {
  const parsed = parseQrPayload(raw);
  if (!parsed.ok) return; // engine reports the precise error
  const payee = sessionService.findByWalletId(parsed.payload.wallet);
  const request = payee?.session.state.qr.requests.find((r) => r.id === parsed.payload.id);
  if (!request) return;
  if (request.status === 'paid') throw new DemoError('DUPLICATE_PAYMENT', 'This payment request has already been paid.');
  if (request.status === 'cancelled') throw new DemoError('INVALID_STATE', 'This payment request was cancelled by the payee.');
  if (request.status === 'expired') throw new DemoError('QR_EXPIRED', 'This payment request has expired.');
}

export function createRequest(req: Request, res: Response) {
  const body = req.body as z.infer<typeof qrRequestSchema>;
  const { result } = sessionService.withState(tokenOf(req), (s) => createQrRequest(s, body));
  return created(res, result, { simulated: true });
}

export function listRequests(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  return ok(res, state.qr.requests, 200, { total: state.qr.requests.length });
}

export function cancelRequest(req: Request, res: Response) {
  const { result } = sessionService.withState(tokenOf(req), (s) => cancelQrRequest(s, req.params.id));
  return ok(res, result);
}

/** Validation only — never moves money. */
export function validate(req: Request, res: Response) {
  const { payload } = req.body as z.infer<typeof qrValidateSchema>;
  const state = sessionService.getState(tokenOf(req));
  const payment = validateQrForPayment(state, payload);
  assertPayeeRequestOpen(payload);
  return ok(res, { valid: true, payment }, 200, { simulated: true });
}

export function pay(req: Request, res: Response) {
  const { payload } = req.body as z.infer<typeof qrPaySchema>;
  const token = tokenOf(req);
  validateQrForPayment(sessionService.getState(token), payload);
  assertPayeeRequestOpen(payload);
  const { state, result } = sessionService.withState(token, (s) => payQr(s, payload));

  // If the payee is another live demo session, credit it and mark its request as paid.
  let payeeCredited = false;
  const payee = sessionService.findByWalletId(result.payload.wallet);
  if (payee && payee.token !== token) {
    try {
      sessionService.applyTo(payee.token, (s) => simulateIncomingQrPayment(s, result.payload.id, state.user.name));
      payeeCredited = true;
    } catch {
      payeeCredited = false;
    }
  }
  return created(res, { ...result, wallet: state.wallet, payeeCredited }, { simulated: true });
}
