import { Permission } from '@/server/auth/permissions'
import {
  createVariant,
  findProductById,
} from '@/server/catalog/products.service'
import { toProductView } from '@/server/catalog/product.types'
import { CreateVariantSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { productId: string }

/**
 * POST /api/v1/catalog/products/:productId/variants
 *
 * Must choose a value for every option the product defines. Returns the whole
 * product rather than the variant alone: the admin screen re-renders the
 * variant matrix from it, and a bare variant would leave it stale.
 */
export const POST = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateVariantSchema)
    await createVariant(params.productId, body, actor)

    const product = await findProductById(actor, params.productId)
    return ok(toProductView(product), { status: 201, requestId })
  }
)
