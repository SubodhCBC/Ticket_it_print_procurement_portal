import { Redis } from 'ioredis'
import { getConfig } from '../config'

/**
 * A short-lived read-through cache for expensive reads.
 *
 * ---------------------------------------------------------------------------
 * What belongs in here, and what does not
 * ---------------------------------------------------------------------------
 * Only aggregates that a user reads and never writes: the reporting endpoints.
 * Nothing transactional is cached — a cart, an order, a stock level or a
 * permission set read from a cache is a correctness bug waiting for the moment
 * two people act on the same row.
 *
 * ---------------------------------------------------------------------------
 * Why the TTL is short and there is no invalidation
 * ---------------------------------------------------------------------------
 * Sixty seconds by default, and nothing ever busts a key. Invalidation would
 * mean every order placement, cancellation, dispatch and stocktake reaching in
 * to delete the right keys — a coupling that grows with every feature and fails
 * silently when one path forgets. A dashboard that is up to a minute behind is a
 * trade a finance team will make without noticing; a dashboard that is *wrong*
 * because an invalidation was missed is not.
 *
 * Set `CACHE_TTL_SECONDS=0`, or leave `REDIS_URL` unset, and every call becomes
 * a pass-through.
 *
 * ---------------------------------------------------------------------------
 * Redis being down is not an error
 * ---------------------------------------------------------------------------
 * A cache miss and a cache outage produce the same result: the value is
 * computed. Failures are logged once and swallowed, because a reporting page
 * that 500s when Redis restarts is worse than one that is briefly slower.
 */

/**
 * One connection per process, cached on `globalThis` for the same reason the
 * Prisma and S3 clients are — Next re-evaluates modules on every hot reload,
 * which would otherwise leak a socket per edit.
 */
const globalForRedis = globalThis as unknown as {
  cacheRedis?: Redis
  cacheWarned?: boolean
}

function client(): Redis | null {
  const { redis } = getConfig()
  if (!redis.url) return null

  if (!globalForRedis.cacheRedis) {
    globalForRedis.cacheRedis = new Redis(redis.url, {
      // The cache must never be the reason a request hangs: three attempts and
      // it falls through to the database.
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
      // Nothing here should keep the process alive on its own.
      lazyConnect: false,
    })
    // ioredis emits `error` on every failed reconnect; without a listener Node
    // treats it as an unhandled exception and takes the process down.
    globalForRedis.cacheRedis.on('error', warnOnce)
  }

  return globalForRedis.cacheRedis
}

/**
 * Returns the cached value, or computes and stores it.
 *
 * The key must already carry everything the value depends on — the actor's
 * account, the window, every filter. Building it is the caller's job because
 * only the caller knows what varies, and a key that forgets a dimension serves
 * one customer another's numbers.
 */
export async function through<T>(
  key: string,
  compute: () => Promise<T>
): Promise<T> {
  const ttlSeconds = getConfig().cache.ttlSeconds
  const redis = ttlSeconds > 0 ? client() : null
  if (!redis) return compute()

  const hit = await read<T>(redis, key)
  if (hit !== undefined) return hit

  const value = await compute()
  await write(redis, key, value, ttlSeconds)
  return value
}

async function read<T>(redis: Redis, key: string): Promise<T | undefined> {
  try {
    const raw = await redis.get(key)
    return raw === null ? undefined : (JSON.parse(raw) as T)
  } catch (error) {
    warnOnce(error)
    return undefined
  }
}

async function write(
  redis: Redis,
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch (error) {
    warnOnce(error)
  }
}

/** Logged once per process rather than per request, so an outage is not a flood. */
function warnOnce(error: unknown): void {
  if (globalForRedis.cacheWarned) return
  globalForRedis.cacheWarned = true
  console.warn(
    'Cache unavailable; falling through to the database. ' +
      (error instanceof Error ? error.message : String(error))
  )
}

/** Anything a cache key may be built from. */
export type CacheKeyPart = string | number | boolean | Date | null | undefined

/**
 * Builds a cache key from an actor's scope and a query.
 *
 * The account is always first and never optional: it is the dimension that must
 * never be missed, and putting it at the front makes a key that forgot it
 * obvious on sight.
 */
export function cacheKey(
  namespace: string,
  accountId: string,
  parts: Record<string, CacheKeyPart>
): string {
  // Sorted, so two callers passing the same filters in a different order share a
  // key rather than each computing their own copy.
  const encoded = Object.keys(parts)
    .sort()
    .map((name) => `${name}=${encodePart(parts[name])}`)
    .join('&')

  return `cache:${namespace}:${accountId}:${encoded}`
}

function encodePart(value: CacheKeyPart): string {
  if (value === undefined || value === null) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

/**
 * Liveness of the cache, for the readiness probe.
 *
 * Returns false rather than throwing when Redis is not configured at all: a
 * deployment without `REDIS_URL` is a supported configuration, not a fault, and
 * the probe reports it as skipped rather than down.
 */
export async function pingCache(): Promise<boolean> {
  const redis = client()
  if (!redis) return false
  await redis.ping()
  return true
}

/** True when a Redis URL is configured at all. */
export function isCacheConfigured(): boolean {
  return Boolean(getConfig().redis.url)
}
