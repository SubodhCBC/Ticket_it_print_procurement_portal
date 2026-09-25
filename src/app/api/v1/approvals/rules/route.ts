import {
  createApprovalRule,
  listApprovalRules,
} from '@/server/approvals/approvals.service'
import { toApprovalRuleView } from '@/server/approvals/approval.types'
import { CreateApprovalRuleSchema } from '@/server/approvals/approval.validation'
import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/approvals/rules
 *
 * The rules that decide which orders need approving and by whom. USER_MANAGE
 * rather than APPROVAL_ACT: deciding an order and deciding who decides orders
 * are different jobs.
 */
export const GET = route(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, actor, requestId }) => {
    const accountId =
      new URL(request.url).searchParams.get('accountId') ?? undefined
    const rules = await listApprovalRules(actor, accountId)

    return ok(rules.map(toApprovalRuleView), { requestId })
  }
)

/**
 * POST /api/v1/approvals/rules
 *
 * A rule pointing at a category, branch or person that does not exist would
 * match nothing or route to nobody and give no sign of either, so all three are
 * checked before the row is written.
 */
export const POST = route(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateApprovalRuleSchema)
    return ok(toApprovalRuleView(await createApprovalRule(actor, body)), {
      status: 201,
      requestId,
    })
  }
)
