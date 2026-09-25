import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { attachmentDisposition, renderCsv } from '@/server/reports/report-table'
import { ORDER_HISTORY } from '@/server/reports/report-tables'
import { OrderHistoryQuerySchema } from '@/server/reports/report.validation'
import {
  orderHistoryForExport,
  orderHistoryRange,
} from '@/server/reports/governance-reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/orders/history.csv
 *
 * Who ordered what, for which branch, when, how many and for how much — one row per order line.
 *
 * The same rows as `GET /api/v1/reports/orders/history`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). CSV with a byte-order mark, so Excel reads names with macrons correctly, and
 * with every cell through the shared formula guard.
 *
 * @permission REPORT_VIEW Always.
 * @error 422 BUSINESS_RULE_VIOLATION More lines match than one export carries; narrow the filters.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, OrderHistoryQuerySchema)
    const rows = await orderHistoryForExport(actor, query)
    const context = exportContext(
      actor,
      resolveAccountId(actor, query.accountId),
      { Branch: query.siteId, Buyer: query.userId, Status: query.status },
      orderHistoryRange(query)
    )
    const body = renderCsv(ORDER_HISTORY, rows)

    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentDisposition(
          ORDER_HISTORY,
          context,
          'csv'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
