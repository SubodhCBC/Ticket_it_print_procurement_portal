import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { topProducts } from '@/server/reports/reports.service'
import { TopProductsQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/products/top
 *
 * The SKUs accounting for the most spend, or the most units with `by=quantity`.
 *
 * Grouped on the snapshotted sku and name rather than the live product, so a
 * product renamed since does not split its own history in two.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, TopProductsQuerySchema)
    return ok(await topProducts(actor, query), { requestId })
  }
)
