import { Permission } from '@/server/auth/permissions'
import { getDamFileNotes } from '@/server/dam/dam.service'
import { DamFileNotesQuerySchema } from '@/server/dam/dam.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/dam/files/notes?folderPath=&fileName=
 *
 * The notes left against one file, from Ticket-IT's
 * `ImageManagement/getFileNotes`. Read-only: adding or deleting a note is not
 * wired yet.
 */
export const GET = route(
  { permissions: [Permission.DAM_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, DamFileNotesQuerySchema)
    return ok(await getDamFileNotes(actor, query), { requestId })
  }
)
