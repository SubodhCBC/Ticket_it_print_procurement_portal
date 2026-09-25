import { Prisma } from '@prisma/client'
import { Permission } from '../auth/permissions'
import { can } from '../auth/permission.service'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope } from '../db/client'
import { fromJsonOr } from '../db/json-column'
import { presignDownload } from '../storage/storage.service'
import { ORDER_PREVIEW_KEY } from '../templates/template-status'
import { NotFoundError } from '../utils/errors'
import { findOrderById } from './orders.service'

/**
 * What an ordered line looks like, for the screens that decide on it.
 *
 * ---------------------------------------------------------------------------
 * The buyer's own picture first
 * ---------------------------------------------------------------------------
 * A personalised design carries a small picture of the front as the buyer
 * finished it, under `__preview` in the line's customisation. That is the
 * artwork an approver is being asked to approve, and nothing else is: the
 * template's thumbnail shows the design before the buyer changed it, and the
 * product photograph shows blank stock. So the preview is always preferred,
 * and the other two are offered only as what they are — see `LineImage.source`.
 *
 * ---------------------------------------------------------------------------
 * Served, not inlined
 * ---------------------------------------------------------------------------
 * A preview is a data URL of up to 600 kB. Putting one per line into a queue of
 * twenty-five approvals would make the hub's first response megabytes, so the
 * list says only whether a line has one, and `GET /orders/{id}/lines/{lineId}/
 * preview` serves the image itself.
 */

export type LineImageSource = 'BUYER_PREVIEW' | 'TEMPLATE' | 'PRODUCT' | 'NONE'

export interface LineImage {
  /**
   * Where the picture comes from. Only BUYER_PREVIEW shows the artwork as
   * ordered; TEMPLATE is the design before personalisation and PRODUCT is the
   * blank stock, so a screen should say so rather than present either as proof.
   */
  readonly source: LineImageSource
  /** API path of the buyer's preview, fetched with the caller's credentials. */
  readonly previewPath: string | null
  /** A short-lived link to the template thumbnail or product photograph. */
  readonly imageUrl: string | null
}

/** Only raster types are served back; an SVG data URL could carry script. */
const SERVABLE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
])

interface ImageableLine {
  readonly id: string
  readonly orderId: string
  readonly productId: string
  readonly templateId: string | null
}

/**
 * The picture for each line, keyed by line id.
 *
 * One query to learn which lines carry a preview — by looking for the key in
 * the text, so the previews themselves are never read — then two more for the
 * template and product images the rest fall back to, signed locally.
 */
export async function lineImages(
  accountId: string,
  lines: readonly ImageableLine[]
): Promise<Map<string, LineImage>> {
  const images = new Map<string, LineImage>()
  if (lines.length === 0) return images

  const withPreview = new Set(
    (
      await withTenantScope(
        accountId,
        (tx) =>
          tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "order_line_items"
          WHERE "id" IN (${Prisma.join(lines.map((line) => line.id))})
            AND CHARINDEX(${`"${ORDER_PREVIEW_KEY}"`}, "customisation") > 0
        `
      )
    ).map((row) => row.id)
  )

  const needFallback = lines.filter((line) => !withPreview.has(line.id))
  const [templates, products] = await Promise.all([
    prisma.template.findMany({
      where: {
        id: {
          in: [
            ...new Set(
              needFallback
                .map((line) => line.templateId)
                .filter((id): id is string => id !== null)
            ),
          ],
        },
      },
      select: {
        id: true,
        thumbnailAsset: { select: { storageKey: true, thumbnailKey: true } },
      },
    }),
    prisma.productAsset.findMany({
      where: {
        productId: { in: [...new Set(needFallback.map((l) => l.productId))] },
        kind: 'IMAGE',
      },
      select: {
        productId: true,
        storageKey: true,
        thumbnailKey: true,
        sortOrder: true,
      },
      orderBy: { sortOrder: 'asc' },
    }),
  ])

  const templateKey = new Map(
    templates
      .filter((template) => template.thumbnailAsset)
      .map((template) => [
        template.id,
        template.thumbnailAsset!.thumbnailKey ??
          template.thumbnailAsset!.storageKey,
      ])
  )
  const productKey = new Map<string, string>()
  for (const asset of products) {
    if (!productKey.has(asset.productId)) {
      productKey.set(asset.productId, asset.thumbnailKey ?? asset.storageKey)
    }
  }

  await Promise.all(
    lines.map(async (line) => {
      if (withPreview.has(line.id)) {
        images.set(line.id, {
          source: 'BUYER_PREVIEW',
          previewPath: previewPath(line.orderId, line.id),
          imageUrl: null,
        })
        return
      }
      const fromTemplate = line.templateId
        ? templateKey.get(line.templateId)
        : undefined
      const key = fromTemplate ?? productKey.get(line.productId)
      images.set(line.id, {
        source: fromTemplate ? 'TEMPLATE' : key ? 'PRODUCT' : 'NONE',
        previewPath: null,
        imageUrl: key ? await presignDownload(key) : null,
      })
    })
  )

  return images
}

/** Pictures for every line of a page of approval requests. */
export async function approvalLineImages(
  requests: readonly {
    readonly accountId: string
    readonly order: { readonly lines: readonly ImageableLine[] }
  }[]
): Promise<Map<string, LineImage>> {
  const byAccount = new Map<string, ImageableLine[]>()
  for (const request of requests) {
    const lines = byAccount.get(request.accountId) ?? []
    lines.push(...request.order.lines)
    byAccount.set(request.accountId, lines)
  }

  const merged = new Map<string, LineImage>()
  for (const [accountId, lines] of byAccount) {
    for (const [id, image] of await lineImages(accountId, lines)) {
      merged.set(id, image)
    }
  }
  return merged
}

export function previewPath(orderId: string, lineId: string): string {
  return `/api/v1/orders/${encodeURIComponent(orderId)}/lines/${encodeURIComponent(lineId)}/preview`
}

/**
 * The buyer's preview of one line, as image bytes.
 *
 * Readable by anyone who may see the order, and by anyone who may decide
 * approvals in its account while it has an approval request — an approver named
 * on a rule need not otherwise see every order in the account.
 */
export async function readLinePreview(
  actor: AuthenticatedActor,
  orderId: string,
  lineId: string
): Promise<{ readonly body: Buffer; readonly contentType: string }> {
  const accountId = await readableAccount(actor, orderId)

  const line = await withTenantScope(accountId, (tx) =>
    tx.orderLineItem.findFirst({
      where: { id: lineId, orderId },
      select: { customisation: true },
    })
  )
  const dataUrl = fromJsonOr<Record<string, unknown>>(
    line?.customisation ?? null,
    {}
  )[ORDER_PREVIEW_KEY]

  const match =
    typeof dataUrl === 'string'
      ? /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(
          dataUrl
        )
      : null
  if (!match || !SERVABLE_TYPES.has(match[1].toLowerCase())) {
    throw new NotFoundError('Preview')
  }

  return {
    body: Buffer.from(match[2], 'base64'),
    contentType: match[1].toLowerCase(),
  }
}

async function readableAccount(
  actor: AuthenticatedActor,
  orderId: string
): Promise<string> {
  try {
    return (await findOrderById(actor, orderId)).accountId
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error
  }

  // Not visible as an order. An approver may still see what they are deciding.
  if (await can(actor, Permission.APPROVAL_ACT)) {
    const request = await prisma.approvalRequest.findFirst({
      where: {
        orderId,
        ...(actor.role === Role.ADMIN ? {} : { accountId: actor.accountId }),
      },
      select: { accountId: true },
    })
    if (request) return request.accountId
  }

  throw new NotFoundError('Order')
}
