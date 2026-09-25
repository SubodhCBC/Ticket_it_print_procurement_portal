import { Prisma } from '@prisma/client'
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { ConfigValidationError } from '../config'
import { ErrorCode, isAppError } from '../utils/errors'
import {
  REQUEST_ID_HEADER,
  type ErrorEnvelope,
  type FieldIssue,
} from '../utils/response'

const SERVER_ERROR_THRESHOLD = 500

interface NormalisedError {
  status: number
  code: ErrorCode
  message: string
  details?: Record<string, unknown>
  /** Unexpected errors are logged at error level rather than warn. */
  unexpected: boolean
}

/**
 * The single exit point for every failure. Guarantees:
 *   - one response shape (ErrorEnvelope) for the whole API;
 *   - internal messages and stack traces never reach the client;
 *   - every failure is correlated with a requestId the user can quote.
 *
 * Ported from the NestJS `AllExceptionsFilter`. Nest's `HttpException` branch
 * is gone — there is no framework exception type here — and a `ZodError` branch
 * takes its place, since validation now throws rather than being intercepted by
 * a pipe.
 */
export function toErrorResponse(
  error: unknown,
  context: { requestId: string; path: string; isProduction: boolean }
): NextResponse {
  const normalised = normalise(error)

  if (normalised.unexpected) {
    console.error(
      `[${context.requestId}] Unhandled exception on ${context.path}: ${normalised.message}`,
      error
    )
  } else if (normalised.code === ErrorCode.TRANSACTION_ABORTED) {
    console.error(
      `[${context.requestId}] Transaction aborted on ${context.path}; the client may retry.`,
      error instanceof Error ? error.message : error
    )
  } else {
    console.warn(`[${context.requestId}] ${normalised.code} on ${context.path}`)
  }

  const envelope: ErrorEnvelope = {
    error: {
      code: normalised.code,
      message:
        normalised.unexpected && context.isProduction
          ? 'An unexpected error occurred. Quote the request id when reporting this.'
          : normalised.message,
      ...(normalised.details ? { details: normalised.details } : {}),
    },
    meta: {
      requestId: context.requestId,
      timestamp: new Date().toISOString(),
      path: context.path,
    },
  }

  return NextResponse.json(envelope, {
    status: normalised.status,
    headers: {
      'Cache-Control': 'no-store',
      [REQUEST_ID_HEADER]: context.requestId,
      ...(normalised.code === ErrorCode.TRANSACTION_ABORTED
        ? { 'Retry-After': '1' }
        : {}),
    },
  })
}

function normalise(error: unknown): NormalisedError {
  if (isAppError(error)) {
    return {
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
      unexpected: error.status >= SERVER_ERROR_THRESHOLD,
    }
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      code: ErrorCode.VALIDATION_FAILED,
      message: 'Request validation failed',
      details: { issues: toFieldIssues(error) },
      unexpected: false,
    }
  }

  // A transaction the database or Prisma cancelled before commit: it ran past
  // its timeout (P2028 — "Transaction already closed … timeout") or lost a
  // deadlock (P2034). Rolled back, so nothing it did was kept, and the request
  // is safe to repeat. A 500 here told clients the opposite — that the outcome
  // was unknown — which is what made a checkout screen tell a buyer to go and
  // check whether their order existed.
  if (isAbortedTransaction(error)) {
    return {
      status: 503,
      code: ErrorCode.TRANSACTION_ABORTED,
      message:
        'The request took too long to complete and nothing was saved. Please try again.',
      details: { retryable: true },
      // Not `unexpected`, which would replace the message in production with a
      // generic one — this message is the useful part. Still logged at error
      // level below: a timeout is capacity or a slow query, and someone should
      // look.
      unexpected: false,
    }
  }

  // A missing or malformed environment variable is an operator error, not a
  // caller error: it must not leak the variable names to the client, but it
  // does need to be loud in the logs.
  if (error instanceof ConfigValidationError) {
    return {
      status: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: error.message,
      unexpected: true,
    }
  }

  return {
    status: 500,
    code: ErrorCode.INTERNAL_ERROR,
    message: error instanceof Error ? error.message : 'Unknown error',
    unexpected: true,
  }
}

/** Prisma error codes for a transaction that was cancelled before it committed. */
const ABORTED_TRANSACTION_CODES = new Set(['P2028', 'P2034'])

export function isAbortedTransaction(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return ABORTED_TRANSACTION_CODES.has(error.code)
  }
  // Seen as an unknown-request error on some engine versions, with no code.
  return (
    error instanceof Prisma.PrismaClientUnknownRequestError &&
    /Transaction (already closed|API error)|expired transaction|deadlock/i.test(
      error.message
    )
  )
}

/** Flattens a ZodError into the per-field list the forms render. */
export function toFieldIssues(error: ZodError): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }))
}
