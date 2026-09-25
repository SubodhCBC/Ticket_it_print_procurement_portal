import { decideApproval } from '@/server/approvals/approvals.service'
import { toApprovalRequestView } from '@/server/approvals/approval.types'
import { approvalLineImages } from '@/server/orders/line-images'
import { DecideApprovalSchema } from '@/server/approvals/approval.validation'
import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { stepId: string }

/**
 * POST /api/v1/approvals/steps/:stepId
 *
 * Records one decision. The step, the request's new tier or outcome, the order's
 * status and the entry on the order's timeline all commit together — an approved
 * decision on an order still sitting in the queue would look to the approver like
 * their click did nothing.
 *
 * An order cannot be approved by the person who raised it, and a step addressed
 * to someone else is refused.
 */
export const POST = route<Params>(
  { permissions: [Permission.APPROVAL_ACT] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, DecideApprovalSchema)
    const decided = await decideApproval(actor, params.stepId, body)

    return ok(
      toApprovalRequestView(decided, await approvalLineImages([decided])),
      { status: 201, requestId }
    )
  }
)
