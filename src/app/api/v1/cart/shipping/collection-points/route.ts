import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { listCollectionPoints } from '@/server/shipping/checkout-shipping.service'
import { CollectionPointsQuerySchema } from '@/server/shipping/shipping.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/cart/shipping/collection-points — parcel collection locations near the chosen address.
 *
 * Backed by NZ Post's Collection Address API. Needs an address chosen with
 * `PUT /cart/shipping/address` first; the locations are the ones NZ Post offers
 * for that address, nearest first.
 *
 * @error 422 BUSINESS_RULE_VIOLATION No NZ Post address has been chosen for this basket yet.
 * @error 503 DEPENDENCY_UNAVAILABLE NZ Post could not be reached, or collection points are not available to this portal yet.
 */
export const GET = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CollectionPointsQuerySchema)
    return ok(
      { items: await listCollectionPoints(actor, query) },
      { requestId }
    )
  }
)
