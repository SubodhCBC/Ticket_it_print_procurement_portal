import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  createShipment,
  listOrderShipments,
} from '@/server/shipping/shipments.service'
import { CreateShipmentSchema } from '@/server/shipping/shipping.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { orderId: string }

/**
 * GET /api/v1/orders/:orderId/shipments — the NZ Post labels made for this order.
 *
 * Voided and failed ones included, oldest first, each with its parcels and
 * tracking references.
 */
export const GET = route<Params>(
  { permissions: [Permission.ORDER_MANAGE] },
  async ({ params, actor, requestId }) => {
    return ok(
      { items: await listOrderShipments(actor, params.orderId) },
      { requestId }
    )
  }
)

/**
 * POST /api/v1/orders/:orderId/shipments — request an NZ Post label for a packed order.
 *
 * The order must be PROCESSING. Send each box's weight and size as measured;
 * the service defaults to the one the buyer chose, and the delivery address to
 * the one they validated at checkout — send `deliveryAddress` for an order that
 * has none.
 *
 * Answers 201 with the shipment PENDING; the label is made in the background
 * and the shipment becomes LABELLED, or FAILED with the reason. Poll
 * `GET /orders/:orderId/shipments/:shipmentId`. One live label per order: void
 * the existing one first. Resending with the same `idempotencyKey` answers 200
 * with the shipment already made.
 *
 * @error 409 CONFLICT The order already has a live label — void it first — or the `idempotencyKey` was used for a different order.
 * @error 422 BUSINESS_RULE_VIOLATION The order is not PROCESSING, has no validated delivery address and none was sent, or no service could be chosen.
 * @error 503 DEPENDENCY_UNAVAILABLE Shipping is switched off, or live labels are not configured (see `GET /shipping/status`).
 */
export const POST = route<Params>(
  { permissions: [Permission.ORDER_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateShipmentSchema)
    const { shipment, created } = await createShipment(
      actor,
      params.orderId,
      body
    )

    if (!created) return ok(shipment, { requestId })
    return ok(shipment, { status: 201, requestId })
  }
)
