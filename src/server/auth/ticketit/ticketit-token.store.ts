import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import { Redis } from 'ioredis'
import { getConfig } from '../../config'
import { DependencyUnavailableError } from '../../utils/errors'
import { durationToSeconds } from '../../utils/jwt'

/**
 * Keeps a Ticket-IT user's upstream JWT on the server for the life of that JWT,
 * so the portal can call Ticket-IT on their behalf after login.
 *
 * The first caller is the document library: Ticket-IT's ImageManagement API
 * decides which client's images to return from the bearer token alone, so the
 * user's own token is the only credential that scopes it correctly. A service
 * account would show every tenant the same client's library.
 *
 * ---------------------------------------------------------------------------
 * Why Redis, keyed by user, encrypted
 * ---------------------------------------------------------------------------
 * Redis because the token is disposable: losing it costs the user one sign-in,
 * not data, and it needs no migration. Keyed by portal user id rather than by
 * session, because the session id changes on every refresh rotation — and every
 * token one user holds is scoped to the same upstream client anyway.
 *
 * Encrypted (AES-256-GCM, bound to the user id) because a bearer token in a
 * Redis dump is a live Ticket-IT login. The key is derived from
 * JWT_REFRESH_SECRET, so rotating that secret makes every stored token
 * unreadable — which reads as "sign in again", the right outcome.
 *
 * The token never reaches the browser. It is readable only by a request that
 * already carries a valid portal access token for the same user.
 */

const globalForTokenStore = globalThis as unknown as {
  ticketItTokenRedis?: Redis
  ticketItTokenWarned?: boolean
}

const KEY_NAMESPACE = 'ticketit-token'
const FORMAT_VERSION = 'v1'

/**
 * Taken off the upstream expiry, so a token is dropped slightly before Ticket-IT
 * would refuse it rather than failing the request that happens to straddle it.
 */
const EXPIRY_SKEW_SECONDS = 30

/** One connection per process, surviving hot reloads — see cache.service.ts. */
function client(): Redis | null {
  const { redis } = getConfig()
  if (!redis.url) return null

  if (!globalForTokenStore.ticketItTokenRedis) {
    globalForTokenStore.ticketItTokenRedis = new Redis(redis.url, {
      // A sign-in must not hang on Redis: three attempts and it gives up.
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    })
    // Without a listener ioredis's reconnect errors take the process down.
    globalForTokenStore.ticketItTokenRedis.on('error', warnOnce)
  }

  return globalForTokenStore.ticketItTokenRedis
}

/** True when there is anywhere to keep a token at all. */
export function isTicketItTokenStoreConfigured(): boolean {
  return Boolean(getConfig().redis.url)
}

/**
 * Stores the token until it expires. Never throws.
 *
 * Called on the login path, where a failure here must not refuse a sign-in the
 * credential check already passed: the user loses the document library for this
 * session, and nothing else.
 */
export async function rememberTicketItToken(
  userId: string,
  token: string
): Promise<void> {
  const redis = client()
  if (!redis) {
    warnOnce(new Error('REDIS_URL is not set'))
    return
  }

  const ttlSeconds = ttlFor(token)
  if (ttlSeconds <= 0) return

  try {
    await redis.set(keyFor(userId), seal(userId, token), 'EX', ttlSeconds)
  } catch (error) {
    warnOnce(error)
  }
}

/**
 * The stored token, or null when there is none to use.
 *
 * Null covers every reason the user has to sign in again — never stored,
 * expired, or sealed under a secret that has since rotated. A Redis outage is
 * *not* folded in: telling someone to sign in again when that would not help
 * sends them round a loop, so it throws as a 503 instead.
 */
export async function recallTicketItToken(
  userId: string
): Promise<string | null> {
  const redis = client()
  if (!redis) return null

  let sealed: string | null
  try {
    sealed = await redis.get(keyFor(userId))
  } catch (error) {
    throw new DependencyUnavailableError('The session store', { cause: error })
  }
  if (sealed === null) return null

  const token = open(userId, sealed)
  if (token === null) await forgetTicketItToken(userId)
  return token
}

/** Drops the token, e.g. once Ticket-IT has refused it. Never throws. */
export async function forgetTicketItToken(userId: string): Promise<void> {
  const redis = client()
  if (!redis) return

  try {
    await redis.del(keyFor(userId))
  } catch (error) {
    warnOnce(error)
  }
}

// --- Internals ----------------------------------------------------------------

function keyFor(userId: string): string {
  return `${KEY_NAMESPACE}:${userId}`
}

/**
 * Seconds until the token should be dropped.
 *
 * From the JWT's own `exp` when it has one, capped at the portal's refresh TTL:
 * nothing can use the token once the portal session behind it is gone. A token
 * with no readable expiry is kept for that cap, and dropped earlier by the first
 * request Ticket-IT refuses.
 */
function ttlFor(token: string): number {
  const cap = Math.floor(durationToSeconds(getConfig().auth.refreshTtl))
  const expiresAt = readExpiry(token)
  if (expiresAt === null) return cap

  const remaining =
    Math.floor(expiresAt - Date.now() / 1000) - EXPIRY_SKEW_SECONDS
  return Math.min(remaining, cap)
}

/** The `exp` claim, read without verifying — Ticket-IT verifies its own tokens. */
function readExpiry(token: string): number | null {
  const payload = token.split('.')[1]
  if (!payload) return null

  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    )
    if (typeof claims !== 'object' || claims === null) return null
    const exp = (claims as Record<string, unknown>).exp
    return typeof exp === 'number' && Number.isFinite(exp) ? exp : null
  } catch {
    return null
  }
}

function encryptionKey(): Buffer {
  return createHash('sha256')
    .update(`ticketit-token-store:${getConfig().auth.refreshSecret}`)
    .digest()
}

/**
 * `v1.<iv>.<tag>.<ciphertext>`, base64url.
 *
 * The user id is authenticated data, so a value copied onto another user's key
 * fails to open rather than handing one user another's Ticket-IT session.
 */
function seal(userId: string, token: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(userId, 'utf8'))
  const ciphertext = Buffer.concat([
    cipher.update(token, 'utf8'),
    cipher.final(),
  ])

  return [
    FORMAT_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

function open(userId: string, sealed: string): string | null {
  const [version, iv, tag, ciphertext] = sealed.split('.')
  if (version !== FORMAT_VERSION || !iv || !tag || !ciphertext) return null

  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(iv, 'base64url')
    )
    decipher.setAAD(Buffer.from(userId, 'utf8'))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

/** Logged once per process, so an outage is not a line per sign-in. */
function warnOnce(error: unknown): void {
  if (globalForTokenStore.ticketItTokenWarned) return
  globalForTokenStore.ticketItTokenWarned = true
  console.warn(
    'Ticket-IT token store unavailable; Ticket-IT users can sign in but cannot ' +
      'open the document library. ' +
      (error instanceof Error ? error.message : String(error))
  )
}
