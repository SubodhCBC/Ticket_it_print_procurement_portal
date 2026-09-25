import { Permission } from '@/server/auth/permissions'
import { enqueueImport } from '@/server/catalog/product-import.service'
import { toImportJobView } from '@/server/catalog/product.types'
import { ImportProductsSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/catalog/products/import
 *
 * Answers 202 with a job to poll. The rows are stored and the work happens on
 * the `import` queue, because a ten-thousand-row load has no business holding a
 * request open — and in Next it would be holding open a process that is also
 * rendering pages.
 *
 * Rows are applied individually, so one bad row does not reject the file.
 * Existing SKUs are skipped unless `updateExisting` is set. `dryRun` runs the
 * same code without writing. Imported products land as DRAFT.
 */
export const POST = route(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, ImportProductsSchema)
    const job = await enqueueImport(body, actor)

    return ok(toImportJobView(job), { status: 202, requestId })
  }
)
