import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { recordPayment } from '@/server/orders/orders.service'
import { toOrderView } from '@/server/orders/order.types'
import { RecordPaymentSchema } from '@/server/orders/order.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { orderId: string }

/**
 * POST /api/v1/orders/:orderId/payment
 *
 * Payment moves on its own axis, which is why it is not a status change: an
 * order can be DELIVERED and UNPAID on Net 30 terms, and PAID while still
 * PROCESSING on a P-Card.
 *
 * BILLING_VIEW opens the route so the order can be read; writing the payment
 * additionally needs BILLING_MANAGE, checked in the service.
 *
 * @permission BILLING_MANAGE Always, to record the payment. Without it the answer is 403.
 */
export const POST = route<Params>(
  { permissions: [Permission.BILLING_VIEW] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, RecordPaymentSchema)
    const order = await recordPayment(actor, params.orderId, body)

    return ok(toOrderView(order), { status: 201, requestId })
  }
)
