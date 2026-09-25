// src/lib/design/order-artwork.ts
//
// The buyer's own artwork, carried on the line that orders it.
//
// ---------------------------------------------------------------------------
// Why it rides with the line and not with the template
// ---------------------------------------------------------------------------
// A buyer personalising a design can now move, restyle and add to it, not only
// type into the fields the designer opened up. That artwork is theirs and it is
// for this order: the operator's template is what every other branch prints
// from, and nothing done on the customiser may reach it.
//
// A cart line already carries a template id, the published version it was made
// from, and the buyer's personalisation, and the order snapshots all three. So
// the design document goes there too, under a reserved key, and travels the
// same road to production that the field values already travel.
//
// Stored as a JSON string rather than as a nested object, so a line's
// personalisation stays what it has always been - a flat record of values -
// and the one entry that is not a piece of wording is obvious on sight.

import type { DesignDocument } from '@/types/design'

/**
 * Mirrors `ORDER_ARTWORK_KEY` in the API's `template-status.ts`, which is the
 * authority: the server rebuilds a personalisation from the published layers
 * and would otherwise refuse this key as a field the template does not have.
 *
 * Double-underscored because the key space it shares is the designer's: a merge
 * field is named `businessName` or `phone`, and this must not be able to
 * collide with one a designer adds next year.
 */
export const ORDER_ARTWORK_KEY = '__artwork'

/**
 * A small picture of the finished front, as a data URL, for the screens that
 * list a line — the basket, checkout, the order — so none of them has to
 * rebuild a canvas to show a thumbnail. Mirrors `ORDER_PREVIEW_KEY`.
 */
export const ORDER_PREVIEW_KEY = '__preview'

/** The server's cap on the preview. Export a thumbnail, not a print file. */
export const MAX_ORDER_PREVIEW_BYTES = 600_000

/**
 * The name of the back design the buyer chose. Absent when the back prints
 * blank. Mirrors `ORDER_BACK_NAME_KEY`.
 */
export const ORDER_BACK_NAME_KEY = '__backName'

/** Every key that is not a field value. */
export const ORDER_RESERVED_KEYS: readonly string[] = [
  ORDER_ARTWORK_KEY,
  ORDER_PREVIEW_KEY,
  ORDER_BACK_NAME_KEY,
]

/**
 * The cap, matched to the server's.
 *
 * A design document is text: objects, coordinates, styling. It is kilobytes
 * until somebody drops a photograph into it, at which point the image arrives
 * as a data URI and the document is measured in megabytes. Four is generous for
 * the first and refuses the second, which belongs in object storage.
 */
export const MAX_ORDER_ARTWORK_BYTES = 4_000_000

/** The design document a saved line is holding, if it is holding one. */
export function readOrderArtwork(
  customisation: Record<string, unknown> | null | undefined
): DesignDocument | null {
  const raw = customisation?.[ORDER_ARTWORK_KEY]
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    const parsed = JSON.parse(raw) as DesignDocument
    return Array.isArray(parsed?.objects) ? parsed : null
  } catch {
    // A line whose artwork will not parse is a line that predates this, or one
    // that was truncated on the way in. Either way the master design is the
    // honest thing to open, so say "none" rather than throw at the buyer.
    return null
  }
}

/** The thumbnail a line carries, or null for a line saved before it had one. */
export function readOrderPreview(customisation: unknown): string | null {
  if (!customisation || typeof customisation !== 'object') return null
  const raw = (customisation as Record<string, unknown>)[ORDER_PREVIEW_KEY]
  return typeof raw === 'string' && raw.startsWith('data:image/') ? raw : null
}

/** The chosen back's name, or null when the back prints blank. */
export function readOrderBackName(customisation: unknown): string | null {
  if (!customisation || typeof customisation !== 'object') return null
  const raw = (customisation as Record<string, unknown>)[ORDER_BACK_NAME_KEY]
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : null
}

/** The wording only, for anything that reasons about fields. */
export function withoutOrderArtwork(
  customisation: Record<string, string> | null | undefined
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(customisation ?? {})) {
    if (ORDER_RESERVED_KEYS.includes(key)) continue
    out[key] = value
  }
  return out
}

/**
 * The line's personalisation with the artwork attached.
 *
 * Returns the values unchanged when the document is too big to carry, rather
 * than sending something the server will reject: the caller decides what to
 * tell the buyer, and losing their wording as well would help nobody.
 *
 * `preview` and `backName` are attached when given. A preview over the cap is
 * dropped rather than failing the save — a missing thumbnail costs a picture,
 * a refused save costs the design.
 */
export function withOrderArtwork(
  values: Record<string, string>,
  design: DesignDocument | null | undefined,
  extras: { preview?: string | null; backName?: string | null } = {}
): { customisation: Record<string, string>; oversized: boolean } {
  const meta: Record<string, string> = {}
  if (
    extras.preview &&
    extras.preview.startsWith('data:image/') &&
    extras.preview.length <= MAX_ORDER_PREVIEW_BYTES
  ) {
    meta[ORDER_PREVIEW_KEY] = extras.preview
  }
  if (extras.backName && extras.backName.trim()) {
    meta[ORDER_BACK_NAME_KEY] = extras.backName.trim().slice(0, 120)
  }

  if (!design) {
    return { customisation: { ...values, ...meta }, oversized: false }
  }
  const encoded = JSON.stringify(design)
  if (encoded.length > MAX_ORDER_ARTWORK_BYTES) {
    return { customisation: { ...values, ...meta }, oversized: true }
  }
  return {
    customisation: { ...values, ...meta, [ORDER_ARTWORK_KEY]: encoded },
    oversized: false,
  }
}
