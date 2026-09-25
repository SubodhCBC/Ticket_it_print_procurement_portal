import { apiClient } from '@/services/api.service'
import type {
  DamCreatedFolder,
  DamFileNotes,
  DamFolderContents,
  DamFolderContentsParams,
  DamFile,
  DamListParams,
  DamPage,
  DamStatus,
  DamUploadResult,
} from './dam.types'

/**
 * The document library, served by `/dam`.
 *
 * Every call runs on the signed-in user's own Ticket-IT session, held by the
 * server. A user without one gets a 403 `TICKETIT_SESSION_REQUIRED` — not a
 * 401, so the client's refresh-and-retry does not fire against it.
 */

const DAM = '/dam'

/**
 * Longer than the client's default 30 seconds: the server gives Ticket-IT two
 * minutes for an upload (`DAM_UPLOAD_TIMEOUT_MS`), and a print file over a slow
 * link needs most of that. Kept above the server's own ceiling on purpose, so a
 * slow upload comes back as the server's message rather than as a client
 * timeout with nothing to say.
 */
const UPLOAD_TIMEOUT_MS = 150_000

function listQuery(params?: DamListParams): Record<string, unknown> {
  const query: Record<string, unknown> = {
    page: params?.page ?? 1,
    pageSize: Math.min(Math.max(params?.pageSize ?? 24, 1), 100),
  }
  if (params?.search?.trim()) query.search = params.search.trim()
  if (params?.sortOn) query.sortOn = params.sortOn
  if (params?.sortDirection) query.sortDirection = params.sortDirection
  return query
}

export async function getStatus(): Promise<DamStatus> {
  return apiClient.get(`${DAM}/status`)
}

/** One folder's sub-folders and a page of its files. Omit the path for the root. */
export async function listFolderContents(
  params?: DamFolderContentsParams
): Promise<DamFolderContents> {
  const query = listQuery(params)
  if (params?.folderPath) query.folderPath = params.folderPath
  return apiClient.get(`${DAM}/files`, { params: query })
}

/** May return folders mixed in with files (`kind: 'folder'`). */
export async function search(
  params?: DamListParams
): Promise<DamPage<DamFile>> {
  return apiClient.get(`${DAM}/search`, { params: listQuery(params) })
}

export async function getFileNotes(
  fileName: string,
  folderPath?: string | null
): Promise<DamFileNotes> {
  return apiClient.get(`${DAM}/files/notes`, {
    params: { fileName, ...(folderPath ? { folderPath } : {}) },
  })
}

/**
 * `POST /dam/files`, multipart: each file as a file part, and `folderPath` as a
 * text part (omitted for the root).
 *
 * The Content-Type is set to multipart explicitly. The client declares JSON for
 * every POST, and axios serialises a `FormData` body to JSON when the declared
 * type says JSON — the files would never leave the browser. With the multipart
 * type named, the browser supplies the boundary itself.
 */
export async function upload(
  files: readonly File[],
  folderPath?: string | null
): Promise<DamUploadResult> {
  const form = new FormData()
  for (const file of files) form.append('files', file, file.name)
  if (folderPath) form.append('folderPath', folderPath)

  return apiClient.post(`${DAM}/files`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: UPLOAD_TIMEOUT_MS,
  })
}

/**
 * `DELETE /dam/files` — removes one file, permanently.
 *
 * The target is named by folder and file name because that pair is a library
 * file's whole identity upstream; there are no ids. `mimeType` is passed on
 * only when the caller knows it — the server does not guess one, since a wrong
 * type is worse than none if the library matches on it.
 */
export async function deleteFile(input: {
  fileName: string
  folderPath?: string | null
  mimeType?: string | null
}): Promise<void> {
  await apiClient.delete(`${DAM}/files`, {
    params: {
      fileName: input.fileName,
      ...(input.folderPath ? { folderPath: input.folderPath } : {}),
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    },
  })
}

/**
 * `POST /dam/folders` — makes a folder at the full path given.
 *
 * What Ticket-IT does when the folder already exists is undocumented and the
 * server passes its answer straight through, so a caller that only wants the
 * folder to exist treats a failure as "probably there already" and lets the
 * next call speak.
 */
export async function createFolder(
  folderPath: string
): Promise<DamCreatedFolder> {
  return apiClient.post(`${DAM}/folders`, { folderPath })
}
