// src/services/dam.service.ts
import { getDataSource } from '@/services/data-source'
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
} from '@/services/data-source/api/dam.types'

export type {
  DamCreatedFolder,
  DamFile,
  DamFileNote,
  DamFileNotes,
  DamFolder,
  DamFolderContents,
  DamFolderContentsParams,
  DamListParams,
  DamPage,
  DamStatus,
  DamUploadedFile,
  DamUploadResult,
} from '@/services/data-source/api/dam.types'

/**
 * The document library (DAM): Ticket-IT's image management, reached through
 * `/api/v1/dam/*` with the signed-in user's own Ticket-IT session.
 *
 * Kept out of `services/index.ts`: nothing here is a shared domain read, and
 * the names (`search`, `upload`) are too generic for an `export *`.
 */

export function getDamStatus(): Promise<DamStatus> {
  return getDataSource().dam.getStatus()
}

export function listDamFolderContents(
  params?: DamFolderContentsParams
): Promise<DamFolderContents> {
  return getDataSource().dam.listFolderContents(params)
}

export function searchDam(params?: DamListParams): Promise<DamPage<DamFile>> {
  return getDataSource().dam.search(params)
}

export function getDamFileNotes(
  fileName: string,
  folderPath?: string | null
): Promise<DamFileNotes> {
  return getDataSource().dam.getFileNotes(fileName, folderPath)
}

export function uploadDamFiles(
  files: readonly File[],
  folderPath?: string | null
): Promise<DamUploadResult> {
  return getDataSource().dam.upload(files, folderPath)
}

/**
 * Removes one file from the library. Permanent: there is no undo upstream and
 * the portal keeps no copy. Needs the `DAM_DELETE` permission.
 */
export function deleteDamFile(input: {
  fileName: string
  folderPath?: string | null
  mimeType?: string | null
}): Promise<void> {
  return getDataSource().dam.deleteFile(input)
}

/**
 * Makes a folder at the full path given. Needs `DAM_UPLOAD`.
 *
 * What the library does when the folder is already there is undocumented, so a
 * caller that only wants it to exist should not read a failure as "it does not".
 */
export function createDamFolder(folderPath: string): Promise<DamCreatedFolder> {
  return getDataSource().dam.createFolder(folderPath)
}

// --- What the library accepts ----------------------------------------------------
//
// The server's own limits (src/server/dam/dam.validation.ts), checked here first
// so a user hears "too big" before waiting for a 100MB upload to be refused.
//
// The per-file ceiling is `DAM_UPLOAD_MAX_FILE_MB` on the server, an operator
// setting; the number below mirrors its default. If an operator raises it, this
// check refuses a file the server would have taken — the wrong way round, which
// is the safe way round. The batch ceiling is the server's own derivation:
// twice the per-file limit, so a pair of large files still goes through.

export const DAM_UPLOAD_MAX_FILES = 10
export const DAM_UPLOAD_MAX_FILE_BYTES = 100 * 1024 * 1024
export const DAM_UPLOAD_MAX_TOTAL_BYTES = DAM_UPLOAD_MAX_FILE_BYTES * 2

const DAM_CONTENT_TYPES = new Set([
  // Raster and vector images the storefront displays.
  'image/png',
  'image/jpeg',
  'image/pjpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/tiff',
  'image/svg+xml',
  // Proofs and print-ready output.
  'application/pdf',
  'application/postscript', // .ai and .eps both arrive as this
  'application/illustrator',
  'application/eps',
  'image/eps',
  'image/x-eps',
  'image/vnd.adobe.photoshop',
  'application/x-photoshop',
  'application/octet-stream', // what a browser sends for .ai/.indd it cannot name
  'application/x-indesign',
  'application/zip', // packaged artwork, fonts and links together
])

const DAM_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'jfif',
  'gif',
  'webp',
  'bmp',
  'tif',
  'tiff',
  'svg',
  'pdf',
  'ai',
  'eps',
  'ps',
  'psd',
  'psb',
  'indd',
  'idml',
  'zip',
])

/**
 * For `<input accept>`.
 *
 * Extensions as well as media types: a browser has no media type for `.ai` or
 * `.indd`, so a types-only list would grey them out in the file picker.
 */
export const DAM_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/tiff,image/svg+xml,application/pdf,' +
  '.ai,.eps,.ps,.psd,.psb,.indd,.idml,.zip'

/** For `<input accept>` where only pictures make sense (the design tools). */
export const DAM_IMAGE_ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,image/bmp,image/tiff,image/svg+xml'

/** Path separators and the characters Windows forbids in a file name. */
const UNSAFE_NAME_PUNCTUATION = /[/\\:*?"<>|]/

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/**
 * Whether a name would be refused: a path separator, a character Windows
 * forbids, or a control character. Control characters are checked by code
 * rather than written into the pattern, so this file stays plain text.
 */
function hasUnsafeNameChar(name: string): boolean {
  if (UNSAFE_NAME_PUNCTUATION.test(name)) return true
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) < 32) return true
  }
  return false
}

function replaceUnsafeNameChars(name: string): string {
  let safe = ''
  for (const char of name) {
    safe +=
      char.charCodeAt(0) < 32 || UNSAFE_NAME_PUNCTUATION.test(char) ? '-' : char
  }
  return safe
}

function megabytes(bytes: number): number {
  return Math.round((bytes / 1_048_576) * 10) / 10
}

/** Whether a library file is a picture the canvas can show. */
export function isDamImage(file: Pick<DamFile, 'name' | 'contentType'>) {
  if (file.contentType) return file.contentType.startsWith('image/')
  const ext = extensionOf(file.name)
  return DAM_EXTENSIONS.has(ext) && ext !== 'pdf'
}

/**
 * The first reason these files would be refused, or null. Same checks and the
 * same order as the server, so the message matches what it would have said.
 */
export function validateDamFiles(files: readonly File[]): string | null {
  if (files.length === 0) return 'Choose at least one file to upload.'
  if (files.length > DAM_UPLOAD_MAX_FILES) {
    return `Upload at most ${DAM_UPLOAD_MAX_FILES} files at a time; you chose ${files.length}.`
  }

  let total = 0
  for (const file of files) {
    const name = file.name.trim()
    if (!name || name.length > 200 || hasUnsafeNameChar(name)) {
      return `"${file.name}" is not a usable file name. Rename it and try again.`
    }
    if (!DAM_EXTENSIONS.has(extensionOf(name))) {
      return `"${name}" is not a file type the library accepts. Upload an image (PNG, JPEG, GIF, WebP, BMP, TIFF, SVG), a PDF, or print artwork (AI, EPS, PSD, INDD, IDML, ZIP).`
    }
    const type = file.type.split(';')[0].trim().toLowerCase()
    if (type && !DAM_CONTENT_TYPES.has(type)) {
      return `"${name}" is a ${type} file, which the library does not accept.`
    }
    if (file.size === 0) return `"${name}" is empty.`
    if (file.size > DAM_UPLOAD_MAX_FILE_BYTES) {
      return `"${name}" is ${megabytes(file.size)}MB. The limit is ${megabytes(DAM_UPLOAD_MAX_FILE_BYTES)}MB per file.`
    }
    total += file.size
  }

  if (total > DAM_UPLOAD_MAX_TOTAL_BYTES) {
    return `These files come to ${megabytes(total)}MB. Upload at most ${megabytes(DAM_UPLOAD_MAX_TOTAL_BYTES)}MB at a time.`
  }
  return null
}

const EXTENSION_FOR_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/pjpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/svg+xml': 'svg',
  'application/pdf': 'pdf',
}

/**
 * A name nothing else in the library has.
 *
 * The library stores a file under the name it was sent with and has no way to
 * look one up except by listing, so "which of these is the picture I just
 * uploaded" needs a name that answers it. `logo.png` becomes
 * `logo-lq3k9x2a-7f3.png`: still readable in the library, never a collision.
 */
export function uniqueDamFileName(original: string, contentType?: string) {
  const trimmed = replaceUnsafeNameChars(original.trim())
  let ext = extensionOf(trimmed)
  if (!DAM_EXTENSIONS.has(ext)) {
    ext =
      (contentType && EXTENSION_FOR_TYPE[contentType.toLowerCase()]) || 'png'
  }
  const dot = trimmed.lastIndexOf('.')
  const stem =
    (dot > 0 ? trimmed.slice(0, dot) : trimmed)
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 120) || 'image'
  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  return `${stem}-${suffix}.${ext}`
}

/** A picture the library holds, with the address a browser loads it from. */
export interface DamStoredImage {
  url: string
  fileName: string
  folderPath: string | null
  thumbnailUrl: string | null
  contentType: string | null
}

/**
 * Upload refused, or accepted but its address could not be found. `code` is
 * the API's error code when the API refused it (e.g.
 * `TICKETIT_SESSION_REQUIRED`), so a caller can fall back quietly.
 */
export class DamUploadError extends Error {
  readonly code: string
  constructor(message: string, code = 'DAM_UPLOAD_FAILED') {
    super(message)
    this.name = 'DamUploadError'
    this.code = code
  }
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Puts one picture in the library and returns the URL it is served from.
 *
 * The upload answer often does not say where the file went — Ticket-IT's
 * `UploadImage` declares no response body — so the folder is listed for the
 * unique name, a few times over a few seconds in case the listing lags the
 * write.
 */
export async function uploadImageToDam(
  image: Blob,
  options: { fileName: string; folderPath?: string | null }
): Promise<DamStoredImage> {
  const contentType = image.type || undefined
  const fileName = uniqueDamFileName(options.fileName, contentType)
  const folderPath = options.folderPath ?? null
  const file = new File([image], fileName, {
    type: contentType ?? 'application/octet-stream',
  })

  const problem = validateDamFiles([file])
  if (problem) throw new DamUploadError(problem, 'VALIDATION_FAILED')

  let result: DamUploadResult
  try {
    result = await uploadDamFiles([file], folderPath)
  } catch (error) {
    const { toApiError } = await import('@/services/api.service')
    const apiError = toApiError(error)
    // A timeout has no response, which the client reports as "could not reach
    // the API … CORS_ORIGINS" — true of a server that is down, and misleading
    // for one that took the upload and is still waiting on Ticket-IT.
    const raw = error as { code?: unknown; message?: unknown }
    const timedOut =
      apiError.details?.timedOut === true ||
      raw?.code === 'ECONNABORTED' ||
      raw?.code === 'ETIMEDOUT' ||
      (typeof raw?.message === 'string' && /timeout/i.test(raw.message))
    if (timedOut) {
      throw new DamUploadError(
        'The image library took too long to answer.',
        'DAM_UPLOAD_TIMEOUT'
      )
    }
    throw new DamUploadError(apiError.message, apiError.code)
  }

  // The upload answers with one entry per file sent. An entry whose `confirmed`
  // is false was stored but could not be found again, so it carries no URL —
  // the re-list below is exactly the retry that case needs.
  const fromUpload = result.files.find(
    (stored) => stored.name === fileName && stored.url
  )
  if (fromUpload?.url) return toStored(fromUpload, folderPath)

  for (const delay of [0, 800, 1600, 3200]) {
    if (delay) await wait(delay)
    try {
      const listing = await listDamFolderContents({
        folderPath,
        search: fileName,
        pageSize: 24,
      })
      const found = listing.items.find(
        (item) => item.kind === 'file' && item.name === fileName && item.url
      )
      if (found?.url) return toStored(found, folderPath)
    } catch {
      // A listing that fails now may succeed on the next try; the upload itself
      // already went through.
    }
  }

  throw new DamUploadError(
    `"${fileName}" was uploaded to the image library, but the library did not say where it is stored.`,
    'DAM_URL_UNKNOWN'
  )
}

/** Takes a listed file or an upload entry: both carry the same five fields. */
function toStored(
  file: Pick<
    DamFile,
    'name' | 'url' | 'folderPath' | 'thumbnailUrl' | 'contentType'
  >,
  folderPath: string | null
): DamStoredImage {
  return {
    url: file.url as string,
    fileName: file.name,
    folderPath: file.folderPath ?? folderPath,
    thumbnailUrl: file.thumbnailUrl,
    contentType: file.contentType,
  }
}

/**
 * The error code the API answers with when the user's Ticket-IT session is
 * gone — never held, or lapsed since `/dam/status` last said "connected".
 */
export const DAM_SESSION_REQUIRED_CODE = 'TICKETIT_SESSION_REQUIRED'

/**
 * How long a picture that was only just uploaded is given to come back.
 *
 * Longer than a library pick's: the file has just been written, and a host
 * that is still processing it answers slowly the first time.
 */
export const FRESH_UPLOAD_CHECK_MS = 45_000

/** Whether the canvas can use a picture: yes, the host refuses, or no answer. */
export type CanvasUrlCheck = 'ok' | 'blocked' | 'timeout'

/**
 * Whether the canvas can use a picture from this URL, and if not, why.
 *
 * Loaded the way the design tools load it — `crossOrigin="anonymous"`, no
 * cookies — and drawn onto a canvas that is then read back. A host that sends
 * no CORS headers fails the load outright; one that does passes both steps. A
 * picture that fails here would break the builder's export, thumbnails and
 * background removal, so the caller keeps its own copy instead.
 *
 * A picture that simply takes longer than `timeoutMs` is `timeout`, not
 * `blocked`: telling someone the host forbids a picture it was merely slow to
 * send has them give up on a picture that works.
 */
export function checkCanvasUrl(
  url: string,
  timeoutMs = 15_000
): Promise<CanvasUrlCheck> {
  return new Promise<CanvasUrlCheck>((resolve) => {
    if (typeof window === 'undefined') return resolve('blocked')
    const img = new Image()
    const timer = window.setTimeout(() => done('timeout'), timeoutMs)
    function done(result: CanvasUrlCheck) {
      window.clearTimeout(timer)
      img.onload = null
      img.onerror = null
      resolve(result)
    }
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d')
        if (!ctx) return done('blocked')
        ctx.drawImage(img, 0, 0, 1, 1)
        ctx.getImageData(0, 0, 1, 1)
        done('ok')
      } catch {
        done('blocked')
      }
    }
    img.onerror = () => done('blocked')
    img.src = url
  })
}
