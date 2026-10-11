import type { Request, Response } from 'express';
import { fail } from '../utils/response';

export function notFoundHandler(req: Request, res: Response): void {
  fail(res, 404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} does not exist.`);
}
