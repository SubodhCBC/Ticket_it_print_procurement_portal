import type { CatalogImportJob, Product } from '@prisma/client'
import { z, ZodError } from 'zod'
import { AuditAction } from '../audit/audit.actions'
import { changesBetween, created } from '../audit/audit-changes'
import { recordAudit, type AuditActor } from '../audit/audit.service'
import type { AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope } from '../db/client'
import { isQueueEnabled } from '../queue/connection'
import { STANDARD_RETRY } from '../queue/job-options'
import { enqueue as addJob } from '../queue/producer'
import { QueueName } from '../queue/queue-names'
import { DependencyUnavailableError, NotFoundError } from '../utils/errors'
import { createId } from '../utils/ids'
import {
  offsetPage,
  toSkipTake,
  type OffsetPage,
  type OffsetPageRequest,
} from '../utils/pagination'
import { findCategoryIdByCode } from './categories.service'
import { PRODUCT_AUDIT_FIELDS } from './products.service'
import { ImportRowSchema, type ImportProductsDto } from './product.validation'
import type { ImportJobSummaryRow } from './product.types'
import { fromJsonOr, toJson, toStringList } from '../db/json-column'

export type ImportOutcome = 'created' | 'updated' | 'skipped' | 'failed'

export interface ImportRowResult {
  /** 1-based, matching the spreadsheet row the merchandiser is looking at. */
  readonly row: number
  readonly sku: string | null
  readonly outcome: ImportOutcome
  readonly message?: string
  readonly productId?: string
}

/** The payload the queue carries: a reference, never the rows themselves. */
export const ImportJobPayloadSchema = z.object({
  jobId: z.string().min(1).max(64),
})
export type ImportJobPayload = z.infer<typeof ImportJobPayloadSchema>

export const IMPORT_JOB_NAME = 'catalog-import'

/**
 * How many per-row results are kept on the job row.
 *
 * A ten-thousand-row success does not need ten thousand JSON objects stored for
 * ever; the failures are what anyone comes back to read. Above this, the results
 * are truncated to the failures plus a note — the counts stay exact.
 */
const MAX_STORED_RESULTS = 1_000

/**
 * Bulk product import (SOW BE-03).
 *
 * ---------------------------------------------------------------------------
 * Asynchronous, including the dry run
 * ---------------------------------------------------------------------------
 * The submitted rows are written to `catalog_import_jobs` and the queue carries
 * only the job id. Ten thousand rows have no business sitting in Redis under
 * BullMQ's completed-job retention, and a request that holds a connection open
 * for a minute is a request that times out at the load balancer.
 *
 * A dry run takes the same path. An import preview that used different logic
 * would be worse than no preview, and the whole point of `dryRun` is that it
 * makes exactly the decisions a real run would.
 *
 * ---------------------------------------------------------------------------
 * Row-at-a-time, not transactional
 * ---------------------------------------------------------------------------
 * A merchandiser uploading 300 rows wants the 297 good ones in and a list of the
 * three that are wrong. All-or-nothing turns a typo in one cell into a rejected
 * file, and the next attempt is a bigger file with more typos.
 *
 * Existing SKUs are skipped unless `updateExisting` is set: a re-uploaded file
 * must not silently overwrite prices edited in the admin UI since. An import
 * never publishes a product and never overwrites a warehouse stock count.
 */

/**
 * Accepts a file and queues it. Returns immediately with the job to poll.
 *
 * The row payload is persisted before the job is enqueued, so a worker can never
 * pick up an id whose rows are not there yet.
 *
 * Refuses outright when there is no queue configured, rather than accepting the
 * rows and leaving a QUEUED job nothing will ever drain. Silence is the worst
 * possible answer here: a merchandiser who uploaded a catalogue and got a job id
 * back has every reason to believe it is running.
 */
export async function enqueueImport(
  dto: ImportProductsDto,
  actor: AuthenticatedActor
): Promise<CatalogImportJob> {
  if (!isQueueEnabled()) {
    throw new DependencyUnavailableError(
      'Bulk import needs the job queue, which is not configured on this deployment'
    )
  }

  const job = await withTenantScope(actor.accountId, (tx) =>
    tx.catalogImportJob.create({
      data: {
        id: createId('imp'),
        accountId: actor.accountId,
        requestedById: actor.userId,
        dryRun: dto.dryRun,
        updateExisting: dto.updateExisting,
        payload: toJson(dto.rows),
        totalRows: dto.rows.length,
      },
    })
  )

  const queued = await addJob(
    QueueName.IMPORT,
    IMPORT_JOB_NAME,
    { jobId: job.id } satisfies ImportJobPayload,
    STANDARD_RETRY
  )

  if (!queued) {
    // Only reachable if Redis was configured a moment ago and is not now. The
    // row stays QUEUED and says why, rather than looking like it is running.
    await prisma.catalogImportJob.update({
      where: { id: job.id },
      data: { error: 'Could not be queued; no job queue is available' },
    })
    throw new DependencyUnavailableError('The job queue is not available')
  }

  console.info(
    `Queued catalogue import ${job.id}: ${job.totalRows} row(s)` +
      `${dto.dryRun ? ' (dry run)' : ''}.`
  )

  return job
}

export async function findImportJob(
  accountId: string,
  jobId: string
): Promise<CatalogImportJob> {
  const job = await withTenantScope(accountId, (tx) =>
    tx.catalogImportJob.findFirst({ where: { id: jobId, accountId } })
  )
  if (!job) throw new NotFoundError('Import job')
  return job
}

export async function listImportJobs(
  accountId: string,
  page: OffsetPageRequest
): Promise<OffsetPage<ImportJobSummaryRow>> {
  const { skip, take } = toSkipTake(page)

  return withTenantScope(accountId, async (tx) => {
    const [items, total] = await Promise.all([
      tx.catalogImportJob.findMany({
        where: { accountId },
        // The payload is the uploaded file and the results can be a thousand
        // objects; neither belongs in a list response.
        omit: { payload: true, results: true },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      tx.catalogImportJob.count({ where: { accountId } }),
    ])

    return offsetPage(items, total, page)
  })
}

/**
 * Runs a queued import. Called by the worker, never by a request.
 *
 * Marks the job RUNNING first, so a job that dies mid-flight is visibly stuck
 * rather than indistinguishable from one still waiting in the queue.
 */
export async function runImport(jobId: string): Promise<void> {
  const job = await prisma.catalogImportJob.findUnique({ where: { id: jobId } })
  if (!job) {
    // Not retryable: the row is gone and no number of attempts will bring it
    // back. Logged and swallowed so the queue does not spend three attempts
    // rediscovering that.
    console.error(`Import job ${jobId} no longer exists; nothing to run.`)
    return
  }

  if (job.status === 'COMPLETED') {
    // A retry of a job that already succeeded. Re-running it would report every
    // create it made as a skip, which reads as a second import that did nothing
    // — so it stops here.
    console.warn(`Import job ${jobId} is already COMPLETED; skipping.`)
    return
  }

  // FAILED is deliberately not in that guard.
  //
  // It used to be, which quietly cancelled the retry the catch block below sets
  // up: that block writes FAILED and rethrows so BullMQ will try again, and the
  // retry then arrived here, read its own FAILED row and returned. The comment
  // on the rethrow has always said a failed import "is retried from the top" —
  // it never was, for as long as both existed.
  //
  // Retrying from the top is safe for the reason that comment gives: creates are
  // keyed on SKU, so a second pass over rows the first pass already wrote
  // reports them as skipped or updates them rather than duplicating them.
  await prisma.catalogImportJob.update({
    where: { id: jobId },
    data: {
      status: 'RUNNING',
      startedAt: new Date(),
      // Cleared so a retry in flight does not show the previous attempt's
      // failure as if it were this one's outcome.
      finishedAt: null,
      error: null,
    },
  })

  try {
    const rows = fromJsonOr<unknown[]>(job.payload, [])
    const results = await applyRows(
      rows,
      job.updateExisting,
      job.dryRun,
      importActor(job)
    )
    const counts = countOutcomes(results)

    await prisma.catalogImportJob.update({
      where: { id: jobId },
      data: {
        status: 'COMPLETED',
        finishedAt: new Date(),
        ...counts,
        results: toJson(storableResults(results)),
      },
    })

    if (!job.dryRun) {
      await recordAudit({
        action: AuditAction.PRODUCT_IMPORTED,
        entityType: 'PRODUCT',
        entityId: jobId,
        entityName: `Bulk import of ${results.length} row(s)`,
        accountId: job.accountId,
        actor: importActor(job),
        details: {
          ...counts,
          total: results.length,
          // Only the failures. A successful ten-thousand-row import does not
          // need ten thousand lines in the audit blob.
          failures: results
            .filter((result) => result.outcome === 'failed')
            .slice(0, 100)
            .map((result) => ({
              row: result.row,
              sku: result.sku,
              message: result.message,
            })),
        },
      })
    }

    console.info(
      `Import ${jobId}${job.dryRun ? ' (dry run)' : ''}: ${counts.created} created, ` +
        `${counts.updated} updated, ${counts.skipped} skipped, ${counts.failed} failed.`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    await prisma.catalogImportJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', finishedAt: new Date(), error: message },
    })

    console.error(`Import job ${jobId} failed outright: ${message}`)
    // Rethrown so the queue records the failure and the retry policy applies.
    // `runImport()` guards against re-running a COMPLETED job, and a FAILED one
    // is retried from the top, which is safe: creates are keyed on SKU and a
    // second pass reports them as skipped or updates them.
    throw error
  }
}

// --- The actual work --------------------------------------------------------

async function applyRows(
  rows: readonly unknown[],
  updateExisting: boolean,
  dryRun: boolean,
  actor: AuditActor
): Promise<ImportRowResult[]> {
  const results: ImportRowResult[] = []

  // Category codes are resolved once. A 500-row file typically spans eight
  // categories, and looking each up per row is 500 queries for eight answers.
  const categoryIdByCode = new Map<string, string | null>()

  for (const [index, raw] of rows.entries()) {
    const rowNumber = index + 1

    const parsed = ImportRowSchema.safeParse(raw)
    if (!parsed.success) {
      results.push({
        row: rowNumber,
        sku: readSku(raw),
        outcome: 'failed',
        message: describeZodError(parsed.error),
      })
      continue
    }

    const row = parsed.data

    if (!categoryIdByCode.has(row.categoryCode)) {
      categoryIdByCode.set(
        row.categoryCode,
        await findCategoryIdByCode(row.categoryCode)
      )
    }
    const categoryId = categoryIdByCode.get(row.categoryCode) ?? null

    if (!categoryId) {
      results.push({
        row: rowNumber,
        sku: row.sku,
        outcome: 'failed',
        message: `Unknown category code "${row.categoryCode}"`,
      })
      continue
    }

    // The whole row: an update is audited with what it replaced.
    const existing = await prisma.product.findUnique({
      where: { sku: row.sku },
    })

    if (existing && !updateExisting) {
      results.push({
        row: rowNumber,
        sku: row.sku,
        outcome: 'skipped',
        message: 'SKU already exists; re-run with updateExisting to overwrite',
        productId: existing.id,
      })
      continue
    }

    if (existing?.deletedAt) {
      // Reviving a deleted product through an import would resurrect it with no
      // audit context and none of the checks the status machine applies.
      results.push({
        row: rowNumber,
        sku: row.sku,
        outcome: 'failed',
        message: 'SKU belongs to a deleted product and cannot be re-imported',
      })
      continue
    }

    if (dryRun) {
      results.push({
        row: rowNumber,
        sku: row.sku,
        outcome: existing ? 'updated' : 'created',
        ...(existing ? { productId: existing.id } : {}),
      })
      continue
    }

    try {
      const data = {
        name: row.name,
        description: row.description ?? null,
        categoryId,
        basePrice: row.basePrice,
        moq: row.moq,
        orderMultiple: row.orderMultiple,
        packSize: row.packSize,
        uom: row.uom,
        ...(row.taxTreatment ? { taxTreatment: row.taxTreatment } : {}),
        widthMm: row.widthMm ?? null,
        heightMm: row.heightMm ?? null,
        bleedMm: row.bleedMm ?? null,
        safeMarginMm: row.safeMarginMm ?? null,
        lowStockThreshold: row.lowStockThreshold,
        leadTimeDays: row.leadTimeDays ?? null,
        tags: toStringList(row.tags),
      }

      const product = existing
        ? await prisma.product.update({
            where: { id: existing.id },
            // `status` and `stockOnHand` are absent on purpose. An import must
            // not publish a product, and it must not silently overwrite a
            // warehouse count with a figure from a spreadsheet.
            data,
          })
        : await prisma.product.create({
            data: {
              id: createId('prd'),
              sku: row.sku,
              status: 'DRAFT',
              ...data,
            },
          })

      await auditImportedProduct(actor, existing, product, rowNumber)

      results.push({
        row: rowNumber,
        sku: row.sku,
        outcome: existing ? 'updated' : 'created',
        productId: product.id,
      })
    } catch (error) {
      results.push({
        row: rowNumber,
        sku: row.sku,
        outcome: 'failed',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return results
}

/**
 * One audit entry per product the import actually changed.
 *
 * The same actions and the same before/after a hand edit writes, so a price that
 * moved through a spreadsheet is found by the same search as one typed into the
 * form — the job's summary entry alone could never say which products moved or
 * from what. An update that changed nothing is not recorded: re-uploading the
 * file that was exported a minute ago is not ten thousand edits.
 *
 * After each write, never inside it, like every other audit write: the entry
 * must describe a row that exists.
 */
async function auditImportedProduct(
  actor: AuditActor,
  before: Product | null,
  after: Product,
  row: number
): Promise<void> {
  const common = {
    entityType: 'PRODUCT' as const,
    entityId: after.id,
    entityName: `${after.sku} — ${after.name}`,
    accountId: actor.accountId,
    actor,
    details: { source: 'bulk-import', row },
  }

  if (!before) {
    await recordAudit({
      ...common,
      action: AuditAction.PRODUCT_CREATED,
      changes: created(after, PRODUCT_AUDIT_FIELDS, { json: ['tags'] }),
    })
    return
  }

  const changes = changesBetween(before, after, PRODUCT_AUDIT_FIELDS, {
    json: ['tags'],
  })
  if (Object.keys(changes.after).length === 0) return

  await recordAudit({ ...common, action: AuditAction.PRODUCT_UPDATED, changes })
}

/**
 * Stated explicitly rather than read from the request context: an import runs
 * in the worker, which has no request and therefore no context.
 */
function importActor(job: {
  requestedById: string | null
  accountId: string
}): AuditActor {
  return {
    userId: job.requestedById,
    name: 'Catalogue import',
    email: 'system@ticketit.local',
    role: 'SYSTEM',
    accountId: job.accountId,
  }
}

/**
 * What is worth persisting on the job row.
 *
 * Under the cap, everything. Above it, the failures plus a marker — the counts
 * are exact either way, and nobody scrolls ten thousand success lines.
 */
function storableResults(
  results: readonly ImportRowResult[]
): readonly ImportRowResult[] {
  if (results.length <= MAX_STORED_RESULTS) return results

  const failures = results.filter((result) => result.outcome === 'failed')
  return [
    ...failures.slice(0, MAX_STORED_RESULTS),
    {
      row: 0,
      sku: null,
      outcome: 'skipped' as const,
      message:
        `${results.length} rows processed; only failures are listed. ` +
        'See the counts for the full picture.',
    },
  ]
}

function countOutcomes(results: readonly ImportRowResult[]): {
  created: number
  updated: number
  skipped: number
  failed: number
} {
  const count = (outcome: ImportOutcome): number =>
    results.filter((result) => result.outcome === outcome).length

  return {
    created: count('created'),
    updated: count('updated'),
    skipped: count('skipped'),
    failed: count('failed'),
  }
}

/**
 * Pulls a SKU out of a row that failed validation, so the error report can name
 * it. Best-effort: the row is unvalidated by definition.
 */
function readSku(raw: unknown): string | null {
  if (typeof raw !== 'object' || raw === null) return null
  const sku = (raw as { sku?: unknown }).sku
  return typeof sku === 'string' && sku.length > 0
    ? sku.trim().toUpperCase()
    : null
}

/** Field-level messages, joined — "basePrice: Expected an amount such as …". */
function describeZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '(row)'}: ${issue.message}`)
    .join('; ')
}
