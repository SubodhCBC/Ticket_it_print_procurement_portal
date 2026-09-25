import { Permission } from '@/server/auth/permissions'
import { changeProductStatus } from '@/server/catalog/products.service'
import { toProductView } from '@/server/catalog/product.types'
import { ChangeProductStatusSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { productId: string }

/**
 * POST /api/v1/catalog/products/:productId/status
 *
 * The only way `status` ever changes. See `product-status.ts` for the
 * transition table — a published product never returns to DRAFT, and SUPERSEDED
 * is terminal and must name its replacement.
 */
export const POST = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, ChangeProductStatusSchema)
    const product = await changeProductStatus(params.productId, body, actor)

    return ok(toProductView(product), { status: 201, requestId })
  }
)
