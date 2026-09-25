import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { getOrderShipment } from '@/server/shipping/shipments.service'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { orderId: string; shipmentId: string }

/**
 * GET /api/v1/orders/:orderId/shipments/:shipmentId — one label request and where it is.
 *
 * `status` moves PENDING → SUBMITTED → LABELLED, or ends FAILED with
 * `lastError`. `labelReady` turns true when the PDF can be downloaded.
 */
export const GET = route<Params>(
  { permissions: [Permission.ORDER_MANAGE] },
  async ({ params, actor, requestId }) => {
    return ok(
      await getOrderShipment(actor, params.orderId, params.shipmentId),
      { requestId }
    )
  }
)
