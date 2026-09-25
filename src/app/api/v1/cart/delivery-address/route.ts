import { Permission } from '@/server/auth/permissions'
import { setOneOffDeliveryAddress } from '@/server/cart/cart.service'
import { toCartView } from '@/server/cart/cart.types'
import {
  CartQuerySchema,
  SetOneOffDeliveryAddressSchema,
} from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import {
  applyValidatedDeliveryAddress,
  getAddressDetails,
} from '@/server/shipping/checkout-shipping.service'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * PUT /api/v1/cart/delivery-address
 *
 * Delivers the basket to an address typed at checkout instead of one of the
 * branch's saved ones (SOW F-18: "alternate ship-to entry enabled or disabled
 * per account by configuration"). The address is kept for this basket and its
 * order, and never appears in the branch's address list.
 *
 * PUT because it replaces the basket's typed address: sending a corrected one
 * retires the previous one, unless an order already points at it.
 *
 * The account's `allowCustomDeliveryAddress` setting is checked as well as the
 * permission, so an account that has not switched it on answers 403 whatever the
 * buyer holds. Whether the buyer may use it at all is on the cart validation
 * (`customDeliveryAddress.allowed`), because buyers cannot read account settings.
 *
 * Send `nzPostAddressId` from `GET /api/v1/shipping/addresses` to have the
 * address validated through NZ Post ParcelAddress (SOW F-16): the address lines
 * are then NZ Post's, and the basket's NZ Post delivery choice — the DPID and the
 * rural flag a label is sent with — is set to the same address in the same call.
 * Typed fields alone are still accepted and are stored as typed.
 *
 * @permission ORDER_CREATE Always.
 * @permission ORDER_CUSTOM_DELIVERY_ADDRESS Always; granted to buyers by default and deniable per user.
 * @error 403 FORBIDDEN The account does not allow typed delivery addresses, or this buyer may not use them.
 * @error 404 NOT_FOUND NZ Post does not recognise `nzPostAddressId`.
 * @error 422 BUSINESS_RULE_VIOLATION The basket has no branch yet.
 * @error 503 DEPENDENCY_UNAVAILABLE `nzPostAddressId` was sent while NZ Post is switched off or unreachable.
 */
export const PUT = route(
  {
    permissions: [
      Permission.ORDER_CREATE,
      Permission.ORDER_CUSTOM_DELIVERY_ADDRESS,
    ],
  },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    const body = await parseJsonBody(request, SetOneOffDeliveryAddressSchema)

    // Fetched here, once, before anything is written: an id NZ Post does not
    // recognise must not leave a half-made address behind.
    const verified = body.nzPostAddressId
      ? await getAddressDetails(body.nzPostAddressId)
      : undefined

    const cart = await setOneOffDeliveryAddress(
      actor,
      body,
      query.siteId,
      verified
    )
    if (verified) await applyValidatedDeliveryAddress(actor, cart, verified)

    return ok(toCartView(cart), { requestId })
  }
)
