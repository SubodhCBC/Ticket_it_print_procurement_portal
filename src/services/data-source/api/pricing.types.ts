/**
 * Rate cards exactly as the API returns them.
 *
 * Mirrors `modules/pricing/dto/rate-card-response.ts`. Money *and* percentages
 * are strings: both are NUMERIC columns, and a discount of `17.24` read as a
 * float is not the number that was negotiated.
 */

export type ApiRateCardStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'

/**
 * Which rule produced a price. Reported rather than inferred, because "20% off"
 * arrived at by a contract ladder and by the card default are the same number
 * and a very different conversation with the customer.
 */
export type ApiPriceSource =
  | 'CATALOG_BASE'
  | 'CATALOG_VOLUME_TIER'
  | 'CONTRACT_FIXED_PRICE'
  | 'CONTRACT_VOLUME_TIER'
  | 'CONTRACT_ITEM_DISCOUNT'
  | 'CONTRACT_DEFAULT_DISCOUNT'

export interface ApiRateCardTier {
  minQuantity: number
  discountPercent: string
}

export interface ApiRateCardItem {
  id: string
  productId: string
  productSku: string
  productName: string
  uom: string
  basePrice: string
  fixedPrice: string | null
  discountPercent: string | null
  tiers: ApiRateCardTier[]
  /** Priced at the product's MOQ — the smallest quantity it can be bought in. */
  effectivePrice: string
  effectiveAtQuantity: number
  source: ApiPriceSource
  /** True when the negotiated line is worse than the public catalogue price. */
  aboveCatalogPrice: boolean
}

export interface ApiRateCard {
  id: string
  accountId: string
  accountCode: string
  accountName: string
  name: string
  notes: string | null
  status: ApiRateCardStatus
  effectiveFrom: string
  effectiveTo: string | null
  defaultDiscountPercent: string
  /** Whether the card prices anything at the instant it was read. */
  isInForce: boolean
  itemCount: number
  createdById: string | null
  createdAt: string
  updatedAt: string
  /** Present only on the single-card read, never on a list. */
  items?: ApiRateCardItem[]
}

/** `GET /pricing/active-rate-card` — null when no contract is in force. */
export interface ApiActiveRateCard {
  id: string
  name: string
  defaultDiscountPercent: string
  effectiveFrom: string
  effectiveTo: string | null
}
