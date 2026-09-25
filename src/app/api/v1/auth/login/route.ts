import { describeUser, login, markLoggedIn } from '@/server/auth/auth.service'
import { toLoginResponse } from '@/server/auth/auth.types'
import { LoginSchema } from '@/server/auth/auth.validation'
import { getRequestContext } from '@/server/context/request-context'
import { publicRoute } from '@/server/middleware/auth.middleware'
import { enforceRateLimit } from '@/server/middleware/rate-limit.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

/**
 * Prisma, Argon2 and AsyncLocalStorage all need real Node — none of them run on
 * the Edge runtime. Every route under `api/` that reaches the server layer
 * declares this.
 */
export const runtime = 'nodejs'

/**
 * POST /api/auth/login
 *
 * Authenticate with a portal or legacy credential. The first login for a user
 * is verified against the legacy Ticket-IT database and replicates them into
 * the portal database; later logins are served entirely from the portal
 * database.
 */
export const POST = publicRoute(async ({ request, requestId }) => {
  // A tighter limit than the global one: credential endpoints are the only
  // place where an attacker gets to guess.
  enforceRateLimit(request, 'auth', 'login')

  const body = await parseJsonBody(request, LoginSchema)

  const context = getRequestContext()
  const result = await login(body.login, body.password, {
    ip: context?.ip,
    userAgent: context?.userAgent,
  })

  await markLoggedIn(result.user.id)

  return ok(toLoginResponse(result.tokens, await describeUser(result.user)), {
    requestId,
  })
})
