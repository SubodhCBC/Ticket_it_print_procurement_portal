import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { listUsers } from '@/server/users/users.service'
import { toUserSummaryView } from '@/server/users/user.types'
import { ListUsersQuerySchema } from '@/server/users/user.validation'
import { ok } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/users
 *
 * Creating users is not here: portal-native and external ones arrive through an
 * invitation, replicated ones through the legacy provisioning on first login.
 */
export const GET = route(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListUsersQuerySchema)
    const page = await listUsers(
      resolveAccountId(actor, query.accountId),
      query
    )

    return ok(
      { ...page, items: page.items.map(toUserSummaryView) },
      { requestId }
    )
  }
)
