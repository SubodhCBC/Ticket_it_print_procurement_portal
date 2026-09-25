import { enqueueDerivatives } from '../catalog/asset-derivative.service'
import { prisma } from '../db/client'
import {
  buildKey,
  copy as copyObject,
  StoragePrefix,
} from '../storage/storage.service'
import { createId } from '../utils/ids'

/**
 * Gives a freshly copied template its own tile and preview images.
 *
 * ---------------------------------------------------------------------------
 * Why the images are copied rather than shared
 * ---------------------------------------------------------------------------
 * Sharing the asset rows was never an option: `TemplateAsset` is scoped to one
 * template and cascades on delete, so a copy pointing at the original's tile
 * would lose its preview the day anyone deleted the original — and
 * `attachTemplateAsset` enforces the same boundary from the other side, by
 * refusing a storage key that is not under this template's own prefix.
 *
 * But leaving a copy with no images at all was worse than it sounds. The copy a
 * buyer is handed when they order an operator design showed "No preview yet —
 * open the Studio Editor and save" beside the original it was pixel-identical
 * to, the only way to clear it was to re-save a design nobody had changed, and
 * their whole library read as unfinished work.
 *
 * So each object is copied *within the bucket* into the new template's prefix.
 * The copy owns its files outright, the invariant holds, and no image bytes
 * pass through this process.
 *
 * ---------------------------------------------------------------------------
 * Two deliberate limits
 * ---------------------------------------------------------------------------
 * **Only the two singletons.** A copy needs to *look* like its source; cloning
 * a 200 MB print-ready SOURCE file to achieve that would be a poor trade.
 *
 * **Derivatives are re-queued, not copied.** Those objects belong to the
 * source, and pointing at them is exactly the sharing this avoids. The read
 * path already falls back to the original while `derivativeStatus` is PENDING,
 * so the tile appears immediately and sharpens when the worker catches up.
 *
 * Non-fatal by design. A copy with no tile is a cosmetic loss the user can
 * clear by re-saving; a copy that failed outright because object storage was
 * briefly unreachable would lose the design work itself.
 */
export async function copyTemplateImages(
  sourceTemplateId: string,
  newTemplateId: string,
  newCode: string
): Promise<void> {
  try {
    const source = await prisma.template.findUnique({
      where: { id: sourceTemplateId },
      select: { thumbnailAssetId: true, previewAssetId: true },
    })
    if (!source) return

    const singletons = [
      { assetId: source.thumbnailAssetId, pointer: 'thumbnailAssetId' },
      { assetId: source.previewAssetId, pointer: 'previewAssetId' },
    ] as const

    for (const { assetId, pointer } of singletons) {
      if (!assetId) continue

      const asset = await prisma.templateAsset.findUnique({
        where: { id: assetId },
      })
      if (!asset) continue

      // Timestamped like a fresh upload, because `storageKey` is unique across
      // the whole table: two copies of one template made inside the same
      // second would otherwise collide on the key and lose the second tile.
      const destinationKey = buildKey(
        StoragePrefix.ARTWORK,
        `template/${newCode}`,
        `${Date.now()}-${asset.filename}`
      )

      await copyObject(asset.storageKey, destinationKey)

      const copiedId = createId('tpa')

      await prisma.$transaction(async (tx) => {
        await tx.templateAsset.create({
          data: {
            id: copiedId,
            templateId: newTemplateId,
            kind: asset.kind,
            storageKey: destinationKey,
            filename: asset.filename,
            contentType: asset.contentType,
            sizeBytes: asset.sizeBytes,
            altText: asset.altText,
            sortOrder: asset.sortOrder,
            // Carried over so a gallery can reserve the right box before the
            // image loads. The pixels are identical, so these are still true.
            widthPx: asset.widthPx,
            heightPx: asset.heightPx,
            derivativeStatus: asset.contentType.startsWith('image/')
              ? 'PENDING'
              : 'NOT_APPLICABLE',
            damDocumentId: asset.damDocumentId,
          },
        })

        await tx.template.update({
          where: { id: newTemplateId },
          data: { [pointer]: copiedId },
        })
      })

      if (asset.contentType.startsWith('image/')) {
        await enqueueDerivatives(copiedId, 'TEMPLATE')
      }
    }
  } catch (error) {
    console.error(
      `Could not copy the tile images onto template ${newTemplateId}; it will ` +
        'show no preview until it is saved from the editor. ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}
