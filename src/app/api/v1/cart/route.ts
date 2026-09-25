import { Permission } from '@/server/auth/permissions'
import { clearCart, openCart } from '@/server/cart/cart.service'
import { toCartView } from '@/server/cart/cart.types'
import { CartQuerySchema } from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/cart
 *
 * This user's open basket for a branch, created on first use — showing the cart
 * is every client's first action, and making them POST an empty one first would
 * be a round trip that exists only to satisfy REST.
 *
 * Baskets are never addressed by id: the basket is resolved from the
 * authenticated user and the branch they asked for, so there is no identifier
 * for one colleague to guess another's with.
 */
export const GET = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    return ok(toCartView(await openCart(actor, query.siteId)), { requestId })
  }
)

/** DELETE /api/v1/cart — empties the basket but keeps it. */
export const DELETE = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    return ok(toCartView(await clearCart(actor, query.siteId)), { requestId })
  }
)
