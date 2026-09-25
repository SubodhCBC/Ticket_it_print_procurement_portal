import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto'
import { Redis } from 'ioredis'
import { getConfig } from '../../config'
import {
  NzPostApiError,
  NzPostNotConfiguredError,
  NzPostUnavailableError,
} from './nzpost.errors'

/**
 * The OAuth 2.0 client-credentials token every NZ Post call carries.
 *
 * ---------------------------------------------------------------------------
 * Requested only on expiry
 * ---------------------------------------------------------------------------
 * NZ Post's guide is explicit that a token per call gets the application
 * rate-limited, and the SOW makes it a requirement. So a token is kept in memory
 * for this process and in Redis for every other one — the web server and the
 * worker share it — and only fetched when neither holds one that is still good.
 *
 * The lifetime comes from the response, never from a constant. The guide says
 * an hour; the token issued to this application on 2026-09-10 said 86399
 * seconds. A hard-coded hour would have been wrong in the safe direction today
 * and nothing guarantees which direction tomorrow.
 *
 * ---------------------------------------------------------------------------
 * Encrypted in Redis
 * ---------------------------------------------------------------------------
 * This token can create consignments billed to the client's NZ Post account for
 * a day. A Redis dump holding it in clear would be that capability, so it is
 * sealed with AES-256-GCM under a key derived from the client secret: rotating
 * the secret makes every stored token unreadable, which reads as "fetch a new
 * one" — the right outcome.
 *
 * Concurrent callers in one process share one in-flight request rather than
 * each asking for a token of their own.
 */

/** Dropped this long before NZ Post would refuse it. */
const EXPIRY_SKEW_SECONDS = 120

const FORMAT_VERSION = 'v1'

interface HeldToken {
  readonly token: string
  /** Epoch milliseconds, already skewed. */
  readonly expiresAt: number
}

const globalForToken = globalThis as unknown as {
  nzPostToken?: HeldToken
  nzPostTokenInFlight?: Promise<HeldToken>
  nzPostTokenRedis?: Redis
  nzPostTokenWarned?: boolean
}

/** A bearer token that is good for at least the skew. */
export async function getAccessToken(): Promise<string> {
  const held = globalForToken.nzPostToken
  if (held && held.expiresAt > Date.now()) return held.token

  globalForToken.nzPostTokenInFlight ??= obtainToken().finally(() => {
    globalForToken.nzPostTokenInFlight = undefined
  })

  const token = await globalForToken.nzPostTokenInFlight
  return token.token
}

/**
 * Forgets the token everywhere. Called when NZ Post refuses one it should have
 * accepted, so the next call fetches a fresh token instead of repeating a
 * refused one until it expires.
 */
export async function invalidateAccessToken(): Promise<void> {
  globalForToken.nzPostToken = undefined
  const redis = client()
  if (!redis) return
  try {
    await redis.del(redisKey())
  } catch (error) {
    warnOnce(error)
  }
}

/**
 * Fetches a token for the status endpoint and reports how it went, without
 * returning the token. Uses the cache like any other caller.
 */
export async function probeAccessToken(): Promise<
  | { readonly ok: true; readonly expiresInSeconds: number }
  | { readonly ok: false; readonly error: string }
> {
  try {
    await getAccessToken()
    const held = globalForToken.nzPostToken
    return {
      ok: true,
      expiresInSeconds: held
        ? Math.max(0, Math.round((held.expiresAt - Date.now()) / 1000))
        : 0,
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

// --- Internals ----------------------------------------------------------------

async function obtainToken(): Promise<HeldToken> {
  const cached = await readFromRedis()
  if (cached && cached.expiresAt > Date.now()) {
    globalForToken.nzPostToken = cached
    return cached
  }

  const fresh = await requestToken()
  globalForToken.nzPostToken = fresh
  await writeToRedis(fresh)
  return fresh
}

async function requestToken(): Promise<HeldToken> {
  const nz = getConfig().nzPost
  if (!nz.clientId || !nz.clientSecret) {
    throw new NzPostNotConfiguredError(
      'authentication',
      [
        nz.clientId ? null : 'NZPOST_CLIENT_ID',
        nz.clientSecret ? null : 'NZPOST_CLIENT_SECRET',
      ].filter((name): name is string => name !== null)
    )
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: nz.clientId,
    client_secret: nz.clientSecret,
  })

  let response: Response
  try {
    response = await fetch(nz.oauthUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body,
      signal: AbortSignal.timeout(nz.timeoutMs),
      cache: 'no-store',
    })
  } catch (error) {
    throw new NzPostUnavailableError('token', { cause: error })
  }

  const text = await response.text()
  let parsed: unknown
  try {
    parsed = text.trim() ? JSON.parse(text) : undefined
  } catch {
    parsed = undefined
  }

  const record =
    typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {}

  if (!response.ok) {
    // An OAuth server's error is `{ error, error_description }`, not NZ Post's
    // envelope. The description is safe to log; the request body is not.
    const description =
      typeof record.error_description === 'string'
        ? record.error_description
        : typeof record.error === 'string'
          ? record.error
          : null
    throw new NzPostApiError(
      response.status,
      [{ code: null, message: 'Token request refused', details: description }],
      null,
      'token'
    )
  }

  const token = record.access_token
  const expiresIn = Number(record.expires_in)
  if (typeof token !== 'string' || token.length === 0) {
    throw new NzPostApiError(
      502,
      [
        {
          code: null,
          message: 'Token response had no access_token',
          details: null,
        },
      ],
      null,
      'token'
    )
  }

  // A response with no usable lifetime is held for five minutes: long enough to
  // spare NZ Post a request per call, short enough to find out soon if the token
  // was in fact short-lived.
  const lifetime =
    Number.isFinite(expiresIn) && expiresIn > 0
      ? expiresIn
      : 300 + EXPIRY_SKEW_SECONDS

  return {
    token,
    expiresAt: Date.now() + Math.max(30, lifetime - EXPIRY_SKEW_SECONDS) * 1000,
  }
}

function client(): Redis | null {
  const { redis } = getConfig()
  if (!redis.url) return null

  if (!globalForToken.nzPostTokenRedis) {
    globalForToken.nzPostTokenRedis = new Redis(redis.url, {
      // A label job must not hang on Redis; failing through to a fresh token
      // request is always correct, only slightly more expensive.
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
    })
    globalForToken.nzPostTokenRedis.on('error', warnOnce)
  }
  return globalForToken.nzPostTokenRedis
}

/**
 * Keyed by a digest of the client id, so changing credentials never picks up
 * the previous application's token.
 */
function redisKey(): string {
  const { redis, nzPost } = getConfig()
  const digest = createHash('sha256')
    .update(nzPost.clientId ?? '')
    .digest('hex')
    .slice(0, 16)
  return `${redis.keyPrefix}nzpost-token:${digest}`
}

async function readFromRedis(): Promise<HeldToken | null> {
  const redis = client()
  if (!redis) return null
  try {
    const sealed = await redis.get(redisKey())
    return sealed ? open(sealed) : null
  } catch (error) {
    warnOnce(error)
    return null
  }
}

async function writeToRedis(held: HeldToken): Promise<void> {
  const redis = client()
  if (!redis) return
  const ttlSeconds = Math.floor((held.expiresAt - Date.now()) / 1000)
  if (ttlSeconds <= 0) return
  try {
    await redis.set(redisKey(), seal(held), 'EX', ttlSeconds)
  } catch (error) {
    warnOnce(error)
  }
}

function encryptionKey(): Buffer {
  return createHash('sha256')
    .update(`nzpost-token-cache:${getConfig().nzPost.clientSecret ?? ''}`)
    .digest()
}

function seal(held: HeldToken): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(held), 'utf8'),
    cipher.final(),
  ])
  return [
    FORMAT_VERSION,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.')
}

function open(sealed: string): HeldToken | null {
  const [version, iv, tag, ciphertext] = sealed.split('.')
  if (version !== FORMAT_VERSION || !iv || !tag || !ciphertext) return null
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      encryptionKey(),
      Buffer.from(iv, 'base64url')
    )
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
    const parsed = JSON.parse(plain) as Partial<HeldToken>
    return typeof parsed.token === 'string' &&
      typeof parsed.expiresAt === 'number'
      ? { token: parsed.token, expiresAt: parsed.expiresAt }
      : null
  } catch {
    return null
  }
}

function warnOnce(error: unknown): void {
  if (globalForToken.nzPostTokenWarned) return
  globalForToken.nzPostTokenWarned = true
  console.warn(
    'NZ Post token cache unavailable; tokens are kept per process instead. ' +
      (error instanceof Error ? error.message : String(error))
  )
}
