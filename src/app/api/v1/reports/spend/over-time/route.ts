import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { spendOverTime } from '@/server/reports/reports.service'
import { ReportRangeQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/spend/over-time
 *
 * The trend chart. Empty buckets are filled with zeros rather than omitted: a
 * chart that skips quiet days draws a straight line through them and overstates
 * the week.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ReportRangeQuerySchema)
    return ok(await spendOverTime(actor, query), { requestId })
  }
)
