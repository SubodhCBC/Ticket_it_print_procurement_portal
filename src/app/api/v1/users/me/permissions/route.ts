import { resolvePermissions } from '@/server/auth/permission.service'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

/**
 * GET /api/v1/users/me/permissions
 *
 * The role baseline with the caller's own grants applied. The frontend uses it
 * to decide which navigation and actions to render — it is a convenience, not
 * the enforcement point, which is always the guard on the endpoint itself.
 *
 * No permission is required: everyone may ask what they themselves can do.
 */
export const GET = route({}, async ({ actor, requestId }) => {
  const effective = await resolvePermissions(actor)

  return ok(
    {
      userId: actor.userId,
      role: actor.role,
      userType: actor.userType,
      permissions: [...effective.accountWide].sort(),
    },
    { requestId }
  )
})
