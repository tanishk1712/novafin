import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

type Source = 'body' | 'params' | 'query';

/**
 * Validates request parts with zod. Parsed (coerced) values are stored on
 * `res.locals.<source>`; for body they also replace `req.body`.
 * Failures reach the error handler as ZodError → 400 VALIDATION_ERROR.
 */
export function validate(schemas: Partial<Record<Source, ZodTypeAny>>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      for (const source of ['params', 'query', 'body'] as const) {
        const schema = schemas[source];
        if (!schema) continue;
        const raw = source === 'body' ? (req.body ?? {}) : req[source];
        const parsed = schema.parse(raw);
        res.locals[source] = parsed;
        if (source === 'body') req.body = parsed;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Typed accessor for a value previously stored by `validate`. */
export function parsed<S extends ZodTypeAny>(res: Response, source: Source, _schema: S): z.infer<S> {
  return res.locals[source] as z.infer<S>;
}
