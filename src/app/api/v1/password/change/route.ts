import { route } from '@/server/middleware/auth.middleware'
import { changePassword } from '@/server/users/password-reset.service'
import { ChangePasswordSchema } from '@/server/users/invitation.validation'
import { noContent } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/password/change
 *
 * Proves the old credential first, so a token lifted from an unlocked machine
 * cannot be used to take the account over. "No local password" and "wrong
 * password" answer identically: distinguishing them would tell an attacker
 * holding a stolen token which accounts are legacy-backed.
 *
 * Every refresh token is revoked, so no session can be renewed. Access tokens
 * are stateless and are *not* revoked — one already issued keeps working for up
 * to fifteen minutes, which is worth stating because "signs you out everywhere"
 * is what a user will assume.
 */
export const POST = route({}, async ({ request, actor, requestId }) => {
  const body = await parseJsonBody(request, ChangePasswordSchema)
  await changePassword(actor.userId, body.currentPassword, body.newPassword)

  return noContent(requestId)
})
