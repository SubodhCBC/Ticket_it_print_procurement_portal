import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { attachmentDisposition, renderCsv } from '@/server/reports/report-table'
import { INVENTORY } from '@/server/reports/report-tables'
import { InventoryQuerySchema } from '@/server/reports/report.validation'
import { inventoryReport } from '@/server/reports/reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/inventory.csv
 *
 * What is low, what is out, and what to reorder — the warehouse view.
 *
 * The same rows as `GET /api/v1/reports/inventory`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). CSV with a byte-order mark, so Excel reads names with macrons correctly, and
 * with every cell through the shared formula guard.
 *
 * @permission INVENTORY_MANAGE Always.
 */
export const GET = route(
  { permissions: [Permission.INVENTORY_MANAGE] },
  async ({ request, actor, requestId }) => {
    const { limit } = parseQuery(request, InventoryQuerySchema)
    const rows = (await inventoryReport(limit)).items
    const context = exportContext(actor, null, { Limit: String(limit) })
    const body = renderCsv(INVENTORY, rows)

    return new Response(body, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentDisposition(INVENTORY, context, 'csv'),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
