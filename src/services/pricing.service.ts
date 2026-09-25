// src/lib/services/pricing.service.ts
import { getDataSource } from '@/services/data-source'
import type {
  RateCardDetailsPatch,
  RateCardItemRow,
} from '@/services/data-source/api/api-pricing.adapter'
import type { RateCard, PaginatedResult } from '@/types'

export type { RateCardDetailsPatch, RateCardItemRow }

/**
 * These functions are thin: every write goes straight to the API, which
 * validates it, applies the tenant scope and writes its own audit entry
 * against the authenticated actor. There is deliberately no client-side
 * audit call — one would invent an actor and record a second, fictional
 * entry beside the real one.
 */

export async function getRateCards(params?: {
  accountId?: string
  search?: string
  status?: RateCard['status']
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<RateCard>> {
  const ds = getDataSource()
  return ds.pricing.list(params)
}

export async function createRateCard(
  input: Omit<RateCard, 'id' | 'itemCount'>
): Promise<RateCard> {
  const ds = getDataSource()
  const created = await ds.pricing.create(input)

  return created
}

export async function updateRateCard(
  id: string,
  input: Partial<RateCard>
): Promise<RateCard> {
  const ds = getDataSource()
  const updated = await ds.pricing.update(id, input)

  return updated
}

/** The card's terms only: name, notes, dates and default discount. */
export async function updateRateCardDetails(
  id: string,
  patch: RateCardDetailsPatch
): Promise<RateCard> {
  return getDataSource().pricing.updateDetails(id, patch)
}

/**
 * Moves a card through DRAFT → ACTIVE → ARCHIVED. Activation fails with a 409
 * when another active card for the account overlaps this one's period.
 */
export async function changeRateCardStatus(
  id: string,
  status: RateCard['status'],
  reason?: string
): Promise<RateCard> {
  return getDataSource().pricing.changeStatus(id, status, reason)
}

/** Soft delete; the server archives the card as it goes. */
export async function deleteRateCard(id: string): Promise<void> {
  return getDataSource().pricing.remove(id)
}

/** One card's negotiated lines, paged and searchable by product name or SKU. */
export async function getRateCardItems(
  rateCardId: string,
  params?: { search?: string; page?: number; pageSize?: number }
): Promise<PaginatedResult<RateCardItemRow>> {
  return getDataSource().pricing.listItems(rateCardId, params)
}

/** Removes a product's terms from a card, keyed by product id. */
export async function removeRateCardItem(
  rateCardId: string,
  productId: string
): Promise<void> {
  return getDataSource().pricing.removeItem(rateCardId, productId)
}

/**
 * The price this buyer actually pays, for this quantity.
 *
 * `quantity` matters and used to be dropped here: volume tiers are part of the
 * answer, so quoting everything at one unit reports the list price on a
 * five-hundred-unit order. The engine that decides is the server's — contract
 * fixed price, contract tier, item discount, card default, catalogue ladder,
 * in that order — and a second copy of those rules in the browser would be a
 * second answer to the same question.
 */
export async function calculateItemPrice(
  productId: string,
  basePrice: number,
  accountId?: string,
  quantity = 1,
  /** The published design being priced, when the line names one. */
  templateVersionId?: string
): Promise<{
  effectivePrice: number
  discountPct: number
  rateCardName?: string
}> {
  const ds = getDataSource()
  return ds.pricing.calculateItemPrice(
    productId,
    basePrice,
    accountId,
    quantity,
    templateVersionId
  )
}
