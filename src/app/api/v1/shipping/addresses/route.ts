import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { searchAddresses } from '@/server/shipping/checkout-shipping.service'
import { AddressSearchQuerySchema } from '@/server/shipping/shipping.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/shipping/addresses — NZ Post address suggestions for the checkout type-ahead.
 *
 * Backed by ParcelAddress. At least four characters, because NZ Post refuses
 * fewer; NZ Post suggests the client starts calling after five typed
 * characters, which is the client's debounce to choose.
 *
 * Returns `addressId`s to pass to `PUT /cart/shipping/address`. The suggestion
 * text is for display only — the address is fetched again when it is chosen.
 *
 * @error 503 DEPENDENCY_UNAVAILABLE NZ Post could not be reached, shipping is switched off, or address search is not available to this portal yet.
 */
export const GET = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, requestId }) => {
    const query = parseQuery(request, AddressSearchQuerySchema)
    return ok({ items: await searchAddresses(query) }, { requestId })
  }
)
