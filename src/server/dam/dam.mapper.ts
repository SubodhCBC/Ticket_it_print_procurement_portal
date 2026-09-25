import { AppError, ErrorCode } from '../utils/errors'
import type { DamFile, DamFileNote, DamFolder } from './dam.types'

/**
 * Turns ImageManagement payloads into the portal's DAM types.
 *
 * ---------------------------------------------------------------------------
 * Why every field is a list of guesses
 * ---------------------------------------------------------------------------
 * Ticket-IT's OpenAPI document types every request and *no* response, and no
 * real account has been run through these endpoints yet — that is what
 * `scripts/check-ticketit-dam.mjs` is for. So each field is read from the names
 * an ASP.NET service over blob storage would plausibly use, first match wins,
 * and anything unexpected degrades to null rather than throwing.
 *
 * The one thing that *does* throw is a payload with no list in it at all. A
 * library that silently renders as empty is worse than one that says it is
 * broken: the first gets reported as "we have no images", the second as a bug.
 *
 * Once the real shapes are known, trim these lists down to the names Ticket-IT
 * actually sends.
 */

/** Wrappers an ASP.NET controller commonly nests its result inside. */
const ENVELOPE_KEYS = [
  'data',
  'result',
  'results',
  'response',
  'payload',
  'value',
  'model',
] as const

/** Generic names for "the rows", tried after any operation-specific ones. */
export const ROW_KEYS = [
  'items',
  'records',
  'list',
  'rows',
  'data',
  'result',
  'results',
  'value',
] as const

export const FOLDER_LIST_KEYS = [
  'folders',
  'subFolders',
  'subfolders',
  'folderList',
  'directories',
] as const

export const FILE_LIST_KEYS = [
  'files',
  'fileList',
  'images',
  'imageList',
  'blobs',
] as const

const NOTE_LIST_KEYS = ['notes', 'fileNotes', 'noteList'] as const

/** `count` is last: it is as often the size of this page as of the whole set. */
const TOTAL_KEYS = [
  'totalCount',
  'totalRecords',
  'totalItems',
  'recordsTotal',
  'totalRows',
  'total',
  'count',
] as const

const FOLDER_NAME_KEYS = ['folderName', 'name', 'displayName', 'title']
const FOLDER_PATH_KEYS = ['folderPath', 'path', 'fullPath', 'prefix', 'folder']
const FOLDER_CHILD_KEYS = [
  'subFolders',
  'subfolders',
  'children',
  'childFolders',
  'folders',
]

const FILE_NAME_KEYS = [
  'fileName',
  'name',
  'blobName',
  'originalFileName',
  'displayName',
  'title',
]
const FILE_FOLDER_KEYS = [
  'folderPath',
  'directory',
  'folder',
  'prefix',
  'path',
  'filePath',
]
const FILE_URL_KEYS = [
  'url',
  'fileUrl',
  'blobUrl',
  'imageUrl',
  'uri',
  'fileUri',
  'downloadUrl',
  'sasUrl',
  'absoluteUri',
  'link',
]
const FILE_THUMBNAIL_KEYS = [
  'thumbnailUrl',
  'thumbUrl',
  'thumbnail',
  'previewUrl',
  'smallImageUrl',
]
const FILE_TYPE_KEYS = ['mimeType', 'contentType', 'mediaType', 'fileType']
const FILE_SIZE_KEYS = [
  'size',
  'fileSize',
  'sizeInBytes',
  'contentLength',
  'length',
  'bytes',
]
const FILE_DATE_KEYS = [
  'lastModified',
  'lastModifiedDate',
  'modifiedDate',
  'modifiedOn',
  'updatedDate',
  'updatedAt',
  'uploadedDate',
  'createdDate',
  'createdOn',
]
const FOLDER_FLAG_KEYS = ['isFolder', 'isDirectory', 'isDir']
const KIND_KEYS = ['type', 'itemType', 'kind']

/** The legacy `FileNote` table: Notes, FileName, FilePath, UserId, dates. */
const NOTE_TEXT_KEYS = ['notes', 'note', 'text', 'content']
const NOTE_ID_KEYS = ['fileNoteId', 'noteId', 'id']
const NOTE_AUTHOR_KEYS = [
  'userName',
  'createdBy',
  'userFullName',
  'fullName',
  'login',
]
const NOTE_CREATED_KEYS = ['createdDate', 'createdAt', 'createdOn']
const NOTE_UPDATED_KEYS = ['updatedDate', 'updatedAt', 'modifiedDate']

/** Guards against a self-referencing or absurdly deep folder tree. */
const MAX_FOLDER_DEPTH = 10

// --- Locating the rows ---------------------------------------------------------

export interface LocatedRows {
  readonly rows: readonly unknown[]
  /** Null when the payload reported no total. */
  readonly total: number | null
}

/**
 * Finds the rows in a payload of unknown shape.
 *
 * A bare array is the rows. Otherwise `keys` are tried in order at the top
 * level, then inside each envelope, two levels down at most. The total is taken
 * from the level the rows were found at, or any level above it.
 */
export function locateRows(
  payload: unknown,
  keys: readonly string[]
): LocatedRows | null {
  return search(payload, keys, 0, null)
}

function search(
  payload: unknown,
  keys: readonly string[],
  depth: number,
  inheritedTotal: number | null
): LocatedRows | null {
  if (Array.isArray(payload)) return { rows: payload, total: inheritedTotal }
  if (!isRecord(payload) || depth > 2) return null

  const total = pick(payload, readNonNegativeInt, TOTAL_KEYS) ?? inheritedTotal

  for (const key of keys) {
    const value = payload[key]
    if (Array.isArray(value)) return { rows: value, total }
  }

  for (const key of ENVELOPE_KEYS) {
    const value = payload[key]
    if (!isRecord(value)) continue
    const found = search(value, keys, depth + 1, total)
    if (found) return found
  }

  return null
}

/** Whether a row in a mixed listing is a folder rather than a file. */
export function isFolderRow(row: unknown): boolean {
  if (!isRecord(row)) return false
  if (pick(row, readBool, FOLDER_FLAG_KEYS) === true) return true

  const kind = pick(row, readText, KIND_KEYS)?.toLowerCase()
  return kind === 'folder' || kind === 'directory' || kind === 'dir'
}

/**
 * The error for a payload with no list in it.
 *
 * The shape is logged — keys and types, never values — so the fix to this file
 * can be written from the log line alone. The caller gets a 502 that says the
 * library is broken rather than empty.
 */
export function unrecognisedPayload(
  operation: string,
  payload: unknown
): AppError {
  console.error(
    `Ticket-IT ImageManagement/${operation} returned no list the portal recognises. ` +
      `Shape: ${describeShape(payload)}. Update src/server/dam/dam.mapper.ts; ` +
      'scripts/check-ticketit-dam.mjs prints the full response.'
  )
  return new AppError(
    ErrorCode.UPSTREAM_ERROR,
    502,
    'The image library returned a response the portal does not recognise.',
    { details: { operation } }
  )
}

// --- Rows to types -------------------------------------------------------------

export function toFolders(
  operation: string,
  rows: readonly unknown[]
): DamFolder[] {
  return mapRows(operation, 'folder', rows, (row) => toFolder(row, 0))
}

export function toFiles(
  operation: string,
  rows: readonly unknown[]
): DamFile[] {
  return mapRows(operation, 'file', rows, toFile)
}

/**
 * Notes arrive as a list, or — for a file with one note — possibly as that note
 * on its own. No payload, or one with no note in it, means the file has none.
 */
export function toFileNotes(
  operation: string,
  payload: unknown
): DamFileNote[] {
  if (payload === undefined || payload === null) return []

  const located = locateRows(payload, [...NOTE_LIST_KEYS, ...ROW_KEYS])
  if (located) return mapRows(operation, 'note', located.rows, toFileNote)

  const single = findNoteRecord(payload, 0)
  const note = single ? toFileNote(single) : null
  return note ? [note] : []
}

function toFolder(row: unknown, depth: number): DamFolder | null {
  if (typeof row === 'string') {
    const path = readText(row)
    return path ? { name: basename(path), path, children: [] } : null
  }
  if (!isRecord(row)) return null

  const path = pick(row, readText, FOLDER_PATH_KEYS)
  const name =
    pick(row, readText, FOLDER_NAME_KEYS) ?? (path ? basename(path) : null)
  if (!name) return null

  const childRows =
    depth < MAX_FOLDER_DEPTH ? pick(row, readArray, FOLDER_CHILD_KEYS) : null
  const children: DamFolder[] = []
  for (const child of childRows ?? []) {
    const folder = toFolder(child, depth + 1)
    if (folder) children.push(folder)
  }

  return { name, path: path ?? name, children }
}

function toFile(row: unknown): DamFile | null {
  if (typeof row === 'string') {
    const value = readText(row)
    if (!value) return null
    const url = readUrl(value)
    return {
      name: url ? nameFromUrl(url) : basename(value),
      kind: 'file',
      folderPath: null,
      url,
      thumbnailUrl: null,
      contentType: null,
      sizeBytes: null,
      updatedAt: null,
    }
  }
  if (!isRecord(row)) return null

  const url = pick(row, readUrl, FILE_URL_KEYS)
  const name =
    pick(row, readText, FILE_NAME_KEYS) ?? (url ? nameFromUrl(url) : null)
  if (!name) return null

  return {
    name,
    kind: isFolderRow(row) ? 'folder' : 'file',
    folderPath: pick(row, readText, FILE_FOLDER_KEYS),
    url,
    thumbnailUrl: pick(row, readUrl, FILE_THUMBNAIL_KEYS),
    contentType: pick(row, readContentType, FILE_TYPE_KEYS),
    sizeBytes: pick(row, readNonNegativeInt, FILE_SIZE_KEYS),
    updatedAt: pick(row, readDateText, FILE_DATE_KEYS),
  }
}

/**
 * What an upload response says about the files it stored.
 *
 * Unlike a listing, this never throws on a payload it cannot read. By the time
 * it runs the bytes are already in Ticket-IT, and turning "I do not recognise
 * this acknowledgement" into a failed upload would have the caller retry a file
 * that is already there. An unreadable response is reported as no information.
 */
export function toUploadedFiles(
  operation: string,
  payload: unknown
): DamFile[] {
  if (payload === undefined || payload === null) return []

  const located = locateRows(payload, [...FILE_LIST_KEYS, ...ROW_KEYS])
  if (located) return mapRows(operation, 'file', located.rows, toFile)

  const single = findFileRecord(payload, 0)
  const file = single ? toFile(single) : null
  return file ? [file] : []
}

/** The one file in a response that wrapped it instead of listing it. */
function findFileRecord(
  payload: unknown,
  depth: number
): Record<string, unknown> | null {
  if (!isRecord(payload) || depth > 2) return null
  if (toFile(payload) !== null) return payload

  for (const key of ENVELOPE_KEYS) {
    const found = findFileRecord(payload[key], depth + 1)
    if (found) return found
  }
  return null
}

function toFileNote(row: unknown): DamFileNote | null {
  if (!isRecord(row)) return null

  const notes = pick(row, readText, NOTE_TEXT_KEYS)
  if (notes === null) return null

  return {
    id: pick(row, readInt, NOTE_ID_KEYS),
    notes,
    authorName: pick(row, readText, NOTE_AUTHOR_KEYS),
    createdAt: pick(row, readDateText, NOTE_CREATED_KEYS),
    updatedAt: pick(row, readDateText, NOTE_UPDATED_KEYS),
  }
}

function findNoteRecord(
  payload: unknown,
  depth: number
): Record<string, unknown> | null {
  if (!isRecord(payload) || depth > 2) return null
  if (pick(payload, readText, NOTE_TEXT_KEYS) !== null) return payload

  for (const key of ENVELOPE_KEYS) {
    const found = findNoteRecord(payload[key], depth + 1)
    if (found) return found
  }
  return null
}

/**
 * Maps every row, leaving out the ones that cannot be read and saying so.
 *
 * Rows are dropped rather than failing the page — one odd entry should not hide
 * a folder's other hundred files — but never silently.
 */
function mapRows<T>(
  operation: string,
  what: string,
  rows: readonly unknown[],
  map: (row: unknown) => T | null
): T[] {
  const mapped: T[] = []
  let firstSkipped: unknown
  let skipped = 0

  for (const row of rows) {
    const value = map(row)
    if (value !== null) {
      mapped.push(value)
      continue
    }
    if (skipped === 0) firstSkipped = row
    skipped += 1
  }

  if (skipped > 0) {
    console.warn(
      `Ticket-IT ImageManagement/${operation}: ${skipped} of ${rows.length} rows ` +
        `could not be read as a ${what} and were left out. ` +
        `First one: ${describeShape(firstSkipped)}`
    )
  }
  return mapped
}

// --- Coercions -----------------------------------------------------------------

/** The first key whose value `read` accepts. */
function pick<T>(
  source: Record<string, unknown>,
  read: (value: unknown) => T | null,
  keys: readonly string[]
): T | null {
  for (const key of keys) {
    const value = read(source[key])
    if (value !== null) return value
  }
  return null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readArray(value: unknown): readonly unknown[] | null {
  return Array.isArray(value) ? value : null
}

/** A non-empty trimmed string, or null for anything else — including "". */
function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** An integer, accepting the numeric strings a loosely typed API may send. */
function readInt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isInteger(parsed) ? parsed : null
  }
  return null
}

function readNonNegativeInt(value: unknown): number | null {
  const parsed = readInt(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

/** A boolean, accepting the "true"/"false" strings and 0/1 seen in the wild. */
function readBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number')
    return value === 1 ? true : value === 0 ? false : null
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase()
    if (normalised === 'true' || normalised === '1') return true
    if (normalised === 'false' || normalised === '0') return false
  }
  return null
}

/**
 * Absolute http(s) only. A relative path would resolve against the portal's own
 * origin in the browser, which is never where Ticket-IT's files are.
 */
function readUrl(value: unknown): string | null {
  const text = readText(value)
  return text && /^https?:\/\//i.test(text) ? text : null
}

/** `fileType` is as likely to hold "jpg" as "image/jpeg"; only the latter is a type. */
function readContentType(value: unknown): string | null {
  const text = readText(value)
  return text && text.includes('/') ? text.toLowerCase() : null
}

function readDateText(value: unknown): string | null {
  const text = readText(value)
  return text && !Number.isNaN(Date.parse(text)) ? text : null
}

function basename(path: string): string {
  return (
    path
      .split(/[\\/]/)
      .filter((segment) => segment.length > 0)
      .pop() ?? path
  )
}

/** The last path segment, without the query string — which may be a signature. */
function nameFromUrl(url: string): string {
  const name = basename(url.split(/[?#]/, 1)[0] ?? url)
  try {
    return decodeURIComponent(name)
  } catch {
    return name
  }
}

/** Keys and types, never values: a row can carry a signed URL. */
function describeShape(value: unknown): string {
  if (Array.isArray(value)) return `array(${value.length})`
  if (value === null) return 'null'
  if (!isRecord(value)) return typeof value

  const keys = Object.entries(value).map(([key, entry]) => {
    if (Array.isArray(entry)) return `${key}: array(${entry.length})`
    return `${key}: ${entry === null ? 'null' : typeof entry}`
  })
  return keys.length > 0 ? `{ ${keys.join(', ')} }` : '{}'
}
