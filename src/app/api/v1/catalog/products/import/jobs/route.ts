import { Permission } from '@/server/auth/permissions'
import { listImportJobs } from '@/server/catalog/product-import.service'
import { toImportJobView } from '@/server/catalog/product.types'
import { ListImportJobsQuerySchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/catalog/products/import/jobs
 *
 * Recent runs, newest first, without the submitted rows or the per-row results —
 * fetch one job for those.
 */
export const GET = route(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListImportJobsQuerySchema)
    const page = await listImportJobs(actor.accountId, query)

    return ok(
      { ...page, items: page.items.map((job) => toImportJobView(job)) },
      { requestId }
    )
  }
)
