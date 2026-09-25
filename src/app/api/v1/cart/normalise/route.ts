import { Permission } from '@/server/auth/permissions'
import { normaliseQuantities } from '@/server/cart/cart.service'
import { toCartView } from '@/server/cart/cart.types'
import { CartQuerySchema } from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/cart/normalise
 *
 * Rounds every line up to a quantity the product can actually be ordered in.
 *
 * The explicit half of "report the adjustment rather than applying it": validate
 * reports the rounding as a warning, and nothing is changed until the buyer asks
 * for it here. A customer who typed 120 of something sold in fifties gets 150,
 * and gets to see that before it happens.
 */
export const POST = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    return ok(toCartView(await normaliseQuantities(actor, query.siteId)), {
      status: 201,
      requestId,
    })
  }
)
