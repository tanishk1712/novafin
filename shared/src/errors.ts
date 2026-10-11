export type DemoErrorCode =
  | 'INVALID_AMOUNT'
  | 'INSUFFICIENT_FUNDS'
  | 'INSUFFICIENT_SHARES'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_PAYMENT'
  | 'QR_INVALID'
  | 'QR_EXPIRED'
  | 'QR_SELF_PAYMENT'
  | 'LIMIT_EXCEEDED'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'UNAUTHORIZED';

const STATUS_BY_CODE: Record<DemoErrorCode, number> = {
  INVALID_AMOUNT: 400,
  VALIDATION_ERROR: 400,
  QR_INVALID: 400,
  QR_EXPIRED: 410,
  QR_SELF_PAYMENT: 400,
  INSUFFICIENT_FUNDS: 422,
  INSUFFICIENT_SHARES: 422,
  LIMIT_EXCEEDED: 422,
  INVALID_STATE: 409,
  DUPLICATE_PAYMENT: 409,
  CONFLICT: 409,
  NOT_FOUND: 404,
  UNAUTHORIZED: 401,
};

/** Business rule violation raised by the demo engine. Safe to show to the user. */
export class DemoError extends Error {
  readonly code: DemoErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: DemoErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DemoError';
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

export function isDemoError(e: unknown): e is DemoError {
  return e instanceof DemoError || (typeof e === 'object' && e !== null && (e as { name?: string }).name === 'DemoError');
}
