import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { resolveRange } from '@/server/reports/report-periods'
import { attachmentDisposition, renderCsv } from '@/server/reports/report-table'
import { INVENTORY_TURNOVER } from '@/server/reports/report-tables'
import {
  InventoryQuerySchema,
  ReportRangeQuerySchema,
} from '@/server/reports/report.validation'
import { inventoryTurnover } from '@/server/reports/reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/inventory/turnover.csv
 *
 * Units shipped against stock on hand, with days of cover.
 *
 * The same rows as `GET /api/v1/reports/inventory/turnover`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). CSV with a byte-order mark, so Excel reads names with macrons correctly, and
 * with every cell through the shared formula guard.
 *
 * @permission INVENTORY_MANAGE Always.
 */
export const GET = route(
  { permissions: [Permission.INVENTORY_MANAGE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ReportRangeQuerySchema)
    const { limit } = parseQuery(request, InventoryQuerySchema)
    const rows = await inventoryTurnover(query, limit)
    const context = exportContext(
      actor,
      null,
      { Limit: String(limit) },
      resolveRange(query.from, query.to)
    )
    const body = renderCsv(INVENTORY_TURNOVER, rows)

    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentDisposition(
          INVENTORY_TURNOVER,
          context,
          'csv'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
