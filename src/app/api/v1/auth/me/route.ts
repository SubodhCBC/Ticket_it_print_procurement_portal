import { describeUser, findActiveUser } from '@/server/auth/auth.service'
import { toUserView } from '@/server/auth/auth.types'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

/**
 * GET /api/auth/me
 *
 * The currently authenticated user, described exactly as login and refresh
 * describe them — same account, site and permission fields, so a client never
 * loses information by rotating its token.
 */
export const GET = route({}, async ({ actor, requestId }) => {
  const user = await findActiveUser(actor.userId)
  return ok(toUserView(await describeUser(user)), { requestId })
})
