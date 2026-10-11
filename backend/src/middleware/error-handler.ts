import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { isDemoError } from '@novafin/shared';
import { HttpError } from '../utils/http-error';
import { fail } from '../utils/response';

/** Central error mapper: DemoError / HttpError / ZodError / JSON SyntaxError / unknown → 500. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  if (isDemoError(err)) {
    fail(res, err.status ?? 400, err.code, err.message, err.details);
    return;
  }
  if (err instanceof HttpError) {
    fail(res, err.status, err.code, err.message, err.details);
    return;
  }
  if (err instanceof ZodError) {
    fail(res, 400, 'VALIDATION_ERROR', err.issues[0]?.message ?? 'Invalid request.', {
      issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message, code: i.code })),
    });
    return;
  }
  const e = (err ?? {}) as { type?: string; status?: number; statusCode?: number; message?: string };
  if (err instanceof SyntaxError || e.type === 'entity.parse.failed') {
    fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON.');
    return;
  }
  if (e.type === 'entity.too.large') {
    fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
    return;
  }
  const status = e.status ?? e.statusCode;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    fail(res, status, 'BAD_REQUEST', e.message ?? 'Bad request.');
    return;
  }
  console.error('[novafin] unhandled error', err);
  fail(res, 500, 'INTERNAL_ERROR', 'Something went wrong in the demo server.');
}
