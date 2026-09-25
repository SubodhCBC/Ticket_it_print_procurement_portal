import { Permission } from '@/server/auth/permissions'
import { CartQuerySchema } from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { selectCollectionPoint } from '@/server/shipping/checkout-shipping.service'
import { SelectCollectionPointSchema } from '@/server/shipping/shipping.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * PUT /api/v1/cart/shipping/collection-point — collect from a nearby location instead, or stop.
 *
 * Takes a `collectionPointId` from `GET /cart/shipping/collection-points`, or
 * null to go back to delivery to the address. The point is looked up again
 * among the ones NZ Post offers for the chosen address.
 *
 * Clears the chosen service and quote, which were for the previous choice.
 *
 * @error 404 NOT_FOUND The collection point is not one NZ Post offers for the chosen address.
 * @error 422 BUSINESS_RULE_VIOLATION No NZ Post address has been chosen for this basket yet.
 */
export const PUT = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    const body = await parseJsonBody(request, SelectCollectionPointSchema)
    return ok(await selectCollectionPoint(actor, body, query.siteId), {
      requestId,
    })
  }
)
