// src/components/shop/customise/order-options.ts
//
// Quantity, stock and price for a personalised design. Pure helpers, so the
// screen that uses them stays about layout.

import type { Product, ProductOptionAxis } from '@/types'
import { findVariant } from '@/services/data-source/api/product.mapper'

/** The pack counts offered before a product's MOQ and multiple are applied. */
export const PACK_PRESETS = [1, 2, 5, 10, 25]

/** Axes that describe what the design is printed on, shown as cards. */
const STOCK_AXIS = /material|paper|stock|substrate|finish|lamination/i

/** "$2,500.00": grouped thousands, so a quantity card reads at a glance. */
export const money = (amount: number) =>
  `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * The pack counts a buyer can pick.
 *
 * Presets under the MOQ are dropped, the rest rounded up to the order multiple,
 * and the smallest orderable quantity is always there — a list that starts
 * above what the buyer wanted is better than an empty one. `keep` is a saved
 * line's quantity, so re-opening a line never silently changes it.
 */
export function packChoices(
  product: Pick<Product, 'moq' | 'orderMultiple'> | null | undefined,
  keep?: number
): number[] {
  const moq = Math.max(1, Math.floor(product?.moq || 1))
  const multiple = Math.max(1, Math.floor(product?.orderMultiple || 1))
  const roundUp = (n: number) => Math.ceil(n / multiple) * multiple

  const choices = new Set<number>([roundUp(moq)])
  for (const preset of PACK_PRESETS) {
    if (preset >= moq) choices.add(roundUp(preset))
  }
  if (keep && keep > 0) choices.add(roundUp(Math.max(keep, moq)))
  return [...choices].sort((a, b) => a - b)
}

/** Stock-like axes first, as cards; everything else as a select. */
export function splitOptionAxes(axes: ProductOptionAxis[] | undefined): {
  stock: ProductOptionAxis[]
  other: ProductOptionAxis[]
} {
  const stock: ProductOptionAxis[] = []
  const other: ProductOptionAxis[] = []
  for (const axis of axes ?? []) {
    if (axis.values.length === 0) continue
    ;(STOCK_AXIS.test(axis.name) ? stock : other).push(axis)
  }
  return { stock, other }
}

/** What the chosen values add to one pack. */
export function optionSurcharge(
  axes: ProductOptionAxis[] | undefined,
  chosen: Record<string, string>
): number {
  return (axes ?? []).reduce(
    (sum, axis) => sum + (Number(axis.valuePrices?.[chosen[axis.name]]) || 0),
    0
  )
}

/**
 * The values a buyer starts on.
 *
 * A saved line's configuration when there is one; otherwise the first value of
 * each axis — unless no variant exists for that combination, in which case the
 * first variant the product actually offers.
 */
export function initialOptions(
  product: Pick<Product, 'optionAxes' | 'variants'>,
  saved?: Record<string, string> | null
): Record<string, string> {
  const axes = product.optionAxes ?? []
  if (axes.length === 0) return {}

  if (saved) {
    const fromSaved: Record<string, string> = {}
    for (const axis of axes) {
      if (axis.values.includes(saved[axis.name])) {
        fromSaved[axis.name] = saved[axis.name]
      }
    }
    if (Object.keys(fromSaved).length === axes.length) return fromSaved
  }

  const firsts = Object.fromEntries(
    axes.map((axis) => [axis.name, axis.values[0] ?? ''])
  )
  if (findVariant(product, firsts) || !product.variants?.length) return firsts

  const offered = product.variants.find((variant) =>
    axes.every((axis) => axis.values.includes(variant.attributes[axis.name]))
  )
  if (!offered) return firsts
  return Object.fromEntries(
    axes.map((axis) => [axis.name, offered.attributes[axis.name]])
  )
}

const NOUNS: [RegExp, string, string][] = [
  [/card/i, 'card', 'cards'],
  [/flyer|leaflet/i, 'flyer', 'flyers'],
  [/poster/i, 'poster', 'posters'],
  [/brochure/i, 'brochure', 'brochures'],
  [/banner/i, 'banner', 'banners'],
  [/sticker/i, 'sticker', 'stickers'],
  [/label/i, 'label', 'labels'],
  [/sign/i, 'sign', 'signs'],
]

/** "cards" for a business card, "units" when nothing better is known. */
export function unitNoun(count: number, ...hints: (string | undefined)[]) {
  const text = hints.filter(Boolean).join(' ')
  const match = NOUNS.find(([pattern]) => pattern.test(text))
  const [singular, plural] = match ? [match[1], match[2]] : ['unit', 'units']
  return count === 1 ? singular : plural
}
