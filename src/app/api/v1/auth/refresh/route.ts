import { describeUser, refresh } from '@/server/auth/auth.service'
import { toLoginResponse } from '@/server/auth/auth.types'
import { RefreshSchema } from '@/server/auth/auth.validation'
import { getRequestContext } from '@/server/context/request-context'
import { publicRoute } from '@/server/middleware/auth.middleware'
import { enforceRateLimit } from '@/server/middleware/rate-limit.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/auth/refresh
 *
 * Exchange a refresh token for a new token pair. Presenting a token that has
 * already been rotated revokes the whole session — see `rotateTokens`.
 */
export const POST = publicRoute(async ({ request, requestId }) => {
  enforceRateLimit(request, 'auth', 'refresh')

  const body = await parseJsonBody(request, RefreshSchema)

  const context = getRequestContext()
  const result = await refresh(body.refreshToken, {
    ip: context?.ip,
    userAgent: context?.userAgent,
  })

  return ok(toLoginResponse(result.tokens, await describeUser(result.user)), {
    requestId,
  })
})
