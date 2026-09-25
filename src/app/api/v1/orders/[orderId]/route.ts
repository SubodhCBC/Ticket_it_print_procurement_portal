import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { findOrderById } from '@/server/orders/orders.service'
import { toOrderView } from '@/server/orders/order.types'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { orderId: string }

/**
 * GET /api/v1/orders/:orderId
 *
 * One order with its lines and its full status history. An order the caller may
 * not see answers 404, not 403 — telling a buyer that an order exists but is a
 * colleague's leaks what other branches are spending on.
 */
export const GET = route<Params>(
  { permissions: [Permission.ORDER_VIEW_OWN] },
  async ({ params, actor, requestId }) => {
    return ok(toOrderView(await findOrderById(actor, params.orderId)), {
      requestId,
    })
  }
)
