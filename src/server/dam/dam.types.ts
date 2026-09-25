/**
 * The document library (DAM), in the portal's own vocabulary.
 *
 * The library is Ticket-IT's ImageManagement API. Nothing outside
 * `src/server/dam` sees its payloads: its responses are untyped in the OpenAPI
 * document and not yet checked against a live account, so every field name it
 * uses is guessed at in `dam.mapper.ts` and nowhere else. When the real shapes
 * are confirmed — `scripts/check-ticketit-dam.mjs` prints them — the fix lands in
 * that one file, not in every screen that shows a picture.
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
  /** Verbatim from Ticket-IT: its timestamps carry no zone, so none is invented. */
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
 * One page of a Ticket-IT listing.
 *
 * Not `OffsetPage`: that promises a total, and Ticket-IT's listings are not
 * known to report one. `total` is null when it did not, and `hasMore` then falls
 * back to whether the page came back full.
 */
export interface DamPage<T> {
  readonly items: readonly T[]
  readonly page: number
  readonly pageSize: number
  readonly total: number | null
  readonly totalPages: number | null
  readonly hasMore: boolean
}

/** A folder's contents: its sub-folders, and a page of its files. */
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
 * `UploadImage` answers with no URL and no id — a library file is identified by
 * its folder and name and nothing else — so everything below `name` comes from
 * re-listing the folder once the upload has gone through. `confirmed` says
 * whether that listing actually found it.
 */
export interface DamUploadedFile {
  /** The name the portal sent, which is the name the library stores it under. */
  readonly name: string
  /** Null at the library's root. */
  readonly folderPath: string | null
  /**
   * Whether the folder listing showed this file after the upload.
   *
   * False is not a failed upload: Ticket-IT accepted the bytes or the whole call
   * would have thrown. It means the portal could not find the file again — a
   * listing that pages differently, a name the library normalised — and the
   * fields below are therefore empty.
   */
  readonly confirmed: boolean
  /** An absolute URL a browser can load, when the listing supplied one. */
  readonly url: string | null
  readonly thumbnailUrl: string | null
  readonly contentType: string | null
  readonly sizeBytes: number | null
}

/**
 * What came of an upload.
 *
 * The call either succeeds for the whole batch or throws — `UploadImage` offers
 * no per-file result and no partial success — so every file sent appears here,
 * in the order it was sent.
 */
export interface DamUploadResult {
  /** Null when the files went to the library's root. */
  readonly folderPath: string | null
  readonly files: readonly DamUploadedFile[]
}

/**
 * One library file, fetched. Returned by `readOperatorDamFile` for the attach
 * paths that copy artwork out of the library and into object storage.
 */
export interface DamFileContent {
  /** As the library holds it, which is what the copy is named after. */
  readonly fileName: string
  readonly folderPath: string | null
  readonly bytes: Buffer
  readonly sizeBytes: number
  /** From the response, falling back to the listing, then to octet-stream. */
  readonly contentType: string
}

export interface DamStatus {
  /** Switched on and configured. Offer the library only when this is true. */
  readonly enabled: boolean
  /** The portal holds a Ticket-IT session for this user. */
  readonly connected: boolean
  /** Why the library cannot be opened right now, for the user. Null when it can. */
  readonly reason: string | null
}
