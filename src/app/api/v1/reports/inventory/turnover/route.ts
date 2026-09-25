import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { inventoryTurnover } from '@/server/reports/reports.service'
import {
  InventoryQuerySchema,
  ReportRangeQuerySchema,
} from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/inventory/turnover
 *
 * How fast stock is moving relative to what is held. Units shipped count
 * DISPATCHED and DELIVERED orders only — goods still in production have not left
 * the shelf, and counting them would overstate movement in exactly the month a
 * large order was placed and not yet filled.
 *
 * A product that shipped nothing still appears, with a zero: "what is not
 * moving" is half the question this answers.
 *
 * Administrator-only for the same reason the warehouse report is — it spans the
 * whole global catalogue.
 */
export const GET = route(
  { permissions: [Permission.INVENTORY_MANAGE] },
  async ({ request, requestId }) => {
    const range = parseQuery(request, ReportRangeQuerySchema)
    const { limit } = parseQuery(request, InventoryQuerySchema)

    return ok(await inventoryTurnover(range, limit), { requestId })
  }
)
