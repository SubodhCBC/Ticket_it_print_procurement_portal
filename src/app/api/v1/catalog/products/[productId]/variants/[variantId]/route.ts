import { Permission } from '@/server/auth/permissions'
import {
  findProductById,
  removeVariant,
  updateVariant,
} from '@/server/catalog/products.service'
import { toProductView } from '@/server/catalog/product.types'
import { UpdateVariantSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { noContent, ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { productId: string; variantId: string }

/** PATCH /api/v1/catalog/products/:productId/variants/:variantId */
export const PATCH = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, UpdateVariantSchema)
    await updateVariant(params.productId, params.variantId, body, actor)

    const product = await findProductById(actor, params.productId)
    return ok(toProductView(product), { requestId })
  }
)

/**
 * DELETE /api/v1/catalog/products/:productId/variants/:variantId
 *
 * Soft — order lines reference the variant SKU.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ params, actor, requestId }) => {
    await removeVariant(params.productId, params.variantId, actor)
    return noContent(requestId)
  }
)
