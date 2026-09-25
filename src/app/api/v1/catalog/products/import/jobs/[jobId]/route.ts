import { Permission } from '@/server/auth/permissions'
import { findImportJob } from '@/server/catalog/product-import.service'
import { toImportJobView } from '@/server/catalog/product.types'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { jobId: string }

/**
 * GET /api/v1/catalog/products/import/jobs/:jobId
 *
 * QUEUED and RUNNING mean it is still going. COMPLETED means it finished —
 * individual rows may still have failed, so read the counts. FAILED means the
 * run itself broke and `error` says why. Includes the per-row results.
 */
export const GET = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ params, actor, requestId }) => {
    const job = await findImportJob(actor.accountId, params.jobId)

    return ok(toImportJobView(job, true), { requestId })
  }
)
