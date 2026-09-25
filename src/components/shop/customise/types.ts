// src/components/shop/customise/types.ts

import type { DesignDocument } from '@/types/design'
import type { SidePreviewWithBounds } from '@/lib/design/proof-export'
import type { ReviewIssue, ReviewSide } from '@/lib/design/review-checks'

/**
 * Everything the review and final-steps screens need, captured once when the
 * buyer presses Next.
 *
 * A snapshot on purpose: the buyer approves *this* artwork, and it is this
 * artwork that goes in the cart — not whatever the canvas holds by the time
 * they press Add to Cart.
 */
export interface PreparedReview {
  /** The artwork as ordered: trimmed to the chosen back, or to none. */
  design: DesignDocument
  /** The wording of the fields the published design offers. */
  values: Record<string, string>
  front: SidePreviewWithBounds
  /** Null when the back prints blank. */
  back: SidePreviewWithBounds | null
  backName: string | null
  /** A small JPEG of the front for the cart line; empty when none could be made. */
  cartPreview: string
  issues: ReviewIssue[]
}

export interface PreviewHighlight {
  side: ReviewSide
  objectId: string
}
