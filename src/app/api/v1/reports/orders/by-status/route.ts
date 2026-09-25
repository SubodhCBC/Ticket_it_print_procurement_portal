import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { ordersByStatus } from '@/server/reports/reports.service'
import { ReportRangeQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/orders/by-status
 *
 * Where work is stuck. Unlike the spend reports this counts *every* status,
 * rejected and cancelled included — the ones carrying no money are often the
 * interesting ones.
 *
 * Shares are of the order count, not of the money: a single large order would
 * otherwise make a busy queue look empty.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ReportRangeQuerySchema)
    return ok(await ordersByStatus(actor, query), { requestId })
  }
)
