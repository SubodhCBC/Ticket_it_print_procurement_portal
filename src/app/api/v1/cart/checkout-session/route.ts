import { Permission } from '@/server/auth/permissions'
import { checkoutSession } from '@/server/cart/cart.service'
import { toCartValidationView } from '@/server/cart/cart.types'
import { CartQuerySchema } from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/cart/checkout-session
 *
 * The validated basket, refused unless it is ready to become an order.
 *
 * Deliberately creates nothing: no order, no stock reservation, no change to
 * the basket's status. All three belong to the order write, and doing any of
 * them here would leave the system half-committed whenever that write failed.
 *
 * The response carries `approval` — whether placing now would need approval,
 * decided by the same rules placement uses — and `deliveryNotesRequired`.
 *
 * @error 422 BUSINESS_RULE_VIOLATION The basket is not ready to be ordered. `details.issues` lists every problem, each with a stable `code` such as `SHIPPING_METHOD_REQUIRED` or `BUDGET_EXCEEDED`.
 */
export const POST = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    return ok(
      toCartValidationView(await checkoutSession(actor, query.siteId)),
      { status: 201, requestId }
    )
  }
)
