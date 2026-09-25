import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { getAddressDetails } from '@/server/shipping/checkout-shipping.service'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { addressId: string }

/**
 * GET /api/v1/shipping/addresses/:addressId — one validated NZ Post address, split into parts.
 *
 * Street number, street, suburb, city, postcode, DPID and whether it is a rural
 * delivery. For showing the buyer what they picked; choosing it for the basket
 * is `PUT /cart/shipping/address`.
 */
export const GET = route<Params>(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ params, requestId }) => {
    return ok(await getAddressDetails(params.addressId), { requestId })
  }
)
