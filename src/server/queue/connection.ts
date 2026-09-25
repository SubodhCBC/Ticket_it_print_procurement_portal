import type { ConnectionOptions } from 'bullmq'
import { getConfig } from '../config'

/**
 * Redis settings for BullMQ.
 *
 * `maxRetriesPerRequest: null` is not a preference — BullMQ requires it. With
 * ioredis's default a blocking `BRPOPLPUSH` is aborted mid-wait and the worker
 * dies silently, which looks exactly like a queue nobody is draining.
 *
 * Deliberately not the options object the cache uses. The cache wants to give up
 * quickly and fall through to the database; a worker wants to keep waiting.
 * Sharing one would force one of those behaviours onto the other.
 *
 * Written out against BullMQ's own `ConnectionOptions` rather than assembled
 * from ioredis's `RedisOptions`: the two packages ship different copies of those
 * types, and ioredis's allows `retryStrategy: null` where BullMQ's does not.
 */
export function queueConnection(): ConnectionOptions {
  return {
    url: requireRedisUrl(),
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    // A worker that cannot reach Redis should keep retrying, not crash-loop.
    retryStrategy: (attempt: number) => Math.min(attempt * 200, 5_000),
  }
}

/** True when a Redis URL is configured, i.e. when queueing is possible at all. */
export function isQueueEnabled(): boolean {
  return Boolean(getConfig().redis.url)
}

/**
 * The URL, or a thrown error.
 *
 * Callers that can carry on without a queue check `isQueueEnabled()` first; this
 * exists so the one that genuinely cannot — the worker — fails loudly at startup
 * rather than sitting there draining nothing.
 */
export function requireRedisUrl(): string {
  const { url } = getConfig().redis
  if (!url) {
    throw new Error(
      'REDIS_URL is not set. The worker has no queue to drain — set it, or do not run the worker.'
    )
  }
  return url
}

/** Namespaces every BullMQ key so several environments can share one Redis. */
export function queuePrefix(): string {
  return getConfig().redis.queuePrefix
}
