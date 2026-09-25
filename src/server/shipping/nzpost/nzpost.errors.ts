import {
  AppError,
  BusinessRuleError,
  DependencyUnavailableError,
  ErrorCode,
  NotFoundError,
} from '../../utils/errors'

/**
 * NZ Post's error envelope, as every spec example writes it:
 *
 *   { "success": false, "message_id": "...",
 *     "errors": [{ "code": "400002", "message": "Invalid parameter(s)",
 *                  "details": "For domestic parcels , the field /delivery_address/street must have a value." }] }
 *
 * `code` is a string in some examples and a number in others, so it is read as
 * whatever arrives.
 */
export interface NzPostErrorItem {
  readonly code: string | null
  readonly message: string | null
  readonly details: string | null
}

/**
 * A call that reached NZ Post and came back refused.
 *
 * Kept apart from `NzPostUnavailableError`, which means no answer at all: the
 * retry policy and the message a person sees both depend on which it was.
 */
export class NzPostApiError extends Error {
  constructor(
    readonly status: number,
    readonly errors: readonly NzPostErrorItem[],
    readonly messageId: string | null,
    readonly operation: string
  ) {
    super(summarise(status, errors, operation))
    this.name = 'NzPostApiError'
  }

  /**
   * Worth trying again. A 5xx or a throttle is; a 4xx is NZ Post saying the
   * request itself is wrong, and sending it again will be refused again.
   */
  get transient(): boolean {
    return this.status >= 500 || this.status === 408 || this.status === 429
  }

  /** The most useful single line for a person: NZ Post's `details`, if any. */
  get detail(): string {
    const first = this.errors.find((error) => error.details || error.message)
    return first?.details || first?.message || `NZ Post answered ${this.status}`
  }
}

/** No answer: DNS, TLS, a refused connection or the timeout. Always transient. */
export class NzPostUnavailableError extends Error {
  constructor(
    readonly operation: string,
    options?: { cause?: unknown }
  ) {
    super(`NZ Post could not be reached (${operation})`, options)
    this.name = 'NzPostUnavailableError'
  }
}

/**
 * The portal cannot make this call as configured — live mode with no base URL,
 * say. Not NZ Post's fault and not transient; an operator has to set something.
 */
export class NzPostNotConfiguredError extends Error {
  constructor(
    readonly capability: string,
    readonly missing: readonly string[]
  ) {
    super(`NZ Post ${capability} is not configured: set ${missing.join(', ')}.`)
    this.name = 'NzPostNotConfiguredError'
  }
}

export function isTransientCarrierError(error: unknown): boolean {
  if (error instanceof NzPostUnavailableError) return true
  if (error instanceof NzPostApiError) return error.transient
  return false
}

/**
 * Turns a carrier failure into the portal's own error for an HTTP response.
 *
 * Every route that reaches NZ Post goes through this, so no request ever
 * surfaces an `NzPostApiError` — which the error middleware does not know and
 * would render as a 500 with the message withheld.
 */
export function toAppError(error: unknown, what: string): unknown {
  if (error instanceof AppError) return error

  if (error instanceof NzPostNotConfiguredError) {
    // Variable names go to the log, not to the browser.
    console.warn(error.message)
    return new DependencyUnavailableError(`NZ Post ${what}`)
  }

  if (error instanceof NzPostUnavailableError) {
    return new DependencyUnavailableError(`NZ Post ${what}`, { cause: error })
  }

  if (error instanceof NzPostApiError) {
    console.warn(
      `NZ Post ${error.operation} answered ${error.status} ` +
        `(message ${error.messageId ?? 'n/a'}): ${error.detail}`
    )
    const details = {
      operation: error.operation,
      upstreamStatus: error.status,
      messageId: error.messageId,
    }

    if (error.status === 401 || error.status === 403) {
      // The token was accepted by the OAuth server and refused by the API: the
      // application has not been approved for this API yet, or the credentials
      // belong to another environment. Neither is the buyer's to fix.
      return new AppError(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
        503,
        `NZ Post ${what} is not available to this portal yet.`,
        { details, cause: error }
      )
    }
    if (error.status === 404) {
      return new NotFoundError(`NZ Post ${what}`, { details })
    }
    if (!error.transient) {
      // NZ Post's own validation messages are written for integrators but are
      // specific — "the field /delivery_address/street must have a value" — and
      // replacing them with something vaguer helps nobody fix the input.
      return new BusinessRuleError(error.detail, { details })
    }
    return new AppError(
      ErrorCode.UPSTREAM_ERROR,
      502,
      `NZ Post ${what} returned an error.`,
      { details, cause: error }
    )
  }

  return error
}

function summarise(
  status: number,
  errors: readonly NzPostErrorItem[],
  operation: string
): string {
  const first = errors[0]
  const text = first
    ? [first.message, first.details].filter(Boolean).join(': ')
    : ''
  return `NZ Post ${operation} answered ${status}${text ? ` — ${text}` : ''}`
}
