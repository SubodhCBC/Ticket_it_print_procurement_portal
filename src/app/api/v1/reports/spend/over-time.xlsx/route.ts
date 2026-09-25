import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { resolveRange } from '@/server/reports/report-periods'
import {
  attachmentDisposition,
  renderXlsx,
} from '@/server/reports/report-table'
import { SPEND_OVER_TIME } from '@/server/reports/report-tables'
import { ReportRangeQuerySchema } from '@/server/reports/report.validation'
import { resolveAccount, spendOverTime } from '@/server/reports/reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/spend/over-time.xlsx
 *
 * Spend and orders per period across the window.
 *
 * The same rows as `GET /api/v1/reports/spend/over-time`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). Numbers as numbers — money, counts and percentages can be summed and
 * filtered without retyping — and an About sheet saying who pulled it, when,
 * and with which filters.
 *
 * @permission REPORT_VIEW Always.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ReportRangeQuerySchema)
    const report = await spendOverTime(actor, query)
    const rows = report.buckets
    const context = exportContext(
      actor,
      resolveAccount(actor, query.accountId),
      { Branch: query.siteId, Granularity: report.granularity },
      resolveRange(query.from, query.to)
    )
    const body = await renderXlsx(SPEND_OVER_TIME, rows, context)

    return new Response(body, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentDisposition(
          SPEND_OVER_TIME,
          context,
          'xlsx'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
