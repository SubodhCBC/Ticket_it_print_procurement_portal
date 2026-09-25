import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { revokeInvitation } from '@/server/users/invitation.service'
import { noContent } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'

export const runtime = 'nodejs'

type Params = { invitationId: string }

/**
 * POST /api/v1/invitations/:invitationId/revoke
 *
 * An invitation that does not exist and one already accepted answer the same
 * 404: distinguishing them would leak whether an invitation was taken up.
 */
export const POST = route<Params>(
  { permissions: [Permission.USER_INVITE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(
      actor,
      new URL(request.url).searchParams.get('accountId') ?? undefined
    )
    await revokeInvitation(accountId, params.invitationId)

    return noContent(requestId)
  }
)
