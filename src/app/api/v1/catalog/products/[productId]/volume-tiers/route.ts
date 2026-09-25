import { Permission } from '@/server/auth/permissions'
import { setVolumeTiers } from '@/server/catalog/products.service'
import { toProductView } from '@/server/catalog/product.types'
import { SetVolumeTiersSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { productId: string }

/**
 * PUT /api/v1/catalog/products/:productId/volume-tiers
 *
 * Replaces the whole ladder. PRICING_MANAGE rather than CATALOG_MANAGE: this is
 * a price change, not a catalogue edit. Refused when a larger quantity would
 * not discount more than a smaller one.
 */
export const PUT = route<Params>(
  { permissions: [Permission.PRICING_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, SetVolumeTiersSchema)
    const product = await setVolumeTiers(params.productId, body, actor)

    return ok(toProductView(product), { requestId })
  }
)
