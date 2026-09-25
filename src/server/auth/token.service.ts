import { createHash } from 'node:crypto'
import type { User } from '@prisma/client'
import { getConfig } from '../config'
import { prisma } from '../db/client'
import { UnauthenticatedError } from '../utils/errors'
import { createId, createSecretToken } from '../utils/ids'
import { asEnum } from '../db/column-types'
import type { Role, UserType } from '../context/request-context'
import {
  durationToSeconds,
  signAccessToken,
  type AccessTokenClaims,
} from '../utils/jwt'

export interface IssuedTokens {
  readonly accessToken: string
  readonly refreshToken: string
  readonly expiresIn: number
}

export interface TokenContext {
  readonly ip?: string
  readonly userAgent?: string
}

/**
 * Issues and rotates the token pair.
 *
 * Access tokens are stateless JWTs, short-lived, and never checked against the
 * database — that is the whole point of them. Refresh tokens are opaque random
 * strings stored as SHA-256 digests, so they can be revoked and so a dump of
 * `refresh_tokens` cannot be replayed. A refresh JWT would be neither.
 */

/**
 * SHA-256, not Argon2: the token is 256 bits of entropy we generated ourselves,
 * so it is not brute-forceable and needs no slow hash.
 */
function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function issueTokens(
  user: User,
  context: TokenContext = {}
): Promise<IssuedTokens> {
  return mint(user, createId('ses'), context)
}

async function mint(
  user: User,
  sessionId: string,
  context: TokenContext,
  rotatedFrom?: string
): Promise<IssuedTokens> {
  const config = getConfig()
  const accessTtl = durationToSeconds(config.auth.accessTtl)
  const refreshTtl = durationToSeconds(config.auth.refreshTtl)

  const claims: AccessTokenClaims = {
    sub: user.id,
    accountId: user.accountId,
    // Omitted rather than sent as null so the token stays small and the claim's
    // absence is the single meaning of "no primary site".
    ...(user.siteId ? { siteId: user.siteId } : {}),
    role: asEnum<Role>(user.role),
    userType: asEnum<UserType>(user.userType),
    email: user.email,
    sid: sessionId,
  }

  const accessToken = await signAccessToken(claims, accessTtl)

  const refreshToken = createSecretToken(32)
  const id = createId('rft')

  await prisma.refreshToken.create({
    data: {
      id,
      userId: user.id,
      tokenHash: digest(refreshToken),
      expiresAt: new Date(Date.now() + refreshTtl * 1000),
      ip: context.ip ?? null,
      userAgent: context.userAgent ?? null,
    },
  })

  if (rotatedFrom) {
    await prisma.refreshToken.update({
      where: { id: rotatedFrom },
      data: { revokedAt: new Date(), rotatedToId: id },
    })
  }

  return { accessToken, refreshToken, expiresIn: accessTtl }
}

/**
 * Exchanges a refresh token for a new pair.
 *
 * Reuse detection: presenting a token that has already been rotated means two
 * parties hold it, so the entire session is revoked rather than just refusing
 * this one call. Without that, a stolen token stays usable until it expires,
 * because the thief simply keeps rotating it.
 */
export async function rotateTokens(
  refreshToken: string,
  context: TokenContext = {}
): Promise<{ tokens: IssuedTokens; user: User }> {
  const existing = await prisma.refreshToken.findUnique({
    where: { tokenHash: digest(refreshToken) },
    include: { user: true },
  })

  if (!existing)
    throw new UnauthenticatedError('Refresh token is not recognised')

  if (existing.revokedAt) {
    console.warn(
      `Refresh token reuse detected for user ${existing.userId} — revoking all sessions.`
    )
    await revokeAllForUser(existing.userId)
    throw new UnauthenticatedError('Refresh token has already been used')
  }

  if (existing.expiresAt.getTime() <= Date.now()) {
    throw new UnauthenticatedError('Refresh token has expired')
  }

  // PENDING counts as not active: an invitation that was issued but never
  // accepted must not be refreshable into a live session.
  if (existing.user.status !== 'ACTIVE' || existing.user.deletedAt) {
    await revokeAllForUser(existing.userId)
    throw new UnauthenticatedError('Account is no longer active')
  }

  const tokens = await mint(
    existing.user,
    createId('ses'),
    context,
    existing.id
  )
  return { tokens, user: existing.user }
}

/** Logout. Idempotent: an unknown or already-revoked token is not an error. */
export async function revokeToken(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: digest(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  })
}

export async function revokeAllForUser(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  })
}
