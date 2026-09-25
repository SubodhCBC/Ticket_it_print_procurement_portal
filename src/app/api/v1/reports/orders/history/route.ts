import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { orderHistory } from '@/server/reports/governance-reports.service'
import { OrderHistoryQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/orders/history
 *
 * Who ordered what, for which branch, when, how many and for how much (SOW §15
 * "order history / audit extract — by account, site, user, status and date
 * range"; AD-7). One row per order line, newest order first, paged.
 *
 * The values are each order's own snapshot — the price it was placed at — not
 * today's catalogue. Drafts are never included. The `.csv` and `.xlsx` routes
 * beside this one carry the whole window rather than a page.
 *
 * @permission REPORT_VIEW Always.
 * @error 403 FORBIDDEN A non-administrator naming an account other than their own.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, OrderHistoryQuerySchema)
    return ok(await orderHistory(actor, query), { requestId })
  }
)
