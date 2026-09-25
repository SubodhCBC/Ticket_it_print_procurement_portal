import { NextResponse } from 'next/server'
import type { ErrorCode } from './errors'

/**
 * The single response shape for every failure the API produces. Frontend and
 * integration partners can rely on this being stable across all endpoints.
 *
 * Byte-for-byte the envelope the NestJS exception filter produced, because the
 * client already parses it — see `src/services/api.service.ts`.
 */
export interface ErrorEnvelope {
  readonly error: {
    /** Stable machine-readable code — branch on this. */
    readonly code: ErrorCode
    /** Human-readable, safe to display. Never contains internals. */
    readonly message: string
    /** Optional structured context, e.g. per-field validation failures. */
    readonly details?: Record<string, unknown>
  }
  readonly meta: {
    /** Correlates the response with server logs. */
    readonly requestId: string
    readonly timestamp: string
    readonly path: string
  }
}

export interface FieldIssue {
  readonly path: string
  readonly message: string
  readonly code?: string
}

/** The request id is echoed on every response so a user can quote it. */
export const REQUEST_ID_HEADER = 'X-Request-Id'

/**
 * A successful JSON response.
 *
 * `Cache-Control: no-store` by default: every one of these routes is
 * tenant-scoped, and a shared cache that kept one account's order list would
 * serve it to the next. A route that genuinely is public overrides it.
 */
export function ok<T>(
  data: T,
  init: {
    status?: number
    requestId?: string
    headers?: Record<string, string>
  } = {}
): NextResponse {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    ...init.headers,
  }
  if (init.requestId) headers[REQUEST_ID_HEADER] = init.requestId

  return NextResponse.json(data, { status: init.status ?? 200, headers })
}

/** 204, which by definition carries no body. */
export function noContent(requestId?: string): NextResponse {
  const headers: Record<string, string> = { 'Cache-Control': 'no-store' }
  if (requestId) headers[REQUEST_ID_HEADER] = requestId

  return new NextResponse(null, { status: 204, headers })
}
