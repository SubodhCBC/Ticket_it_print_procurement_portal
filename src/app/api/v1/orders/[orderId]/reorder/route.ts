import { Permission } from '@/server/auth/permissions'
import { toCartView } from '@/server/cart/cart.types'
import { route } from '@/server/middleware/auth.middleware'
import { reorderToCart } from '@/server/orders/reorder.service'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { orderId: string }

/**
 * POST /api/v1/orders/:orderId/reorder
 *
 * One-click re-order (SOW M-08). Puts the order's lines back in the basket with
 * their specifications intact — product, configuration, quantity, the design and
 * the personalisation printed on it — and answers with the basket and a row per
 * original line saying what became of it.
 *
 * Prices are not carried. The lines are priced today, through the ordinary
 * basket, because the price on an order is the price it was placed at and a
 * basket quoting last year's figure would not survive checkout.
 *
 * Nothing is substituted. A line goes back as it was or not at all, and each row
 * says why not with a `reasonCode` a screen can act on: PRODUCT_WITHDRAWN,
 * PRODUCT_REPLACED (with `replacedBy` naming the successor, rather than the
 * design being moved onto a product it was not drawn for), DESIGN_WITHDRAWN,
 * DESIGN_REQUIRED (an order from before template pricing — the item is still
 * on sale, it needs a design), or REFUSED with the basket's own words.
 *
 * The basket is added to, never replaced: a re-order must not discard work
 * already in progress.
 *
 * Both permissions, not either: re-ordering is reading an order and filling a
 * basket, and holding one without the other is not enough to do it. An order
 * the caller may not see answers 404, as the order page does.
 *
 * @permission ORDER_VIEW_OWN Always. Narrower roles see only their own orders.
 * @permission ORDER_CREATE Always. Without it the answer is 403.
 * @error 404 NOT_FOUND No such order, or not one this caller may see.
 * @error 422 BUSINESS_RULE_VIOLATION Not one line could be ordered again; `details.lines` says why for each.
 */
export const POST = route<Params>(
  { permissions: [Permission.ORDER_VIEW_OWN, Permission.ORDER_CREATE] },
  async ({ params, actor, requestId }) => {
    const result = await reorderToCart(actor, params.orderId)

    return ok(
      { cart: toCartView(result.cart), lines: result.lines },
      { status: 201, requestId }
    )
  }
)
