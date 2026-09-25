// src/components/shop/cart/line-format.ts
//
// The wording a basket line and an order line share: money, packs and units,
// and how a delivery method is named. Kept apart from the components so the
// basket, checkout and order screens cannot drift into three spellings of the
// same fact.

import type { CorporatePaymentMethod } from '@/types'
import { formatNumber } from '@/lib/format'

// Money and dates are formatted by `@/lib/format` — import `formatMoney` and
// `formatDate` from there, not from here.

/**
 * A pack size as a number, or null when it is not a usable one.
 *
 * Two shapes reach this. `Product.unitsPerPack` and `OrderLineItem` carry the
 * COUNT, which is what should be passed. The catalogue mapper also composes a
 * shelf LABEL — "Pack of 250", "Box of 50" — and that label used to be handed
 * here by mistake: `Number("Pack of 250")` is NaN, so every catalogue-side line
 * quietly degraded from "5 packs · 1,250 units" to "5 units". The label is
 * therefore read too, rather than trusted to never arrive.
 */
export function packSizeOf(packSize: string | number | null | undefined) {
  if (packSize === null || packSize === undefined) return null

  const size =
    typeof packSize === 'number' ? packSize : numberWithinLabel(packSize)
  return Number.isFinite(size) && size > 0 ? size : null
}

/** The count inside "Pack of 250" — or NaN, which `packSizeOf` rejects. */
function numberWithinLabel(packSize: string): number {
  const trimmed = packSize.trim()
  if (trimmed === '') return NaN
  const direct = Number(trimmed)
  if (Number.isFinite(direct)) return direct
  // "Pack of 250", "Box of 50", "Square metres: 4" — the count is the last
  // run of digits. A label naming no count ("Single pack") stays unusable,
  // which is right: one per pack is not a pack size worth saying twice.
  const digits = trimmed.match(/(\d[\d,]*)(?!.*\d)/)
  return digits ? Number(digits[1].replace(/,/g, '')) : NaN
}

/** "1 pack" / "5 packs" — a quantity whose pack size is unknown or mixed. */
export function packCount(qty: number): string {
  return `${formatNumber(qty)} ${qty === 1 ? 'pack' : 'packs'}`
}

/**
 * "2 packs · 200 units" when a pack holds more than one, else "2 units".
 *
 * A line's quantity is counted in packs; a buyer thinks in the pieces that
 * arrive, so both are said whenever they differ.
 */
export function packsAndUnits(
  qty: number,
  packSize: string | number | null | undefined
): string {
  const size = packSizeOf(packSize)
  if (size !== null && size > 1) {
    const units = qty * size
    return `${packCount(qty)} · ${formatNumber(units)} units`
  }
  return `${formatNumber(qty)} ${qty === 1 ? 'unit' : 'units'}`
}

/** "pack" or "unit" — what a unit price is a price of. */
export function priceBasis(
  packSize: string | number | null | undefined
): string {
  const size = packSizeOf(packSize)
  return size !== null && size > 1 ? 'pack' : 'unit'
}

/** The frozen configuration as label/value pairs, in the order it was chosen. */
export function optionEntries(
  options: Record<string, string> | null | undefined
): [string, string][] {
  return Object.entries(options ?? {}).filter(
    ([name, value]) => name.trim() !== '' && String(value).trim() !== ''
  )
}

/** "CourierPost Express (Next Day)", from the cart's option. */
export function shippingOptionName(option: {
  label: string
  eta: string
}): string {
  return option.eta ? `${option.label} (${option.eta})` : option.label
}

/** What an order is called when it predates choosing a delivery method. */
export const STANDARD_DELIVERY_LABEL = 'Standard delivery'

/**
 * The settlement terms, as the checkout selector names them.
 *
 * Pre-approved credit has no API counterpart and settles as invoice terms, so
 * it reads the same.
 */
export const PAYMENT_METHOD_LABELS: Record<CorporatePaymentMethod, string> = {
  CORPORATE_INVOICE: 'Invoice, net 30',
  PURCHASING_CARD: 'Corporate purchasing card',
  CORPORATE_ACH: 'Bank transfer (ACH)',
  PREAPPROVED_CREDIT: 'Invoice, net 30',
}
