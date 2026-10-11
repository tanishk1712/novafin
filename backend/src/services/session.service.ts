import { randomInt, randomUUID } from 'node:crypto';
import {
  DemoError,
  checkWatchlistAlerts,
  createSeedState,
  expireQrRequests,
  settlePending,
  type DemoState,
  type DemoUser,
  type OperationResult,
} from '@novafin/shared';
import { marketService } from './market.service';

/**
 * In-memory demo sessions. Each session owns an isolated, SIMULATED DemoState.
 * Nothing is persisted; restarting the server wipes every session.
 */

export interface Session {
  state: DemoState;
  createdAt: number;
  lastSeen: number;
}

const DEFAULT_TTL_MINUTES = 240;
const RESERVED_WALLETS = new Set(['NVF-4821-7730', 'NVF-1001-2002', 'NVF-3141-5926', 'NVF-2718-2818', 'NVF-1618-0339']);

function slug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .slice(0, 40) || 'demo.user';
}

class SessionService {
  private sessions = new Map<string, Session>();
  private ttlMs = DEFAULT_TTL_MINUTES * 60_000;
  private cleanupTimer: NodeJS.Timeout | null = null;

  configure(opts: { ttlMinutes?: number }): void {
    if (opts.ttlMinutes && opts.ttlMinutes > 0) this.ttlMs = opts.ttlMinutes * 60_000;
  }

  get ttlMinutes(): number {
    return this.ttlMs / 60_000;
  }

  get size(): number {
    return this.sessions.size;
  }

  private uniqueWalletId(): string {
    for (;;) {
      const id = `NVF-${randomInt(1000, 10000)}-${randomInt(1000, 10000)}`;
      if (!RESERVED_WALLETS.has(id) && !this.findByWalletId(id)) return id;
    }
  }

  /** Gives each session its own identity so sessions can pay each other via QR. */
  private personalise(state: DemoState, identity?: Partial<DemoUser>, name?: string): DemoState {
    const user: DemoUser = {
      ...state.user,
      id: identity?.id ?? `usr_${randomUUID().replace(/-/g, '').slice(0, 12)}`,
      walletId: identity?.walletId ?? this.uniqueWalletId(),
      name: identity?.name ?? name ?? state.user.name,
      email: identity?.email ?? (name ? `${slug(name)}@demo.novafin.app` : state.user.email),
      createdAt: identity?.createdAt ?? state.user.createdAt,
    };
    return { ...state, user };
  }

  create(name?: string, now = Date.now()): { token: string; session: Session } {
    const token = randomUUID();
    const state = this.personalise(createSeedState(now), undefined, name?.trim() || undefined);
    const session: Session = { state, createdAt: now, lastSeen: now };
    this.sessions.set(token, session);
    return { token, session };
  }

  private isExpired(s: Session, now: number): boolean {
    return now - s.lastSeen > this.ttlMs;
  }

  /** Returns a live session and refreshes its TTL, or undefined if missing/expired. */
  touch(token: string, now = Date.now()): Session | undefined {
    const s = this.sessions.get(token);
    if (!s) return undefined;
    if (this.isExpired(s, now)) {
      this.sessions.delete(token);
      return undefined;
    }
    s.lastSeen = now;
    return s;
  }

  private require(token: string): Session {
    const s = this.touch(token);
    if (!s) throw new DemoError('UNAUTHORIZED', 'Demo session expired or not found. Start a new demo session.');
    return s;
  }

  /** Lazy simulation housekeeping: settle due transfers/withdrawals, expire QR requests, fire watchlist alerts. */
  private maintain(state: DemoState, now: number): DemoState {
    let next = settlePending(state, { now }).state;
    next = expireQrRequests(next, now);
    next = checkWatchlistAlerts(next, marketService.prices(), { now }).state;
    return next;
  }

  /** Current state of a session after lazy maintenance. */
  getState(token: string, now = Date.now()): DemoState {
    const s = this.require(token);
    s.state = this.maintain(s.state, now);
    return s.state;
  }

  /** Applies a pure engine operation and stores the resulting state. Errors leave state untouched. */
  withState<T>(token: string, fn: (state: DemoState) => OperationResult<T>, now = Date.now()): { state: DemoState; result: T } {
    const s = this.require(token);
    const current = this.maintain(s.state, now);
    s.state = current;
    const out = fn(current);
    s.state = out.state;
    return { state: out.state, result: out.result };
  }

  /** Replaces the session's state with a fresh seed, keeping the session identity. */
  reset(token: string, now = Date.now()): DemoState {
    const s = this.require(token);
    s.state = this.personalise(createSeedState(now), s.state.user);
    return s.state;
  }

  delete(token: string): boolean {
    return this.sessions.delete(token);
  }

  findByWalletId(walletId: string): { token: string; session: Session } | undefined {
    const now = Date.now();
    for (const [token, session] of this.sessions) {
      if (session.state.user.walletId === walletId && !this.isExpired(session, now)) return { token, session };
    }
    return undefined;
  }

  /** Applies an operation to another session (e.g. crediting a QR payee) without touching its TTL. */
  applyTo<T>(token: string, fn: (state: DemoState) => OperationResult<T>): T | undefined {
    const s = this.sessions.get(token);
    if (!s) return undefined;
    const out = fn(s.state);
    s.state = out.state;
    return out.result;
  }

  cleanup(now = Date.now()): number {
    let removed = 0;
    for (const [token, s] of this.sessions) {
      if (this.isExpired(s, now)) {
        this.sessions.delete(token);
        removed++;
      }
    }
    return removed;
  }

  startCleanup(intervalMs = 60_000): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => this.cleanup(), intervalMs);
    this.cleanupTimer.unref?.();
  }

  stopCleanup(): void {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
  }

  clear(): void {
    this.sessions.clear();
  }
}

export const sessionService = new SessionService();
export type { SessionService };
