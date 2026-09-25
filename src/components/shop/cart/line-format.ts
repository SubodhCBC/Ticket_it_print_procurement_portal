// src/components/shop/cart/line-format.ts
//
// The wording a basket line and an order line share: money, packs and units,
// and how a delivery method is named. Kept apart from the components so the
// basket, checkout and order screens cannot drift into three spellings of the
// same fact.

import type { CorporatePaymentMethod } from '@/types'

/** Server money, formatted. A dash when there is no price to show. */
export function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `$${value.toFixed(2)}`
}

/** A pack size as a number, or null when it is not a usable one. */
export function packSizeOf(packSize: string | number | null | undefined) {
  const size = Number(packSize)
  return Number.isFinite(size) && size > 0 ? size : null
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
    return `${qty} ${qty === 1 ? 'pack' : 'packs'} · ${units.toLocaleString('en-US')} units`
  }
  return `${qty} ${qty === 1 ? 'unit' : 'units'}`
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

/** "12 Sep 2026", from an ISO date or date-time. A dash when there is none. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-NZ', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
}
