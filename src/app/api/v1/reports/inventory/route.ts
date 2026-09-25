import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { inventoryReport } from '@/server/reports/reports.service'
import { InventoryQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/inventory
 *
 * The warehouse view: what is low, what is out, and what to reorder. Healthy
 * lines are trimmed — this is a "what needs attention" report, and a thousand
 * rows of nothing wrong is not one.
 *
 * INVENTORY_MANAGE rather than INVENTORY_VIEW, and that is the whole protection:
 * this report spans the global catalogue and is deliberately *not* filtered by
 * product visibility, because a reorder list has to include lines restricted to
 * one customer's contract. Head office holds INVENTORY_VIEW and would otherwise
 * see them.
 */
export const GET = route(
  { permissions: [Permission.INVENTORY_MANAGE] },
  async ({ request, requestId }) => {
    const query = parseQuery(request, InventoryQuerySchema)
    return ok(await inventoryReport(query.limit), { requestId })
  }
)
