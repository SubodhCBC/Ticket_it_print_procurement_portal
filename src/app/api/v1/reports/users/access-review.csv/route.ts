import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { attachmentDisposition, renderCsv } from '@/server/reports/report-table'
import { ACCESS_REVIEW } from '@/server/reports/report-tables'
import { AccessReviewQuerySchema } from '@/server/reports/report.validation'
import { accessReview } from '@/server/reports/governance-reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/users/access-review.csv
 *
 * Every user with access, their role, branches, permission overrides and last sign-in, for attestation.
 *
 * The same rows as `GET /api/v1/reports/users/access-review`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). CSV with a byte-order mark, so Excel reads names with macrons correctly, and
 * with every cell through the shared formula guard.
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
    const body = renderCsv(ACCESS_REVIEW, rows)

    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentDisposition(
          ACCESS_REVIEW,
          context,
          'csv'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
