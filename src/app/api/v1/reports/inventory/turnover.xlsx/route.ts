import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { resolveRange } from '@/server/reports/report-periods'
import {
  attachmentDisposition,
  renderXlsx,
} from '@/server/reports/report-table'
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
 * GET /api/v1/reports/inventory/turnover.xlsx
 *
 * Units shipped against stock on hand, with days of cover.
 *
 * The same rows as `GET /api/v1/reports/inventory/turnover`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). Numbers as numbers — money, counts and percentages can be summed and
 * filtered without retyping — and an About sheet saying who pulled it, when,
 * and with which filters.
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
    const body = await renderXlsx(INVENTORY_TURNOVER, rows, context)

    return new Response(body, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentDisposition(
          INVENTORY_TURNOVER,
          context,
          'xlsx'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
