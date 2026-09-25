import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { orderAgeing } from '@/server/reports/governance-reports.service'
import { OrderAgeingQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/orders/ageing
 *
 * Every open order and how long it has sat in its current status (SOW §15, order
 * operations dashboard: "orders by status, awaiting approval, in production, in
 * transit, and ageing"). Counted per status into bands — 0–2, 3–7, 8–14, 15–30
 * and 31+ days — with the orders themselves listed longest-waiting first.
 *
 * Days in the current status, not since the order was placed: an order approved
 * ten days ago and still not in production is the one to chase, and age since
 * placement would rank it below one placed a month ago and dispatched yesterday.
 * Both figures are on every row.
 *
 * A snapshot as of now; there is no date range, because a window would hide
 * exactly the old orders this exists to find.
 *
 * @permission REPORT_VIEW Always.
 * @error 403 FORBIDDEN A non-administrator naming an account other than their own.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, OrderAgeingQuerySchema)
    return ok(await orderAgeing(actor, query), { requestId })
  }
)
