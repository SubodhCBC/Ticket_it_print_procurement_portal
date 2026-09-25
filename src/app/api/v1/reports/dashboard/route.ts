import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { dashboard } from '@/server/reports/reports.service'
import { DashboardQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/dashboard
 *
 * Every card and chart on a dashboard, in one response — the range is resolved
 * once, so no card can disagree with the chart beside it.
 *
 * `spend`, `trend`, `byStatus`, `pace` and `topSites` answer "what happened in
 * the window"; `queue` and `network` are a snapshot of now. That asymmetry is
 * deliberate: an order placed six weeks ago and still in production is work
 * somebody is waiting on today, and a windowed queue would hide it.
 *
 * `scope=platform` is administrator-only and is refused in the service.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, DashboardQuerySchema)
    return ok(await dashboard(actor, query), { requestId })
  }
)
