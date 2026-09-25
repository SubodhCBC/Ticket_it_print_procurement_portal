import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { spendByRegion } from '@/server/reports/reports.service'
import { ReportRangeQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/spend/by-region
 *
 * Spend by delivery region, read from each order's frozen shipping snapshot
 * rather than from the address row: an address corrected later must not move
 * historical spend between regions.
 *
 * Orders with no region recorded are grouped rather than dropped, so the total
 * still reconciles with the headline.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ReportRangeQuerySchema)
    return ok(await spendByRegion(actor, query), { requestId })
  }
)
