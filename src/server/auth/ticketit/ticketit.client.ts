import { getConfig } from '../../config'
import { DependencyUnavailableError } from '../../utils/errors'

/**
 * The HTTP transport for the Ticket-IT API (the .NET service documented at
 * `/swagger/index.html`).
 *
 * It replaces the direct read of the legacy SQL Server database that used to
 * back authentication. The trade is deliberate: the API is the system that owns
 * these users, so it can answer "is this password correct" — something the
 * database could only be asked by re-implementing two of its hashing schemes
 * here.
 *
 * ---------------------------------------------------------------------------
 * Why everything here is defensive
 * ---------------------------------------------------------------------------
 * The published OpenAPI document types every request body and *no* response:
 * all 183 operations declare `200: "Success"` with no schema and no 4xx at all.
 * So nothing in this file may assume a shape it has not checked. What is known
 * comes from probing the live service:
 *
 *   - bad credentials answer **400**, not 401, with
 *     `{"hasError":true,"errorCode":0,"errorMessage":"Invalid Login Credentials or Password"}`
 *   - a missing or expired bearer token answers **401** with an empty body
 *   - `GET /api/health` answers `{"status":"healthy"}`
 *
 * Anything else is treated as an upstream failure rather than guessed at.
 */

/** The error envelope the service returns on a handled failure. */
interface TicketItErrorBody {
  readonly hasError?: boolean
  readonly errorCode?: number
  readonly errorMessage?: string
}

/**
 * A request that reached Ticket-IT and came back refused.
 *
 * Distinct from `DependencyUnavailableError`, which means the call never got an
 * answer at all. The login path needs to tell those apart: a refusal is the
 * user's wrong password (401 to the browser), an outage is ours (503).
 */
export class TicketItApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** `errorCode` from the envelope. Always 0 in everything observed so far. */
    readonly upstreamCode: number | null = null
  ) {
    super(message)
    this.name = 'TicketItApiError'
  }

  /** The service answers 400, not 401, when a login is rejected. */
  get isCredentialRejection(): boolean {
    return this.status === 400 || this.status === 401
  }
}

export interface TicketItRequest {
  /** Path below the origin, e.g. `/api/v1/Account/login`. */
  readonly path: string
  readonly method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /**
   * Sent as JSON, unless it is a `FormData` — then as `multipart/form-data`.
   * `ImageManagement/UploadImage` is the only operation that takes a multipart
   * body; everything else this client reaches is JSON.
   */
  readonly body?: unknown
  /**
   * Bearer token from `Account/login`. The OpenAPI document applies `Bearer`
   * security at the root, so every endpoint except login and the password-reset
   * pair needs one.
   */
  readonly token?: string
  /**
   * Overrides `TICKETIT_API_TIMEOUT_MS` for this call. The default is set for
   * small JSON requests and is far too short to push a file over.
   */
  readonly timeoutMs?: number
}

/** True when a base URL is configured at all. Mirrors the old `isLegacyConfigured`. */
export function isTicketItConfigured(): boolean {
  return Boolean(getConfig().ticketItApi.baseUrl)
}

function baseUrl(): string {
  const configured = getConfig().ticketItApi.baseUrl
  if (!configured) {
    throw new Error(
      'TICKETIT_API_BASE_URL is not set, but the Ticket-IT authentication path was reached. ' +
        'Either configure it or set TICKETIT_AUTH_ENABLED=false.'
    )
  }
  return configured
}

/**
 * Calls Ticket-IT and returns the parsed body.
 *
 * Returns `undefined` for an empty 2xx body rather than throwing: several
 * endpoints answer 200 with nothing, and a caller that wanted a value can say so
 * by checking. Throws `TicketItApiError` on a non-2xx and
 * `DependencyUnavailableError` when the call could not be completed.
 */
export async function ticketItRequest<T = unknown>(
  request: TicketItRequest
): Promise<T | undefined> {
  const { path, method = 'GET', body, token, timeoutMs } = request
  const url = `${baseUrl()}${path}`
  const isMultipart = body instanceof FormData

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Tunnel-Skip-Anti-Phishing-Page': '1',
  }
  if (token) headers.Authorization = `Bearer ${token}`
  // A multipart body gets no Content-Type here on purpose: only fetch knows the
  // boundary it generated, and a header set by hand would name the wrong one.
  if (body !== undefined && !isMultipart) {
    headers['Content-Type'] = 'application/json'
  }

  let response: Response
  try {
    response = await fetch(url, {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : isMultipart
            ? (body as FormData)
            : JSON.stringify(body),
      // A slow upstream must not hold an HTTP request open indefinitely — the
      // login answers 503 instead. Same reasoning as the old `socketTimeout` on
      // the legacy connection string.
      signal: AbortSignal.timeout(
        timeoutMs ?? getConfig().ticketItApi.timeoutMs
      ),
      // Ticket-IT is a private dependency of the server, never a browser
      // request; no cookies or cached responses should be involved.
      cache: 'no-store',
      redirect: 'follow',
    })
  } catch (error) {
    // DNS failure, TLS failure, connection refused, or the abort above. None of
    // them say anything about the credential that was offered.
    console.error(`Ticket-IT request failed: ${method} ${path}`, error)
    throw new DependencyUnavailableError('Ticket-IT API', { cause: error })
  }

  const text = await response.text()
  const parsed = parseJson(text)

  if (!response.ok) {
    throw new TicketItApiError(
      response.status,
      errorMessageFrom(parsed) ?? `Ticket-IT answered ${response.status}`,
      errorCodeFrom(parsed)
    )
  }

  // A 200 carrying `hasError: true` is the service reporting a handled failure
  // with a success status. Observed on the login endpoint's sibling routes, so
  // it is checked on every response rather than only on the non-2xx path.
  if (isErrorEnvelope(parsed)) {
    throw new TicketItApiError(
      response.status,
      errorMessageFrom(parsed) ?? 'Ticket-IT reported an error',
      errorCodeFrom(parsed)
    )
  }

  return parsed as T | undefined
}

/**
 * Parses a body that may not be JSON at all.
 *
 * The 401 from an unauthenticated call has an empty body, and some endpoints
 * return a bare quoted string. Neither should surface as a parse crash, so a
 * body that will not parse is handed back as its raw text.
 */
function parseJson(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed.length === 0) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isErrorEnvelope(value: unknown): boolean {
  return isRecord(value) && value.hasError === true
}

function errorMessageFrom(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined
  const body = value as TicketItErrorBody
  if (typeof body.errorMessage === 'string' && body.errorMessage.length > 0) {
    return body.errorMessage
  }
  // ASP.NET's own ProblemDetails, which is what an unhandled 400 looks like.
  const title = value.title
  return typeof title === 'string' && title.length > 0 ? title : undefined
}

function errorCodeFrom(value: unknown): number | null {
  if (!isRecord(value)) return null
  const code = (value as TicketItErrorBody).errorCode
  return typeof code === 'number' ? code : null
}

/**
 * Liveness probe, for the health endpoint.
 *
 * `/api/health` is the one operation on the service that needs no token, so it
 * reports reachability without a credential of our own.
 */
export async function pingTicketItApi(): Promise<void> {
  await ticketItRequest({ path: '/api/health' })
}
