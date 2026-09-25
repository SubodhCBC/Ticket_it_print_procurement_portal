import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { refreshTrackingNow } from '@/server/shipping/tracking.service'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { orderId: string }

/**
 * POST /api/v1/orders/:orderId/tracking/refresh — poll ParcelTrack for this order now.
 *
 * For an operator looking into a delivery. Waits for NZ Post and answers with
 * how many new events arrived; if every parcel is now delivered, the order moves
 * to DELIVERED as it would on a scheduled poll.
 *
 * @error 503 DEPENDENCY_UNAVAILABLE Shipping is switched off, tracking is not configured, or NZ Post could not be reached.
 */
export const POST = route<Params>(
  { permissions: [Permission.ORDER_MANAGE] },
  async ({ params, actor, requestId }) => {
    return ok(await refreshTrackingNow(actor, params.orderId), {
      status: 201,
      requestId,
    })
  }
)
