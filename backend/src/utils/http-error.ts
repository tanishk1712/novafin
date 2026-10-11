/** Transport-level error (auth, routing, request validation outside the engine). */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'A valid demo session token is required.') => new HttpError(401, 'UNAUTHORIZED', message);
export const notFound = (message = 'Resource not found.') => new HttpError(404, 'NOT_FOUND', message);
