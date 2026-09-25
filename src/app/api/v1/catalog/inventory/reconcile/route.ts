import { Permission } from '@/server/auth/permissions'
import { reconcileStock } from '@/server/catalog/products.service'
import { ReconcileStockSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/catalog/inventory/reconcile
 *
 * Its own path rather than another route under `catalog/products`: a stocktake
 * is an operation on the warehouse, not on one product, and nesting it would
 * have produced `/catalog/products/inventory/reconcile` — a path that reads as
 * a product called "inventory". Per-product *adjustments* stay on the product,
 * because those genuinely are about one product.
 *
 * Answers 200, not 201: a stocktake creates nothing. It reports, and sometimes
 * corrects. Every line comes back with its variance whether or not anything
 * changed, because the discrepancy is the point of the exercise; `dryRun`
 * reports without writing.
 */
export const POST = route(
  { permissions: [Permission.INVENTORY_MANAGE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, ReconcileStockSchema)
    const report = await reconcileStock(body, actor)

    return ok(report, { requestId })
  }
)
