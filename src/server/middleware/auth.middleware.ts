import type { NextRequest } from 'next/server'
import { getConfig } from '../config'
import {
  attachActor,
  runWithRequestContext,
  UserType,
  type AuthenticatedActor,
  type RequestContext,
  type Role,
} from '../context/request-context'
import {
  resolvePermissions,
  type EffectivePermissions,
} from '../auth/permission.service'
import type { Permission } from '../auth/permissions'
import { ForbiddenError, UnauthenticatedError } from '../utils/errors'
import { createRequestId } from '../utils/ids'
import { extractBearerToken, verifyAccessToken } from '../utils/jwt'
import { toErrorResponse } from './error.middleware'

/**
 * The route wrapper. Between them, `route` and `publicRoute` do the work that
 * four separate pieces of NestJS wiring used to:
 *
 *   RequestContextMiddleware -> opens the AsyncLocalStorage scope
 *   JwtAuthGuard             -> verifies the bearer token, attaches the actor
 *   AuthorizationGuard       -> enforces roles and permissions
 *   AllExceptionsFilter      -> turns any throw into the error envelope
 *
 * Every handler under `app/api` is expected to go through one of them; a route
 * that does neither has no request context, so the tenant scope and the audit
 * logger would both fail closed.
 */

export type RouteParams = Record<string, string | string[]>

export interface RouteContext<P extends RouteParams = RouteParams> {
  readonly request: NextRequest
  readonly params: P
  readonly requestId: string
}

export interface AuthedRouteContext<
  P extends RouteParams = RouteParams,
> extends RouteContext<P> {
  readonly actor: AuthenticatedActor
  /**
   * The actor's effective permissions, resolved on demand.
   *
   * Lazy because it costs a query: a route guarded by role alone, or by
   * authentication alone, must not pay for a grant lookup it never reads. The
   * result is cached per request, so calling this more than once is free.
   */
  permissions(): Promise<EffectivePermissions>
}

export interface RouteOptions {
  /** The caller's role must be one of these. */
  readonly roles?: readonly Role[]
  /** The caller must hold every one of these. */
  readonly permissions?: readonly Permission[]
}

type NextRouteHandler<P extends RouteParams> = (
  request: NextRequest,
  segment: { params: Promise<P> }
) => Promise<Response>

function newRequestContext(request: NextRequest): RequestContext {
  const config = getConfig()

  // `x-forwarded-for` is honoured only when TRUST_PROXY is on — behind no proxy
  // it is a client-supplied header and trusting it would let anyone forge the
  // origin of their own session.
  const forwarded = config.security.trustProxy
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    : undefined

  return {
    requestId: request.headers.get('x-request-id') ?? createRequestId(),
    startedAt: Date.now(),
    ...(forwarded ? { ip: forwarded } : {}),
    ...(request.headers.get('user-agent')
      ? { userAgent: request.headers.get('user-agent') as string }
      : {}),
  }
}

/**
 * Authenticates the bearer token and fills in the context the wrapper opened
 * while the request was still anonymous, so the tenant scope, audit logger and
 * log formatter all see the actor for the rest of this request.
 */
async function authenticate(request: NextRequest): Promise<AuthenticatedActor> {
  const token = extractBearerToken(request.headers.get('authorization'))
  if (!token)
    throw new UnauthenticatedError(
      'Authorization header is missing or malformed'
    )

  const claims = await verifyAccessToken(token)

  const actor: AuthenticatedActor = {
    userId: claims.sub,
    accountId: claims.accountId,
    ...(claims.siteId ? { siteId: claims.siteId } : {}),
    role: claims.role,
    // Tokens minted before userType was a claim carry none. Reading them as
    // EXISTING matches what every such token actually belonged to — external
    // users did not exist yet — and the claim becomes mandatory naturally as
    // the old access tokens expire.
    userType: claims.userType ?? UserType.EXISTING,
    email: claims.email,
    sessionId: claims.sid,
  }

  attachActor(actor)
  return actor
}

async function enforce(
  actor: AuthenticatedActor,
  options: RouteOptions,
  permissions: () => Promise<EffectivePermissions>
): Promise<void> {
  const requiredRoles = options.roles
  if (
    requiredRoles &&
    requiredRoles.length > 0 &&
    !requiredRoles.includes(actor.role)
  ) {
    throw new ForbiddenError(
      'Your role does not have access to this resource',
      {
        details: { requiredRoles, role: actor.role },
      }
    )
  }

  const required = options.permissions
  if (required && required.length > 0) {
    const effective = await permissions()
    const missing = required.filter((permission) => !effective.has(permission))

    if (missing.length > 0) {
      // The missing permission names are safe to return: they are a fixed,
      // public vocabulary, and telling an integrator which permission their
      // token lacks saves a support round trip. No grant data is exposed.
      throw new ForbiddenError(
        'You do not have permission to perform this action',
        {
          details: { missingPermissions: missing },
        }
      )
    }
  }
}

/**
 * A route that requires a valid access token.
 *
 * Declaring neither `roles` nor `permissions` is allowed and means "any
 * authenticated user" — being authenticated is itself an authorization
 * decision for most read endpoints, and requiring an annotation on every
 * handler would make the annotations noise nobody reads. Anything that mutates
 * state or crosses a portal boundary is expected to declare what it needs.
 */
export function route<P extends RouteParams = RouteParams>(
  options: RouteOptions,
  handler: (context: AuthedRouteContext<P>) => Promise<Response> | Response
): NextRouteHandler<P> {
  return async (request, segment) => {
    const context = newRequestContext(request)

    return runWithRequestContext(context, async () => {
      try {
        const actor = await authenticate(request)

        let cached: Promise<EffectivePermissions> | undefined
        const permissions = () => (cached ??= resolvePermissions(actor))

        await enforce(actor, options, permissions)

        return await handler({
          request,
          params: await segment.params,
          requestId: context.requestId,
          actor,
          permissions,
        })
      } catch (error) {
        return toErrorResponse(error, {
          requestId: context.requestId,
          path: new URL(request.url).pathname,
          isProduction: safeIsProduction(),
        })
      }
    })
  }
}

/** A route reachable without a token — login, refresh, logout, health. */
export function publicRoute<P extends RouteParams = RouteParams>(
  handler: (context: RouteContext<P>) => Promise<Response> | Response
): NextRouteHandler<P> {
  return async (request, segment) => {
    const context = newRequestContext(request)

    return runWithRequestContext(context, async () => {
      try {
        return await handler({
          request,
          params: await segment.params,
          requestId: context.requestId,
        })
      } catch (error) {
        return toErrorResponse(error, {
          requestId: context.requestId,
          path: new URL(request.url).pathname,
          isProduction: safeIsProduction(),
        })
      }
    })
  }
}

/**
 * Reading the environment must not itself throw inside the error handler — a
 * bad `.env` would then produce an unhandled rejection instead of the 500 that
 * explains it.
 */
function safeIsProduction(): boolean {
  try {
    return getConfig().app.isProduction
  } catch {
    return process.env.NODE_ENV === 'production'
  }
}
