import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { spendByAccount } from '@/server/reports/reports.service'
import { ReportRangeQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/spend/by-account
 *
 * Spend per customer account — the one genuinely cross-tenant report, which is
 * why it runs outside the tenant scope and why ACCOUNT_MANAGE guards it. That
 * permission is administrator-only, and this must never be reachable without it.
 */
export const GET = route(
  { permissions: [Permission.ACCOUNT_MANAGE] },
  async ({ request, requestId }) => {
    const query = parseQuery(request, ReportRangeQuerySchema)
    return ok(await spendByAccount(query), { requestId })
  }
)
