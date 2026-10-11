import type { NextFunction, Request, Response } from 'express';
import { sessionService, type Session } from '../services/session.service';
import { unauthorized } from '../utils/http-error';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      session?: Session;
      sessionToken?: string;
    }
  }
}

export function extractToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.trim().split(/\s+/);
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token;
}

/** Requires `Authorization: Bearer <demo session token>`; sets req.session / req.sessionToken. */
export function requireSession(req: Request, _res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) return next(unauthorized());
  const session = sessionService.touch(token);
  if (!session) return next(unauthorized('Demo session expired or not found. Start a new demo session.'));
  req.session = session;
  req.sessionToken = token;
  next();
}

/** Authenticated session token (requireSession must have run). */
export function tokenOf(req: Request): string {
  if (!req.sessionToken) throw unauthorized();
  return req.sessionToken;
}
