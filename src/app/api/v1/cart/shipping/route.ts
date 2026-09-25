import { Permission } from '@/server/auth/permissions'
import { CartQuerySchema } from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import {
  clearCartShipping,
  getCartShipping,
} from '@/server/shipping/checkout-shipping.service'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/cart/shipping — the basket's NZ Post delivery choice.
 *
 * The validated address, any collection point, and the chosen service with its
 * quote. `selection` is null until an address has been chosen.
 *
 * The quote is recorded with the order and never billed: `freightBilled` is
 * always false, and nothing here changes the basket total or the branch budget.
 */
export const GET = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    return ok(await getCartShipping(actor, query.siteId), { requestId })
  }
)

/**
 * DELETE /api/v1/cart/shipping — forget the basket's NZ Post delivery choice.
 *
 * The order can still be placed without one; staff then enter the delivery
 * address when they request the label.
 */
export const DELETE = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    return ok(await clearCartShipping(actor, query.siteId), { requestId })
  }
)
