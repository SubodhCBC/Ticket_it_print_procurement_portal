import { SignJWT, jwtVerify } from 'jose'
import { getConfig } from '../config'
import type { Role, UserType } from '../context/request-context'
import { UnauthenticatedError } from './errors'

/** Claims carried in the access token. Kept small — it travels on every request. */
export interface AccessTokenClaims {
  /** The portal user id (`usr_…`), not the legacy integer id. */
  readonly sub: string
  readonly accountId: string
  /** The user's primary site, absent for ADMIN and account-wide HEAD_OFFICE. */
  readonly siteId?: string
  readonly role: Role
  /** Needed alongside `role` to derive the permission baseline. */
  readonly userType: UserType
  readonly email: string
  /** Ties the access token to the refresh-token family it was minted from. */
  readonly sid: string
}

/**
 * HS256, matching what `@nestjs/jwt` signed with in the API this was ported
 * from — an access token minted by the old service still verifies here, so the
 * two can run side by side during a cutover.
 */
const ALGORITHM = 'HS256'

/** `15m`, `900s`, `30d` — already validated by the env schema. */
export function durationToSeconds(duration: string): number {
  const match = /^(\d+)(ms|s|m|h|d)$/.exec(duration)
  if (!match) throw new Error(`Unparseable duration: ${duration}`)

  const value = Number(match[1])
  const unit = match[2]
  const multipliers: Record<string, number> = {
    ms: 0.001,
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  }
  return Math.floor(
    value * (multipliers[unit as keyof typeof multipliers] ?? 1)
  )
}

function accessSecret(): Uint8Array {
  return new TextEncoder().encode(getConfig().auth.accessSecret)
}

export async function signAccessToken(
  claims: AccessTokenClaims,
  expiresInSeconds: number
): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000)

  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + expiresInSeconds)
    .sign(accessSecret())
}

/**
 * Verifies signature and expiry only — no database round trip, which is what
 * keeps this cheap enough to run on every request. The cost is a window of up
 * to JWT_ACCESS_TTL (15m) during which a deactivated user's token still works;
 * the refresh path re-checks the account, so the window is bounded by the
 * access TTL rather than the refresh TTL.
 */
export async function verifyAccessToken(
  token: string
): Promise<AccessTokenClaims> {
  try {
    const { payload } = await jwtVerify(token, accessSecret(), {
      algorithms: [ALGORITHM],
    })
    return payload as unknown as AccessTokenClaims
  } catch {
    throw new UnauthenticatedError('Access token is invalid or has expired')
  }
}

export function extractBearerToken(
  header: string | null | undefined
): string | undefined {
  if (!header) return undefined

  const [scheme, value] = header.split(' ')
  if (!scheme || !value) return undefined
  if (scheme.toLowerCase() !== 'bearer') return undefined

  const token = value.trim()
  return token.length > 0 ? token : undefined
}
