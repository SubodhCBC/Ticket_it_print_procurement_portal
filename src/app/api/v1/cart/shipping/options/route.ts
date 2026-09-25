import { Permission } from '@/server/auth/permissions'
import { CartQuerySchema } from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { listShippingOptions } from '@/server/shipping/checkout-shipping.service'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/cart/shipping/options — delivery services and prices for the chosen address.
 *
 * Live ShippingOptions rates for the basket as one parcel, estimated from the
 * products' recorded weights and a default box size. `source` says where the
 * prices came from: NZPOST, FLAT_RATE when live rates could not be had, or
 * UNAVAILABLE when there is neither — checkout carries on regardless.
 *
 * Needs an address chosen with `PUT /cart/shipping/address` first.
 *
 * @error 422 BUSINESS_RULE_VIOLATION No NZ Post address has been chosen for this basket yet.
 */
export const GET = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    return ok(await listShippingOptions(actor, query.siteId), { requestId })
  }
)
