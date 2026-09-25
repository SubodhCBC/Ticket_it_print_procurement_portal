import { Worker, type Job, type Processor, type WorkerOptions } from 'bullmq'
import {
  DerivativeJobSchema,
  DERIVATIVE_JOB_NAME,
  generateDerivatives,
  sweepPendingDerivatives,
} from '@/server/catalog/asset-derivative.service'
import {
  ImportJobPayloadSchema,
  runImport,
} from '@/server/catalog/product-import.service'
import { getConfig } from '@/server/config'
import { prisma } from '@/server/db/client'
import { recipientOf, renderMailJob } from '@/server/mail/mail.renderer'
import { sendMail } from '@/server/mail/mail.service'
import {
  processMaintenanceJob,
  registerMaintenanceSchedules,
} from '@/server/maintenance/maintenance.worker'
import { queueConnection, queuePrefix } from '@/server/queue/connection'
import { closeQueues } from '@/server/queue/producer'
import { QueueName } from '@/server/queue/queue-names'
import {
  processShippingJob,
  registerShippingSchedules,
  shippingBackoffStrategy,
} from '@/server/shipping/shipping.worker'

/**
 * The background worker.
 *
 * ---------------------------------------------------------------------------
 * Why this is a separate process
 * ---------------------------------------------------------------------------
 * The NestJS original ran its processors inside the API for want of a second
 * deployment. Under Next that is worse, not equivalent: the same process serves
 * React pages, so a ten-thousand-row import or a 40-megapixel resize would be
 * competing with page renders for the event loop and for memory. Everything
 * slow, memory-hungry or retryable lives here instead.
 *
 * It shares the codebase and nothing else. It has no HTTP server, no request
 * context and no tenant scope of its own — each job carries whatever identity it
 * needs, which is why `runImport` takes an actor from the job row rather than
 * from a context that would be empty here.
 *
 * Run it with `npm run worker`, alongside `next start` rather than instead of
 * it. With no REDIS_URL it refuses to start, because a worker that silently
 * drains nothing is the failure this whole file exists to avoid.
 */

const config = getConfig()

/** Workers are held so shutdown can close them. */
const workers: Worker[] = []

function start(
  name: QueueName,
  concurrency: number,
  processor: Processor,
  extra: Pick<WorkerOptions, 'settings'> = {}
): Worker {
  const worker = new Worker(name, processor, {
    connection: queueConnection(),
    prefix: queuePrefix(),
    concurrency,
    ...extra,
  })

  // BullMQ swallows worker errors unless something listens. Without this a
  // failing job is invisible until somebody notices the email never arrived.
  worker.on('failed', (job: Job | undefined, error: Error) => {
    const attempts = job
      ? `${job.attemptsMade}/${job.opts.attempts ?? 1}`
      : 'unknown'
    console.error(
      `[${name}] job ${job?.id ?? '?'} ("${job?.name ?? '?'}") failed on attempt ` +
        `${attempts}: ${error.message}`
    )
  })

  worker.on('error', (error) => {
    // Connection-level trouble, not a job failure. Logged rather than fatal:
    // ioredis reconnects on its own and the retry strategy keeps trying.
    console.error(`[${name}] worker error: ${error.message}`)
  })

  console.info(`[${name}] draining, concurrency ${concurrency}.`)
  workers.push(worker)
  return worker
}

// --- email -------------------------------------------------------------------
//
// Rendered here rather than by the producer, so a fixed template applies to
// everything still on the queue, and so a single-use token never sits in Redis
// inside a rendered body.

start(QueueName.EMAIL, config.worker.emailConcurrency, async (job) => {
  await sendMail({
    to: recipientOf(job.data),
    ...renderMailJob(job.name, job.data),
  })
})

// --- catalogue import --------------------------------------------------------
//
// Serial by default. An import is a long run of writes keyed on SKU, and two
// runs of the same file in parallel would have the second report as skipped what
// the first had just created — which reads as data loss to whoever uploaded it.

start(QueueName.IMPORT, config.worker.importConcurrency, async (job) => {
  // Parsed with the same schema the producer used. A job left in Redis from
  // before a deploy can carry a shape this build does not understand, and that
  // should be a clean failure rather than a TypeError halfway through.
  const { jobId } = ImportJobPayloadSchema.parse(job.data)
  await runImport(jobId)
})

// --- render ------------------------------------------------------------------
//
// The only consumer on this queue, deliberately. BullMQ hands each job to
// exactly one worker, so a second worker on `render` elsewhere would quietly eat
// these jobs and mark them complete. Anything new that needs the queue — the
// template builder's CMYK PDF, for one — dispatches from here on the job name
// rather than by adding a worker. The name is still checked rather than assumed,
// for that same eventual second kind of job: an unrecognised name is left alone,
// not failed.

start(QueueName.RENDER, config.worker.renderConcurrency, async (job) => {
  if (job.name !== DERIVATIVE_JOB_NAME) {
    console.debug(`[render] ignoring job "${job.name}".`)
    return
  }

  const { assetId, target } = DerivativeJobSchema.parse(job.data)
  await generateDerivatives(assetId, target)
})

// --- shipping ----------------------------------------------------------------
//
// NZ Post labels, tracking polls and the daily unscanned-label check. The
// backoff strategy is what SHIPPING_RETRY's `nzpost` type refers to: without it
// registered here BullMQ would retry those jobs immediately, five times in a
// row, against a carrier that is down.

start(
  QueueName.SHIPPING,
  config.worker.shippingConcurrency,
  processShippingJob,
  { settings: { backoffStrategy: shippingBackoffStrategy } }
)

void registerShippingSchedules().catch((error: unknown) => {
  console.error(
    'Could not register the shipping schedules: ' +
      (error instanceof Error ? error.message : String(error))
  )
})

// --- maintenance -------------------------------------------------------------
//
// Daily housekeeping. One at a time: nothing here is urgent, and every job is a
// bulk statement that should not run alongside another of its kind.

start(QueueName.MAINTENANCE, 1, processMaintenanceJob)

void registerMaintenanceSchedules().catch((error: unknown) => {
  console.error(
    'Could not register the maintenance schedules: ' +
      (error instanceof Error ? error.message : String(error))
  )
})

// --- startup sweep -----------------------------------------------------------
//
// Every image attached while there was no worker was recorded PENDING precisely
// so this would find it. Bounded, and failures are logged rather than fatal — a
// worker that cannot sweep should still drain the queue it was started for.

void sweepPendingDerivatives().catch((error: unknown) => {
  console.error(
    'Could not sweep pending derivatives on startup: ' +
      (error instanceof Error ? error.message : String(error))
  )
})

// --- shutdown ----------------------------------------------------------------

let shuttingDown = false

async function shutdown(signal: string): Promise<void> {
  // A second Ctrl-C should not start a second shutdown over the top of the
  // first, which is how in-flight jobs get abandoned mid-write.
  if (shuttingDown) return
  shuttingDown = true

  console.info(`${signal} received; finishing in-flight jobs.`)

  // `close()` waits for what is running to finish rather than killing it. A job
  // interrupted halfway is not necessarily safe to retry — an import is
  // idempotent, but only from the top.
  await Promise.all(workers.map((worker) => worker.close()))
  await closeQueues()
  await prisma.$disconnect()

  console.info('Worker stopped.')
  process.exit(0)
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal)
  })
}

console.info(
  `Worker up: ${config.app.name} (${config.app.env}), queue prefix "${queuePrefix()}".`
)
