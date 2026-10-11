import type { Request, Response } from 'express';
import { z } from 'zod';
import { sessionService } from '../services/session.service';
import { tokenOf } from '../middleware/require-session';
import { created, ok } from '../utils/response';

export const demoLoginSchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty.').max(60, 'Name must be at most 60 characters.').optional(),
  })
  .strict();

export function demoLogin(req: Request, res: Response) {
  const { name } = req.body as z.infer<typeof demoLoginSchema>;
  const { token, session } = sessionService.create(name);
  return created(
    res,
    { token, tokenType: 'Bearer', expiresInMinutes: sessionService.ttlMinutes, user: session.state.user },
    { simulated: true },
  );
}

export function logout(req: Request, res: Response) {
  sessionService.delete(tokenOf(req));
  return ok(res, { loggedOut: true });
}

export function me(req: Request, res: Response) {
  const state = sessionService.getState(tokenOf(req));
  return ok(res, { user: state.user });
}
