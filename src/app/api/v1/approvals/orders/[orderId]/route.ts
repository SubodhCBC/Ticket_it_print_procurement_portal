import { findApprovalByOrder } from '@/server/approvals/approvals.service'
import { toApprovalRequestView } from '@/server/approvals/approval.types'
import { approvalLineImages } from '@/server/orders/line-images'
import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { orderId: string }

/**
 * GET /api/v1/approvals/orders/:orderId
 *
 * The approval an order is waiting on, so a buyer can see who it sits with
 * without opening the approvals hub. An order from another account answers 404.
 */
export const GET = route<Params>(
  { permissions: [Permission.ORDER_VIEW_OWN] },
  async ({ params, actor, requestId }) => {
    const approval = await findApprovalByOrder(actor, params.orderId)
    return ok(
      toApprovalRequestView(approval, await approvalLineImages([approval])),
      {
        requestId,
      }
    )
  }
)
