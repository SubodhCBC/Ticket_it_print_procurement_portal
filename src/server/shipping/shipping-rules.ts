import type { StructuredAddress, TrackingEventData } from './carrier.types'

/**
 * The pure rules the shipping services share. No database, no network, no
 * configuration — so each can be reasoned about, and changed, on its own.
 */

// --- Parcel estimate (decision D2) --------------------------------------------

export interface EstimateLine {
  readonly sku: string
  /** In the product's `uom`, which is what `weightGrams` is per. */
  readonly quantity: number
  readonly weightGrams: number | null
}

export interface ParcelEstimate {
  readonly weightGrams: number
  readonly lengthCm: number
  readonly widthCm: number
  readonly heightCm: number
  /** Products with no recorded weight. Their share is missing from the total. */
  readonly missingWeightSkus: readonly string[]
  /** True when the weight is a floor rather than a sum of known weights. */
  readonly isFloor: boolean
}

/** What a rate request asks for when nothing in the basket has a weight. */
export const MINIMUM_ESTIMATE_GRAMS = 100

/**
 * The basket as one parcel, for a checkout quote.
 *
 * An estimate, and labelled as one. `Product.weightGrams` is optional, so the
 * sum can be short, and the box is a configured default because the size of a
 * print job's box is decided by whoever packs it. That is why labels take their
 * weights and sizes from staff instead (decision D2) — this only pre-fills that
 * form and prices the checkout, where the freight is recorded but never billed.
 */
export function estimateParcel(
  lines: readonly EstimateLine[],
  defaultCm: {
    readonly length: number
    readonly width: number
    readonly height: number
  }
): ParcelEstimate {
  let total = 0
  const missing = new Set<string>()

  for (const line of lines) {
    if (line.weightGrams === null || line.weightGrams <= 0) {
      missing.add(line.sku)
      continue
    }
    total += line.weightGrams * Math.max(0, line.quantity)
  }

  const isFloor = total < MINIMUM_ESTIMATE_GRAMS
  return {
    weightGrams: Math.max(MINIMUM_ESTIMATE_GRAMS, Math.round(total)),
    lengthCm: defaultCm.length,
    widthCm: defaultCm.width,
    heightCm: defaultCm.height,
    missingWeightSkus: [...missing].sort(),
    isFloor,
  }
}

// --- Addresses ------------------------------------------------------------------

/**
 * Splits a single address line into the number and the street, which is how
 * ParcelLabel wants a collection point's address. NZ Post describes those
 * locations with one `address_line_1` ("88-98 Taupo Quay").
 *
 * Handles "5", "42C", "88-98" and "2/10". A line that does not start with a
 * number comes back with an empty number, and the label request will say so
 * rather than this guessing.
 */
export function splitStreetLine(line: string): {
  streetNumber: string
  street: string
} {
  const trimmed = line.trim()
  const match = /^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s+(.+)$/.exec(trimmed)
  return match?.[1] && match[2]
    ? { streetNumber: match[1], street: match[2].trim() }
    : { streetNumber: '', street: trimmed }
}

/** Whether a structured address has what ParcelLabel requires of one. */
export function structuredAddressGaps(address: StructuredAddress): string[] {
  return [
    address.streetNumber ? null : 'streetNumber',
    address.street ? null : 'street',
    address.city ? null : 'city',
    address.postcode ? null : 'postcode',
  ].filter((field): field is string => field !== null)
}

// --- Tracking -------------------------------------------------------------------

/**
 * Whether an event means the parcel has been delivered.
 *
 * NZ Post's specs give one example event ("Ready for pickup") and no list of
 * statuses, so this reads the words rather than a code: a status or description
 * that says delivered, and does not say it was not, or only attempted. It is
 * deliberately strict — marking an order delivered too early is worse than
 * marking it a poll late — and it is the one rule here that must be checked
 * against real ParcelTrack responses before the order lifecycle trusts it.
 */
export function isDeliveredEvent(
  event: Pick<TrackingEventData, 'status' | 'description'>
): boolean {
  const status = (event.status ?? '').toLowerCase()
  const description = (event.description ?? '').toLowerCase()
  const negative = /not delivered|undeliver|attempt|unable|failed|return/

  if (negative.test(status) || negative.test(description)) return false
  return (
    /^delivered\b/.test(status) || /\bhas been delivered\b/.test(description)
  )
}

/** One event's identity, so a re-poll inserts nothing it already holds. */
export function trackingDedupeKey(
  trackingReference: string,
  event: Pick<TrackingEventData, 'occurredAt' | 'seqRef' | 'status'>
): string {
  const tail = event.seqRef ?? event.status ?? ''
  return `${trackingReference}|${event.occurredAt.toISOString()}|${tail}`.slice(
    0,
    255
  )
}

// --- Money ----------------------------------------------------------------------

/** "12.5" or 12.5 to "12.50"; null stays null. */
export function toMoney(
  value: string | number | null | undefined
): string | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? (Math.round(parsed * 100) / 100).toFixed(2)
    : null
}
