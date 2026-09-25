import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { changeOrderStatus } from '@/server/orders/orders.service'
import { toOrderView } from '@/server/orders/order.types'
import { ChangeOrderStatusSchema } from '@/server/orders/order.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { orderId: string }

/**
 * POST /api/v1/orders/:orderId/status
 *
 * The state machine decides what is *possible*; a second check decides who is
 * *allowed*. Approval decisions need APPROVAL_ACT, fulfilment moves need
 * ORDER_MANAGE, and a buyer may always cancel their own order.
 *
 * The shelf moves in the same transaction as the status: dispatching consumes
 * the reservation, rejecting or cancelling releases it.
 *
 * An order routed by approval rules is decided on its approval step: APPROVED,
 * REJECTED or CHANGES_REQUESTED here records the caller's decision on the step
 * open at the current tier, exactly as `POST /approvals/steps/{stepId}` would.
 * On a multi-tier order that can leave the order PENDING_APPROVAL — read
 * `status` from the response. `deliveryNotes`, when sent, replaces the order's
 * delivery instructions.
 *
 * @permission APPROVAL_ACT To move to APPROVED, REJECTED or CHANGES_REQUESTED. The person who placed the order cannot decide it.
 * @permission ORDER_MANAGE To move to PROCESSING, DISPATCHED or DELIVERED.
 * @permission ORDER_CANCEL To cancel an order someone else placed. A buyer may always cancel their own.
 * @permission ORDER_CREATE To resubmit for approval an order someone else placed. A buyer may always resubmit their own.
 * @error 403 FORBIDDEN A permission above is missing, or the order is waiting on approval steps and none open now is addressed to the caller (`details.openSteps`).
 * @error 422 BUSINESS_RULE_VIOLATION The move is not allowed from the current status (`details.allowed`), or a dispatch has no NZ Post label and no carrier and tracking number.
 */
export const POST = route<Params>(
  { permissions: [Permission.ORDER_VIEW_OWN] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, ChangeOrderStatusSchema)
    const order = await changeOrderStatus(actor, params.orderId, body)

    return ok(toOrderView(order), { status: 201, requestId })
  }
)
