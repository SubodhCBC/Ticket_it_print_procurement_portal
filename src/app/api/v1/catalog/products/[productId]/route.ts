import { Permission } from '@/server/auth/permissions'
import {
  findProductById,
  presignAssets,
  removeProduct,
  updateProduct,
} from '@/server/catalog/products.service'
import { toProductView } from '@/server/catalog/product.types'
import { UpdateProductSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { noContent, ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { productId: string }

/**
 * GET /api/v1/catalog/products/:productId
 *
 * One product, with options, variants and volume pricing. A product the caller
 * may not see is reported as missing rather than forbidden — saying a SKU
 * exists but is not theirs leaks another customer's contract line.
 */
export const GET = route<Params>(
  { permissions: [Permission.CATALOG_VIEW] },
  async ({ params, actor, requestId }) => {
    const product = await findProductById(actor, params.productId)
    return ok(toProductView(product, await presignAssets(product, actor)), {
      requestId,
    })
  }
)

/** PATCH /api/v1/catalog/products/:productId */
export const PATCH = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, UpdateProductSchema)
    return ok(
      toProductView(await updateProduct(params.productId, body, actor)),
      { requestId }
    )
  }
)

/**
 * DELETE /api/v1/catalog/products/:productId
 *
 * Only ever from DRAFT. A published product is marked unavailable or superseded
 * instead — orders and invoices reference it.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ params, actor, requestId }) => {
    await removeProduct(params.productId, actor)
    return noContent(requestId)
  }
)
