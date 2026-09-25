import sharp from 'sharp'
import { z } from 'zod'
import { prisma } from '../db/client'
import { RENDER_RETRY } from '../queue/job-options'
import { enqueue as addJob } from '../queue/producer'
import { QueueName } from '../queue/queue-names'
import {
  getStream,
  put as putObject,
  remove as removeObject,
} from '../storage/storage.service'

/**
 * Which table the asset lives in.
 *
 * Product images and template images need exactly the same two derivatives, and
 * they ride the same queue. What differs is one row's address, so that is all
 * the payload carries — a second service would mean a second copy of the sharp
 * pipeline and, worse, a second worker on one queue: BullMQ hands each job to
 * exactly one worker, so the product worker would consume template jobs, log
 * that it did not recognise them, and mark them complete. Every template
 * thumbnail would silently never appear.
 */
export const DerivativeTarget = {
  PRODUCT: 'PRODUCT',
  TEMPLATE: 'TEMPLATE',
} as const
export type DerivativeTarget =
  (typeof DerivativeTarget)[keyof typeof DerivativeTarget]

/**
 * The queue payload: an asset id and its table, never the image bytes.
 *
 * `target` defaults to PRODUCT so jobs enqueued before templates existed still
 * parse after a deploy — a queue drains what was on it when the code changed.
 */
export const DerivativeJobSchema = z.object({
  assetId: z.string().min(1).max(64),
  target: z.enum(['PRODUCT', 'TEMPLATE']).default('PRODUCT'),
})
export type DerivativeJobPayload = z.infer<typeof DerivativeJobSchema>

export const DERIVATIVE_JOB_NAME = 'product-image-derivatives'

/**
 * The two sizes generated per catalogue image.
 *
 * Two, not a ladder. A grid thumbnail and a detail-page preview are what the
 * portal actually renders; every extra size is storage and processing spent on a
 * breakpoint nobody has asked for. `fit: 'inside'` preserves aspect ratio and
 * never upscales, so a small source image is left at its own size rather than
 * being blown up into something blurry.
 */
const DERIVATIVES = [
  {
    field: 'thumbnailKey',
    suffix: 'thumb',
    width: 320,
    height: 320,
    quality: 72,
  },
  {
    field: 'previewKey',
    suffix: 'preview',
    width: 1200,
    height: 1200,
    quality: 82,
  },
] as const

/**
 * Above this, the source is left alone.
 *
 * sharp streams, but a genuinely enormous file still costs memory to decode, and
 * an image this size in a product catalogue is a mistake rather than a
 * requirement. The asset still works; it simply has no thumbnail, and the status
 * says why.
 */
const MAX_SOURCE_BYTES = 100 * 1024 * 1024

/**
 * Resized copies of product and template images.
 *
 * ---------------------------------------------------------------------------
 * Why this is asynchronous
 * ---------------------------------------------------------------------------
 * Decoding a 40-megapixel print source and resizing it twice takes seconds and
 * hundreds of megabytes. Doing it inside the request that attaches the asset
 * would tie an admin's upload to that cost, and doing it inside the web process
 * at all is why the RENDER queue exists — its whole description is "slow, memory
 * hungry, isolated". In Next that argument is stronger, not weaker: the same
 * process is serving the React pages.
 *
 * ---------------------------------------------------------------------------
 * The original is never touched
 * ---------------------------------------------------------------------------
 * Derivatives are additional objects with their own keys. The uploaded file
 * stays exactly as it arrived, because it is what the print pipeline (INT-01)
 * sends to production — a re-encoded, resized copy reaching a printing press is
 * the kind of mistake that is discovered on delivery.
 */

/**
 * Queues derivative generation for an image asset.
 *
 * Never throws into the caller: attaching an asset must succeed whether or not a
 * thumbnail can be scheduled. A failure here — including no queue being
 * configured at all — leaves the asset PENDING, which `sweepPendingDerivatives`
 * picks up once there is a worker to pick it up with.
 */
export async function enqueueDerivatives(
  assetId: string,
  target: DerivativeTarget = 'PRODUCT'
): Promise<void> {
  try {
    const queued = await addJob(
      QueueName.RENDER,
      DERIVATIVE_JOB_NAME,
      { assetId, target } satisfies DerivativeJobPayload,
      RENDER_RETRY
    )

    if (!queued) {
      console.debug(
        `No queue configured; asset ${assetId} stays PENDING for the sweep.`
      )
    }
  } catch (error) {
    console.warn(
      `Could not queue derivatives for asset ${assetId}; it stays PENDING for the sweep. ` +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

/**
 * Generates and stores the derivatives. Called by the worker.
 *
 * Failure is recorded on the row rather than left silent: an admin looking at a
 * product with no thumbnail should be able to see that generation failed and
 * why, instead of assuming the upload did not work.
 */
export async function generateDerivatives(
  assetId: string,
  target: DerivativeTarget = 'PRODUCT'
): Promise<void> {
  const asset = await readAsset(assetId, target)

  if (!asset) {
    // The asset was removed between enqueue and run. Not retryable.
    console.warn(`Asset ${assetId} no longer exists; nothing to generate.`)
    return
  }

  // A product asset says it is an image through `kind`; a template asset says so
  // through its content type, because its `kind` answers a different question
  // (is this the tile, the mock-up, or artwork inside the design).
  if (!asset.isImage) {
    await setStatus(assetId, target, 'NOT_APPLICABLE')
    return
  }

  if (asset.sizeBytes > MAX_SOURCE_BYTES) {
    await failDerivatives(
      assetId,
      target,
      `Source is ${Math.round(asset.sizeBytes / 1_048_576)}MB, above the ` +
        `${MAX_SOURCE_BYTES / 1_048_576}MB limit for derivatives`
    )
    return
  }

  try {
    const source = await readAll(asset.storageKey)
    const metadata = await sharp(source).metadata()

    const updates: Record<string, string> = {}

    for (const spec of DERIVATIVES) {
      const body = await sharp(source)
        // Honour the EXIF orientation before resizing, or portrait photographs
        // come out sideways in the grid.
        .rotate()
        .resize(spec.width, spec.height, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .webp({ quality: spec.quality })
        .toBuffer()

      const key = derivativeKey(asset.storageKey, spec.suffix)
      await putObject(key, body, {
        contentType: 'image/webp',
        metadata: { sourceAssetId: assetId },
      })

      updates[spec.field] = key
    }

    const data = {
      ...updates,
      widthPx: metadata.width ?? null,
      heightPx: metadata.height ?? null,
      derivativeStatus: 'READY' as const,
      derivativeError: null,
    }

    if (target === 'TEMPLATE') {
      await prisma.templateAsset.update({ where: { id: assetId }, data })
    } else {
      await prisma.productAsset.update({ where: { id: assetId }, data })
    }

    console.info(
      `Generated derivatives for ${target.toLowerCase()} asset ${assetId} ` +
        `(${metadata.width ?? '?'}x${metadata.height ?? '?'}).`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await failDerivatives(assetId, target, message)
    // Rethrown so the queue's retry policy applies — a transient storage error
    // deserves another attempt, and the row already says it failed.
    throw error
  }
}

/**
 * Re-queues images that never got their derivatives.
 *
 * Covers three cases: assets that existed before this feature, ones whose
 * enqueue failed, and ones whose job was lost. Bounded per run so a sweep cannot
 * flood the render queue.
 *
 * This deployment has the first case for real: every image attached while there
 * was no worker was recorded PENDING precisely so this sweep would find it.
 */
export async function sweepPendingDerivatives(limit = 100): Promise<number> {
  // The limit is per table rather than shared. Splitting a budget between them
  // would mean a backlog of product images starving templates of their
  // thumbnails entirely, which is how one slow import makes an unrelated gallery
  // look broken.
  const [products, templates] = await Promise.all([
    prisma.productAsset.findMany({
      where: { kind: 'IMAGE', derivativeStatus: 'PENDING' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),
    prisma.templateAsset.findMany({
      where: {
        contentType: { startsWith: 'image/' },
        derivativeStatus: 'PENDING',
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),
  ])

  for (const asset of products) await enqueueDerivatives(asset.id, 'PRODUCT')
  for (const asset of templates) await enqueueDerivatives(asset.id, 'TEMPLATE')

  const total = products.length + templates.length
  if (total > 0) {
    console.info(`Swept ${total} image(s) back onto the derivative queue.`)
  }
  return total
}

/** Deletes the derivative objects for an asset. Best-effort. */
export async function removeDerivatives(
  thumbnailKey: string | null,
  previewKey: string | null
): Promise<void> {
  for (const key of [thumbnailKey, previewKey]) {
    if (!key) continue
    try {
      await removeObject(key)
    } catch (error) {
      console.warn(
        `Could not delete derivative ${key}; it is now an orphaned object. ` +
          (error instanceof Error ? error.message : String(error))
      )
    }
  }
}

/**
 * The one shape this service needs from either asset table.
 *
 * Narrow on purpose: everything else about a product asset and a template asset
 * differs, and a wider type would tempt this service into caring.
 */
async function readAsset(
  assetId: string,
  target: DerivativeTarget
): Promise<{
  storageKey: string
  sizeBytes: number
  isImage: boolean
} | null> {
  if (target === 'TEMPLATE') {
    const asset = await prisma.templateAsset.findUnique({
      where: { id: assetId },
    })
    return asset
      ? {
          storageKey: asset.storageKey,
          sizeBytes: asset.sizeBytes,
          isImage: asset.contentType.startsWith('image/'),
        }
      : null
  }

  const asset = await prisma.productAsset.findUnique({ where: { id: assetId } })
  return asset
    ? {
        storageKey: asset.storageKey,
        sizeBytes: asset.sizeBytes,
        isImage: asset.kind === 'IMAGE',
      }
    : null
}

async function setStatus(
  assetId: string,
  target: DerivativeTarget,
  derivativeStatus: 'NOT_APPLICABLE' | 'FAILED',
  derivativeError?: string
): Promise<void> {
  const data = {
    derivativeStatus,
    ...(derivativeError ? { derivativeError } : {}),
  }

  if (target === 'TEMPLATE') {
    await prisma.templateAsset.update({ where: { id: assetId }, data })
  } else {
    await prisma.productAsset.update({ where: { id: assetId }, data })
  }
}

async function failDerivatives(
  assetId: string,
  target: DerivativeTarget,
  message: string
): Promise<void> {
  await setStatus(assetId, target, 'FAILED', message.slice(0, 500))
  console.warn(
    `Derivatives failed for ${target.toLowerCase()} asset ${assetId}: ${message}`
  )
}

/**
 * Pulls the whole object into memory.
 *
 * sharp can stream, but it needs random access for some formats and buffers
 * internally anyway; MAX_SOURCE_BYTES is what bounds this rather than the read
 * strategy.
 */
async function readAll(storageKey: string): Promise<Buffer> {
  const stream = await getStream(storageKey)
  const chunks: Buffer[] = []

  for await (const chunk of stream) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike)
    )
  }
  return Buffer.concat(chunks)
}

/**
 * `artwork/catalog/SKU/123-photo.png` -> `artwork/catalog/SKU/123-photo.thumb.webp`
 *
 * Derived from the source key rather than generated fresh, so a derivative is
 * always findable from its original — which is what makes an orphan sweep
 * possible if a row is ever lost.
 */
export function derivativeKey(storageKey: string, suffix: string): string {
  const lastDot = storageKey.lastIndexOf('.')
  const stem =
    lastDot > storageKey.lastIndexOf('/')
      ? storageKey.slice(0, lastDot)
      : storageKey
  return `${stem}.${suffix}.webp`
}
