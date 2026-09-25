import { getConfig } from '../../config'
import {
  NzPostApiError,
  NzPostNotConfiguredError,
  NzPostUnavailableError,
  type NzPostErrorItem,
} from './nzpost.errors'
import { noteHttpRetry } from '../integration-calls'
import { getAccessToken, invalidateAccessToken } from './nzpost.token'

/**
 * The HTTP transport for NZ Post's shipping APIs.
 *
 * Every request carries two credentials, and the guide mentions only one of
 * them: `Authorization: Bearer <token>` and a `client_id` header, which every
 * operation in every downloaded spec marks as required.
 *
 * ---------------------------------------------------------------------------
 * Where requests go
 * ---------------------------------------------------------------------------
 * `NZPOST_API_BASE_URL` plus a per-API base path. The paths default to NZ Post's
 * documented ones — from the downloaded specs for four APIs, and from NZ Post's
 * documentation pages for ParcelPickUp and ParcelTrack, whose specs point at
 * MuleSoft's mock server.
 *
 * ---------------------------------------------------------------------------
 * Retries
 * ---------------------------------------------------------------------------
 * `interactive` retries a read up to three times in about two seconds, for the
 * checkout calls a person is waiting on (SOW §7.2: three attempts for
 * interactive calls). Writes are never retried here: `POST /labels` and
 * `POST /bookings` have no idempotency key on NZ Post's side, so a retry after a
 * timeout can create a second consignment. The label job owns that decision and
 * checks the shipment row before it sends again.
 */

export type NzPostApi =
  | 'parcelAddress'
  | 'shippingOptions'
  | 'parcelLabel'
  | 'collectionAddress'
  | 'parcelPickup'
  | 'parcelTrack'

type QueryValue = string | number | boolean | undefined | null

export interface NzPostRequest {
  readonly api: NzPostApi
  /** Below the API's base path, starting with `/`. */
  readonly path: string
  readonly method?: 'GET' | 'POST' | 'DELETE'
  /** Arrays repeat the key, which is how ParcelTrack takes several references. */
  readonly query?: Record<string, QueryValue | readonly string[]>
  readonly body?: unknown
  /** A name for logs and errors: `ParcelLabel status`. */
  readonly operation: string
  readonly retry?: 'none' | 'interactive'
}

const INTERACTIVE_DELAYS_MS = [300, 1_200]

/** Calls NZ Post and returns the parsed JSON body. */
export async function nzPostJson<T>(request: NzPostRequest): Promise<T> {
  const response = await send(request, 'application/json')
  return (await readJson(response, request.operation)) as T
}

/** Calls NZ Post for a document — the label PDF. */
export async function nzPostBinary(
  request: NzPostRequest,
  accept: string
): Promise<{ readonly body: Buffer; readonly contentType: string }> {
  const response = await send(request, accept)
  const contentType = response.headers.get('content-type') ?? ''

  // A JSON body where a document was asked for is NZ Post explaining why there
  // is no document.
  if (contentType.includes('json')) {
    await readJson(response, request.operation)
    throw new NzPostApiError(
      502,
      [
        {
          code: null,
          message: `Expected ${accept}, received JSON`,
          details: null,
        },
      ],
      null,
      request.operation
    )
  }

  return {
    body: Buffer.from(await response.arrayBuffer()),
    contentType,
  }
}

// --- Internals ----------------------------------------------------------------

async function send(request: NzPostRequest, accept: string): Promise<Response> {
  const delays =
    request.retry === 'interactive' && (request.method ?? 'GET') === 'GET'
      ? INTERACTIVE_DELAYS_MS
      : []

  for (let attempt = 0; ; attempt += 1) {
    try {
      return await sendOnce(request, accept, false)
    } catch (error) {
      const retryable =
        error instanceof NzPostUnavailableError ||
        (error instanceof NzPostApiError && error.transient)
      const delay = delays[attempt]
      if (!retryable || delay === undefined) throw error
      noteHttpRetry()
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
}

async function sendOnce(
  request: NzPostRequest,
  accept: string,
  isRetryAfterRefusedToken: boolean
): Promise<Response> {
  const nz = getConfig().nzPost
  const url = buildUrl(request)
  const token = await getAccessToken()

  const headers: Record<string, string> = {
    Accept: accept,
    Authorization: `Bearer ${token}`,
    client_id: nz.clientId ?? '',
  }
  if (request.body !== undefined) headers['Content-Type'] = 'application/json'
  if (nz.userName) headers.user_name = nz.userName
  if (request.api === 'parcelLabel' && nz.accountNumber) {
    headers.account_number = nz.accountNumber
  }

  let response: Response
  try {
    response = await fetch(url, {
      method: request.method ?? 'GET',
      headers,
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
      signal: AbortSignal.timeout(nz.timeoutMs),
      cache: 'no-store',
      redirect: 'follow',
    })
  } catch (error) {
    console.error(
      `NZ Post request failed: ${request.method ?? 'GET'} ${request.api}${request.path}`,
      error instanceof Error ? error.message : error
    )
    throw new NzPostUnavailableError(request.operation, { cause: error })
  }

  // A 401 means the token was refused — revoked, or issued before a credential
  // change. One fresh token, one more try; a second 401 is a real refusal.
  if (response.status === 401 && !isRetryAfterRefusedToken) {
    await response.body?.cancel()
    await invalidateAccessToken()
    noteHttpRetry()
    return sendOnce(request, accept, true)
  }

  if (!response.ok) {
    const parsed = parseBody(await response.text())
    throw new NzPostApiError(
      response.status,
      errorsFrom(parsed),
      messageIdFrom(parsed),
      request.operation
    )
  }

  return response
}

async function readJson(
  response: Response,
  operation: string
): Promise<unknown> {
  const parsed = parseBody(await response.text())

  // A 2xx with `success: false` is NZ Post reporting a handled failure with a
  // success status. A batch where only some references fail is different: the
  // ParcelTrack example answers `success: true` with an `errors` list on the
  // failing result, and the caller reads those.
  if (isRecord(parsed) && parsed.success === false) {
    throw new NzPostApiError(
      422,
      errorsFrom(parsed),
      messageIdFrom(parsed),
      operation
    )
  }
  return parsed
}

function buildUrl(request: NzPostRequest): string {
  const nz = getConfig().nzPost
  const basePath = nz.paths[request.api]
  const missing = [
    nz.apiBaseUrl ? null : 'NZPOST_API_BASE_URL',
    basePath ? null : pathVariable(request.api),
  ].filter((name): name is string => name !== null)

  if (missing.length > 0) {
    throw new NzPostNotConfiguredError(request.operation, missing)
  }

  const url = new URL(`${nz.apiBaseUrl}${basePath}${request.path}`)
  for (const [key, value] of Object.entries(request.query ?? {})) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, item)
    } else {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function pathVariable(api: NzPostApi): string {
  return `NZPOST_${api.toUpperCase()}_PATH`
}

function parseBody(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The spec examples wrap some bodies in `{ "value": ... }` — an artefact of how
 * the examples were exported — so both shapes are read.
 */
function unwrap(value: unknown): unknown {
  return isRecord(value) && isRecord(value.value) ? value.value : value
}

function errorsFrom(value: unknown): NzPostErrorItem[] {
  const body = unwrap(value)
  if (!isRecord(body) || !Array.isArray(body.errors)) {
    return typeof body === 'string' && body
      ? [{ code: null, message: body.slice(0, 300), details: null }]
      : []
  }
  return body.errors.filter(isRecord).map((error) => ({
    code:
      error.code === undefined || error.code === null
        ? null
        : String(error.code),
    message: typeof error.message === 'string' ? error.message : null,
    details: typeof error.details === 'string' ? error.details : null,
  }))
}

function messageIdFrom(value: unknown): string | null {
  const body = unwrap(value)
  return isRecord(body) && typeof body.message_id === 'string'
    ? body.message_id
    : null
}
