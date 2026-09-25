import { permissionCatalog } from '@/server/auth/permission-catalog'
import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

/**
 * GET /api/v1/authorization/permissions
 *
 * The permission catalogue and each role's baseline, so the roles-and-
 * permissions screen renders the matrix rather than hard-coding a second copy
 * of it.
 *
 * Read-only, and it stays that way: the baseline is compiled into the
 * application, so there is nothing here to PUT. Departures from it are per-user
 * grants on `/users/:userId/permissions`.
 */
export const GET = route(
  { permissions: [Permission.USER_MANAGE] },
  ({ requestId }) => ok(permissionCatalog(), { requestId })
)
