import { publicRoute } from '@/server/middleware/auth.middleware'
import { enforceRateLimit } from '@/server/middleware/rate-limit.middleware'
import { completePasswordReset } from '@/server/users/password-reset.service'
import { ResetPasswordSchema } from '@/server/users/invitation.validation'
import { noContent } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/password/reset
 *
 * Completes a reset and revokes every session. A password is usually reset
 * because the old one may be known to someone else, and leaving their refresh
 * token live for another thirty days would make the reset cosmetic.
 */
export const POST = publicRoute(async ({ request, requestId }) => {
  enforceRateLimit(request, 'auth', 'password-reset')

  const body = await parseJsonBody(request, ResetPasswordSchema)
  await completePasswordReset(body.token, body.password)

  return noContent(requestId)
})
