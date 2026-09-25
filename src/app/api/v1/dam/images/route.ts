import { Permission } from '@/server/auth/permissions'
import { listDamImages } from '@/server/dam/dam.service'
import { DamListQuerySchema } from '@/server/dam/dam.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/dam/images?search=&page=&pageSize=&sortOn=&sortDirection=
 *
 * Every image the client holds, across folders, from Ticket-IT's
 * `ImageManagement/GetImagesByClient`.
 */
export const GET = route(
  { permissions: [Permission.DAM_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, DamListQuerySchema)
    return ok(await listDamImages(actor, query), { requestId })
  }
)
