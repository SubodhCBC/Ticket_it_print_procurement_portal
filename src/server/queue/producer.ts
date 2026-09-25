import { Queue, type JobsOptions } from 'bullmq'
import { isQueueEnabled, queueConnection, queuePrefix } from './connection'
import { STANDARD_RETRY } from './job-options'
import type { QueueName } from './queue-names'

/**
 * The producer side of the queues. Anything that wants work done later goes
 * through here; nothing outside this directory constructs a `Queue`.
 *
 * ---------------------------------------------------------------------------
 * One instance per queue, cached on `globalThis`
 * ---------------------------------------------------------------------------
 * The same reason the Prisma, S3 and Redis clients are: Next re-evaluates route
 * modules on every hot reload, and a fresh `Queue` per evaluation leaks a Redis
 * connection per edit until the dev server runs out of file descriptors.
 *
 * ---------------------------------------------------------------------------
 * Queueing is optional, and that is a supported configuration
 * ---------------------------------------------------------------------------
 * With no `REDIS_URL` there is no queue, and `enqueue` says so by returning
 * false rather than throwing. Each caller then decides what that means for it:
 * mail sends directly, derivatives stay PENDING for the sweep, and an import
 * refuses outright, because an import that silently never runs is worse than
 * one that says it cannot.
 */

const globalForQueues = globalThis as unknown as {
  bullQueues?: Map<string, Queue>
}

function registry(): Map<string, Queue> {
  if (!globalForQueues.bullQueues) globalForQueues.bullQueues = new Map()
  return globalForQueues.bullQueues
}

/** The queue, or null when Redis is not configured. */
export function getQueue(name: QueueName): Queue | null {
  if (!isQueueEnabled()) return null

  const queues = registry()
  const existing = queues.get(name)
  if (existing) return existing

  const queue = new Queue(name, {
    connection: queueConnection(),
    prefix: queuePrefix(),
    defaultJobOptions: STANDARD_RETRY,
  })

  // ioredis emits `error` on every failed reconnect; without a listener Node
  // treats it as an unhandled exception and takes the process down — including
  // the HTTP server, over a queue nothing was waiting on.
  queue.on('error', (error) => {
    console.error(`Queue "${name}" connection error: ${error.message}`)
  })

  queues.set(name, queue)
  return queue
}

/**
 * Adds a job.
 *
 * Returns false when there is no queue to add to. Throws when there *is* one
 * and the add failed — that is a real outage, and swallowing it would turn a
 * Redis blip into work that quietly never happened.
 */
export async function enqueue(
  name: QueueName,
  jobName: string,
  data: unknown,
  options: JobsOptions = STANDARD_RETRY
): Promise<boolean> {
  const queue = getQueue(name)
  if (!queue) return false

  await queue.add(jobName, data, options)
  return true
}

/**
 * Closes every producer connection. For the worker's shutdown path and for
 * scripts; a request never calls this.
 */
export async function closeQueues(): Promise<void> {
  const queues = registry()
  await Promise.all([...queues.values()].map((queue) => queue.close()))
  queues.clear()
}
