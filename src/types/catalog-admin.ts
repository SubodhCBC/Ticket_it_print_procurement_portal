import type { Product } from '@/types'

/**
 * Catalogue administration types.
 *
 * The shop screens read `Product` from `@/types`, which is shaped for a buyer:
 * money as numbers, stock collapsed to "what can I still order". The admin
 * screens need what the API actually stores — a variant's price override as
 * opposed to its effective price, the asset list, the volume ladder as the
 * percentages it is edited in — so they read these instead. Money and
 * percentages stay strings here for the same reason they are strings on the
 * wire: they are NUMERIC columns and a float would round them.
 */

export type CatalogProductStatus =
  'DRAFT' | 'ACTIVE' | 'UNAVAILABLE' | 'SUPERSEDED'
export type CatalogVisibility = 'ALL_ACCOUNTS' | 'RESTRICTED'
export type CatalogAssetKind = 'IMAGE' | 'ARTWORK' | 'SPEC_SHEET'
export type CatalogUom =
  'EACH' | 'PACK' | 'BOX' | 'ROLL' | 'SET' | 'SQUARE_METRE'
export type CatalogVariantStatus = 'ACTIVE' | 'INACTIVE'
export type CatalogCategoryStatus = 'ACTIVE' | 'INACTIVE'

// --- Product detail ------------------------------------------------------------

export interface AdminProductOption {
  id: string
  name: string
  values: string[]
  valuePrices: Record<string, string>
  sortOrder: number
}

export interface AdminProductVariant {
  id: string
  sku: string
  attributes: Record<string, string>
  /** Null when the variant sells at the product's base price. */
  priceOverride: string | null
  effectivePrice: string
  stockOnHand: number
  availableStock: number
  status: CatalogVariantStatus | string
}

export interface AdminProductAsset {
  id: string
  kind: CatalogAssetKind
  filename: string
  contentType: string
  sizeBytes: number
  altText: string | null
  sortOrder: number
  widthPx: number | null
  heightPx: number | null
  derivativeStatus: string
  derivativeError: string | null
  url?: string
  thumbnailUrl?: string
  previewUrl?: string
}

export interface AdminVolumeTier {
  minQuantity: number
  discountPercent: string
  unitPrice: string
  lineTotal: string
}

export interface AdminProductView {
  id: string
  sku: string
  name: string
  description: string | null
  category: { id: string; code: string; name: string }
  status: CatalogProductStatus
  visibility: CatalogVisibility
  basePrice: string
  moq: number
  orderMultiple: number
  packSize: number
  uom: CatalogUom
  trackInventory: boolean
  stockOnHand: number
  stockReserved: number
  availableStock: number
  lowStockThreshold: number
  reorderQuantity: number | null
  isLowStock: boolean
  leadTimeDays: number | null
  tags: string[]
  options: AdminProductOption[]
  variants: AdminProductVariant[]
  volumeTiers: AdminVolumeTier[]
  assets: AdminProductAsset[]
  supersededBy: { id: string; sku: string; name: string } | null
  createdAt: string
  updatedAt: string
}

/** One GET, both shapes: the UI product for shared components, the view for admin panels. */
export interface AdminProductDetail {
  product: Product
  view: AdminProductView
}

// --- Product writes ------------------------------------------------------------

export interface ChangeProductStatusInput {
  status: Exclude<CatalogProductStatus, 'DRAFT'>
  /** Required for SUPERSEDED, refused otherwise. */
  supersededById?: string
  reason?: string
}

/** A signed movement — never an absolute figure. */
export interface StockAdjustmentInput {
  delta: number
  reason: string
  variantId?: string
}

export interface StockAdjustmentResult {
  productId: string
  variantId?: string
  stockOnHand: number
}

export interface CreateVariantInput {
  sku: string
  attributes: Record<string, string>
  priceOverride?: string | null
  sortOrder?: number
}

export interface UpdateVariantInput {
  /** `null` clears the override. */
  priceOverride?: string | null
  status?: CatalogVariantStatus
  sortOrder?: number
}

export interface VolumeTierInput {
  minQuantity: number
  discountPercent: number
}

export interface VisibilityInput {
  visibility: CatalogVisibility
  accountIds: string[]
}

export interface OptionAxisInput {
  name: string
  values: string[]
}

export interface AttachAssetInput {
  filename: string
  contentType: string
  sizeBytes: number
  kind: CatalogAssetKind
  altText?: string | null
  sortOrder?: number
}

/**
 * The two steps a file goes through. There is no presign step any more: the
 * browser puts the file in the image library (DAM) and the server copies it
 * into object storage when the asset is attached.
 */
export type AssetUploadStage = 'uploading-library' | 'attaching'

export interface UploadAssetInput {
  file: File
  kind: CatalogAssetKind
  altText?: string
  sortOrder?: number
}

/** One file sent to the SKU matcher; `sku` overrides what its name says. */
export interface ImageFilenameInput {
  filename: string
  sku?: string
}

/** Which product an image file is for, as the server read it off the name. */
export interface ImageFilenameMatch {
  filename: string
  /** SUFFIX: matched once `ignoredSuffix` was cut off the end of the name. */
  matchedOn: 'EXACT' | 'SUFFIX' | null
  ignoredSuffix: string | null
  product: {
    id: string
    sku: string
    name: string
    status: string
    imageCount: number
    nextImageSortOrder: number
  } | null
}

// --- Categories ------------------------------------------------------------------

export interface CatalogCategory {
  id: string
  code: string
  name: string
  description: string | null
  sortOrder: number
  status: CatalogCategoryStatus
  /** RESTRICTED hides the category, and every product in it, from other accounts. */
  visibility: CatalogVisibility
  itemCount: number
}

export interface CatalogCategoryListParams {
  status?: CatalogCategoryStatus
  /** Server default is true; false hides categories with no active products. */
  includeEmpty?: boolean
  visibility?: CatalogVisibility
}

/** A category's stored allow-list, kept even while it is ALL_ACCOUNTS. */
export interface CategoryVisibilityDetail {
  visibility: CatalogVisibility
  accounts: { id: string; name: string; accountCode: string }[]
}

export interface CreateCategoryInput {
  code: string
  name: string
  description?: string
  sortOrder?: number
}

export interface UpdateCategoryInput {
  name?: string
  /** `null` clears it. */
  description?: string | null
  sortOrder?: number
  status?: CatalogCategoryStatus
}

// --- Bulk import -------------------------------------------------------------------

/**
 * One row of `POST /catalog/products/import`, as `ImportRowSchema` reads it.
 *
 * Whole-number fields accept a string too: the schema coerces them, and a cell
 * the browser could not read as a number is sent as typed so the job reports
 * that row as failed instead of it being silently dropped or zeroed.
 */
export interface ImportRowInput {
  sku: string
  name: string
  categoryCode: string
  description?: string
  basePrice: string
  moq?: number | string
  orderMultiple?: number | string
  packSize?: number | string
  uom?: string
  widthMm?: number | string
  heightMm?: number | string
  bleedMm?: string
  safeMarginMm?: string
  lowStockThreshold?: number | string
  leadTimeDays?: number | string
  tags?: string[]
  /** STANDARD, ZERO_RATED or EXEMPT. Left out, an existing product keeps its own. */
  taxTreatment?: string
}

export interface ImportProductsInput {
  rows: ImportRowInput[]
  updateExisting: boolean
  dryRun: boolean
}

export type ImportJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
export type ImportOutcome = 'created' | 'updated' | 'skipped' | 'failed'

export interface ImportRowResult {
  /** 1-based; 0 marks the "only failures are listed" note on very large runs. */
  row: number
  sku: string | null
  outcome: ImportOutcome
  message?: string
  productId?: string
}

export interface ImportJob {
  id: string
  status: ImportJobStatus | string
  dryRun: boolean
  updateExisting: boolean
  totalRows: number
  created: number
  updated: number
  skipped: number
  failed: number
  /** Set only when the run itself broke. */
  error: string | null
  requestedById: string | null
  startedAt: string | null
  finishedAt: string | null
  createdAt: string
  /** Present on the single-job read only. */
  results?: ImportRowResult[]
}

// --- Stocktake ---------------------------------------------------------------------

export interface StockCountInput {
  sku: string
  countedQuantity: number
  note?: string
}

export interface ReconcileStockInput {
  counts: StockCountInput[]
  reason: string
  dryRun: boolean
}

export type StockReconciliationOutcome =
  | 'MATCHED'
  | 'ADJUSTED'
  | 'WOULD_ADJUST'
  | 'BELOW_RESERVED'
  | 'NOT_TRACKED'
  | 'UNKNOWN_SKU'

export interface StockReconciliationLine {
  sku: string
  name?: string
  systemQuantity?: number
  countedQuantity?: number
  variance?: number
  reserved?: number
  outcome: StockReconciliationOutcome
  message?: string
}

export interface StockReconciliation {
  dryRun: boolean
  reason: string
  summary: {
    counted: number
    matched: number
    adjusted: number
    refused: number
    netVariance: number
  }
  lines: StockReconciliationLine[]
}
