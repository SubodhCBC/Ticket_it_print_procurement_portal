import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { resolveRange } from '@/server/reports/report-periods'
import { attachmentDisposition, renderCsv } from '@/server/reports/report-table'
import { ORDERS_BY_STATUS } from '@/server/reports/report-tables'
import { ReportRangeQuerySchema } from '@/server/reports/report.validation'
import {
  ordersByStatus,
  resolveAccount,
} from '@/server/reports/reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/orders/by-status.csv
 *
 * Orders and their value at each status.
 *
 * The same rows as `GET /api/v1/reports/orders/by-status`, with the columns declared
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
    const rows = await ordersByStatus(actor, query)
    const context = exportContext(
      actor,
      resolveAccount(actor, query.accountId),
      { Branch: query.siteId },
      resolveRange(query.from, query.to)
    )
    const body = renderCsv(ORDERS_BY_STATUS, rows)

    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentDisposition(
          ORDERS_BY_STATUS,
          context,
          'csv'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
