import { z } from 'zod';
import { CURRENCY_CODES, type QrPaymentRequest } from '../types';
import { hashString } from '../random';
import { hasMaxDecimals } from '../money';

/**
 * NovaFin application-specific QR payment payload.
 *
 * This format is ONLY understood by the NovaFin demo. It is NOT a UPI, ACH,
 * EMVCo or wire-transfer instruction and must not be treated as one.
 *
 * The `chk` field is a non-cryptographic integrity checksum that detects
 * accidental corruption or naive tampering in the demo. A production system
 * would sign payloads server-side.
 */

export const QR_PAYLOAD_TYPE = 'novafin.payment-request';
export const QR_PAYLOAD_VERSION = 1;

export const qrPayloadSchema = z
  .object({
    type: z.literal(QR_PAYLOAD_TYPE),
    v: z.literal(QR_PAYLOAD_VERSION),
    id: z.string().regex(/^QR-[A-Z0-9]{6,20}$/, 'Invalid request id'),
    wallet: z.string().regex(/^NVF-\d{4}-\d{4}$/, 'Invalid wallet id'),
    name: z.string().min(1).max(60),
    amount: z
      .number()
      .positive('Amount must be greater than zero')
      .max(1_000_000)
      .refine((n) => hasMaxDecimals(n, 2), 'Amount has too many decimals'),
    currency: z.enum(CURRENCY_CODES),
    note: z.string().max(140).optional(),
    exp: z.string().datetime(),
    demo: z.literal(true),
    chk: z.string().regex(/^[0-9a-f]{8}$/),
  })
  .strict();

export type QrPayload = z.infer<typeof qrPayloadSchema>;

function checksumOf(p: Omit<QrPayload, 'chk'>): string {
  const canonical = [p.type, p.v, p.id, p.wallet, p.name, p.amount.toFixed(2), p.currency, p.note ?? '', p.exp].join('|');
  return hashString(`novafin-demo:${canonical}`).toString(16).padStart(8, '0');
}

export function buildQrPayload(req: QrPaymentRequest): QrPayload {
  const base: Omit<QrPayload, 'chk'> = {
    type: QR_PAYLOAD_TYPE,
    v: QR_PAYLOAD_VERSION,
    id: req.id,
    wallet: req.walletId,
    name: req.payeeName,
    amount: req.amount,
    currency: req.currency,
    ...(req.note ? { note: req.note } : {}),
    exp: req.expiresAt,
    demo: true,
  };
  return { ...base, chk: checksumOf(base) };
}

export function encodeQrPayload(req: QrPaymentRequest): string {
  return JSON.stringify(buildQrPayload(req));
}

export type QrParseResult = { ok: true; payload: QrPayload } | { ok: false; error: string };

/** Parses and validates raw scanned text. Unknown or malformed payloads are rejected. */
export function parseQrPayload(raw: string): QrParseResult {
  if (typeof raw !== 'string' || raw.length === 0) return { ok: false, error: 'QR code is empty.' };
  if (raw.length > 2000) return { ok: false, error: 'QR payload is too large.' };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'This is not a NovaFin payment QR code.' };
  }
  if (!data || typeof data !== 'object' || (data as { type?: unknown }).type !== QR_PAYLOAD_TYPE) {
    return { ok: false, error: 'Unknown QR format. Only NovaFin demo payment requests are supported.' };
  }
  const parsed = qrPayloadSchema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, error: `Malformed payment request: ${first?.path.join('.') || 'payload'} — ${first?.message ?? 'invalid'}` };
  }
  const { chk, ...rest } = parsed.data;
  if (checksumOf(rest) !== chk) return { ok: false, error: 'Payment request integrity check failed (payload was modified).' };
  return { ok: true, payload: parsed.data };
}
