import type { UpstreamUserRecord } from '../upstream-user'
import { toUpstreamUserRecord } from './ticketit-user.mapper'
import {
  TicketItApiError,
  ticketItRequest,
  type TicketItRequest,
} from './ticketit.client'

/**
 * The Ticket-IT `Account` and `User` endpoints, expressed as the two questions
 * the portal actually asks: "is this credential good, and who does it belong
 * to", and "reset this person's password".
 *
 * This is the only module permitted to talk to Ticket-IT's auth surface, the
 * same way `legacy-user.repository.ts` was the only one permitted to query the
 * legacy database directly.
 */

export interface TicketItAuthentication {
  /**
   * The upstream JWT.
   *
   * Never handed to the browser: the portal issues its own session tokens, which
   * is what every downstream check — permissions, tenant isolation, refresh
   * rotation — is keyed on. It is returned for the profile lookup in the same
   * login, and so login can keep it server-side (`ticketit-token.store.ts`) for
   * the features that call Ticket-IT on the user's behalf — today the document
   * library.
   */
  readonly token: string
  readonly record: UpstreamUserRecord
}

/**
 * Verifies a credential against Ticket-IT and returns the user behind it.
 *
 * Two calls, because neither alone is enough: `Account/login` proves the
 * password, and `User/GetCurrentLoginUserDetails` is what returns the profile —
 * the client, role, region and branch the portal replicates.
 *
 * Resolves `null` when the credential was refused. That is deliberately not an
 * exception: a wrong password is the expected outcome of a login attempt, and
 * the caller turns it into the same opaque 401 an unknown login gets. A
 * Ticket-IT outage *is* thrown, as `DependencyUnavailableError`.
 */
export async function authenticateWithTicketIt(
  login: string,
  password: string
): Promise<TicketItAuthentication | null> {
  const trimmed = login.trim()
  if (trimmed.length === 0 || password.length === 0) return null

  let payload: unknown
  try {
    payload = await ticketItRequest({
      path: '/api/v1/Account/login',
      method: 'POST',
      body: { login: trimmed, password },
    })
  } catch (error) {
    // The service answers 400 — not 401 — with
    // `{"hasError":true,"errorMessage":"Invalid Login Credentials or Password"}`
    // for both an unknown login and a wrong password.
    if (error instanceof TicketItApiError && error.isCredentialRejection) {
      return null
    }
    throw error
  }

  const token = extractToken(payload)
  if (!token) {
    // The credential was accepted but the response did not carry a bearer token
    // where any of the usual keys would put it. That is a contract change
    // upstream, not a user error, so it must not be reported as a bad password.
    throw new TicketItApiError(
      502,
      'Ticket-IT accepted the credential but returned no bearer token. ' +
        `Response keys: ${describeKeys(payload)}`
    )
  }

  const jwtClaims = decodeJwtPayload(token)

  let profile: unknown = undefined
  try {
    profile = await fetchCurrentUser(token)
  } catch (error) {
    // If Ticket-IT's GetCurrentLoginUserDetails 500s (e.g. missing RendererApi settings on dev server),
    // fallback gracefully to the claims already packed inside the JWT token.
    console.warn(
      'GetCurrentLoginUserDetails call failed on Ticket-IT. Using claims from JWT token:',
      error instanceof Error ? error.message : error
    )
    profile = jwtClaims
  }

  return {
    token,
    // The login response and JWT claims are passed as the fallback source:
    record: toUpstreamUserRecord(profile ?? jwtClaims, {
      ...(isRecord(payload) ? payload : {}),
      ...(isRecord(jwtClaims) ? jwtClaims : {}),
    }),
  }
}

/**
 * Signs a *service* account in and returns only its bearer token.
 *
 * The portal's own credential, not a person's, so no profile is fetched and no
 * portal user is provisioned — nobody signs in as this account. Its one use is
 * the operator's own files in the document library, which belong to the portal
 * rather than to any tenant; see `dam/dam-service-account.ts` for why that is
 * the one place a token other than the caller's own is allowed.
 *
 * Throws rather than returning null on a refusal. A wrong password here is a
 * misconfigured deployment, which has to be loud — unlike a person's wrong
 * password, which is the expected outcome of a login form.
 */
export async function authenticateTicketItServiceAccount(
  login: string,
  password: string
): Promise<string> {
  const payload = await ticketItRequest({
    path: '/api/v1/Account/login',
    method: 'POST',
    body: { login: login.trim(), password },
  })

  const token = extractToken(payload)
  if (!token) {
    throw new TicketItApiError(
      502,
      'Ticket-IT accepted the service credential but returned no bearer ' +
        `token. Response keys: ${describeKeys(payload)}`
    )
  }
  return token
}

/**
 * `GET /api/v1/User/GetCurrentLoginUserDetails` — the caller's own
 * `UserViewModel`, identified by the bearer token rather than by an id.
 */
async function fetchCurrentUser(token: string): Promise<unknown> {
  const profile = await ticketItRequest({
    path: '/api/v1/User/GetCurrentLoginUserDetails',
    token,
  })

  if (profile === undefined) {
    throw new TicketItApiError(
      502,
      'Ticket-IT returned an empty profile for a token it had just issued'
    )
  }
  return profile
}

// --- Password reset ---------------------------------------------------------

/**
 * Starts a reset in Ticket-IT for a user whose password lives there.
 *
 * Ticket-IT sends the email and mints the token; the portal is only the button.
 * Nothing is returned even on success, and an upstream refusal is swallowed for
 * the same reason the portal's own flow always answers 204 — an endpoint that
 * behaved differently for a known and an unknown login would let anyone test
 * who has an account.
 */
export async function requestTicketItPasswordReset(
  userName: string
): Promise<void> {
  await sendQuietly({
    path: '/api/v1/Account/SendForgotPasswordEmail',
    method: 'POST',
    body: { userName: userName.trim() },
  })
}

/**
 * Completes a reset against Ticket-IT with the token from its email.
 *
 * `confirmPassword` is required by the upstream contract and is sent equal to
 * `password`: the portal has already matched the two in its own validation, and
 * a second field the caller could get wrong adds nothing.
 *
 * Unlike the request step this reports failure — the user is looking at the
 * form and an expired link has to say so.
 */
export async function completeTicketItPasswordReset(
  passwordResetToken: string,
  password: string
): Promise<void> {
  await ticketItRequest({
    path: '/api/v1/Account/ResetPassword',
    method: 'POST',
    body: { passwordResetToken, password, confirmPassword: password },
  })
}

/** Fire-and-report-only. Used where failure must not reach the caller. */
async function sendQuietly(request: TicketItRequest): Promise<void> {
  try {
    await ticketItRequest(request)
  } catch (error) {
    console.warn(
      `Ticket-IT ${request.path} failed; the caller was told nothing.`,
      error instanceof Error ? error.message : String(error)
    )
  }
}

// --- Token extraction -------------------------------------------------------

/**
 * The keys a bearer token could plausibly arrive under.
 *
 * A list rather than one name because the OpenAPI document types no response at
 * all for `Account/login`, so the field name is not published anywhere. The
 * order is preference, not likelihood — the first match wins.
 */
const TOKEN_KEYS = [
  'token',
  'accessToken',
  'access_token',
  'jwt',
  'jwtToken',
  'bearerToken',
  'authToken',
  'idToken',
] as const

/** Wrappers an ASP.NET service commonly nests its payload inside. */
const ENVELOPE_KEYS = [
  'data',
  'result',
  'response',
  'payload',
  'value',
] as const

/**
 * Finds the JWT in a login response of unknown shape.
 *
 * Checks the well-known names at the top level, then one level down inside a
 * wrapper, then falls back to recognising a bare JWT string — three dot-
 * separated base64url segments — wherever it appears. The last case covers a
 * service that returns the token as the whole body, which is common enough in
 * .NET controllers that returning `Ok(token)` is a one-liner.
 */
function extractToken(payload: unknown): string | undefined {
  if (typeof payload === 'string') {
    return looksLikeJwt(payload) ? payload : undefined
  }
  if (!isRecord(payload)) return undefined

  const direct = pickToken(payload)
  if (direct) return direct

  for (const key of ENVELOPE_KEYS) {
    const nested = payload[key]
    if (isRecord(nested)) {
      const found = pickToken(nested)
      if (found) return found
    }
    if (typeof nested === 'string' && looksLikeJwt(nested)) return nested
  }

  // Last resort: any string value anywhere in the top level that is shaped like
  // a JWT. Cheap, and it means an unexpected field name still works.
  for (const value of Object.values(payload)) {
    if (typeof value === 'string' && looksLikeJwt(value)) return value
  }

  return undefined
}

function pickToken(source: Record<string, unknown>): string | undefined {
  for (const key of TOKEN_KEYS) {
    const value = source[key]
    if (typeof value === 'string' && value.trim().length > 0)
      return value.trim()
  }
  return undefined
}

/** Three non-empty base64url segments. Not a validation — only a recognition. */
function looksLikeJwt(value: string): boolean {
  const parts = value.trim().split('.')
  return (
    parts.length === 3 && parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Names the keys of an unexpected payload, for the error above. Never values. */
function describeKeys(payload: unknown): string {
  if (isRecord(payload)) return Object.keys(payload).join(', ') || '(none)'
  return typeof payload
}

/**
 * Decodes the JWT token payload to extract claims directly if user profile fetch fails.
 */
function decodeJwtPayload(token: string): Record<string, unknown> | undefined {
  try {
    const parts = token.trim().split('.')
    if (parts.length !== 3) return undefined
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const jsonStr = Buffer.from(base64, 'base64').toString('utf-8')
    const parsed = JSON.parse(jsonStr)
    if (!isRecord(parsed)) return undefined

    let userRoles = parsed.UserRoles
    if (typeof userRoles === 'string') {
      try {
        userRoles = JSON.parse(userRoles)
      } catch {}
    }

    return {
      userId: parsed.UserId ?? parsed.userId,
      login: parsed.Login ?? parsed.login,
      email: parsed.Email ?? parsed.email,
      clientName: parsed.ClientName ?? parsed.clientName,
      userRoles: userRoles ?? parsed.userRoles,
      roleName: parsed.role ?? parsed.Role ?? parsed.RoleName,
      regionName: parsed.RegionName ?? parsed.regionName,
      isHeadOfficeAdmin:
        parsed.role === 'Admin' ||
        parsed.Role === 'Admin' ||
        Boolean(parsed.isHeadOfficeAdmin),
      ...parsed,
    }
  } catch {
    return undefined
  }
}
