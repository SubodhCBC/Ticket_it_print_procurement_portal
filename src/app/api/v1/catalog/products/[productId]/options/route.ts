import { Permission } from '@/server/auth/permissions'
import { setProductOptions } from '@/server/catalog/products.service'
import { toProductView } from '@/server/catalog/product.types'
import { SetProductOptionsSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { productId: string }

/**
 * PUT /api/v1/catalog/products/:productId/options
 *
 * Replaces the whole option set. Refused when it would orphan a variant built
 * on a value the new set no longer offers — the offending SKUs are named.
 */
export const PUT = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, SetProductOptionsSchema)
    const product = await setProductOptions(params.productId, body, actor)

    return ok(toProductView(product), { requestId })
  }
)
