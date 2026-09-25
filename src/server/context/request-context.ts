import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * The three portals in the platform. Kept here rather than in a domain module
 * because the request context, route guards and logger all need it before any
 * feature module is loaded.
 */
export const Role = {
  ADMIN: 'ADMIN',
  HEAD_OFFICE: 'HEAD_OFFICE',
  SITE_USER: 'SITE_USER',
} as const

export type Role = (typeof Role)[keyof typeof Role]

/**
 * Where a user came from. Mirrors the Prisma `UserType` enum.
 *
 * Kept beside `Role` rather than in the authorization module because the two
 * are read together everywhere: an external user's effective permissions are
 * decided by both, so neither is usable without the other.
 */
export const UserType = {
  EXISTING: 'EXISTING',
  NEW: 'NEW',
  EXTERNAL: 'EXTERNAL',
} as const

export type UserType = (typeof UserType)[keyof typeof UserType]

export interface AuthenticatedActor {
  readonly userId: string
  readonly accountId: string
  /** Absent for ADMIN and account-wide HEAD_OFFICE users. */
  readonly siteId?: string
  readonly role: Role
  /** Decides the permission baseline together with `role` — external users
   *  never inherit a site user's rights. See basePermissionsFor(). */
  readonly userType: UserType
  readonly email: string
  readonly sessionId: string
}

/**
 * Ambient per-request state carried in AsyncLocalStorage. Anything that needs
 * the tenant — the tenant scope, the audit logger, the structured logger —
 * reads it from here instead of threading it through every call signature.
 */
export interface RequestContext {
  readonly requestId: string
  readonly startedAt: number
  readonly ip?: string
  readonly userAgent?: string
  /** Undefined on public routes (login, health, inbound webhooks). */
  readonly actor?: AuthenticatedActor
  /**
   * Set only when an ADMIN deliberately steps outside tenant scoping.
   * Every such request is written to the audit log.
   */
  readonly tenantScopeBypass?: boolean
}

/**
 * Ambient request state. Nothing outside this module touches the storage
 * directly — the helpers below are the whole public surface.
 *
 * Why AsyncLocalStorage instead of threading a context argument through every
 * service: the tenant id is needed by layers the caller never sees (the tenant
 * scope guard, the audit logger, the log formatter). Passing it by hand means
 * exactly one forgotten parameter becomes a cross-tenant data leak.
 *
 * This requires the Node.js runtime — every route handler that reaches the
 * server layer declares `export const runtime = 'nodejs'`, because the Edge
 * runtime has no async_hooks.
 */
const storage = new AsyncLocalStorage<RequestContext>()

export function runWithRequestContext<T>(
  context: RequestContext,
  fn: () => T
): T {
  return storage.run(context, fn)
}

/** Returns undefined outside a request — e.g. in a worker job or a CLI script. */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

export function requireRequestContext(): RequestContext {
  const context = storage.getStore()
  if (!context) {
    throw new Error(
      'No request context is active — did this run outside the request pipeline?'
    )
  }
  return context
}

/**
 * Attaches the authenticated actor to the context the route wrapper already
 * opened, once the bearer token has been verified.
 *
 * Mutates in place rather than calling `runWithRequestContext` with a new
 * object, because `AsyncLocalStorage.run` ends its scope as soon as its
 * callback returns — a guard that re-ran the context would lose the actor
 * before the handler ever executed. `RequestContext` is readonly to stop
 * casual writes; this is the single sanctioned exception, and it only ever
 * fills a field that was undefined.
 */
export function attachActor(actor: AuthenticatedActor): void {
  const context = storage.getStore()
  if (!context) {
    throw new Error('attachActor called outside a request context')
  }
  ;(
    context as { -readonly [K in keyof RequestContext]: RequestContext[K] }
  ).actor = actor
}

/** The active tenant, or undefined on public/unauthenticated routes. */
export function getCurrentAccountId(): string | undefined {
  return storage.getStore()?.actor?.accountId
}

export function getCurrentRequestId(): string | undefined {
  return storage.getStore()?.requestId
}
