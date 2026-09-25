import { toLoginResponse } from '@/server/auth/auth.types'
import { describeUser } from '@/server/auth/auth.service'
import { publicRoute } from '@/server/middleware/auth.middleware'
import { enforceRateLimit } from '@/server/middleware/rate-limit.middleware'
import { acceptInvitation } from '@/server/users/invitation.service'
import { AcceptInvitationSchema } from '@/server/users/invitation.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/invitations/accept
 *
 * Public: the invitee has no account yet, which is the whole point. The account
 * is discovered from the token rather than supplied by the caller.
 *
 * A wrong token, an expired one and an already-used one all answer identically —
 * an invitee cannot act on the difference, and telling an attacker which they
 * hit turns this into an oracle. Rate-limited for the same reason login is.
 *
 * Succeeds with a full session, so the new user lands signed in rather than at
 * a login form typing the password they just chose.
 */
export const POST = publicRoute(async ({ request, requestId }) => {
  enforceRateLimit(request, 'auth', 'invitation-accept')

  const body = await parseJsonBody(request, AcceptInvitationSchema)
  const { tokens, user } = await acceptInvitation(body.token, body.password)

  return ok(toLoginResponse(tokens, await describeUser(user)), {
    requestId,
  })
})
