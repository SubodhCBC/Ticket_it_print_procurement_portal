import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { getOrderTracking } from '@/server/shipping/tracking.service'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { orderId: string }

/**
 * GET /api/v1/orders/:orderId/tracking — the order's NZ Post tracking timeline.
 *
 * What the portal holds from ParcelTrack, newest event first. Fast whatever NZ
 * Post is doing: nothing is fetched while the request waits. When what is held
 * is more than half an hour old and the order is dispatched, a refresh is queued
 * in the background and `refreshQueued` says so.
 *
 * Visible to whoever may see the order — the same rule as `GET /orders/:orderId`.
 */
export const GET = route<Params>(
  { permissions: [Permission.ORDER_VIEW_OWN] },
  async ({ params, actor, requestId }) => {
    return ok(await getOrderTracking(actor, params.orderId), { requestId })
  }
)
