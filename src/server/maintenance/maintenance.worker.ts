import type { Job } from 'bullmq'
import { getQueue } from '../queue/producer'
import { QueueName } from '../queue/queue-names'
import { prisma } from '../db/client'
import { purgeUnusedOneOffAddresses } from './one-off-addresses'

/**
 * Scheduled housekeeping on the MAINTENANCE queue.
 *
 * The queue was declared for "orphan assets, expired sessions, stale carts" and
 * had no consumer until the first job arrived. Each job is dispatched on its
 * name, so the next one is a case here rather than a second worker on the same
 * queue — BullMQ hands a job to exactly one worker, and a second consumer would
 * quietly take some of these.
 */
export const MaintenanceJob = {
  PURGE_ONE_OFF_ADDRESSES: 'addresses.purge-one-offs',
  PURGE_INTEGRATION_CALLS: 'integration-calls.purge',
} as const

const SCHEDULE_PURGE_ONE_OFF_ADDRESSES = 'maintenance-purge-one-off-addresses'
const SCHEDULE_PURGE_INTEGRATION_CALLS = 'maintenance-purge-integration-calls'

/**
 * How long integration call records are kept. Integration health reads the last
 * day and the last week; ninety days leaves room to look back at an incident
 * without the table growing with every checkout for seven years.
 */
const INTEGRATION_CALL_RETENTION_DAYS = 90

export async function processMaintenanceJob(job: Job): Promise<unknown> {
  switch (job.name) {
    case MaintenanceJob.PURGE_ONE_OFF_ADDRESSES:
      return { removed: await purgeUnusedOneOffAddresses() }
    case MaintenanceJob.PURGE_INTEGRATION_CALLS: {
      const { count } = await prisma.integrationCall.deleteMany({
        where: {
          occurredAt: {
            lt: new Date(
              Date.now() - INTEGRATION_CALL_RETENTION_DAYS * 86_400_000
            ),
          },
        },
      })
      return { removed: count }
    }
    default:
      // A name this build does not know — left alone rather than failed, so a
      // job queued by a newer deploy is not burned through its retries here.
      console.debug(`[maintenance] ignoring job "${job.name}".`)
      return null
  }
}

/**
 * Registers the daily jobs. Upserted, so every worker start converges on one
 * schedule instead of adding another.
 */
export async function registerMaintenanceSchedules(): Promise<void> {
  const queue = getQueue(QueueName.MAINTENANCE)
  if (!queue) return

  await queue.upsertJobScheduler(
    SCHEDULE_PURGE_ONE_OFF_ADDRESSES,
    { every: 24 * 60 * 60_000 },
    { name: MaintenanceJob.PURGE_ONE_OFF_ADDRESSES, data: {} }
  )
  await queue.upsertJobScheduler(
    SCHEDULE_PURGE_INTEGRATION_CALLS,
    { every: 24 * 60 * 60_000 },
    { name: MaintenanceJob.PURGE_INTEGRATION_CALLS, data: {} }
  )
  console.info(
    '[maintenance] unused one-off address and old integration call purges daily.'
  )
}
