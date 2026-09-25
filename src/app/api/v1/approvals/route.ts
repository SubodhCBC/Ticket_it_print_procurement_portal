import { listApprovals } from '@/server/approvals/approvals.service'
import { toApprovalRequestView } from '@/server/approvals/approval.types'
import { approvalLineImages } from '@/server/orders/line-images'
import { ListApprovalsQuerySchema } from '@/server/approvals/approval.validation'
import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/approvals
 *
 * The approvals queue. `mine=true` narrows to steps this actor can act on right
 * now — open, at the current tier, and addressed to them by name or by role —
 * and never their own order, whatever role they hold.
 */
export const GET = route(
  { permissions: [Permission.APPROVAL_ACT] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListApprovalsQuerySchema)
    const page = await listApprovals(actor, query)
    const images = await approvalLineImages(page.items)

    return ok(
      {
        ...page,
        items: page.items.map((item) => toApprovalRequestView(item, images)),
      },
      { requestId }
    )
  }
)
