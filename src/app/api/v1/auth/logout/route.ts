import { logout } from '@/server/auth/auth.service'
import { LogoutSchema } from '@/server/auth/auth.validation'
import { publicRoute } from '@/server/middleware/auth.middleware'
import { noContent } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/auth/logout
 *
 * Revoke a refresh token. Public and idempotent: a client holding an expired
 * access token must still be able to end its session, and an unknown token is
 * not an error.
 */
export const POST = publicRoute(async ({ request, requestId }) => {
  const body = await parseJsonBody(request, LogoutSchema)
  await logout(body.refreshToken)

  return noContent(requestId)
})
