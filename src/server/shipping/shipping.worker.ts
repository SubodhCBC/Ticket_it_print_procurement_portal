import { UnrecoverableError, type BackoffStrategy, type Job } from 'bullmq'
import { getConfig } from '../config'
import { getQueue } from '../queue/producer'
import { withJobAttempt } from './integration-calls'
import { QueueName } from '../queue/queue-names'
import { isShippingEnabled } from './nzpost/nzpost.settings'
import { processLabelJob, TerminalShippingError } from './shipments.service'
import {
  LabelJobSchema,
  ShippingJob,
  TrackOrderJobSchema,
} from './shipping.queue'
import {
  flagUnscannedLabels,
  pollDueTracking,
  refreshOrderTracking,
} from './tracking.service'

/**
 * The consumer side of the `shipping` queue, and its schedules. Wired up by
 * `src/worker/index.ts`; nothing in a request imports this.
 */

/**
 * SHIPPING_RETRY's spacing: one minute, fifteen minutes, two hours, twenty
 * hours. Quick enough that a blip does not keep staff waiting for a label,
 * spread enough that five attempts cover roughly a day of NZ Post being down.
 */
const NZPOST_BACKOFF_MS = [
  60_000,
  15 * 60_000,
  2 * 60 * 60_000,
  20 * 60 * 60_000,
]

export const shippingBackoffStrategy: BackoffStrategy = (
  attemptsMade,
  type
) => {
  if (type !== 'nzpost') return 0
  return (
    NZPOST_BACKOFF_MS[attemptsMade - 1] ?? NZPOST_BACKOFF_MS.at(-1) ?? 60_000
  )
}

const SCHEDULE_TRACKING = 'shipping-tracking-poll'
const SCHEDULE_RECONCILE = 'shipping-labels-reconcile'

export async function processShippingJob(job: Job): Promise<unknown> {
  // Every carrier call the job makes is recorded as this attempt, so a retried
  // job's calls count towards the retry volume integration health reports.
  return withJobAttempt(job.attemptsMade + 1, () => runShippingJob(job))
}

async function runShippingJob(job: Job): Promise<unknown> {
  switch (job.name) {
    case ShippingJob.LABEL: {
      const { shipmentId } = LabelJobSchema.parse(job.data)
      try {
        return await processLabelJob(shipmentId, {
          number: job.attemptsMade + 1,
          max: job.opts.attempts ?? 1,
        })
      } catch (error) {
        // BullMQ retries anything thrown unless it is told not to. A request NZ
        // Post has refused on its merits will be refused the same way four more
        // times, a day apart.
        if (error instanceof TerminalShippingError) {
          throw new UnrecoverableError(error.message)
        }
        throw error
      }
    }

    case ShippingJob.TRACK_ORDER: {
      const { orderId } = TrackOrderJobSchema.parse(job.data)
      return refreshOrderTracking(orderId)
    }

    case ShippingJob.TRACK_POLL:
      return pollDueTracking()

    case ShippingJob.RECONCILE_LABELS:
      return flagUnscannedLabels()

    default:
      // Left alone rather than failed, for the same reason the render worker
      // does: a job this build does not know may belong to a newer one.
      console.debug(`[shipping] ignoring job "${job.name}".`)
      return null
  }
}

/**
 * Registers the tracking poll and the daily reconciliation, or removes them
 * when shipping is switched off. Upserted, so every worker start converges on
 * the configured interval instead of adding a second schedule.
 */
export async function registerShippingSchedules(): Promise<void> {
  const queue = getQueue(QueueName.SHIPPING)
  if (!queue) return

  if (!isShippingEnabled()) {
    await queue.removeJobScheduler(SCHEDULE_TRACKING)
    await queue.removeJobScheduler(SCHEDULE_RECONCILE)
    console.info('[shipping] NZ Post is disabled; tracking schedules removed.')
    return
  }

  const pollMinutes = getConfig().nzPost.trackingPollMinutes
  await queue.upsertJobScheduler(
    SCHEDULE_TRACKING,
    { every: pollMinutes * 60_000 },
    { name: ShippingJob.TRACK_POLL, data: {} }
  )
  await queue.upsertJobScheduler(
    SCHEDULE_RECONCILE,
    { every: 24 * 60 * 60_000 },
    { name: ShippingJob.RECONCILE_LABELS, data: {} }
  )
  console.info(
    `[shipping] tracking poll every ${pollMinutes} min; unscanned-label check daily.`
  )
}
