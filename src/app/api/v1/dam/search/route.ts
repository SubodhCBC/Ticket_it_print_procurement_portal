import { Permission } from '@/server/auth/permissions'
import { searchDam } from '@/server/dam/dam.service'
import { DamListQuerySchema } from '@/server/dam/dam.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/dam/search?search=&page=&pageSize=&sortOn=&sortDirection=
 *
 * Ticket-IT's `ImageManagement/AdvanceSearch`. Results can include folders as
 * well as files; each item's `kind` says which.
 */
export const GET = route(
  { permissions: [Permission.DAM_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, DamListQuerySchema)
    return ok(await searchDam(actor, query), { requestId })
  }
)
