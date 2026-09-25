import { Permission } from '@/server/auth/permissions'
import { openCart, setCheckoutDetails } from '@/server/cart/cart.service'
import { toCartView } from '@/server/cart/cart.types'
import {
  CartQuerySchema,
  SetCheckoutDetailsSchema,
} from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { syncDeliveryChoiceToShipTo } from '@/server/shipping/checkout-shipping.service'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * PATCH /api/v1/cart/checkout-details
 *
 * Purchase order, addresses, delivery date, payment method and terms.
 *
 * The branch cannot be changed here: a basket belongs to one branch, and that
 * branch decides its budget, its purchase-order rule and its addresses. Asking
 * for the other branch's basket is the operation; moving this one is not.
 *
 * `acceptTerms` is a boolean, and the server stamps the instant — taking a
 * timestamp from the client would let it claim the buyer agreed at any time it
 * liked.
 *
 * Changing `shippingAddressId` resets the basket's NZ Post delivery choice to
 * that address: to the address itself when it has been validated through NZ
 * Post (its DPID and rural flag), and to nothing when it has not (SOW F-16).
 */
export const PATCH = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    const body = await parseJsonBody(request, SetCheckoutDetailsSchema)

    const before = await openCart(actor, query.siteId)
    const cart = await setCheckoutDetails(actor, body, query.siteId)

    if (
      body.shippingAddressId !== undefined &&
      cart.shippingAddressId !== before.shippingAddressId
    ) {
      await syncDeliveryChoiceToShipTo(actor, cart)
    }

    return ok(toCartView(cart), { requestId })
  }
)
