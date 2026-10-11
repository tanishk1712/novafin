import { z } from 'zod';
import { CURRENCY_CODES } from '@novafin/shared';

/** Reusable zod primitives for request validation. The engine re-validates business rules. */

export const amountSchema = z
  .number({ required_error: 'Amount is required.', invalid_type_error: 'Amount must be a number.' })
  .finite('Amount must be a finite number.')
  .positive('Amount must be greater than zero.');

export const currencySchema = z.enum(CURRENCY_CODES, {
  errorMap: () => ({ message: `Currency must be one of ${CURRENCY_CODES.join(', ')}.` }),
});

export const symbolSchema = z
  .string()
  .trim()
  .min(1, 'Symbol is required.')
  .max(12, 'Symbol is too long.')
  .regex(/^[A-Za-z0-9.\-]+$/, 'Invalid symbol.')
  .transform((s) => s.toUpperCase());

export const idParamSchema = z.object({ id: z.string().trim().min(1).max(128) });
export const symbolParamSchema = z.object({ symbol: symbolSchema });

export const pageSchema = z.coerce.number().int().min(1).default(1);
export const pageSizeSchema = (def: number, max: number) => z.coerce.number().int().min(1).max(max).default(def);
export const orderSchema = z.enum(['asc', 'desc']).default('desc');

export const isoDateSchema = z
  .string()
  .trim()
  .refine((s) => !Number.isNaN(Date.parse(s)), 'Must be an ISO date (e.g. 2026-01-31).');

/** Optional numeric query param ("" is treated as absent). */
export const optionalQueryNumber = z.preprocess(
  (v) => (v === '' || v === undefined ? undefined : v),
  z.coerce.number().finite().optional(),
);
