// src/services/asset-storage.ts

/**
 * Where a template's or a product's own files go — thumbnails, previews,
 * product images, artwork, spec sheets.
 *
 * The image library (DAM), and only the image library. Object storage used to
 * be reachable from the browser through presign → PUT → attach with a
 * `storageKey`; those routes are gone, and the server now reads the file out of
 * the library and copies it to S3 itself. This module is the one place that
 * knows how a file gets there, so the screens and adapters do not.
 *
 * ---------------------------------------------------------------------------
 * The contract this sends
 * ---------------------------------------------------------------------------
 *   1. `POST /api/v1/dam/folders` with `{ folderPath }` — the owner's folder,
 *      `Templates/<templateId>` or `Products/<productId>`. Uploads do not
 *      create it.
 *   2. `POST /api/v1/dam/files` (multipart) — the file into that folder. The
 *      response lists the stored file with its `url` (`uploadImageToDam`
 *      re-lists the folder if it does not).
 *   3. `POST /api/v1/templates/:id/assets` or `/catalog/products/:id/assets`
 *      with `{ damDocumentId: '<folderPath>/<fileName>', damUrl, filename,
 *      contentType, sizeBytes, kind, altText?, sortOrder? }`. The server
 *      records the DAM file, copies it into object storage and hands `damUrl`
 *      back as the asset's `url` / the template's `thumbnailUrl`.
 *   4. Deleting an asset is unchanged; the server unlinks the DAM file.
 */

/** One folder per template, so its files can be found and removed together. */
export const damFolderForTemplate = (templateId: string) =>
  `Templates/${templateId}`

/** One folder per product. */
export const damFolderForProduct = (productId: string) =>
  `Products/${productId}`

/**
 * Folders this browser session has already asked for.
 *
 * The create call is per folder, not per upload: a product with eight images
 * would otherwise make eight identical calls, seven of which exist only to be
 * refused. Remembered whether or not the call succeeded — see why below.
 */
const foldersEnsured = new Set<string>()

/**
 * Makes the owner's folder, if it is not already known to be there.
 *
 * Ticket-IT does not document what `CreateFolder` does when the folder already
 * exists, and the server passes its answer straight through, so "already there"
 * and "genuinely refused" are not told apart here — both are swallowed and the
 * upload that follows is left to speak. An upload into a missing folder fails
 * with a message about the upload, which is the one the user can act on; an
 * error thrown here would replace it with a message about a folder they never
 * asked for.
 *
 * The exception is a lost Ticket-IT session: that is not about this folder, it
 * is the user's session, and the caller has a quiet fallback for it.
 */
async function ensureDamFolder(folderPath: string): Promise<void> {
  if (foldersEnsured.has(folderPath)) return

  const { createDamFolder, DAM_SESSION_REQUIRED_CODE, DamUploadError } =
    await import('@/services/dam.service')

  try {
    await createDamFolder(folderPath)
  } catch (error) {
    const { toApiError } = await import('@/services/api.service')
    const apiError = toApiError(error)
    if (apiError.code === DAM_SESSION_REQUIRED_CODE) {
      throw new DamUploadError(apiError.message, apiError.code)
    }
    // Anything else: the folder may well exist already. Fall through.
  }

  // Set even on failure. A folder that could not be created will not be
  // created by asking again with the same session, and the upload's own error
  // is the better one to show.
  foldersEnsured.add(folderPath)
}

/** What an attach call needs to register a file that is in the image library. */
export interface DamAssetReference {
  /** `<folderPath>/<fileName>` — how Ticket-IT addresses a file; it has no ids. */
  damDocumentId: string
  /** Where the file is served from. */
  damUrl: string
  /** The name it is stored under: the original plus a unique suffix. */
  storedFileName: string
  contentType: string
  sizeBytes: number
}

/**
 * Puts one owned file into the image library and returns its reference.
 *
 * Throws `DamUploadError` with a message for the user when the library refuses
 * it (no Ticket-IT session, a type or size it does not take) or does not say
 * where it went.
 */
export async function storeOwnedFileInDam(
  file: Blob,
  options: { fileName: string; folderPath: string }
): Promise<DamAssetReference> {
  // Loaded on use: the DAM service reads the data source, which loads the
  // adapters that import this module.
  const { uploadImageToDam } = await import('@/services/dam.service')

  await ensureDamFolder(options.folderPath)

  const stored = await uploadImageToDam(file, {
    fileName: options.fileName,
    folderPath: options.folderPath,
  })
  const folder = stored.folderPath ?? options.folderPath
  return {
    damDocumentId: `${folder}/${stored.fileName}`,
    damUrl: stored.url,
    storedFileName: stored.fileName,
    contentType:
      stored.contentType ?? (file.type || 'application/octet-stream'),
    sizeBytes: file.size,
  }
}
