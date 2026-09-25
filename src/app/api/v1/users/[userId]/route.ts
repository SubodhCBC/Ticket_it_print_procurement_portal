import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  deactivateUser,
  findUserById,
  updateUser,
} from '@/server/users/users.service'
import { toUserSummaryView } from '@/server/users/user.types'
import { UpdateUserSchema } from '@/server/users/user.validation'
import { noContent, ok } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { userId: string }

function requestedAccount(request: Request): string | undefined {
  return new URL(request.url).searchParams.get('accountId') ?? undefined
}

/** GET /api/v1/users/:userId */
export const GET = route<Params>(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    return ok(toUserSummaryView(await findUserById(accountId, params.userId)), {
      requestId,
    })
  }
)

/**
 * PATCH /api/v1/users/:userId
 *
 * Role, status and branch attachment. Any of the three makes every live access
 * token stale — the token carries all of them — so the refresh family is revoked
 * and the change takes effect within the access TTL rather than in thirty days.
 *
 * You cannot change your own role or disable yourself: not a security control,
 * since a peer with USER_MANAGE can still do it, but the mistake is
 * unrecoverable through the API that made it.
 */
export const PATCH = route<Params>(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    const body = await parseJsonBody(request, UpdateUserSchema)

    return ok(
      toUserSummaryView(
        await updateUser(accountId, params.userId, body, actor)
      ),
      {
        requestId,
      }
    )
  }
)

/** DELETE /api/v1/users/:userId — soft, and ends every session. */
export const DELETE = route<Params>(
  { permissions: [Permission.USER_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    await deactivateUser(accountId, params.userId, actor)

    return noContent(requestId)
  }
)
