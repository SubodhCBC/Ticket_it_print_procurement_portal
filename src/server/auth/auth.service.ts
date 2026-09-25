import type { User } from '@prisma/client'
import { getConfig } from '../config'
import { prisma } from '../db/client'
import {
  AppError,
  ErrorCode,
  ForbiddenError,
  UnauthenticatedError,
} from '../utils/errors'
import { hashPassword, needsRehash, verifyPassword } from '../utils/password'
import type { AuthenticatedUserRecord } from './auth.types'
import { authenticateWithTicketIt } from './ticketit/ticketit-auth.repository'
import { rememberTicketItToken } from './ticketit/ticketit-token.store'
import { resolvePermissions } from './permission.service'
import {
  issueTokens,
  revokeToken,
  rotateTokens,
  type IssuedTokens,
  type TokenContext,
} from './token.service'
import { syncFromUpstream } from './user-provisioning.service'
import { asEnum } from '../db/column-types'
import type { Role, UserType } from '../context/request-context'

export interface LoginResult {
  readonly tokens: IssuedTokens
  readonly user: User
  /** True when this login provisioned the user into the portal database. */
  readonly provisioned: boolean
  /** Which system actually verified the password. Surfaced for logging. */
  readonly verifiedAgainst: 'portal' | 'ticketit'
}

/** 401 with a distinct code so clients can tell a bad password from a lockout. */
class InvalidCredentialsError extends AppError {
  constructor() {
    super(ErrorCode.INVALID_CREDENTIALS, 401, 'Login or password is incorrect')
  }
}

/**
 * The authentication flow.
 *
 *   Ticket-IT user     login -> POST /api/v1/Account/login ->
 *                      GET /api/v1/User/GetCurrentLoginUserDetails ->
 *                      replicate the profile locally -> issue portal tokens
 *
 *   Portal-native user login -> local Argon2id verify -> issue portal tokens
 *
 * Ticket-IT is the sole authority for the credential of every user it owns.
 * There is no local hash to fall back to and none is written, so a password
 * changed upstream takes effect on the next sign-in with no window in which the
 * old one still works, and a profile change is picked up on every login rather
 * than after a staleness TTL.
 *
 * The cost is one HTTPS round trip per login, and no logins for those users
 * while the API is unreachable. That is the opposite trade to the one this file
 * used to make — it verified against a replicated hash and only consulted the
 * legacy database when that hash rejected — and it is deliberate: a portal that
 * can admit someone with a password their own organisation has already revoked
 * is the worse failure of the two.
 *
 * The portal issues its own access and refresh tokens either way. The upstream
 * JWT is never handed to the browser: every authorisation decision here —
 * permissions, tenant isolation, refresh rotation — is keyed on the portal user
 * id, which a Ticket-IT token knows nothing about.
 */
export async function login(
  loginValue: string,
  password: string,
  context: TokenContext = {}
): Promise<LoginResult> {
  const normalisedLogin = loginValue.trim().toLowerCase()

  const existing = await prisma.user.findUnique({
    where: { login: normalisedLogin },
  })

  // A user invited into the portal has no Ticket-IT counterpart to ask, and
  // holds the only copy of their own password hash.
  if (existing && isPortalNative(existing)) {
    return loginPortalNative(existing, password, context)
  }

  return loginWithTicketIt(loginValue.trim(), password, existing, context)
}

/**
 * Whose password this is.
 *
 * `legacyUserId` is the discriminator rather than `userType`: it is the column
 * that records whether there is an upstream account to verify against, and it is
 * written by provisioning rather than editable in the admin screens.
 *
 * An unknown login reaches the Ticket-IT path and costs a round trip, where a
 * portal-native rejection is answered from memory. That timing difference is a
 * narrow signal about which accounts exist here, and it is accepted for the same
 * reason the old code accepted it: closing it means either delaying every
 * rejection to the slowest path, or asking Ticket-IT about logins we already
 * know it has never heard of.
 */
function isPortalNative(user: User): boolean {
  return user.legacyUserId === null
}

// --- Ticket-IT users: the API is the authority ------------------------------

/**
 * Verifies the credential against Ticket-IT, replicates the profile it returns,
 * and issues portal tokens.
 *
 * `existing` is the local row that matched this login before the call, and is
 * used only to report whether the login created a user here. It can be null for
 * a user who does have a local row — if their login was renamed upstream the
 * lookup misses and the upsert, which matches on the upstream user id, still
 * finds them. The flag is telemetry, so that is not worth a second query.
 */
async function loginWithTicketIt(
  loginValue: string,
  password: string,
  existing: User | null,
  context: TokenContext
): Promise<LoginResult> {
  if (!getConfig().ticketItApi.authEnabled) {
    console.warn(
      `Rejecting the login for "${loginValue}": it is not a portal-native ` +
        'account and TICKETIT_AUTH_ENABLED is false, so there is nothing to ' +
        'verify it against.'
    )
    throw new InvalidCredentialsError()
  }

  // Unknown login and wrong password are the same error on purpose: telling an
  // unauthenticated caller which logins exist hands them a user list. A
  // Ticket-IT outage is *not* folded in here — the repository throws
  // DependencyUnavailableError for that, and answering "wrong password" to
  // someone whose password is fine would send them to reset a credential that
  // was never the problem.
  const authenticated = await authenticateWithTicketIt(loginValue, password)
  if (!authenticated) throw new InvalidCredentialsError()

  const user = await syncFromUpstream(authenticated.record)

  // Checked after the credential, so a suspended account cannot be told apart
  // from a non-existent one without valid credentials. Upstream has already
  // vouched for this person; this is the portal's own veto, which an
  // administrator can apply here without any access to Ticket-IT.
  assertUsable(user)

  // Kept server-side for the rest of the session so the portal can call
  // Ticket-IT as this user — the document library is scoped upstream by this
  // token and nothing else. Never fails the login: without it, only the library
  // is unavailable.
  await rememberTicketItToken(user.id, authenticated.token)

  const provisioned = existing === null
  console.info(
    `${provisioned ? 'First login' : 'Login'} for Ticket-IT user ` +
      `${authenticated.record.upstreamUserId}; replicated as ${user.id}.`
  )

  return {
    tokens: await issueTokens(user, context),
    user,
    provisioned,
    verifiedAgainst: 'ticketit',
  }
}

// --- Portal-native users: the portal database is the authority --------------

/**
 * Users invited into the portal, who have no Ticket-IT account. Their password
 * lives here and nowhere else, so this path never leaves the process — which is
 * also what keeps the seeded development logins and the verification suite
 * working with no API reachable.
 */
async function loginPortalNative(
  user: User,
  password: string,
  context: TokenContext
): Promise<LoginResult> {
  if (user.deletedAt) throw new InvalidCredentialsError()

  // An invited user who has not accepted yet has no hash to check against.
  const matches =
    user.passwordHash !== null &&
    (await verifyPassword(password, user.passwordHash))

  if (!matches) throw new InvalidCredentialsError()

  assertUsable(user)

  const refreshed = await rehashIfNeeded(user, password)

  return {
    tokens: await issueTokens(refreshed, context),
    user: refreshed,
    provisioned: false,
    verifiedAgainst: 'portal',
  }
}

// --- Shared helpers ---------------------------------------------------------

/**
 * Upgrades a stored hash when the Argon2 cost parameters have been raised since
 * it was written. A successful login is the only moment the plaintext is in
 * hand, so it is the only moment this can be done.
 */
async function rehashIfNeeded(user: User, password: string): Promise<User> {
  if (user.passwordHash === null || !needsRehash(user.passwordHash)) return user

  return prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(password) },
  })
}

/** The portal's own veto on an account, applied after the credential passes. */
function assertUsable(user: User): void {
  if (user.deletedAt || user.status !== 'ACTIVE') {
    throw new ForbiddenError(
      'This account has been deactivated. Contact your administrator.'
    )
  }
}

// --- Session lifecycle ------------------------------------------------------

export async function refresh(
  refreshToken: string,
  context: TokenContext = {}
): Promise<LoginResult> {
  const { tokens, user } = await rotateTokens(refreshToken, context)
  return { tokens, user, provisioned: false, verifiedAgainst: 'portal' }
}

export async function logout(refreshToken: string): Promise<void> {
  await revokeToken(refreshToken)
}

export async function findActiveUser(userId: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id: userId } })

  if (!user || user.deletedAt || user.status !== 'ACTIVE') {
    throw new UnauthenticatedError('Account is no longer active')
  }
  return user
}

/**
 * The user plus the account, site and effective permissions every session
 * response carries.
 *
 * Kept here rather than in the route handlers because login, refresh and
 * /auth/me must all describe a session the same way — a client that got
 * permissions from one of the three and not the others would silently lose them
 * the moment its access token rotated.
 */
export async function describeUser(
  user: User
): Promise<AuthenticatedUserRecord> {
  const [account, site, effective] = await Promise.all([
    prisma.account.findUniqueOrThrow({
      where: { id: user.accountId },
      select: {
        id: true,
        name: true,
        accountCode: true,
        poPrefix: true,
        requirePoNumber: true,
        poFormat: true,
      },
    }),
    user.siteId
      ? prisma.site.findUnique({
          where: { id: user.siteId },
          select: {
            id: true,
            code: true,
            name: true,
            poPrefix: true,
            poRequired: true,
            poFormat: true,
            monthlyBudget: true,
          },
        })
      : Promise.resolve(null),
    resolvePermissions({
      userId: user.id,
      accountId: user.accountId,
      role: asEnum<Role>(user.role),
      userType: asEnum<UserType>(user.userType),
    }),
  ])

  return {
    user,
    account,
    site,
    permissions: [...effective.accountWide].sort(),
  }
}

/** Records the successful login. Never allowed to fail the request. */
export async function markLoggedIn(userId: string): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    })
  } catch (error) {
    console.warn(
      `Could not record lastLoginAt for ${userId}`,
      error instanceof Error ? error.message : String(error)
    )
  }
}
