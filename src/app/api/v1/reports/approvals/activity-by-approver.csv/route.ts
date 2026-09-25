import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { resolveRange } from '@/server/reports/report-periods'
import { attachmentDisposition, renderCsv } from '@/server/reports/report-table'
import { APPROVAL_ACTIVITY_BY_APPROVER } from '@/server/reports/report-tables'
import { ApprovalActivityQuerySchema } from '@/server/reports/report.validation'
import { approvalActivity } from '@/server/reports/governance-reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/approvals/activity-by-approver.csv
 *
 * Decisions per approver, by outcome, with average and median hours to decide.
 *
 * The same rows as `GET /api/v1/reports/approvals/activity-by-approver`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). CSV with a byte-order mark, so Excel reads names with macrons correctly, and
 * with every cell through the shared formula guard.
 *
 * @permission REPORT_VIEW Always.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ApprovalActivityQuerySchema)
    const rows = (await approvalActivity(actor, query)).byApprover
    const context = exportContext(
      actor,
      resolveAccountId(actor, query.accountId),
      {
        Branch: query.siteId,
        Approver: query.approverId,
        Outcome: query.outcome,
      },
      resolveRange(query.from, query.to)
    )
    const body = renderCsv(APPROVAL_ACTIVITY_BY_APPROVER, rows)

    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentDisposition(
          APPROVAL_ACTIVITY_BY_APPROVER,
          context,
          'csv'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
