import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { orderVelocity } from '@/server/reports/reports.service'
import { ReportRangeQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/orders/velocity
 *
 * How fast orders are arriving, rather than what they are worth. A month of many
 * small orders and a month of one large one look identical on a revenue chart and
 * mean very different things to a production team.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ReportRangeQuerySchema)
    return ok(await orderVelocity(actor, query), { requestId })
  }
)
