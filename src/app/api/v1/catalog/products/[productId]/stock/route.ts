import { Permission } from '@/server/auth/permissions'
import { adjustStock } from '@/server/catalog/products.service'
import { AdjustStockSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { productId: string }

/**
 * POST /api/v1/catalog/products/:productId/stock
 *
 * A signed movement, never an absolute figure — two people counting the same
 * shelf and both submitting "42" loses an adjustment; both submitting "+3" does
 * not. A reason is required and lands in the audit trail.
 *
 * For absolute counts see `POST /api/v1/catalog/inventory/reconcile`.
 */
export const POST = route<Params>(
  { permissions: [Permission.INVENTORY_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, AdjustStockSchema)
    const result = await adjustStock(params.productId, body, actor)

    return ok(result, { status: 201, requestId })
  }
)
