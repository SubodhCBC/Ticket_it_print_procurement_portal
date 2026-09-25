import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { approvalActivity } from '@/server/reports/governance-reports.service'
import { ApprovalActivityQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/approvals/activity
 *
 * Every approval decision in a window, by approver and outcome, with the cycle
 * time from submission to decision (SOW §15: "approval activity — by approver,
 * outcome and date range — governance and approval cycle time").
 *
 * Covers both routes an order takes to an approver: rule steps, one row per
 * tier decided, and account-threshold holds, released through the order's own
 * status. The two are read so that no decision is counted twice. Answers with
 * totals, a row per approver, and the decisions themselves, newest first.
 *
 * @permission REPORT_VIEW Always.
 * @error 403 FORBIDDEN A non-administrator naming an account other than their own.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ApprovalActivityQuerySchema)
    return ok(await approvalActivity(actor, query), { requestId })
  }
)
