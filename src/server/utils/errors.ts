/**
 * Stable, machine-readable error codes. Clients branch on these — never on the
 * HTTP status alone and never on the message text, which is free to change.
 *
 * Adding a code is safe; renaming one is a breaking API change.
 */
export const ErrorCode = {
  // 400 — the request itself is malformed
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  MALFORMED_REQUEST: 'MALFORMED_REQUEST',

  // 401 / 403 — identity and permission
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  FORBIDDEN: 'FORBIDDEN',
  TENANT_MISMATCH: 'TENANT_MISMATCH',
  // The request needs the caller's Ticket-IT session and the portal holds none
  // that is still valid. Sent as 403: the portal session itself is fine.
  TICKETIT_SESSION_REQUIRED: 'TICKETIT_SESSION_REQUIRED',

  // 404 / 409 — resource state
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  STALE_VERSION: 'STALE_VERSION',
  IMMUTABLE_RESOURCE: 'IMMUTABLE_RESOURCE',

  // 422 — well-formed but rejected by a business rule
  BUSINESS_RULE_VIOLATION: 'BUSINESS_RULE_VIOLATION',

  // 429 — throttling
  RATE_LIMITED: 'RATE_LIMITED',

  // 500 / 502 / 503 — our fault
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  // A database transaction was cancelled before it committed — it ran past its
  // timeout, or lost a deadlock. Nothing it wrote was kept, so the same request
  // is safe to send again. Sent as 503 with `details.retryable: true`.
  TRANSACTION_ABORTED: 'TRANSACTION_ABORTED',
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export interface AppErrorOptions {
  /** Machine-readable detail safe to show the caller. Never put secrets here. */
  readonly details?: Record<string, unknown>
  /** Original error, preserved for logs only — never serialised to the client. */
  readonly cause?: unknown
}

/**
 * Every deliberately thrown error in the system extends this. `toErrorResponse`
 * turns it into the standard envelope; anything that is *not* an AppError is
 * treated as an unexpected bug and reported as INTERNAL_ERROR with its message
 * withheld in production.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: Record<string, unknown>
  /** `true` = an expected condition (bad input, missing row), not an incident. */
  readonly isOperational = true

  constructor(
    code: ErrorCode,
    status: number,
    message: string,
    options: AppErrorOptions = {}
  ) {
    super(
      message,
      options.cause !== undefined ? { cause: options.cause } : undefined
    )
    this.name = new.target.name
    this.code = code
    this.status = status
    this.details = options.details
    Error.captureStackTrace?.(this, new.target)
  }
}

export class ValidationError extends AppError {
  constructor(
    message = 'Request validation failed',
    options?: AppErrorOptions
  ) {
    super(ErrorCode.VALIDATION_FAILED, 400, message, options)
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required', options?: AppErrorOptions) {
    super(ErrorCode.UNAUTHENTICATED, 401, message, options)
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = 'You do not have access to this resource',
    options?: AppErrorOptions
  ) {
    super(ErrorCode.FORBIDDEN, 403, message, options)
  }
}

/**
 * Raised when a request reaches a row belonging to another account. Deliberately
 * distinct from ForbiddenError so it can be alarmed on separately — in a
 * multi-tenant system this is a security signal, not a routine denial.
 */
export class TenantMismatchError extends AppError {
  constructor(
    message = 'Resource does not belong to the active account',
    options?: AppErrorOptions
  ) {
    super(ErrorCode.TENANT_MISMATCH, 403, message, options)
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource', options?: AppErrorOptions) {
    super(ErrorCode.NOT_FOUND, 404, `${resource} not found`, options)
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', options?: AppErrorOptions) {
    super(ErrorCode.CONFLICT, 409, message, options)
  }
}

/** Optimistic-locking failure: someone else changed the row first. */
export class StaleVersionError extends AppError {
  constructor(
    message = 'Resource was modified by someone else',
    options?: AppErrorOptions
  ) {
    super(ErrorCode.STALE_VERSION, 409, message, options)
  }
}

export class BusinessRuleError extends AppError {
  constructor(message: string, options?: AppErrorOptions) {
    super(ErrorCode.BUSINESS_RULE_VIOLATION, 422, message, options)
  }
}

export class RateLimitedError extends AppError {
  constructor(message = 'Too many requests', options?: AppErrorOptions) {
    super(ErrorCode.RATE_LIMITED, 429, message, options)
  }
}

export class DependencyUnavailableError extends AppError {
  constructor(dependency: string, options?: AppErrorOptions) {
    super(
      ErrorCode.DEPENDENCY_UNAVAILABLE,
      503,
      `${dependency} is unavailable`,
      options
    )
  }
}

export class NotImplementedError extends AppError {
  constructor(what: string, options?: AppErrorOptions) {
    super(
      ErrorCode.NOT_IMPLEMENTED,
      501,
      `${what} is not implemented yet`,
      options
    )
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}
