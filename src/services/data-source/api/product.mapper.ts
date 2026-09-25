import type {
  Product,
  ProductCategory,
  ProductFinishOption,
  ProductMaterialOption,
  ProductSizeOption,
  ProductVariant,
  ProductVolumeDiscount,
} from '@/types'
import type {
  AdminProductView,
  CatalogCategory,
  ImportJob,
  ImportOutcome,
  ImportRowResult,
} from '@/types/catalog-admin'
import type {
  ApiCategory,
  ApiImportJob,
  ApiProduct,
  ApiProductOption,
  ApiUom,
} from './catalog.types'

/**
 * The one place that knows both the API's catalogue shape and the UI's.
 *
 * Everything else — services, hooks, screens — keeps reading `Product` from
 * `@/types`, so a field added to the API surfaces here and nowhere else.
 */

/** Used when a product has no image, or when the list was fetched without links. */
export const PRODUCT_PLACEHOLDER_IMAGE = '/product-placeholder.svg'

/**
 * `packSize` + `uom` as a shelf label.
 *
 * The API stores a count and a unit ("250", PACK) because pricing and stock are
 * both per selling unit and arithmetic on a label is not possible. The tile
 * wants the sentence, so it is composed here rather than stored twice.
 */
const UOM_LABEL: Record<ApiUom, { singular: string; grouped: string }> = {
  EACH: { singular: 'Single unit', grouped: 'Pack of' },
  PACK: { singular: 'Single pack', grouped: 'Pack of' },
  BOX: { singular: 'Single box', grouped: 'Box of' },
  ROLL: { singular: 'Single roll', grouped: 'Roll of' },
  SET: { singular: 'Single set', grouped: 'Set of' },
  SQUARE_METRE: { singular: 'Per square metre', grouped: 'Square metres:' },
}

export function packSizeLabel(packSize: number, uom: ApiUom): string {
  const label = UOM_LABEL[uom] ?? UOM_LABEL.EACH
  return packSize > 1 ? `${label.grouped} ${packSize}` : label.singular
}

/** The short code the admin tables print in the UOM column. */
const UOM_CODE: Record<ApiUom, string> = {
  EACH: 'EA',
  PACK: 'PK',
  BOX: 'BX',
  ROLL: 'RL',
  SET: 'ST',
  SQUARE_METRE: 'M2',
}

export function uomCode(uom: ApiUom): string {
  return UOM_CODE[uom] ?? uom
}

/**
 * Every unit a product can be sold in, for a picker.
 *
 * A fixed list rather than free text: the unit is what price, MOQ and stock are
 * all counted in, so "Box of 100" typed by hand — with the word ignored and only
 * the number read — was a unit the form showed and the API never saw.
 */
export const UOM_OPTIONS: {
  value: ApiUom
  label: string
  noun: string
  plural: string
}[] = [
  { value: 'EACH', label: 'Each (single item)', noun: 'item', plural: 'items' },
  { value: 'PACK', label: 'Pack', noun: 'pack', plural: 'packs' },
  { value: 'BOX', label: 'Box', noun: 'box', plural: 'boxes' },
  { value: 'ROLL', label: 'Roll', noun: 'roll', plural: 'rolls' },
  { value: 'SET', label: 'Set', noun: 'set', plural: 'sets' },
  { value: 'SQUARE_METRE', label: 'Square metre', noun: 'm²', plural: 'm²' },
]

/**
 * The merchandising grouping the shop filters on.
 *
 * Derived from the category code rather than stored: the API has no such field,
 * and a second column meaning "roughly the category" is one more thing to keep
 * in step with the first. An unmapped category simply has no print category,
 * which the UI already treats as "unfiltered".
 */
const PRINT_CATEGORY_BY_CODE: Record<
  string,
  NonNullable<Product['printCategory']>
> = {
  SIGNS: 'Signs',
  POSTERS: 'Posters',
  BANNERS: 'Banners',
  FLYERS: 'Flyers',
  BROCHURES: 'Brochures',
  CARDS: 'Business Cards',
  BUSINESS_CARDS: 'Business Cards',
  CATALOGUES: 'Catalogue',
  TEMPLATES: 'Template Design',
  MARKETING: 'Marketing Materials',
  PROMO: 'Promotional Products',
}

/**
 * Option axes the product detail page renders as its own control.
 *
 * The API models every axis the same way — a named list of values — because it
 * has no opinion about which of them is a "size". The UI does, so the three it
 * has dedicated controls for are picked out by name and the rest are left in
 * `options` for the generic renderer.
 */
const SIZE_OPTION_NAMES = ['size', 'format', 'dimensions', 'extent']
const MATERIAL_OPTION_NAMES = [
  'material',
  'paper',
  'stock',
  'substrate',
  'base',
]
const FINISH_OPTION_NAMES = [
  'finish',
  'finishing',
  'lamination',
  'corners',
  'fold',
]

function findOption(
  options: ApiProductOption[],
  names: string[]
): ApiProductOption | undefined {
  return options.find((option) =>
    names.includes(option.name.trim().toLowerCase())
  )
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Millimetres to inches, for the size controls the UI draws to scale.
 *
 * Only meaningful for the product's own trim size, so every value in a size
 * axis inherits it; the axis carries labels ("A2", '24" x 36"'), not
 * measurements. A caller that needs true per-value dimensions is asking for
 * variants, which the API models separately.
 */
function toInches(mm: number | null): number {
  return mm ? Math.round((mm / 25.4) * 100) / 100 : 0
}

function toSizeOptions(product: ApiProduct): ProductSizeOption[] | undefined {
  const option = findOption(product.options, SIZE_OPTION_NAMES)
  if (!option) return undefined

  return option.values.map((value, index) => ({
    id: `${option.id}-${slug(value)}`,
    label: value,
    dimensions: value,
    widthInches: toInches(product.widthMm),
    heightInches: toInches(product.heightMm),
    // The API prices variants explicitly rather than by multiplier; without a
    // variant for this value it sells at the base price.
    priceMultiplier: 1,
    ...(index === 0 ? { isPopular: true } : {}),
  }))
}

function toMaterialOptions(
  product: ApiProduct
): ProductMaterialOption[] | undefined {
  const option = findOption(product.options, MATERIAL_OPTION_NAMES)
  if (!option) return undefined

  return option.values.map((value) => ({
    id: `${option.id}-${slug(value)}`,
    name: value,
    description: `${option.name}: ${value}`,
    priceAddon: valuePriceOf(option, value),
  }))
}

function toFinishOptions(
  product: ApiProduct
): ProductFinishOption[] | undefined {
  const option = findOption(product.options, FINISH_OPTION_NAMES)
  if (!option) return undefined

  return option.values.map((value) => ({
    id: `${option.id}-${slug(value)}`,
    name: value,
    description: `${option.name}: ${value}`,
    priceAddon: valuePriceOf(option, value),
  }))
}

/**
 * What choosing a value adds to one pack. Zero when the option does not price
 * it — and when the API predates value prices and sends no map at all.
 */
export function valuePriceOf(
  option: Pick<ApiProductOption, 'valuePrices'>,
  value: string
): number {
  const amount = Number(option.valuePrices?.[value] ?? 0)
  return Number.isFinite(amount) && amount > 0 ? amount : 0
}

function toVolumeDiscounts(
  product: ApiProduct
): ProductVolumeDiscount[] | undefined {
  if (product.volumeTiers.length === 0) return undefined

  return product.volumeTiers.map((tier) => ({
    minQty: tier.minQuantity,
    discountPercent: Number(tier.discountPercent),
  }))
}

/**
 * The primary image.
 *
 * List responses omit asset links unless `withThumbnails` was requested, so a
 * product with images can still legitimately arrive with none — hence the
 * placeholder rather than an empty string, which would render a broken tile.
 */
function toThumbnailUrl(product: ApiProduct): string {
  const image = product.assets.find((asset) => asset.kind === 'IMAGE')
  return image?.thumbnailUrl ?? image?.url ?? PRODUCT_PLACEHOLDER_IMAGE
}

function toArtworkUrl(product: ApiProduct): string | undefined {
  const artwork = product.assets.find((asset) => asset.kind === 'ARTWORK')
  return artwork?.url
}

export function toProduct(api: ApiProduct): Product {
  const printCategory = PRINT_CATEGORY_BY_CODE[api.category.code]

  return {
    id: api.id,
    sku: api.sku,
    name: api.name,
    description: api.description ?? '',
    thumbnailUrl: toThumbnailUrl(api),
    categoryId: api.category.id,
    categoryName: api.category.name,
    packSize: packSizeLabel(api.packSize, api.uom),
    uom: UOM_CODE[api.uom] ?? api.uom,
    basePrice: Number(api.basePrice),
    moq: api.moq,
    orderMultiple: api.orderMultiple,
    status: api.status,
    // What a buyer can still order, not what is on the shelf. The shelf count
    // is carried separately as `stockOnHand` for the warehouse views.
    stockRemaining: api.trackInventory ? api.availableStock : undefined,
    lowStockThreshold: api.lowStockThreshold,
    // A product that can be personalised is one the studio has tagged as such;
    // the API has no dedicated flag.
    isPersonalizable:
      api.tags.includes('personalisable') ||
      api.tags.includes('personalizable'),
    ...(printCategory ? { printCategory } : {}),
    ...(toArtworkUrl(api) ? { artworkUrl: toArtworkUrl(api) } : {}),
    availableSizes: toSizeOptions(api),
    materials: toMaterialOptions(api),
    finishingOptions: toFinishOptions(api),
    volumeDiscounts: toVolumeDiscounts(api),
    ...(api.leadTimeDays !== null ? { turnaroundDays: api.leadTimeDays } : {}),
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,

    visibility: api.visibility,
    stockOnHand: api.stockOnHand,
    stockReserved: api.stockReserved,
    trackInventory: api.trackInventory,
    isLowStock: api.isLowStock,
    reorderQuantity: api.reorderQuantity,
    tags: api.tags,
    ...(api.taxTreatment ? { taxTreatment: api.taxTreatment } : {}),
    widthMm: api.widthMm,
    heightMm: api.heightMm,
    bleedMm: api.bleedMm === null ? null : Number(api.bleedMm),
    safeMarginMm: api.safeMarginMm === null ? null : Number(api.safeMarginMm),
    supersededBy: api.supersededBy,

    optionAxes: api.options.map((option) => ({
      id: option.id,
      name: option.name,
      values: option.values,
      valuePrices: Object.fromEntries(
        option.values.map((value) => [value, valuePriceOf(option, value)])
      ),
    })),
    variants: api.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      attributes: variant.attributes,
      effectivePrice: Number(variant.effectivePrice),
      availableStock: variant.availableStock,
      status: variant.status,
    })),
  }
}

/**
 * The variant matching a set of chosen option values.
 *
 * Matched on every axis the product declares, not on the ones the caller
 * happened to fill in: a partial match would pick an arbitrary configuration
 * and print the wrong thing.
 */
export function findVariant(
  product: Pick<Product, 'optionAxes' | 'variants'>,
  chosen: Record<string, string>
): ProductVariant | undefined {
  const axes = product.optionAxes ?? []
  if (axes.length === 0) return undefined

  return (product.variants ?? []).find((variant) =>
    axes.every((axis) => variant.attributes[axis.name] === chosen[axis.name])
  )
}

/**
 * The API view kept close to the wire for the admin panels.
 *
 * Copied field by field rather than spread, so a field the API adds later does
 * not silently appear on a type that does not declare it.
 */
export function toAdminProductView(api: ApiProduct): AdminProductView {
  return {
    id: api.id,
    sku: api.sku,
    name: api.name,
    description: api.description,
    category: api.category,
    status: api.status,
    visibility: api.visibility,
    basePrice: api.basePrice,
    moq: api.moq,
    orderMultiple: api.orderMultiple,
    packSize: api.packSize,
    uom: api.uom,
    trackInventory: api.trackInventory,
    stockOnHand: api.stockOnHand,
    stockReserved: api.stockReserved,
    availableStock: api.availableStock,
    lowStockThreshold: api.lowStockThreshold,
    reorderQuantity: api.reorderQuantity,
    isLowStock: api.isLowStock,
    leadTimeDays: api.leadTimeDays,
    tags: api.tags,
    options: api.options.map((option) => ({
      id: option.id,
      name: option.name,
      values: option.values,
      valuePrices: option.valuePrices ?? {},
      sortOrder: option.sortOrder,
    })),
    variants: api.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      attributes: variant.attributes,
      priceOverride: variant.priceOverride,
      effectivePrice: variant.effectivePrice,
      stockOnHand: variant.stockOnHand,
      availableStock: variant.availableStock,
      status: variant.status,
    })),
    volumeTiers: api.volumeTiers.map((tier) => ({
      minQuantity: tier.minQuantity,
      discountPercent: tier.discountPercent,
      unitPrice: tier.unitPrice,
      lineTotal: tier.lineTotal,
    })),
    assets: api.assets.map((asset) => ({
      id: asset.id,
      kind: asset.kind,
      filename: asset.filename,
      contentType: asset.contentType,
      sizeBytes: asset.sizeBytes,
      altText: asset.altText,
      sortOrder: asset.sortOrder,
      widthPx: asset.widthPx,
      heightPx: asset.heightPx,
      derivativeStatus: asset.derivativeStatus,
      derivativeError: asset.derivativeError,
      ...(asset.url ? { url: asset.url } : {}),
      ...(asset.thumbnailUrl ? { thumbnailUrl: asset.thumbnailUrl } : {}),
      ...(asset.previewUrl ? { previewUrl: asset.previewUrl } : {}),
    })),
    supersededBy: api.supersededBy,
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
  }
}

/** The category with the fields the admin table needs and `ProductCategory` drops. */
export function toCatalogCategory(api: ApiCategory): CatalogCategory {
  return {
    id: api.id,
    code: api.code,
    name: api.name,
    description: api.description,
    sortOrder: api.sortOrder,
    status: api.status,
    // An older API build does not send it; unrestricted is what it meant then.
    visibility: api.visibility ?? 'ALL_ACCOUNTS',
    itemCount: api.itemCount,
  }
}

const IMPORT_OUTCOMES: readonly ImportOutcome[] = [
  'created',
  'updated',
  'skipped',
  'failed',
]

/**
 * Per-row results arrive as stored JSON, so they are read defensively: a row
 * that does not look like a result is dropped rather than rendered as garbage.
 */
function toImportResults(raw: unknown): ImportRowResult[] | undefined {
  if (!Array.isArray(raw)) return undefined

  return raw.flatMap((entry): ImportRowResult[] => {
    if (typeof entry !== 'object' || entry === null) return []
    const row = entry as Record<string, unknown>
    const outcome = row.outcome as ImportOutcome
    if (!IMPORT_OUTCOMES.includes(outcome)) return []

    return [
      {
        row: typeof row.row === 'number' ? row.row : 0,
        sku: typeof row.sku === 'string' ? row.sku : null,
        outcome,
        ...(typeof row.message === 'string' ? { message: row.message } : {}),
        ...(typeof row.productId === 'string'
          ? { productId: row.productId }
          : {}),
      },
    ]
  })
}

export function toImportJob(api: ApiImportJob): ImportJob {
  const results = toImportResults(api.results)

  return {
    id: api.id,
    status: api.status,
    dryRun: api.dryRun,
    updateExisting: api.updateExisting,
    totalRows: api.totalRows,
    created: api.created,
    updated: api.updated,
    skipped: api.skipped,
    failed: api.failed,
    error: api.error,
    requestedById: api.requestedById,
    startedAt: api.startedAt,
    finishedAt: api.finishedAt,
    createdAt: api.createdAt,
    ...(results ? { results } : {}),
  }
}

export function toCategory(api: ApiCategory): ProductCategory {
  return {
    id: api.id,
    name: api.name,
    code: api.code,
    description: api.description ?? '',
    itemCount: api.itemCount,
  }
}

/**
 * The UI's `Product` back into the API's create body.
 *
 * Lossy in one direction on purpose: `status` and `stockOnHand` are not
 * settable on create. A product is always born DRAFT and published through its
 * own audited transition, and stock moves through the adjustment endpoint so
 * every change carries a reason — see the notes on `CreateProductSchema`.
 */
export interface ApiCreateProductBody {
  sku: string
  name: string
  description?: string | null
  categoryId: string
  basePrice: string
  moq: number
  orderMultiple: number
  packSize: number
  uom: ApiUom
  widthMm?: number | null
  heightMm?: number | null
  bleedMm?: string | null
  safeMarginMm?: string | null
  trackInventory: boolean
  lowStockThreshold: number
  reorderQuantity?: number | null
  leadTimeDays?: number | null
  tags: string[]
}

/** "Pack of 250", "Box of 500", "Single unit" -> 250 / 500 / 1. */
export function parsePackSize(label: string | number | undefined): number {
  if (typeof label === 'number') return Math.max(1, Math.trunc(label))
  const match = /(\d+)/.exec(label ?? '')
  return match ? Math.max(1, Number(match[1])) : 1
}

const UOM_FROM_CODE: Record<string, ApiUom> = {
  EA: 'EACH',
  EACH: 'EACH',
  PK: 'PACK',
  PACK: 'PACK',
  BX: 'BOX',
  BOX: 'BOX',
  RL: 'ROLL',
  ROLL: 'ROLL',
  ST: 'SET',
  SET: 'SET',
  M2: 'SQUARE_METRE',
  SQUARE_METRE: 'SQUARE_METRE',
}

export function toApiUom(uom: string | undefined): ApiUom {
  return UOM_FROM_CODE[(uom ?? '').trim().toUpperCase()] ?? 'EACH'
}

/** Money as a two-decimal string, which is what every API money field expects. */
export function toMoney(value: number | string | undefined): string {
  return Number(value ?? 0).toFixed(2)
}

export function toCreateBody(
  input: Partial<Product> & { sku: string }
): ApiCreateProductBody {
  return {
    sku: input.sku,
    name: input.name ?? input.sku,
    description: input.description ?? null,
    categoryId: input.categoryId ?? '',
    basePrice: toMoney(input.basePrice),
    moq: input.moq ?? 1,
    orderMultiple: input.orderMultiple ?? 1,
    packSize: parsePackSize(input.packSize),
    uom: toApiUom(input.uom),
    widthMm: input.widthMm ?? null,
    heightMm: input.heightMm ?? null,
    bleedMm: input.bleedMm == null ? null : String(input.bleedMm),
    safeMarginMm:
      input.safeMarginMm == null ? null : String(input.safeMarginMm),
    trackInventory: input.trackInventory ?? true,
    lowStockThreshold: input.lowStockThreshold ?? 0,
    reorderQuantity: input.reorderQuantity ?? null,
    leadTimeDays: input.turnaroundDays ?? null,
    tags: input.tags ?? [],
    ...(input.taxTreatment ? { taxTreatment: input.taxTreatment } : {}),
  }
}

/**
 * A partial update. Only the keys actually present are sent — the API rejects
 * an empty body, and sending an untouched field as `null` would clear it.
 */
export function toUpdateBody(input: Partial<Product>): Record<string, unknown> {
  const body: Record<string, unknown> = {}

  if (input.name !== undefined) body.name = input.name
  if (input.description !== undefined) body.description = input.description
  if (input.categoryId !== undefined) body.categoryId = input.categoryId
  if (input.basePrice !== undefined) body.basePrice = toMoney(input.basePrice)
  if (input.moq !== undefined) body.moq = input.moq
  if (input.orderMultiple !== undefined)
    body.orderMultiple = input.orderMultiple
  if (input.packSize !== undefined)
    body.packSize = parsePackSize(input.packSize)
  if (input.uom !== undefined) body.uom = toApiUom(input.uom)
  if (input.widthMm !== undefined) body.widthMm = input.widthMm
  if (input.heightMm !== undefined) body.heightMm = input.heightMm
  // Sent as strings, as on create: these are NUMERIC columns and the API
  // validates them as decimals. Without these two an edit to the bleed or the
  // safe margin was accepted by the form and silently dropped here.
  if (input.bleedMm !== undefined)
    body.bleedMm = input.bleedMm == null ? null : String(input.bleedMm)
  if (input.safeMarginMm !== undefined)
    body.safeMarginMm =
      input.safeMarginMm == null ? null : String(input.safeMarginMm)
  if (input.trackInventory !== undefined)
    body.trackInventory = input.trackInventory
  if (input.lowStockThreshold !== undefined)
    body.lowStockThreshold = input.lowStockThreshold
  if (input.reorderQuantity !== undefined)
    body.reorderQuantity = input.reorderQuantity
  if (input.turnaroundDays !== undefined)
    body.leadTimeDays = input.turnaroundDays
  if (input.tags !== undefined) body.tags = input.tags
  if (input.taxTreatment !== undefined) body.taxTreatment = input.taxTreatment

  return body
}
