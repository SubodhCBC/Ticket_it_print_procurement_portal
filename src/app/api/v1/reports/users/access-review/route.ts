import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { accessReview } from '@/server/reports/governance-reports.service'
import { AccessReviewQuerySchema } from '@/server/reports/report.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/users/access-review
 *
 * Every user with access to one account: role, primary and additional branches,
 * per-user permission overrides, and when they last signed in (SOW §15 "user
 * access review extract — by account"; §12: "quarterly extract of every active
 * user, role, site association and last login, for client attestation").
 *
 * Active users only unless `includeInactive=true`, which adds everyone else,
 * deactivated users included. Expired permission grants are left out — they
 * confer nothing, and a reviewer should not be asked to attest to them.
 *
 * USER_MANAGE rather than REPORT_VIEW: it is the same information the user list
 * already shows to whoever holds that permission, and no more.
 *
 * @permission USER_MANAGE Always.
 * @error 403 FORBIDDEN A non-administrator naming an account other than their own.
 */
export const GET = route(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, AccessReviewQuerySchema)
    return ok(await accessReview(actor, query), { requestId })
  }
)
