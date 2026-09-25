import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { attachmentDisposition, renderCsv } from '@/server/reports/report-table'
import { ORDER_AGEING } from '@/server/reports/report-tables'
import { OrderAgeingQuerySchema } from '@/server/reports/report.validation'
import { orderAgeing } from '@/server/reports/governance-reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/orders/ageing.csv
 *
 * Every open order and how long it has sat in its status, longest first.
 *
 * The same rows as `GET /api/v1/reports/orders/ageing`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). CSV with a byte-order mark, so Excel reads names with macrons correctly, and
 * with every cell through the shared formula guard.
 *
 * @permission REPORT_VIEW Always.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, OrderAgeingQuerySchema)
    const report = await orderAgeing(actor, query)
    const rows = report.orders
    const context = exportContext(
      actor,
      resolveAccountId(actor, query.accountId),
      { Branch: query.siteId, Status: query.status, 'As of': report.asOf }
    )
    const body = renderCsv(ORDER_AGEING, rows)

    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentDisposition(
          ORDER_AGEING,
          context,
          'csv'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
