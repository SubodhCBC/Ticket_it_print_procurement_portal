import { z } from 'zod'

import { getConfig } from '../config'
import { ValidationError } from '../utils/errors'

/** `?search=` is no search at all, not a search for the empty string. */
const blankAsAbsent = <S extends z.ZodTypeAny>(schema: S) =>
  z.preprocess(
    (value) =>
      typeof value === 'string' && value.trim() === '' ? undefined : value,
    schema
  )

/**
 * Paging and search for every library listing. Mirrors Ticket-IT's
 * `SearchRequestModel`, which is 1-based as well.
 */
export const DamListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
  search: blankAsAbsent(z.string().trim().max(200).optional()),
  /** A field name, passed through to Ticket-IT. */
  sortOn: blankAsAbsent(
    z
      .string()
      .trim()
      .regex(/^[A-Za-z][A-Za-z0-9_.]{0,63}$/, 'sortOn must be a field name')
      .optional()
  ),
  sortDirection: blankAsAbsent(z.enum(['asc', 'desc']).optional()),
})

export const DamFolderContentsQuerySchema = DamListQuerySchema.extend({
  /** Omit for the library's root. */
  folderPath: blankAsAbsent(z.string().trim().max(1024).optional()),
})

export const DamFileNotesQuerySchema = z.object({
  folderPath: blankAsAbsent(z.string().trim().max(1024).optional()),
  fileName: z.string().trim().min(1).max(512),
})

/**
 * The text parts of an upload. The files themselves arrive as file parts of the
 * same request and are checked by `assertUploadableFiles`.
 */
export const DamUploadSchema = z.object({
  /** Omit to upload into the library's root. */
  folderPath: blankAsAbsent(z.string().trim().max(1024).optional()),
})

/**
 * What `ImageManagement/UnlinkFile` needs to find the file: there is no id, so
 * the folder and the name are the whole of a file's identity.
 *
 * `mimeType` is in its request model and is passed through when the caller knows
 * it. Nothing here guesses one — a wrong type is worse than none if the library
 * matches on it.
 */
export const DamDeleteFileQuerySchema = z.object({
  folderPath: blankAsAbsent(z.string().trim().max(1024).optional()),
  fileName: z.string().trim().min(1).max(512),
  mimeType: blankAsAbsent(z.string().trim().max(120).optional()),
})

/**
 * How anything outside `dam/` names a library file.
 *
 * `damDocumentId` is the folder and the name joined —
 * `Products/prd_01J9Z.../dog.jpg` — because that pair is the whole of a file's
 * identity upstream; there are no ids. It is what `POST /dam/files` hands back
 * and what the asset row stores.
 *
 * `damUrl` is accepted because the upload response carries one and it is simpler
 * for a client to pass the whole thing back than to strip it. It is *not* how
 * the file is found: see `readOperatorDamFile`, which treats it as a fallback and
 * only after checking the host. A server that fetched whatever URL a caller
 * named would fetch anything on its own network.
 *
 * `filename`, `contentType` and `sizeBytes` are accepted for the same reason and
 * are equally advisory — all three are read off the file itself, so a caller
 * cannot describe a 4KB GIF as a 40MB TIFF and have the row say so.
 */
export const DamFileRefSchema = z.object({
  damDocumentId: z
    .string()
    .trim()
    .min(1)
    .max(512)
    /**
     * No traversal and no backslashes. The path is handed to the library as a
     * folder to look in, and `Templates/x/../../SomeoneElse` is a request to
     * look somewhere else.
     */
    .refine(
      (value) =>
        !value.includes('\\') &&
        !value.split('/').some((segment) => segment === '..'),
      'damDocumentId must be a plain folder-and-file path'
    ),
  damUrl: blankAsAbsent(z.string().trim().url().max(2048).optional()),
  filename: blankAsAbsent(z.string().trim().max(200).optional()),
  contentType: blankAsAbsent(z.string().trim().max(120).optional()),
  sizeBytes: z.coerce.number().int().positive().optional(),
})

/**
 * Splits a `damDocumentId` back into the folder and name the library wants.
 *
 * A leading slash and a trailing one are both tolerated — a client joining paths
 * produces them — and a bare name means a file in the library's root.
 */
export function splitDamDocumentId(damDocumentId: string): {
  folderPath: string | null
  fileName: string
} {
  const trimmed = damDocumentId.trim().replace(/^\/+|\/+$/g, '')
  const cut = trimmed.lastIndexOf('/')

  return cut === -1
    ? { folderPath: null, fileName: trimmed }
    : {
        folderPath: trimmed.slice(0, cut) || null,
        fileName: trimmed.slice(cut + 1),
      }
}

/**
 * The most the portal will copy out of the library in one go.
 *
 * Buffered in this process on its way to object storage, so the ceiling is about
 * what one request may hold rather than about what the library may store. See
 * the note on `damUploadMaxFileBytes` — same trade, same reason it is a setting.
 */
export function damCopyMaxBytes(): number {
  return getConfig().dam.copyMaxMb * 1024 * 1024
}

/** `ImageManagement/CreateFolder`. The path is the folder's full path. */
export const CreateDamFolderSchema = z.object({
  folderPath: z.string().trim().min(1).max(1024),
})

export type DamListQueryDto = z.infer<typeof DamListQuerySchema>
export type DamFolderContentsQueryDto = z.infer<
  typeof DamFolderContentsQuerySchema
>
export type DamFileNotesQueryDto = z.infer<typeof DamFileNotesQuerySchema>
export type DamUploadDto = z.infer<typeof DamUploadSchema>
export type DamDeleteFileQueryDto = z.infer<typeof DamDeleteFileQuerySchema>
export type CreateDamFolderDto = z.infer<typeof CreateDamFolderSchema>
export type DamFileRefDto = z.infer<typeof DamFileRefSchema>

// --- What an upload may carry ----------------------------------------------------

/**
 * How much one request may carry.
 *
 * ---------------------------------------------------------------------------
 * Why these are a setting and not a constant
 * ---------------------------------------------------------------------------
 * Next buffers the whole multipart body in memory before the handler sees it,
 * and the copy out of the library into object storage buffers it again. So a
 * 200MB print file costs this process roughly 200MB twice over, per concurrent
 * upload — these numbers bound what the server can survive, not what a designer
 * would like to send.
 *
 * Raising them is a memory decision, which is why `DAM_UPLOAD_MAX_FILE_MB` and
 * `DAM_COPY_MAX_MB` are environment variables an operator can tune against the
 * container's actual limit rather than a number baked in here.
 *
 * The real fix for genuinely large artwork is to stream rather than buffer,
 * which needs `@aws-sdk/lib-storage` — not a dependency of this project.
 */
export const DAM_UPLOAD_MAX_FILES = 10

export function damUploadMaxFileBytes(): number {
  return getConfig().dam.upload.maxFileMb * 1024 * 1024
}

/**
 * The batch ceiling, derived rather than set separately: two files at the limit,
 * so a pair of large ones still goes through while ten of them cannot.
 */
export function damUploadMaxTotalBytes(): number {
  return damUploadMaxFileBytes() * 2
}

/**
 * What the library accepts.
 *
 * Ticket-IT's operation is called `UploadImage`, but the permission it sits
 * behind is described as "artwork, proofs and other files" — so proofs (PDF) and
 * the print-production formats a designer actually hands over (AI, EPS, PSD,
 * INDD) belong here too. A catalogue whose Artwork slot refuses `.ai` is a
 * catalogue nobody can put real artwork in.
 *
 * Still a closed list rather than "anything". An uploaded file keeps its name in
 * blob storage and comes back as a URL a browser loads, so admitting `.html` or
 * `.svg`-adjacent scriptable types would make the library a place to host a page
 * on someone else's origin. SVG is on the list because the builder genuinely
 * uses it; it is the one entry here worth revisiting if the library ever serves
 * files inline rather than as downloads.
 */
const ALLOWED_CONTENT_TYPES = new Set([
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

/**
 * Extensions matching the types above.
 *
 * Checked as well as the content type, not instead of it — and for these formats
 * it is the half that does the work. A browser has no media type for `.ai` or
 * `.indd` and sends `application/octet-stream`, which on its own would admit
 * anything at all; pairing it with a known extension is what keeps the list
 * closed.
 */
const ALLOWED_EXTENSIONS = new Set([
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

/** A name that is a name and not a path: no traversal, no directory separators. */
// Control characters are matched on purpose: a file name carrying one is refused.
// oxlint-disable-next-line no-control-regex
const UNSAFE_FILE_NAME = /[/\\:*?"<>|]|[\u0000-\u001F]/

/**
 * Checks the file parts of an upload and throws `ValidationError` — the same 400
 * envelope a bad JSON body gets — on the first problem.
 *
 * Every rejection names the file. A form that submitted eight images and came
 * back with "one of these is too big" is a form nobody can fix.
 */
export function assertUploadableFiles(files: readonly File[]): void {
  if (files.length === 0) {
    throw new ValidationError('Attach at least one file to upload')
  }
  if (files.length > DAM_UPLOAD_MAX_FILES) {
    throw new ValidationError(
      `Upload at most ${DAM_UPLOAD_MAX_FILES} files at a time; this request ` +
        `had ${files.length}`
    )
  }

  let total = 0
  for (const file of files) {
    assertUploadableFile(file)
    total += file.size
  }

  const maxTotal = damUploadMaxTotalBytes()
  if (total > maxTotal) {
    throw new ValidationError(
      `These files come to ${megabytes(total)}MB. Upload at most ` +
        `${megabytes(maxTotal)}MB at a time.`
    )
  }
}

function assertUploadableFile(file: File): void {
  const name = file.name.trim()
  if (
    name === '' ||
    name === '.' ||
    name === '..' ||
    name.length > 200 ||
    UNSAFE_FILE_NAME.test(name)
  ) {
    throw new ValidationError(
      `"${file.name}" is not a usable file name. Rename it and try again.`
    )
  }

  const extension = name.includes('.')
    ? name.slice(name.lastIndexOf('.') + 1).toLowerCase()
    : ''
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new ValidationError(
      `"${name}" is not a file type the library accepts. Upload an image ` +
        '(PNG, JPEG, GIF, WebP, BMP, TIFF, SVG), a PDF, or print artwork ' +
        '(AI, EPS, PSD, INDD, IDML, ZIP).'
    )
  }

  // An empty type is a browser that could not work out what the file is. The
  // extension already had to be one of ours, so it is not treated as a refusal.
  const contentType = file.type.split(';')[0].trim().toLowerCase()
  if (contentType !== '' && !ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ValidationError(
      `"${name}" was sent as ${contentType}, which the library does not accept.`
    )
  }

  if (file.size === 0) throw new ValidationError(`"${name}" is empty`)

  const maxFile = damUploadMaxFileBytes()
  if (file.size > maxFile) {
    throw new ValidationError(
      `"${name}" is ${megabytes(file.size)}MB. The limit is ` +
        `${megabytes(maxFile)}MB per file.`
    )
  }
}

function megabytes(bytes: number): number {
  return Math.round((bytes / 1_048_576) * 10) / 10
}
