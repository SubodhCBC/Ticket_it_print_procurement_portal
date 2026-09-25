import { publicRoute } from '@/server/middleware/auth.middleware'
import { enforceRateLimit } from '@/server/middleware/rate-limit.middleware'
import { getRequestContext } from '@/server/context/request-context'
import { requestPasswordReset } from '@/server/users/password-reset.service'
import { RequestPasswordResetSchema } from '@/server/users/invitation.validation'
import { noContent } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/password/forgot
 *
 * Always 204, whatever the identifier was. An endpoint that answered differently
 * for a known and an unknown address would let anyone test whether a given
 * person has an account here.
 *
 * A user whose account lives in Ticket-IT is forwarded to it: their password is
 * upstream, so Ticket-IT sends the email and mints the token, and the portal
 * only relays the request. An identifier with no local user at all is forwarded
 * too — someone who has never signed in here still has an account there.
 */
export const POST = publicRoute(async ({ request, requestId }) => {
  enforceRateLimit(request, 'auth', 'password-forgot')

  const body = await parseJsonBody(request, RequestPasswordResetSchema)
  const context = getRequestContext()

  await requestPasswordReset(body.identifier, {
    ip: context?.ip,
    userAgent: context?.userAgent,
  })

  return noContent(requestId)
})
