import type { NextFunction, Request, RequestHandler, Response } from 'express';

/** Forwards sync throws and rejected promises to the Express 4 error handler. */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => {
    try {
      Promise.resolve(fn(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
}
