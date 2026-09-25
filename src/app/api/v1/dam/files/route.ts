import { Permission } from '@/server/auth/permissions'
import {
  deleteDamFile,
  listDamFolderContents,
  uploadDamFiles,
} from '@/server/dam/dam.service'
import {
  DamDeleteFileQuerySchema,
  DamFolderContentsQuerySchema,
  DamUploadSchema,
} from '@/server/dam/dam.validation'
import { route } from '@/server/middleware/auth.middleware'
import { noContent, ok } from '@/server/utils/response'
import { parseMultipartBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/dam/files?folderPath=&search=&page=&pageSize=&sortOn=&sortDirection=
 *
 * One folder's sub-folders and a page of its files, from Ticket-IT's
 * `ImageManagement/GetFilesByClient`. Omit `folderPath` for the root.
 */
export const GET = route(
  { permissions: [Permission.DAM_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, DamFolderContentsQuerySchema)
    return ok(await listDamFolderContents(actor, query), { requestId })
  }
)

/**
 * POST /api/v1/dam/files — adds files to the library.
 *
 * `multipart/form-data`: one or more file parts, plus an optional `folderPath`
 * text part naming the folder to put them in. Omit it for the root. Ten files,
 * 25MB each and 60MB in total at most; images and PDFs only.
 *
 * The response carries one entry per file sent, each with the URL and folder the
 * library now holds it under. Those come from re-listing the folder, because
 * `UploadImage` itself answers with no URL and no id; an entry whose `confirmed`
 * is false is a file that was stored but could not be found again, so its URL is
 * null and the folder is worth a look.
 *
 * @error 400 VALIDATION_FAILED A file is too big, empty, badly named, or of a type the library does not take.
 * @error 403 TICKETIT_SESSION_REQUIRED The user has no live Ticket-IT session, so there is no library to write to.
 */
export const POST = route(
  { permissions: [Permission.DAM_UPLOAD] },
  async ({ request, actor, requestId }) => {
    const { fields, files } = await parseMultipartBody(request, DamUploadSchema)
    const result = await uploadDamFiles(actor, fields, files)
    return ok(result, { status: 201, requestId })
  }
)

/**
 * DELETE /api/v1/dam/files?folderPath=&fileName=&mimeType= — removes one file.
 *
 * Ticket-IT's `ImageManagement/UnlinkFile`. The target is named by folder and
 * file name because that is a library file's whole identity — there are no ids —
 * and `mimeType` is passed on when the caller knows it. Omit `folderPath` for a
 * file in the root.
 *
 * Permanent: there is no undo upstream and the portal keeps no copy.
 *
 * @error 403 TICKETIT_SESSION_REQUIRED The user has no live Ticket-IT session, so there is no library to write to.
 * @error 404 NOT_FOUND No such file in that folder.
 */
export const DELETE = route(
  { permissions: [Permission.DAM_DELETE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, DamDeleteFileQuerySchema)
    await deleteDamFile(actor, query)
    return noContent(requestId)
  }
)
