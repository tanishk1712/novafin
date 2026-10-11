/**
 * Typed client for the optional NovaFin Express demo API.
 * The browser UI works without it (localStorage demo mode); the Settings page
 * uses this client to show backend connectivity and server-side market data.
 */

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: Record<string, unknown>;
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit & { token?: string; timeoutMs?: number } = {}): Promise<ApiSuccess<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 4000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(init.token ? { Authorization: `Bearer ${init.token}` } : {}),
        ...init.headers,
      },
    });
    const body = (await res.json().catch(() => null)) as ApiSuccess<T> | ApiFailure | null;
    if (!res.ok || !body || body.success === false) {
      const err = body && body.success === false ? body.error : { code: 'HTTP_ERROR', message: res.statusText };
      throw new ApiError(res.status, err.code, err.message);
    }
    return body;
  } finally {
    clearTimeout(timer);
  }
}

export const backendApi = {
  health: () => apiFetch<{ status: string; uptime: number }>('/health'),
  marketSummary: () =>
    apiFetch<{
      indices: { key: string; name: string; value: number; changePercent: number }[];
      advancers: number;
      decliners: number;
      status?: { label: string; nyTime: string };
    }>('/market/summary'),
  rates: () => apiFetch<{ base: string; ratesPerUsd: Record<string, number>; feePercent: number }>('/exchange/rates'),
  demoLogin: () => apiFetch<{ token: string; user: { name: string; walletId: string } }>('/auth/demo-login', { method: 'POST', body: '{}' }),
  wallet: (token: string) => apiFetch<{ wallet: { balances: Record<string, number> } }>('/wallet', { token }),
};
