import { AuditAction, type AuditEventAction } from '../audit/audit.actions'
import { AuditEntityType } from '../audit/audit.entity-types'
import { recordAudit } from '../audit/audit.service'
import {
  forgetTicketItToken,
  isTicketItTokenStoreConfigured,
  recallTicketItToken,
} from '../auth/ticketit/ticketit-token.store'
import {
  isTicketItConfigured,
  TicketItApiError,
  ticketItRequest,
} from '../auth/ticketit/ticketit.client'
import { getConfig } from '../config'
import {
  forgetDamServiceToken,
  isDamServiceAccountConfigured,
  recallDamServiceToken,
} from './dam-service-account'
import type { AuthenticatedActor } from '../context/request-context'
import {
  AppError,
  BusinessRuleError,
  DependencyUnavailableError,
  ErrorCode,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors'
import {
  FILE_LIST_KEYS,
  FOLDER_LIST_KEYS,
  isFolderRow,
  locateRows,
  ROW_KEYS,
  toFileNotes,
  toFiles,
  toFolders,
  toUploadedFiles,
  unrecognisedPayload,
  type LocatedRows,
} from './dam.mapper'
import type {
  DamFile,
  DamFileContent,
  DamFileNotes,
  DamFolder,
  DamFolderContents,
  DamPage,
  DamStatus,
  DamUploadedFile,
  DamUploadResult,
} from './dam.types'
import {
  assertUploadableFiles,
  damCopyMaxBytes,
  splitDamDocumentId,
  type CreateDamFolderDto,
  type DamDeleteFileQueryDto,
  type DamFileNotesQueryDto,
  type DamFileRefDto,
  type DamFolderContentsQueryDto,
  type DamListQueryDto,
  type DamUploadDto,
} from './dam.validation'

/**
 * The document library (DAM), reached through Ticket-IT's ImageManagement API.
 *
 * ---------------------------------------------------------------------------
 * Whose credential
 * ---------------------------------------------------------------------------
 * The signed-in user's own Ticket-IT token, kept at login by
 * `ticketit-token.store.ts`. Ticket-IT picks whose library to return from that
 * token alone, so it is also what keeps one tenant out of another's artwork. The
 * portal adds no scoping on top, and must never swap in any other token.
 *
 * Portal-native users (invited, seeded) have no Ticket-IT account and so no
 * library. They get TICKETIT_SESSION_REQUIRED, the same as a Ticket-IT user
 * whose upstream session has lapsed — both are fixed by a Ticket-IT sign-in.
 *
 * ---------------------------------------------------------------------------
 * What is wired
 * ---------------------------------------------------------------------------
 * Reading: folders, a folder's contents, the client's images, search, and a
 * file's notes. Ticket-IT takes paging in a request body, so every one of those
 * is a POST upstream; none of them changes anything, which is why the portal
 * exposes them as GETs.
 *
 * Writing: upload, delete one file (`UnlinkFile`), and create a folder.
 * Renaming and deleting folders, note editing (`upsertFileNotes`,
 * `deleteFileNotes`) and the share cart all exist upstream and are not wired.
 *
 * The routes enforce `DAM_VIEW` to read, `DAM_UPLOAD` to upload or make a
 * folder, and `DAM_DELETE` to remove a file. Every successful call is audited,
 * reads included: a DAM is a store whose *reading* is itself the sensitive
 * act.
 */

const IMAGE_MANAGEMENT_PATH = '/api/v1/ImageManagement'

const NO_SESSION_MESSAGE =
  'The image library needs a Ticket-IT sign-in. Sign out, then sign in with ' +
  'your Ticket-IT account.'

const EXPIRED_SESSION_MESSAGE =
  'Your Ticket-IT session has expired. Sign out and sign in again to open the ' +
  'image library.'

const EMPTY: LocatedRows = { rows: [], total: 0 }

/**
 * 403, not 401: the portal session is fine. The client treats a 401 as its own
 * access token expiring and would refresh-and-retry against the wrong token.
 */
class TicketItSessionRequiredError extends AppError {
  constructor(message: string) {
    super(ErrorCode.TICKETIT_SESSION_REQUIRED, 403, message)
  }
}

/**
 * Whether the library can be offered to this user. Does not call Ticket-IT:
 * `connected` means a token is held, not that Ticket-IT will still accept it.
 */
export async function getDamStatus(
  actor: AuthenticatedActor
): Promise<DamStatus> {
  if (missingConfiguration().length > 0) {
    return {
      enabled: false,
      connected: false,
      reason: 'The image library is not switched on for this portal.',
    }
  }

  const connected = (await recallTicketItToken(actor.userId)) !== null
  return {
    enabled: true,
    connected,
    reason: connected ? null : NO_SESSION_MESSAGE,
  }
}

/** `ImageManagement/GetFolderSubFolder` — the client's folders. */
export async function listDamFolders(
  actor: AuthenticatedActor,
  query: DamListQueryDto
): Promise<DamPage<DamFolder>> {
  const operation = 'GetFolderSubFolder'
  const payload = await callImageManagement(actor, operation, searchBody(query))

  const located = locateOrThrow(operation, payload, [
    ...FOLDER_LIST_KEYS,
    ...ROW_KEYS,
  ])
  const items = toFolders(operation, located.rows)

  await recordDamAudit(
    AuditAction.DAM_DOCUMENTS_LISTED,
    'dam:folders',
    'Image library folders',
    { search: query.search ?? null, page: query.page, returned: items.length }
  )

  return toPage(items, located, query)
}

/** `ImageManagement/GetFilesByClient` — one folder's sub-folders and files. */
export async function listDamFolderContents(
  actor: AuthenticatedActor,
  query: DamFolderContentsQueryDto
): Promise<DamFolderContents> {
  const operation = 'GetFilesByClient'
  const folderPath = query.folderPath ?? null
  const payload = await callImageManagement(actor, operation, {
    ...searchBody(query),
    folderPath,
  })

  const { folders, files, located } = splitContents(operation, payload)

  await recordDamAudit(
    AuditAction.DAM_DOCUMENTS_LISTED,
    `dam:folder:${folderPath ?? ''}`,
    folderPath ?? 'Image library root',
    {
      folderPath,
      search: query.search ?? null,
      page: query.page,
      returnedFiles: files.length,
      returnedFolders: folders.length,
    }
  )

  return { ...toPage(files, located, query), folderPath, folders }
}

/** `ImageManagement/GetImagesByClient` — every image the client holds. */
export async function listDamImages(
  actor: AuthenticatedActor,
  query: DamListQueryDto
): Promise<DamPage<DamFile>> {
  return listFiles(actor, 'GetImagesByClient', 'dam:images', query)
}

/** `ImageManagement/AdvanceSearch` — may return folders as well as files. */
export async function searchDam(
  actor: AuthenticatedActor,
  query: DamListQueryDto
): Promise<DamPage<DamFile>> {
  return listFiles(actor, 'AdvanceSearch', 'dam:search', query)
}

/** `ImageManagement/getFileNotes` — the notes left against one file. */
export async function getDamFileNotes(
  actor: AuthenticatedActor,
  query: DamFileNotesQueryDto
): Promise<DamFileNotes> {
  const operation = 'getFileNotes'
  const folderPath = query.folderPath ?? null
  const payload = await callImageManagement(actor, operation, {
    fileNoteId: null,
    folderPath,
    fileName: query.fileName,
  })

  const items = toFileNotes(operation, payload)
  const fullPath = folderPath
    ? `${folderPath}/${query.fileName}`
    : query.fileName

  await recordDamAudit(AuditAction.DAM_DOCUMENT_VIEWED, fullPath, fullPath, {
    folderPath,
    fileName: query.fileName,
    returnedNotes: items.length,
  })

  return { folderPath, fileName: query.fileName, items }
}

/**
 * `ImageManagement/UploadImage` — adds files to the library.
 *
 * All of them in one upstream call, because that is the only shape the endpoint
 * offers: there is no per-file result and no partial success to report. Either
 * Ticket-IT accepts the batch or the whole request fails, which is also the
 * honest thing to show a user who dropped eight files onto a folder.
 *
 * Nothing is written on the portal's side. The library lives in Ticket-IT, and a
 * row here recording what is in it would be a second copy of the truth that
 * drifts the first time someone uploads through Ticket-IT's own interface.
 */
export async function uploadDamFiles(
  actor: AuthenticatedActor,
  dto: DamUploadDto,
  files: readonly File[]
): Promise<DamUploadResult> {
  assertUploadableFiles(files)

  const operation = 'UploadImage'
  const folderPath = dto.folderPath ?? null
  const { fileField, timeoutMs } = getConfig().dam.upload

  // Trimmed, and passed explicitly: without a third argument `FormData` labels
  // the part "blob" and the library fills up with files called blob. Trimmed
  // because that is the name `assertUploadableFiles` approved and the one
  // reported back, so it must also be the one stored.
  const uploaded = files.map((file) => file.name.trim())

  // The folder is made first, so a caller filing into `Templates/<id>` does not
  // have to know whether that folder exists yet. Best-effort on purpose: the
  // library documents neither what it answers for a folder that is already
  // there nor whether a nested path is created a level at a time, and an upload
  // must not fail because a folder it was about to use already existed.
  if (folderPath !== null) {
    try {
      await callImageManagement(actor, 'CreateFolder', {
        folderPath,
        oldFolderPath: null,
      })
    } catch (error) {
      console.warn(
        `Could not pre-create the image library folder "${folderPath}"; ` +
          'continuing with the upload, which fails on its own if the folder ' +
          'is genuinely missing.',
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  const form = new FormData()
  files.forEach((file, i) => form.append(fileField, file, uploaded[i]))
  // Omitted rather than sent empty for the root — an empty string is a folder
  // named "" to a path-joining server, and null is not expressible in a form.
  if (folderPath !== null) form.append('folderPath', folderPath)

  const payload = await callImageManagement(actor, operation, form, {
    timeoutMs,
  })

  const stored = await locateUploaded(
    actor,
    folderPath,
    uploaded,
    toUploadedFiles(operation, payload)
  )
  const confirmed = stored.filter((file) => file.confirmed).length

  await recordDamAudit(
    AuditAction.DAM_DOCUMENT_UPLOADED,
    `dam:folder:${folderPath ?? ''}`,
    folderPath ?? 'Image library root',
    {
      folderPath,
      fileField,
      fileNames: uploaded,
      fileCount: uploaded.length,
      totalBytes: files.reduce((sum, file) => sum + file.size, 0),
      // A count short of fileCount is the trail to follow when a folder looks
      // empty after an upload that reported success.
      confirmed,
    }
  )

  return { folderPath, files: stored }
}

/**
 * `ImageManagement/UnlinkFile` — removes one file from the library.
 *
 * Permanent as far as the portal is concerned: there is no undo upstream and no
 * copy here, which is why `DAM_DELETE` is separate from `DAM_UPLOAD` and why the
 * audit row is written whatever else happens.
 */
export async function deleteDamFile(
  actor: AuthenticatedActor,
  query: DamDeleteFileQueryDto
): Promise<void> {
  const operation = 'UnlinkFile'
  const folderPath = query.folderPath ?? null
  const fullPath = folderPath
    ? `${folderPath}/${query.fileName}`
    : query.fileName

  await callImageManagement(actor, operation, {
    folderPath,
    fileName: query.fileName,
    mimeType: query.mimeType ?? null,
  })

  await recordDamAudit(AuditAction.DAM_DOCUMENT_DELETED, fullPath, fullPath, {
    folderPath,
    fileName: query.fileName,
    mimeType: query.mimeType ?? null,
  })
}

/**
 * `ImageManagement/CreateFolder` — makes a folder.
 *
 * Whether the library creates intermediate folders for a nested path, and what
 * it does when the folder already exists, are both undocumented. Neither is
 * guessed at here: the path goes up as given and Ticket-IT's own answer comes
 * back, so a caller that needs "create if absent" checks the listing first.
 */
export async function createDamFolder(
  actor: AuthenticatedActor,
  dto: CreateDamFolderDto
): Promise<{ folderPath: string }> {
  const operation = 'CreateFolder'

  await callImageManagement(actor, operation, {
    folderPath: dto.folderPath,
    oldFolderPath: null,
  })

  await recordDamAudit(
    AuditAction.DAM_FOLDER_CREATED,
    dto.folderPath,
    dto.folderPath,
    { folderPath: dto.folderPath }
  )

  return { folderPath: dto.folderPath }
}

/**
 * The bytes of one library file, on the *portal's own* credential.
 *
 * Only for artwork that genuinely belongs to the operator: product assets, which
 * sit behind `CATALOG_MANAGE` and are withheld from every customer role, and
 * operator-owned templates. Anything a customer owns must go through
 * `readDamFileAsActor` instead — see the warning there.
 *
 * Two steps, because the library offers no "download this file" operation: the
 * folder is searched to turn a folder-and-name into a link, and the link is then
 * fetched. Doing both here, back to back, is also what makes a signed and
 * short-lived link safe to use — it is spent immediately and never stored.
 */
export async function readOperatorDamFile(
  ref: DamFileRefDto
): Promise<DamFileContent> {
  if (!isDamServiceAccountConfigured()) {
    console.warn(
      'A template or product asset was attached from the image library, but ' +
        'DAM_SERVICE_LOGIN and DAM_SERVICE_PASSWORD are not set.'
    )
    throw new DependencyUnavailableError('The image library')
  }

  return readDamFile(ref, (folderPath, fileName) =>
    findFileIn(folderPath, fileName, (operation, body) =>
      callImageManagementAsService(operation, body)
    )
  )
}

/**
 * The same, on the signed-in user's own credential.
 *
 * For a customer-owned template. Two things go wrong if the service credential
 * is used there, and the second is the serious one:
 *
 * 1. The file is not found. The customer uploaded it into *their* library, and
 *    Ticket-IT picks whose library to search from the token alone.
 * 2. A file of that name in the *operator's* library is found instead — so a
 *    customer could name any path and have the portal copy the operator's
 *    artwork into their own template. The caller never sees the library, so
 *    nothing else would catch it.
 *
 * Which credential to use is therefore decided by who owns the record the asset
 * is being attached to, and nowhere else.
 */
export async function readDamFileAsActor(
  actor: AuthenticatedActor,
  ref: DamFileRefDto
): Promise<DamFileContent> {
  return readDamFile(ref, (folderPath, fileName) =>
    findFileIn(folderPath, fileName, (operation, body) =>
      callImageManagement(actor, operation, body)
    )
  )
}

async function readDamFile(
  ref: DamFileRefDto,
  find: (folderPath: string | null, fileName: string) => Promise<DamFile | null>
): Promise<DamFileContent> {
  const { folderPath, fileName } = splitDamDocumentId(ref.damDocumentId)
  const file = await find(folderPath, fileName)

  const url = file?.url ?? trustedCallerUrl(ref.damUrl)
  if (!url) {
    throw new BusinessRuleError(
      file
        ? `The image library lists "${fileName}" but gave no link to it, so ` +
            'the portal cannot copy it. Re-upload the file to the library.'
        : `The image library has no file called "${fileName}"` +
            (folderPath ? ` in ${folderPath}.` : ' in its root.'),
      { details: { folderPath, fileName } }
    )
  }

  const { bytes, contentType } = await downloadDamUrl(url, fileName)

  return {
    fileName: file?.name ?? fileName,
    folderPath: file?.folderPath ?? folderPath,
    bytes,
    sizeBytes: bytes.byteLength,
    // Read off the file, falling back to the listing and only then to what the
    // caller claimed — a client that mislabels a PDF as a PNG must not have the
    // row agree with it.
    contentType:
      contentType ??
      file?.contentType ??
      ref.contentType ??
      'application/octet-stream',
  }
}

/**
 * Removes an operator-owned file from the library, on the portal's own
 * credential.
 *
 * Called when a template or product asset is detached, so the library does not
 * fill up with files no record points at any more.
 *
 * Never throws. The asset row is already gone by the time this runs, and failing
 * the request afterwards would tell an admin the delete did not work when the
 * part they care about did. A file left behind is reported to the log and is
 * removable by hand from `DELETE /api/v1/dam/files`.
 *
 * Note what this means: detaching an image deletes it from the shared library,
 * where a person may have put it deliberately and may be using it elsewhere. It
 * is the requested behaviour, not an accident — `dam.service` has no way to know
 * whether anything else references a file, because the library has no such
 * concept.
 */
export async function forgetOperatorDamFile(
  damDocumentId: string,
  contentType?: string | null
): Promise<void> {
  await forgetDamFile(damDocumentId, contentType, (operation, body) =>
    callImageManagementAsService(operation, body)
  )
}

/**
 * The same, on the signed-in user's own credential, for a customer-owned
 * record.
 *
 * The mirror of `readDamFileAsActor`, and it matters for the same reason in
 * reverse: unlinking a customer's file with the operator's credential would
 * either miss it entirely or delete the operator's file of that name.
 */
export async function forgetDamFileAsActor(
  actor: AuthenticatedActor,
  damDocumentId: string,
  contentType?: string | null
): Promise<void> {
  await forgetDamFile(damDocumentId, contentType, (operation, body) =>
    callImageManagement(actor, operation, body)
  )
}

async function forgetDamFile(
  damDocumentId: string,
  contentType: string | null | undefined,
  call: (operation: string, body: Record<string, unknown>) => Promise<unknown>
): Promise<void> {
  const { folderPath, fileName } = splitDamDocumentId(damDocumentId)
  if (!fileName) return

  try {
    await call('UnlinkFile', {
      folderPath,
      fileName,
      mimeType: contentType ?? null,
    })
  } catch (error) {
    console.warn(
      `Detached an asset but could not remove "${damDocumentId}" from the ` +
        'image library; it is now an orphaned file.',
      error instanceof Error ? error.message : String(error)
    )
  }
}

/**
 * The URL a caller supplied, but only if it points at the library.
 *
 * The fallback for a file the listing cannot find — a folder that pages oddly, a
 * name the library normalised — and the reason it is checked at all is that this
 * server would otherwise fetch any address a caller named, including ones only
 * reachable from inside the network.
 */
function trustedCallerUrl(damUrl: string | undefined): string | null {
  if (!damUrl) return null

  const base = getConfig().ticketItApi.baseUrl
  if (!base) return null

  let candidate: URL
  let allowed: URL
  try {
    candidate = new URL(damUrl)
    allowed = new URL(base)
  } catch {
    return null
  }

  if (candidate.protocol !== 'https:' && candidate.protocol !== 'http:') {
    return null
  }

  // The library's own host, or the storage host it redirects to. Only an exact
  // host match or a subdomain of it — `evil-ticketit.example` must not pass a
  // check that `ticketit.example` would.
  const host = candidate.hostname.toLowerCase()
  const trusted = allowed.hostname.toLowerCase()
  if (host !== trusted && !host.endsWith(`.${trusted}`)) {
    console.warn(
      `Ignoring a damUrl on ${host}: it is not ${trusted} or a subdomain of it.`
    )
    return null
  }

  return damUrl
}

/** The one file of that name in that folder, or null, on whichever credential. */
async function findFileIn(
  folderPath: string | null,
  fileName: string,
  call: (operation: string, body: Record<string, unknown>) => Promise<unknown>
): Promise<DamFile | null> {
  const operation = 'GetFilesByClient'
  const payload = await call(operation, {
    pageNumber: 1,
    pageSize: LOOKUP_PAGE_SIZE,
    // Narrowed upstream so a folder of a thousand files still answers in one
    // page. The exact match below is what actually decides.
    searchString: fileName,
    sortOn: null,
    sortDirection: null,
    folderPath,
  })

  const { files } = splitContents(operation, payload)
  const wanted = fileName.trim().toLowerCase()
  return files.find((file) => file.name.trim().toLowerCase() === wanted) ?? null
}

/**
 * Fetches a library link and returns what it gave back.
 *
 * Tried anonymously first: these links are usually blob-storage URLs that carry
 * their own signature and reject an unexpected `Authorization` header. The
 * bearer is only offered if the anonymous attempt is refused, which is the case
 * where the link is a portal-side route rather than a storage URL.
 */
async function downloadDamUrl(
  url: string,
  fileName: string
): Promise<{ bytes: Buffer; contentType: string | null }> {
  const timeoutMs = getConfig().dam.upload.timeoutMs

  let response = await fetchQuietly(url, timeoutMs)
  if (response && (response.status === 401 || response.status === 403)) {
    response = await fetchQuietly(url, timeoutMs, await recallDamServiceToken())
  }

  if (!response) {
    throw new DependencyUnavailableError('The image library')
  }
  if (!response.ok) {
    throw new AppError(
      ErrorCode.UPSTREAM_ERROR,
      502,
      `The image library refused to hand over "${fileName}".`,
      { details: { upstreamStatus: response.status } }
    )
  }

  // Checked before reading, so an oversized file is refused rather than
  // buffered. The length is a hint, not a guarantee, so the bytes are checked
  // again below.
  const limit = damCopyMaxBytes()
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > limit) {
    throw tooLarge(fileName, declared)
  }

  const bytes = Buffer.from(await response.arrayBuffer())
  if (bytes.byteLength > limit) {
    throw tooLarge(fileName, bytes.byteLength)
  }
  if (bytes.byteLength === 0) {
    throw new BusinessRuleError(`"${fileName}" is empty in the image library.`)
  }

  const contentType =
    response.headers.get('content-type')?.split(';')[0].trim() || null

  return { bytes, contentType }
}

async function fetchQuietly(
  url: string,
  timeoutMs: number,
  bearer?: string
): Promise<Response | null> {
  try {
    return await fetch(url, {
      headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store',
      redirect: 'follow',
    })
  } catch (error) {
    console.error(`Could not fetch an image library file`, error)
    return null
  }
}

function tooLarge(fileName: string, bytes: number): AppError {
  const mb = (value: number) => Math.round((value / 1_048_576) * 10) / 10
  return new BusinessRuleError(
    `"${fileName}" is ${mb(bytes)}MB. The portal copies at most ` +
      `${mb(damCopyMaxBytes())}MB out of the library.`
  )
}

// --- Internals -----------------------------------------------------------------

/** One page of the folder listing used to find a just-uploaded file. */
const LOOKUP_PAGE_SIZE = 100

/**
 * How far into a folder to look before giving up.
 *
 * Five pages is five hundred files. A folder deeper than that, with the new file
 * not near the front of it, falls through to the per-name search below — which
 * is the reliable path and is only skipped first because one listing covers
 * every file of a ten-file upload at once.
 */
const LOOKUP_MAX_PAGES = 5

/**
 * Finds the files an upload just stored, so the caller gets URLs instead of a
 * name and a search to run.
 *
 * `UploadImage` answers with nothing usable — no URL, no id, and a file has no
 * identity beyond its folder and name — so the folder is re-listed afterwards.
 * Anything the upload response did happen to describe is used first and costs
 * no extra call.
 *
 * Never throws. The bytes are already stored by the time this runs, and turning
 * "I could not find it again" into a failed request would have the caller upload
 * the same file a second time. A file that cannot be found comes back
 * `confirmed: false` instead.
 */
async function locateUploaded(
  actor: AuthenticatedActor,
  folderPath: string | null,
  names: readonly string[],
  acknowledged: readonly DamFile[]
): Promise<DamUploadedFile[]> {
  const found = new Map<string, DamFile>()
  const remember = (file: DamFile) => {
    const key = file.name.trim().toLowerCase()
    if (!found.has(key)) found.set(key, file)
  }
  for (const file of acknowledged) remember(file)

  const missing = () =>
    names.filter((name) => !found.has(name.toLowerCase())).length

  if (missing() > 0) {
    await lookupQuietly('folder listing', async () => {
      for (let page = 1; page <= LOOKUP_MAX_PAGES && missing() > 0; page += 1) {
        const listed = await listFolderPage(actor, folderPath, page)
        for (const file of listed.files) remember(file)
        if (!listed.hasMore) break
      }
    })
  }

  // One search per file still unaccounted for, which the upload's own cap holds
  // to ten. A search is what finds a file in a folder too deep to page through.
  for (const name of names) {
    if (found.has(name.toLowerCase())) continue
    await lookupQuietly(`search for ${name}`, async () => {
      const listed = await listFolderPage(actor, folderPath, 1, name)
      for (const file of listed.files) remember(file)
    })
  }

  return names.map((name) => {
    const file = found.get(name.toLowerCase()) ?? null
    return {
      name,
      folderPath: file?.folderPath ?? folderPath,
      confirmed: file !== null,
      url: file?.url ?? null,
      thumbnailUrl: file?.thumbnailUrl ?? null,
      contentType: file?.contentType ?? null,
      sizeBytes: file?.sizeBytes ?? null,
    }
  })
}

/** One page of `GetFilesByClient`, optionally narrowed by a search string. */
async function listFolderPage(
  actor: AuthenticatedActor,
  folderPath: string | null,
  page: number,
  search?: string
): Promise<{ files: DamFile[]; hasMore: boolean }> {
  const operation = 'GetFilesByClient'
  const payload = await callImageManagement(actor, operation, {
    pageNumber: page,
    pageSize: LOOKUP_PAGE_SIZE,
    searchString: search ?? null,
    sortOn: null,
    sortDirection: null,
    folderPath,
  })

  const { files, located } = splitContents(operation, payload)
  return {
    files,
    hasMore:
      located.total === null
        ? located.rows.length >= LOOKUP_PAGE_SIZE
        : page * LOOKUP_PAGE_SIZE < located.total,
  }
}

/** Runs a lookup whose failure must not reach the caller. */
async function lookupQuietly(what: string, run: () => Promise<void>) {
  try {
    await run()
  } catch (error) {
    console.warn(
      `Ticket-IT ImageManagement: the upload succeeded but the ${what} that ` +
        'would have found the stored files failed. They are reported ' +
        'unconfirmed.',
      error
    )
  }
}

async function listFiles(
  actor: AuthenticatedActor,
  operation: string,
  auditEntityId: string,
  query: DamListQueryDto
): Promise<DamPage<DamFile>> {
  const payload = await callImageManagement(actor, operation, searchBody(query))

  const located = locateOrThrow(operation, payload, [
    ...FILE_LIST_KEYS,
    ...ROW_KEYS,
  ])
  const items = toFiles(operation, located.rows)

  await recordDamAudit(
    AuditAction.DAM_DOCUMENTS_LISTED,
    auditEntityId,
    `Image library ${operation}`,
    { search: query.search ?? null, page: query.page, returned: items.length }
  )

  return toPage(items, located, query)
}

/**
 * One ImageManagement call, as the actor.
 *
 * Every refusal is turned into the portal's own error here, so no route ever
 * sees a `TicketItApiError` — which the error middleware does not know and would
 * render as a 500.
 */
async function callImageManagement(
  actor: AuthenticatedActor,
  operation: string,
  body: Record<string, unknown> | FormData,
  options: { timeoutMs?: number } = {}
): Promise<unknown> {
  assertConfigured()

  const token = await recallTicketItToken(actor.userId)
  if (!token) throw new TicketItSessionRequiredError(NO_SESSION_MESSAGE)

  return callAs(
    { kind: 'user', userId: actor.userId, token },
    operation,
    body,
    options
  )
}

/**
 * The same call on the portal's own credential, for operator-owned files only.
 *
 * Takes no actor on purpose: a browsing endpoint that reached this would show
 * one tenant another's library. See `dam-service-account.ts`.
 */
async function callImageManagementAsService(
  operation: string,
  body: Record<string, unknown> | FormData,
  options: { timeoutMs?: number } = {}
): Promise<unknown> {
  // Not `assertConfigured()`: that also insists on Redis, which is where a
  // *user's* token is kept. This credential is held in the process and re-
  // obtained by signing in, so a deployment with no Redis can still copy an
  // image out of the library even though nobody can browse it.
  assertServiceConfigured()

  const token = await recallDamServiceToken()
  return callAs({ kind: 'service' as const, token }, operation, body, options)
}

/** Which credential a call is running on, and how to drop it when it lapses. */
type DamCaller =
  | { kind: 'user'; userId: string; token: string }
  | { kind: 'service'; token: string }

async function callAs(
  caller: DamCaller,
  operation: string,
  body: Record<string, unknown> | FormData,
  options: { timeoutMs?: number }
): Promise<unknown> {
  try {
    return await ticketItRequest({
      path: `${IMAGE_MANAGEMENT_PATH}/${operation}`,
      method: 'POST',
      body,
      token: caller.token,
      timeoutMs: options.timeoutMs,
    })
  } catch (error) {
    if (!(error instanceof TicketItApiError)) throw error
    throw await translateRefusal(caller, operation, error)
  }
}

async function translateRefusal(
  caller: DamCaller,
  operation: string,
  error: TicketItApiError
): Promise<AppError> {
  console.warn(
    `Ticket-IT ImageManagement/${operation} answered ${error.status}: ${error.message}`
  )
  const details = { operation, upstreamStatus: error.status }

  if (error.status === 401) {
    // Expired or revoked upstream. Dropped so the status endpoint stops
    // reporting a session the library can no longer use, and so the next
    // service call signs in again instead of reusing a dead token.
    if (caller.kind === 'user') {
      await forgetTicketItToken(caller.userId)
      return new TicketItSessionRequiredError(EXPIRED_SESSION_MESSAGE)
    }
    forgetDamServiceToken()
    return new DependencyUnavailableError('The image library', {
      details,
      cause: error,
    })
  }
  if (error.status === 403) {
    return new ForbiddenError(
      'Ticket-IT does not allow this account to use the image library.',
      { details }
    )
  }
  if (error.status === 404) {
    return new NotFoundError('Image library item', { details })
  }
  if (error.status < 500) {
    // A 400, or a 200 carrying `hasError`. Ticket-IT's handled failures are
    // written for its own users — the library being switched off for a client,
    // say — so the message is passed on rather than replaced.
    return new BusinessRuleError(error.message, { details })
  }
  return new AppError(
    ErrorCode.UPSTREAM_ERROR,
    502,
    'The image library returned an error.',
    { details, cause: error }
  )
}

function missingConfiguration(): string[] {
  return [
    getConfig().dam.enabled ? null : 'DAM_ENABLED=true',
    isTicketItConfigured() ? null : 'TICKETIT_API_BASE_URL',
    // The user's token lives in Redis; without it nobody has a session to use.
    isTicketItTokenStoreConfigured() ? null : 'REDIS_URL',
  ].filter((name): name is string => name !== null)
}

/** The variable names go to the log, not the response. */
function assertConfigured(): void {
  refuseUnless(missingConfiguration())
}

/**
 * What a call on the portal's own credential needs: the library switched on and
 * an endpoint to reach. Not Redis — see `callImageManagementAsService`.
 */
function assertServiceConfigured(): void {
  refuseUnless(
    [
      getConfig().dam.enabled ? null : 'DAM_ENABLED=true',
      isTicketItConfigured() ? null : 'TICKETIT_API_BASE_URL',
    ].filter((name): name is string => name !== null)
  )
}

function refuseUnless(missing: readonly string[]): void {
  if (missing.length === 0) return

  console.warn(
    `Image library request refused: set ${missing.join(', ')} to enable it.`
  )
  throw new DependencyUnavailableError('The image library')
}

/** Ticket-IT's `SearchRequestModel`. */
function searchBody(query: DamListQueryDto): Record<string, unknown> {
  return {
    pageNumber: query.page,
    pageSize: query.pageSize,
    searchString: query.search ?? null,
    sortOn: query.sortOn ?? null,
    sortDirection: query.sortDirection ?? null,
  }
}

/** An empty body is an empty listing; a body with no list in it is an error. */
function locateOrThrow(
  operation: string,
  payload: unknown,
  keys: readonly string[]
): LocatedRows {
  if (payload === undefined) return EMPTY

  const located = locateRows(payload, keys)
  if (!located) throw unrecognisedPayload(operation, payload)
  return located
}

/**
 * A folder listing may come back as separate folder and file lists, or as one
 * list with the folders flagged. Which one Ticket-IT does is not known yet, so
 * both are handled.
 */
function splitContents(
  operation: string,
  payload: unknown
): { folders: DamFolder[]; files: DamFile[]; located: LocatedRows } {
  if (payload === undefined) return { folders: [], files: [], located: EMPTY }

  if (!Array.isArray(payload)) {
    const fileList = locateRows(payload, FILE_LIST_KEYS)
    const folderList = locateRows(payload, FOLDER_LIST_KEYS)
    if (fileList || folderList) {
      return {
        folders: folderList ? toFolders(operation, folderList.rows) : [],
        files: fileList ? toFiles(operation, fileList.rows) : [],
        located: fileList ?? EMPTY,
      }
    }
  }

  const mixed = locateOrThrow(operation, payload, ROW_KEYS)
  return {
    folders: toFolders(operation, mixed.rows.filter(isFolderRow)),
    files: toFiles(
      operation,
      mixed.rows.filter((row) => !isFolderRow(row))
    ),
    located: mixed,
  }
}

function toPage<T>(
  items: readonly T[],
  located: LocatedRows,
  query: DamListQueryDto
): DamPage<T> {
  const { total } = located
  return {
    items,
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages:
      total === null ? null : Math.max(1, Math.ceil(total / query.pageSize)),
    // Without a total, a full page is the only hint that another follows. Raw
    // rows, not mapped items: a dropped row still occupied a slot upstream.
    hasMore:
      total === null
        ? located.rows.length >= query.pageSize
        : query.page * query.pageSize < total,
  }
}

/**
 * Records a successful library call. `recordAudit` never throws.
 *
 * The id column holds 64 characters and a deep folder path does not fit, so the
 * id is the start of the path and the whole of it is in the details.
 */
async function recordDamAudit(
  // Events only: the library is Ticket-IT's system of record, and the portal
  // has no prior state of a file to compare. See EVENT_ACTIONS.
  action: AuditEventAction,
  entityId: string,
  entityName: string,
  details: Record<string, unknown>
): Promise<void> {
  await recordAudit({
    action,
    entityType: AuditEntityType.INTEGRATION,
    entityId: entityId.slice(0, 64),
    entityName: entityName.slice(0, 500),
    details: { source: 'ticketit-image-management', ...details },
  })
}
