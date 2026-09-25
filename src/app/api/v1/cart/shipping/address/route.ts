import { Permission } from '@/server/auth/permissions'
import { CartQuerySchema } from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { selectDeliveryAddress } from '@/server/shipping/checkout-shipping.service'
import { SelectDeliveryAddressSchema } from '@/server/shipping/shipping.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * PUT /api/v1/cart/shipping/address — choose the NZ Post-validated delivery address.
 *
 * Takes an `addressId` from `GET /shipping/addresses`. The address is fetched
 * from ParcelAddress again here, so its parts, DPID and rural flag come from NZ
 * Post rather than from the client.
 *
 * Clears any chosen service, quote and collection point: they were for the
 * previous address.
 */
export const PUT = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    const body = await parseJsonBody(request, SelectDeliveryAddressSchema)
    return ok(await selectDeliveryAddress(actor, body, query.siteId), {
      requestId,
    })
  }
)
