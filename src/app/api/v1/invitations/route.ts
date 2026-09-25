import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  createInvitation,
  listInvitations,
} from '@/server/users/invitation.service'
import { toInvitationView } from '@/server/users/user.types'
import {
  CreateInvitationSchema,
  ListInvitationsQuerySchema,
} from '@/server/users/invitation.validation'
import { ok } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/invitations
 *
 * The user row is created at *acceptance*, not here. A revoked or expired
 * invitation therefore leaves nothing behind that could later be logged into,
 * and an administrator who mistypes an address has not created an account for a
 * stranger.
 *
 * Inviting an address that already has a live invitation revokes the old one
 * first: two valid tokens for one address means revoking one does not actually
 * revoke access.
 */
export const POST = route(
  { permissions: [Permission.USER_INVITE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateInvitationSchema)
    const invitation = await createInvitation(
      resolveAccountId(actor, body.accountId),
      body,
      actor
    )

    return ok(toInvitationView(invitation), { status: 201, requestId })
  }
)

/** GET /api/v1/invitations — outstanding and historical invitations. */
export const GET = route(
  { permissions: [Permission.USER_INVITE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListInvitationsQuerySchema)
    const page = await listInvitations(
      resolveAccountId(actor, query.accountId),
      query
    )

    return ok(
      { ...page, items: page.items.map(toInvitationView) },
      { requestId }
    )
  }
)
