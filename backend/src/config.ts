/** Runtime configuration for the NovaFin demo API (all values are for a SIMULATED demo). */

function int(name: string, fallback: number, min = 0): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
}

export interface AppConfig {
  port: number;
  corsOrigins: string[];
  marketTickMs: number;
  sessionTtlMinutes: number;
  nodeEnv: string;
}

export function loadConfig(): AppConfig {
  return {
    port: int('PORT', 4000, 1),
    corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:3000')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    marketTickMs: int('MARKET_TICK_MS', 7000, 1000),
    sessionTtlMinutes: int('SESSION_TTL_MINUTES', 240, 1),
    nodeEnv: process.env.NODE_ENV ?? 'development',
  };
}
