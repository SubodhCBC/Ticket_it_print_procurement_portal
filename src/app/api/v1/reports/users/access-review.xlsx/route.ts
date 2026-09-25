import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import {
  attachmentDisposition,
  renderXlsx,
} from '@/server/reports/report-table'
import { ACCESS_REVIEW } from '@/server/reports/report-tables'
import { AccessReviewQuerySchema } from '@/server/reports/report.validation'
import { accessReview } from '@/server/reports/governance-reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/users/access-review.xlsx
 *
 * Every user with access, their role, branches, permission overrides and last sign-in, for attestation.
 *
 * The same rows as `GET /api/v1/reports/users/access-review`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). Numbers as numbers — money, counts and percentages can be summed and
 * filtered without retyping — and an About sheet saying who pulled it, when,
 * and with which filters.
 *
 * @permission USER_MANAGE Always.
 */
export const GET = route(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, AccessReviewQuerySchema)
    const rows = (await accessReview(actor, query)).users
    const context = exportContext(
      actor,
      resolveAccountId(actor, query.accountId),
      { 'Includes inactive users': query.includeInactive ? 'yes' : 'no' }
    )
    const body = await renderXlsx(ACCESS_REVIEW, rows, context)

    return new Response(body, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentDisposition(
          ACCESS_REVIEW,
          context,
          'xlsx'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
