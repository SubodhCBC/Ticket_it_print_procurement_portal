import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { resolveRange } from '@/server/reports/report-periods'
import { attachmentDisposition, renderCsv } from '@/server/reports/report-table'
import { SPEND_OVER_TIME } from '@/server/reports/report-tables'
import { ReportRangeQuerySchema } from '@/server/reports/report.validation'
import { resolveAccount, spendOverTime } from '@/server/reports/reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/spend/over-time.csv
 *
 * Spend and orders per period across the window.
 *
 * The same rows as `GET /api/v1/reports/spend/over-time`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). CSV with a byte-order mark, so Excel reads names with macrons correctly, and
 * with every cell through the shared formula guard.
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
    const body = renderCsv(SPEND_OVER_TIME, rows)

    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentDisposition(
          SPEND_OVER_TIME,
          context,
          'csv'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
