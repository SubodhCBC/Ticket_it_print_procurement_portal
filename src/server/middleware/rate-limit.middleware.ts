import type { NextRequest } from 'next/server'
import { getConfig } from '../config'
import { RateLimitedError } from '../utils/errors'

/**
 * A fixed-window rate limiter for the credential endpoints.
 *
 * **In-memory, and therefore per-instance.** The NestJS API used
 * `@nestjs/throttler` backed by Redis, so a limit of 10/min was 10 across the
 * whole fleet. Here the counters live in this process, which means N instances
 * allow N times the configured limit. That is correct for a single-instance
 * deployment and for local development, and it is a real gap the moment the app
 * is scaled horizontally or deployed to a serverless platform where every
 * request may land in a fresh isolate.
 *
 * Replacing the map below with a Redis INCR + EXPIRE is the whole fix; the
 * REDIS_URL is already in config for it. Until then this is a speed bump
 * against online guessing, not a fleet-wide control.
 */

interface Window {
  count: number
  resetAt: number
}

const windows = new Map<string, Window>()

/** Keeps the map from growing without bound on a long-lived process. */
function sweep(now: number): void {
  if (windows.size < 1000) return
  for (const [key, window] of windows) {
    if (window.resetAt <= now) windows.delete(key)
  }
}

/**
 * The caller's identity for limiting purposes.
 *
 * `x-forwarded-for` is honoured only when TRUST_PROXY is on — behind no proxy
 * it is a client-supplied header, and trusting it would let an attacker rotate
 * it to get an unlimited number of fresh buckets.
 */
function clientKey(request: NextRequest): string {
  const config = getConfig()
  const forwarded = config.security.trustProxy
    ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    : undefined

  return forwarded || request.headers.get('x-real-ip') || 'unknown'
}

/**
 * Consumes one unit of the caller's budget, throwing 429 when it is spent.
 *
 * A tighter limit than the global one applies to credential endpoints:
 * RATE_LIMIT_AUTH_MAX (10/min) rather than the 120/min everything else gets,
 * because those are the only routes where an attacker gets to guess.
 */
export function enforceRateLimit(
  request: NextRequest,
  bucket: 'auth' | 'default',
  scope = 'global'
): void {
  const config = getConfig()
  const limit =
    bucket === 'auth'
      ? config.security.rateLimit.authMax
      : config.security.rateLimit.max
  const ttlMs = config.security.rateLimit.ttlSeconds * 1000

  const now = Date.now()
  sweep(now)

  const key = `${bucket}:${scope}:${clientKey(request)}`
  const existing = windows.get(key)

  if (!existing || existing.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + ttlMs })
    return
  }

  existing.count += 1
  if (existing.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
    throw new RateLimitedError('Too many requests — try again shortly.', {
      details: { retryAfterSeconds: retryAfter },
    })
  }
}

/** Test-only: drops every counter. */
export function resetRateLimits(): void {
  windows.clear()
}
