import { Permission } from '@/server/auth/permissions'
import { validateCart } from '@/server/cart/cart.service'
import { toCartValidationView } from '@/server/cart/cart.types'
import { ValidateCartQuerySchema } from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/cart/validate
 *
 * Everything wrong with the basket, at once — it never short-circuits, so a
 * buyer with four bad lines sees four messages rather than fixing one and
 * discovering the next.
 *
 * Blocking `issues` are separated from `warnings`: a quantity that needs
 * rounding up is a warning the buyer can accept, while an unpublished product
 * or a breached budget is a hard stop. `forCheckout` additionally requires the
 * details a basket needs before it can be paid for.
 *
 * Writes nothing. POST because a validation prices the whole basket and that is
 * not a GET-shaped amount of work, and 200 because nothing was created.
 */
export const POST = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ValidateCartQuerySchema)
    const validation = await validateCart(
      actor,
      query.siteId,
      query.forCheckout
    )

    return ok(toCartValidationView(validation), { status: 201, requestId })
  }
)
