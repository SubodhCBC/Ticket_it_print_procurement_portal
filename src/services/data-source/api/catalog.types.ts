/**
 * The catalogue payloads exactly as the API returns them.
 *
 * Kept separate from the UI's `Product` in `@/types` on purpose. The two are
 * different shapes — money is a string here because the columns are
 * NUMERIC(12,2) and a JSON number would round them, `packSize` is a count
 * rather than the label a tile prints, and stock is split across three fields —
 * and the one file allowed to know both is `product.mapper.ts`. Screens keep
 * reading the UI type, so the API can add a field without touching them.
 *
 * Mirrors `src/modules/catalog/dto/product-response.ts` in the backend.
 */

export type ApiProductStatus = 'DRAFT' | 'ACTIVE' | 'UNAVAILABLE' | 'SUPERSEDED'
export type ApiProductVisibility = 'ALL_ACCOUNTS' | 'RESTRICTED'
export type ApiUom = 'EACH' | 'PACK' | 'BOX' | 'ROLL' | 'SET' | 'SQUARE_METRE'

export interface ApiCategory {
  id: string
  code: string
  name: string
  description: string | null
  sortOrder: number
  status: 'ACTIVE' | 'INACTIVE'
  visibility: ApiProductVisibility
  itemCount: number
}

export interface ApiProductOption {
  id: string
  name: string
  values: string[]
  /**
   * What a value adds to the price of one pack, as money strings keyed by
   * value. A value absent from the map adds nothing.
   */
  valuePrices: Record<string, string>
  sortOrder: number
}

export interface ApiProductVariant {
  id: string
  sku: string
  attributes: Record<string, string>
  priceOverride: string | null
  effectivePrice: string
  stockOnHand: number
  availableStock: number
  status: string
}

export interface ApiProductAsset {
  id: string
  kind: 'IMAGE' | 'ARTWORK' | 'SPEC_SHEET'
  filename: string
  contentType: string
  sizeBytes: number
  altText: string | null
  sortOrder: number
  widthPx: number | null
  heightPx: number | null
  derivativeStatus: string
  derivativeError: string | null
  /** Presigned and short-lived. Absent unless the caller asked for links. */
  url?: string
  thumbnailUrl?: string
  previewUrl?: string
}

export interface ApiVolumeTier {
  minQuantity: number
  discountPercent: string
  unitPrice: string
  lineTotal: string
}

export interface ApiProduct {
  id: string
  sku: string
  name: string
  description: string | null
  category: { id: string; code: string; name: string }
  status: ApiProductStatus
  visibility: ApiProductVisibility
  basePrice: string
  moq: number
  orderMultiple: number
  packSize: number
  uom: ApiUom
  widthMm: number | null
  heightMm: number | null
  depthMm: number | null
  weightGrams: number | null
  bleedMm: string | null
  safeMarginMm: string | null
  trackInventory: boolean
  stockOnHand: number
  stockReserved: number
  availableStock: number
  lowStockThreshold: number
  reorderQuantity: number | null
  isLowStock: boolean
  leadTimeDays: number | null
  tags: string[]
  /** Absent from an API build before tax treatment. */
  taxTreatment?: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT'
  options: ApiProductOption[]
  variants: ApiProductVariant[]
  volumeTiers: ApiVolumeTier[]
  assets: ApiProductAsset[]
  supersededBy: { id: string; sku: string; name: string } | null
  createdAt: string
  updatedAt: string
}

/** `OffsetPage<T>` — the same field names the UI's `PaginatedResult` uses. */
export interface ApiOffsetPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** `POST /catalog/products/:id/stock` — the new shelf figure, not a product. */
export interface ApiStockAdjustment {
  productId: string
  variantId?: string
  stockOnHand: number
}

/** `ImportJobView`. `results` is present on the single-job read only. */
export interface ApiImportJob {
  id: string
  status: string
  dryRun: boolean
  updateExisting: boolean
  totalRows: number
  created: number
  updated: number
  skipped: number
  failed: number
  error: string | null
  requestedById: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  results?: unknown
}

/** `POST /catalog/inventory/reconcile` — returned whether or not it wrote. */
export interface ApiStockReconciliation {
  dryRun: boolean
  reason: string
  summary: {
    counted: number
    matched: number
    adjusted: number
    refused: number
    netVariance: number
  }
  lines: {
    sku: string
    name?: string
    systemQuantity?: number
    countedQuantity?: number
    variance?: number
    reserved?: number
    outcome:
      | 'MATCHED'
      | 'ADJUSTED'
      | 'WOULD_ADJUST'
      | 'BELOW_RESERVED'
      | 'NOT_TRACKED'
      | 'UNKNOWN_SKU'
    message?: string
  }[]
}

/** One line of `POST /pricing/quote`. */
export interface ApiQuotedLine {
  productId: string
  sku: string
  name: string
  quantity: number
  basePrice: string
  unitPrice: string
  lineTotal: string
  discountPercent: string
  source: string
  rateCardId: string | null
  rateCardName: string | null
  catalogUnitPrice: string
  catalogLineTotal: string
  saving: string
  aboveCatalogPrice: boolean
}
