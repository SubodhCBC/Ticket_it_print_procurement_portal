import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { voidShipment } from '@/server/shipping/shipments.service'
import { VoidShipmentSchema } from '@/server/shipping/shipping.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { orderId: string; shipmentId: string }

/**
 * POST /api/v1/orders/:orderId/shipments/:shipmentId/void — withdraw a label in the portal.
 *
 * NZ Post has no void endpoint. This stops the portal treating the label as
 * live — dispatch and pickups ignore it — and whoever printed it discards the
 * copy. A label nobody scans is never charged.
 *
 * Refused once the order has been dispatched on this label. Voiding an already
 * voided label answers with it unchanged.
 *
 * @error 422 BUSINESS_RULE_VIOLATION The order has already been dispatched on this label.
 */
export const POST = route<Params>(
  { permissions: [Permission.ORDER_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, VoidShipmentSchema)
    return ok(
      await voidShipment(actor, params.orderId, params.shipmentId, body),
      { status: 201, requestId }
    )
  }
)
