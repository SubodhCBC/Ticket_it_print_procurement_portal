import {
  removeApprovalRule,
  updateApprovalRule,
} from '@/server/approvals/approvals.service'
import { toApprovalRuleView } from '@/server/approvals/approval.types'
import { UpdateApprovalRuleSchema } from '@/server/approvals/approval.validation'
import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { noContent, ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { ruleId: string }

/** PATCH /api/v1/approvals/rules/:ruleId */
export const PATCH = route<Params>(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, UpdateApprovalRuleSchema)
    return ok(
      toApprovalRuleView(await updateApprovalRule(actor, params.ruleId, body)),
      {
        requestId,
      }
    )
  }
)

/**
 * DELETE /api/v1/approvals/rules/:ruleId
 *
 * Soft. Requests already in flight keep their steps — the approver was
 * snapshotted onto the step when it was raised — so retiring a rule never
 * strands an order halfway through it.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.USER_MANAGE] },
  async ({ params, actor, requestId }) => {
    await removeApprovalRule(actor, params.ruleId)
    return noContent(requestId)
  }
)
