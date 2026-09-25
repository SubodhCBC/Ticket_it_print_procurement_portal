import { Permission } from '@/server/auth/permissions'
import { createDamFolder, listDamFolders } from '@/server/dam/dam.service'
import {
  CreateDamFolderSchema,
  DamListQuerySchema,
} from '@/server/dam/dam.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/dam/folders?search=&page=&pageSize=&sortOn=&sortDirection=
 *
 * The client's folders, from Ticket-IT's `ImageManagement/GetFolderSubFolder`.
 * Pass a folder's `path` to /dam/files as `folderPath` to open it.
 */
export const GET = route(
  { permissions: [Permission.DAM_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, DamListQuerySchema)
    return ok(await listDamFolders(actor, query), { requestId })
  }
)

/**
 * POST /api/v1/dam/folders — makes a folder.
 *
 * Ticket-IT's `ImageManagement/CreateFolder`. `folderPath` is the folder's full
 * path, so a folder per template or product is one call rather than a walk down
 * the tree.
 *
 * Whether a nested path creates its intermediate folders, and what happens when
 * the folder already exists, are not documented upstream and are not guessed at
 * here — Ticket-IT's own answer comes back. A caller that needs "make it if it
 * is missing" checks GET /dam/folders first.
 *
 * @error 403 TICKETIT_SESSION_REQUIRED The user has no live Ticket-IT session, so there is no library to write to.
 */
export const POST = route(
  { permissions: [Permission.DAM_UPLOAD] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateDamFolderSchema)
    return ok(await createDamFolder(actor, body), { status: 201, requestId })
  }
)
