import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { spendByCategory } from '@/server/reports/reports.service'
import { ReportRangeQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/spend/by-category
 *
 * Spend per product category. Raw SQL, because the grouping column is two joins
 * away — the tenant scope still applies, since RLS is enforced by the database
 * rather than by the query builder.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ReportRangeQuerySchema)
    return ok(await spendByCategory(actor, query), { requestId })
  }
)
