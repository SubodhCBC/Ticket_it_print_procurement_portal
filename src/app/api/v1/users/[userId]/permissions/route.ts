import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  grantPermission,
  listGrants,
  revokeGrant,
} from '@/server/users/users.service'
import { toGrantView } from '@/server/users/user.types'
import {
  GrantPermissionSchema,
  RevokePermissionSchema,
} from '@/server/users/user.validation'
import { noContent, ok } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { userId: string }

function requestedAccount(request: Request): string | undefined {
  return new URL(request.url).searchParams.get('accountId') ?? undefined
}

/**
 * GET /api/v1/users/:userId/permissions
 *
 * The per-user departures from the role baseline. The baseline itself is
 * compiled in and read from `/authorization/permissions`.
 */
export const GET = route<Params>(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    const grants = await listGrants(accountId, params.userId)

    return ok(grants.map(toGrantView), { requestId })
  }
)

/**
 * POST /api/v1/users/:userId/permissions
 *
 * Grants or denies one permission, optionally scoped to a single resource. A
 * repeat grant updates the existing row rather than adding a second: the unique
 * index cannot enforce that itself, because PostgreSQL treats NULL resource ids
 * as distinct.
 *
 * DENY always beats ALLOW when the two are resolved, whatever order the rows
 * were written in.
 */
export const POST = route<Params>(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    const body = await parseJsonBody(request, GrantPermissionSchema)

    const grant = await grantPermission(accountId, params.userId, body, actor)
    return ok(toGrantView(grant), { status: 201, requestId })
  }
)

/** DELETE /api/v1/users/:userId/permissions — removes one grant by name. */
export const DELETE = route<Params>(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    const body = await parseJsonBody(request, RevokePermissionSchema)

    await revokeGrant(accountId, params.userId, body)
    return noContent(requestId)
  }
)
