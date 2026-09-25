import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { retryShipment } from '@/server/shipping/shipments.service'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { orderId: string; shipmentId: string }

/**
 * POST /api/v1/orders/:orderId/shipments/:shipmentId/retry — replay a failed label request.
 *
 * Only a FAILED shipment, only while the order is in production. The stored
 * request is sent again; a shipment that already has a consignment id resumes
 * from fetching its label instead of asking NZ Post for a new consignment.
 *
 * @error 422 BUSINESS_RULE_VIOLATION The shipment is not FAILED, or the order is no longer in production.
 */
export const POST = route<Params>(
  { permissions: [Permission.ORDER_MANAGE] },
  async ({ params, actor, requestId }) => {
    return ok(await retryShipment(actor, params.orderId, params.shipmentId), {
      status: 201,
      requestId,
    })
  }
)
