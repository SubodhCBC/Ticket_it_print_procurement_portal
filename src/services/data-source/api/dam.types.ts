/**
 * The document library (DAM), as `/api/v1/dam/*` returns it.
 *
 * Mirrors `src/server/dam/dam.types.ts` field for field. The server maps
 * Ticket-IT's ImageManagement payloads into these shapes, so the browser never
 * sees Ticket-IT's own field names — and any of the nullable fields below may
 * genuinely be null, because Ticket-IT does not always supply them.
 */

export interface DamFolder {
  readonly name: string
  /** As Ticket-IT addresses it. Hand it back unchanged as `folderPath`. */
  readonly path: string
  /** Empty when Ticket-IT returned the folder without its sub-folders. */
  readonly children: readonly DamFolder[]
}

export interface DamFile {
  readonly name: string
  /** Search results can mix folders in with files. */
  readonly kind: 'file' | 'folder'
  readonly folderPath: string | null
  /** An absolute URL a browser can load, when Ticket-IT supplies one. */
  readonly url: string | null
  readonly thumbnailUrl: string | null
  readonly contentType: string | null
  readonly sizeBytes: number | null
  /** Verbatim from Ticket-IT: its timestamps carry no zone. */
  readonly updatedAt: string | null
}

export interface DamFileNote {
  readonly id: number | null
  readonly notes: string
  readonly authorName: string | null
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

/**
 * One page of a listing. Not `PaginatedResult`: Ticket-IT does not always
 * report a total, so `total`/`totalPages` may be null and `hasMore` is the
 * signal to page on.
 */
export interface DamPage<T> {
  readonly items: readonly T[]
  readonly page: number
  readonly pageSize: number
  readonly total: number | null
  readonly totalPages: number | null
  readonly hasMore: boolean
}

export interface DamFolderContents extends DamPage<DamFile> {
  /** Null for the library's root. */
  readonly folderPath: string | null
  readonly folders: readonly DamFolder[]
}

export interface DamFileNotes {
  readonly folderPath: string | null
  readonly fileName: string
  readonly items: readonly DamFileNote[]
}

/**
 * One uploaded file, as the library holds it afterwards.
 *
 * Ticket-IT's upload answers with no URL and no id, so everything below `name`
 * comes from the server re-listing the folder once the upload went through.
 * `confirmed` says whether that listing found it.
 */
export interface DamUploadedFile {
  /** The name the file was sent under, which is the name it is stored under. */
  readonly name: string
  /** Null at the library's root. */
  readonly folderPath: string | null
  /**
   * Whether the folder listing showed this file after the upload.
   *
   * False is not a failed upload — the bytes were accepted or the whole call
   * would have failed. It means the file could not be found again, so `url`
   * and the fields below it are null and the folder is worth a second look.
   */
  readonly confirmed: boolean
  readonly url: string | null
  readonly thumbnailUrl: string | null
  readonly contentType: string | null
  readonly sizeBytes: number | null
}

/**
 * What came of an upload. The call succeeds for the whole batch or fails for
 * all of it — there is no partial success — so every file sent appears in
 * `files`, in the order it was sent.
 */
export interface DamUploadResult {
  readonly folderPath: string | null
  readonly files: readonly DamUploadedFile[]
}

/** What `POST /dam/folders` answers with. */
export interface DamCreatedFolder {
  readonly folderPath: string
}

export interface DamStatus {
  /** Switched on and configured. Offer the library only when this is true. */
  readonly enabled: boolean
  /** The portal holds a Ticket-IT session for this user. */
  readonly connected: boolean
  /** Why the library cannot be opened right now, for the user. */
  readonly reason: string | null
}

export interface DamListParams {
  page?: number
  /** 1–100. */
  pageSize?: number
  search?: string
  sortOn?: string
  sortDirection?: 'asc' | 'desc'
}

export interface DamFolderContentsParams extends DamListParams {
  /** Omit, or null, for the root. */
  folderPath?: string | null
}
