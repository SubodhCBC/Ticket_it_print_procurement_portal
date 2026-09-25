import { Permission } from '@/server/auth/permissions'
import { CartQuerySchema } from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { selectShippingService } from '@/server/shipping/checkout-shipping.service'
import { SelectShippingServiceSchema } from '@/server/shipping/shipping.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * PUT /api/v1/cart/shipping/service — choose a delivery service.
 *
 * Takes a `serviceCode` from `GET /cart/shipping/options`. The price is quoted
 * again here and recorded as it stands, including mandatory addons such as the
 * rural delivery surcharge.
 *
 * Recorded, never billed: the quote travels to the order for reconciliation and
 * does not change the basket total, the branch budget or the invoice.
 *
 * @error 422 BUSINESS_RULE_VIOLATION No address chosen yet, or the service is not offered for this address (`details.available`).
 */
export const PUT = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    const body = await parseJsonBody(request, SelectShippingServiceSchema)
    return ok(await selectShippingService(actor, body, query.siteId), {
      requestId,
    })
  }
)
