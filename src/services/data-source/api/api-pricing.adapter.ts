import { apiClient } from '@/services/api.service'
import type { PaginatedResult, RateCard, RateCardItem } from '@/types'
import type { ApiOffsetPage, ApiQuotedLine } from './catalog.types'
import type { ApiRateCard, ApiRateCardItem } from './pricing.types'

/**
 * Contract pricing, served by `/pricing/rate-cards` and `/pricing/quote`.
 *
 * Same function signatures as the mock adapter it replaces.
 *
 * One shape difference worth knowing: the list endpoint returns `itemCount` and
 * no `items`, while the single-card read returns the full set. A card may carry
 * two thousand negotiated lines, so a list that inlined them would send
 * megabytes to render a table of card names. Callers that need the lines fetch
 * the card.
 */

const RATE_CARDS = '/pricing/rate-cards'

export async function list(params?: {
  accountId?: string
  search?: string
  status?: RateCard['status']
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<RateCard>> {
  const query: Record<string, unknown> = {
    page: params?.page ?? 1,
    pageSize: params?.pageSize ?? 20,
  }
  if (params?.accountId) query.accountId = params.accountId
  if (params?.status) query.status = params.status
  if (params?.search?.trim()) query.search = params.search.trim()

  const page: ApiOffsetPage<ApiRateCard> = await apiClient.get(RATE_CARDS, {
    params: query,
  })

  return {
    items: page.items.map(toRateCard),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
  }
}

export async function create(
  input: Omit<RateCard, 'id' | 'itemCount'>
): Promise<RateCard> {
  const created: ApiRateCard = await apiClient.post(RATE_CARDS, {
    accountId: input.accountId,
    name: input.name,
    effectiveFrom: input.effectiveFrom ?? new Date().toISOString(),
    ...(input.effectiveTo ? { effectiveTo: input.effectiveTo } : {}),
    defaultDiscountPercent: toPercent(input.defaultDiscountPct),
    ...(input.items?.length ? { items: input.items.map(toItemBody) } : {}),
  })

  // A card is always created DRAFT; activation is its own audited transition,
  // because it is the moment the card starts deciding what a customer pays.
  if (input.status && input.status !== 'DRAFT') {
    return changeStatus(created.id, input.status)
  }
  return toRateCard(created)
}

export async function update(
  id: string,
  input: Partial<RateCard>
): Promise<RateCard> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.effectiveFrom !== undefined)
    body.effectiveFrom = input.effectiveFrom
  if (input.effectiveTo !== undefined)
    body.effectiveTo = input.effectiveTo ?? null
  if (input.defaultDiscountPct !== undefined) {
    body.defaultDiscountPercent = toPercent(input.defaultDiscountPct)
  }

  let current: ApiRateCard | undefined
  if (Object.keys(body).length > 0) {
    current = await apiClient.patch(
      `${RATE_CARDS}/${encodeURIComponent(id)}`,
      body
    )
  }

  // Items are replaced through their own endpoint, not as a field on the card.
  if (input.items) {
    current = await apiClient.post(
      `${RATE_CARDS}/${encodeURIComponent(id)}/items`,
      {
        items: input.items.map(toItemBody),
        // The editor shows the whole set, so saving it is the whole set —
        // anything the user removed has to actually go.
        replaceAll: true,
      }
    )
  }

  if (input.status) {
    const before: ApiRateCard =
      current ??
      (await apiClient.get(`${RATE_CARDS}/${encodeURIComponent(id)}`))
    if (before.status !== input.status) return changeStatus(id, input.status)
    return toRateCard(before)
  }

  if (!current) throw new Error('Nothing to update')
  return toRateCard(current)
}

/**
 * DRAFT → ACTIVE → ARCHIVED, and DRAFT → ARCHIVED for a card never signed.
 *
 * Activation is refused with a 409 when another active card for the same
 * account overlaps this one's window. That ApiError is left to reach the
 * screen: its message says what to change, and a generic one would not.
 */
export async function changeStatus(
  id: string,
  status: RateCard['status'],
  reason?: string
): Promise<RateCard> {
  const updated: ApiRateCard = await apiClient.post(
    `${RATE_CARDS}/${encodeURIComponent(id)}/status`,
    { status, ...(reason?.trim() ? { reason: reason.trim() } : {}) }
  )
  return toRateCard(updated)
}

/** Soft delete. The server archives the card on the way out. */
export async function remove(id: string): Promise<void> {
  await apiClient.delete(`${RATE_CARDS}/${encodeURIComponent(id)}`)
}

/** The card's own terms, in the shape `PATCH /pricing/rate-cards/:id` takes. */
export interface RateCardDetailsPatch {
  name?: string
  notes?: string | null
  effectiveFrom?: string
  /** `null` clears the end date, making the contract open-ended. */
  effectiveTo?: string | null
  defaultDiscountPct?: number
}

/**
 * Edits a card's terms without touching its lines or its status.
 *
 * Separate from `update()`, which cannot express "clear the end date" (the UI
 * type has no null for it) and does not send notes. The edit form needs both.
 */
export async function updateDetails(
  id: string,
  patch: RateCardDetailsPatch
): Promise<RateCard> {
  const body: Record<string, unknown> = {}
  if (patch.name !== undefined) body.name = patch.name
  if (patch.notes !== undefined) body.notes = patch.notes
  if (patch.effectiveFrom !== undefined)
    body.effectiveFrom = patch.effectiveFrom
  if (patch.effectiveTo !== undefined) body.effectiveTo = patch.effectiveTo
  if (patch.defaultDiscountPct !== undefined) {
    body.defaultDiscountPercent = toPercent(patch.defaultDiscountPct)
  }

  const updated: ApiRateCard = await apiClient.patch(
    `${RATE_CARDS}/${encodeURIComponent(id)}`,
    body
  )
  return toRateCard(updated)
}

/** One negotiated line, as the paged items table shows it. */
export type RateCardItemRow = RateCardItem & {
  uom: string
  /**
   * The line's own percentage. Null when it prices by a fixed amount or by
   * tiers alone. `discountPct` on the base type is the saving the quoted price
   * represents, which is a different number.
   */
  itemDiscountPct: number | null
}

/**
 * One card's lines, a page at a time.
 *
 * `GET /pricing/rate-cards/:id` returns every line on the card; a contract can
 * carry two thousand, so the detail table pages through this endpoint instead.
 */
export async function listItems(
  rateCardId: string,
  params?: { search?: string; page?: number; pageSize?: number }
): Promise<PaginatedResult<RateCardItemRow>> {
  const query: Record<string, unknown> = {
    page: params?.page ?? 1,
    // The API caps a page at 200.
    pageSize: Math.min(params?.pageSize ?? 50, 200),
  }
  if (params?.search?.trim()) query.search = params.search.trim()

  const page: ApiOffsetPage<ApiRateCardItem> = await apiClient.get(
    `${RATE_CARDS}/${encodeURIComponent(rateCardId)}/items`,
    { params: query }
  )

  return {
    items: page.items.map((item) => ({
      ...toRateCardItem(item),
      rateCardId,
      uom: item.uom,
      itemDiscountPct:
        item.discountPercent !== null ? Number(item.discountPercent) : null,
    })),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
  }
}

/**
 * Removes one product's negotiated terms. Keyed by product, not by line id.
 * The product falls back to the card's default discount, or to catalogue price.
 */
export async function removeItem(
  rateCardId: string,
  productId: string
): Promise<void> {
  await apiClient.delete(
    `${RATE_CARDS}/${encodeURIComponent(rateCardId)}/items/${encodeURIComponent(productId)}`
  )
}

/**
 * What one product costs this account.
 *
 * Goes to the pricing engine rather than reimplementing precedence in the
 * browser. Fixed price beats contract ladder beats item discount beats card
 * default beats the catalogue ladder — five rules whose order is the thing the
 * engine exists to get right, and a second copy of them here would be a second
 * answer to the same question.
 *
 * `basePrice` is the fallback when the caller cannot be quoted at all.
 */
export async function calculateItemPrice(
  productId: string,
  basePrice: number,
  accountId?: string,
  quantity = 1,
  /**
   * The published design being priced, when there is one. A line naming a
   * version is priced from that version's own price and the rate card is not
   * consulted — so passing it is what makes a personalised line quote at what
   * the buyer will actually be charged rather than at the stock's list price.
   */
  templateVersionId?: string
): Promise<{
  effectivePrice: number
  discountPct: number
  rateCardName?: string
}> {
  try {
    const response: { lines: ApiQuotedLine[] } = await apiClient.post(
      '/pricing/quote',
      {
        lines: [
          {
            productId,
            quantity: Math.max(1, quantity),
            ...(templateVersionId ? { templateVersionId } : {}),
          },
        ],
        ...(accountId ? { accountId } : {}),
      }
    )

    const line = response.lines[0]
    if (!line) return { effectivePrice: basePrice, discountPct: 0 }

    return {
      effectivePrice: Number(line.unitPrice),
      discountPct: Number(line.discountPercent),
      ...(line.rateCardName ? { rateCardName: line.rateCardName } : {}),
    }
  } catch {
    // Pricing being unavailable must not blank a price. List price, no discount.
    return { effectivePrice: basePrice, discountPct: 0 }
  }
}

// --- Mapping --------------------------------------------------------------------

function toRateCard(api: ApiRateCard): RateCard {
  return {
    id: api.id,
    accountId: api.accountId,
    accountName: api.accountName,
    name: api.name,
    effectiveFrom: api.effectiveFrom,
    ...(api.effectiveTo ? { effectiveTo: api.effectiveTo } : {}),
    defaultDiscountPct: Number(api.defaultDiscountPercent),
    status: api.status,
    itemCount: api.itemCount,
    // Empty on a list response — the count above is what a summary row shows.
    items: (api.items ?? []).map(toRateCardItem),
    isInForce: api.isInForce,
    ...(api.notes ? { notes: api.notes } : {}),
    accountCode: api.accountCode,
  }
}

function toRateCardItem(api: ApiRateCardItem): RateCardItem {
  const basePrice = Number(api.basePrice)
  const effectivePrice = Number(api.effectivePrice)

  return {
    id: api.id,
    rateCardId: '',
    productId: api.productId,
    productSku: api.productSku,
    productName: api.productName,
    basePrice,
    ...(api.fixedPrice !== null ? { fixedPrice: Number(api.fixedPrice) } : {}),
    // The discount the *quoted* price represents, not just the item's own
    // percentage: a fixed price and a contract ladder both produce a saving the
    // table has to show, and neither sets `discountPercent` on the row.
    discountPct:
      api.discountPercent !== null
        ? Number(api.discountPercent)
        : basePrice > 0
          ? Number(
              (((basePrice - effectivePrice) / basePrice) * 100).toFixed(2)
            )
          : 0,
    effectivePrice,
    effectiveAtQuantity: api.effectiveAtQuantity,
    source: api.source,
    aboveCatalogPrice: api.aboveCatalogPrice,
    tiers: api.tiers.map((tier) => ({
      minQuantity: tier.minQuantity,
      discountPercent: Number(tier.discountPercent),
    })),
  }
}

/**
 * One product's terms, in the shape the items endpoint takes.
 *
 * A fixed price and a discount are mutually exclusive server-side, so only one
 * is ever sent — passing both is refused rather than silently resolved, and
 * rightly so.
 */
function toItemBody(item: RateCardItem): Record<string, unknown> {
  if (item.fixedPrice != null) {
    return { productId: item.productId, fixedPrice: item.fixedPrice.toFixed(2) }
  }

  return {
    productId: item.productId,
    ...(item.discountPct != null
      ? { discountPercent: toPercent(item.discountPct) }
      : {}),
    ...(item.tiers?.length
      ? {
          tiers: item.tiers.map((tier) => ({
            minQuantity: tier.minQuantity,
            discountPercent: toPercent(tier.discountPercent),
          })),
        }
      : {}),
  }
}

/** Percentages cross the wire as strings, to two decimals — NUMERIC(5,2). */
function toPercent(value: number | string | undefined): string {
  return Number(value ?? 0).toFixed(2)
}
