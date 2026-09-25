// src/components/shop/customise/prepare-review.ts

import type { PrintTemplate } from '@/types'
import type { DesignDocument, DesignObject } from '@/types/design'
import { renderSidePreviewWithBounds } from '@/lib/design/proof-export'
import { MAX_ORDER_PREVIEW_BYTES } from '@/lib/design/order-artwork'
import { findReviewIssues, printedBack } from '@/lib/design/review-checks'
import type { PreparedReview } from './types'

/** Wide enough to read the small print on a business card at laptop size. */
const REVIEW_PREVIEW_WIDTH = 960

/**
 * The front as a thumbnail small enough for the cart line to carry.
 *
 * JPEG, because the server caps the preview at 600 KB of data URL and a PNG of
 * a photograph is not going to fit. Tried smaller once before giving up; the
 * studio's own capture is the last resort.
 */
async function cartThumbnail(
  template: PrintTemplate,
  objects: DesignObject[],
  values: Record<string, string>,
  fallback: string | undefined
): Promise<string> {
  for (const [width, quality] of [
    [480, 0.85],
    [360, 0.72],
  ] as const) {
    const { dataUrl } = await renderSidePreviewWithBounds(
      template,
      objects,
      values,
      width,
      { format: 'jpeg', quality }
    )
    // Empty means the canvas is unreadable, which a smaller one will be too.
    if (!dataUrl) break
    if (dataUrl.length <= MAX_ORDER_PREVIEW_BYTES) return dataUrl
  }
  return fallback?.startsWith('data:image/') &&
    fallback.length <= MAX_ORDER_PREVIEW_BYTES
    ? fallback
    : ''
}

/**
 * Pictures of both printed sides, where everything sits on them, and what the
 * buyer should look at again.
 *
 * `template` is the **published** template: its design is what "you did not
 * change this" is measured against. `design` is the buyer's artwork, already
 * trimmed to the back they chose.
 */
export async function prepareReview({
  template,
  design,
  values,
  fallbackThumbnail,
}: {
  template: PrintTemplate
  design: DesignDocument
  values: Record<string, string>
  fallbackThumbnail?: string
}): Promise<PreparedReview> {
  const working: PrintTemplate = { ...template, design }
  const back = printedBack(design)

  const front = await renderSidePreviewWithBounds(
    working,
    design.objects ?? [],
    values,
    REVIEW_PREVIEW_WIDTH
  )
  const backPreview = back
    ? await renderSidePreviewWithBounds(
        working,
        back.objects ?? [],
        values,
        REVIEW_PREVIEW_WIDTH
      )
    : null
  const cartPreview = await cartThumbnail(
    working,
    design.objects ?? [],
    values,
    fallbackThumbnail
  )

  return {
    design,
    values,
    front,
    back: backPreview,
    backName: back?.name ?? null,
    cartPreview,
    issues: findReviewIssues(design, template.design),
  }
}
