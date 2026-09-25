import { apiClient } from '@/services/api.service'
import type {
  EffectiveProduct,
  PaginatedResult,
  Product,
  ProductCategory,
} from '@/types'
import type {
  AdminProductDetail,
  AdminProductView,
  AttachAssetInput,
  CatalogCategory,
  CatalogCategoryListParams,
  CategoryVisibilityDetail,
  ChangeProductStatusInput,
  CreateVariantInput,
  ImageFilenameInput,
  ImageFilenameMatch,
  ImportJob,
  ImportProductsInput,
  ReconcileStockInput,
  StockAdjustmentResult,
  StockReconciliation,
  UpdateCategoryInput,
  UpdateVariantInput,
  VisibilityInput,
  VolumeTierInput,
} from '@/types/catalog-admin'
import type {
  ApiCategory,
  ApiImportJob,
  ApiOffsetPage,
  ApiProduct,
  ApiQuotedLine,
  ApiStockAdjustment,
  ApiStockReconciliation,
} from './catalog.types'
import {
  toAdminProductView,
  toCatalogCategory,
  toCategory,
  toCreateBody,
  toImportJob,
  toMoney,
  toProduct,
  toUpdateBody,
  valuePriceOf,
} from './product.mapper'

/**
 * The catalogue, served by `GET /catalog/products` and `/catalog/categories`.
 *
 * Same function signatures as the mock adapter it replaces, so the service
 * layer and every screen above it are unchanged — see `../index.ts`.
 *
 * Scoping is the server's job, not this file's: the product list an
 * administrator gets includes drafts and restricted lines, and a site user's
 * does not, because the endpoint filters on the bearer token. There is
 * deliberately no client-side equivalent of that filter here.
 */

const PRODUCTS = '/catalog/products'
const CATEGORIES = '/catalog/categories'

interface ListParams {
  page?: number
  pageSize?: number
  categoryId?: string
  status?: Product['status']
  search?: string
  /**
   * Presign one thumbnail per row. `list` defaults it on, because most of its
   * callers render a grid; a picker that shows names only turns it off.
   */
  withThumbnails?: boolean
}

/**
 * "All" is what the category filter sends for "no filter". It is a UI token,
 * not a category id, and forwarding it would return an empty page.
 */
function realCategoryId(categoryId?: string): string | undefined {
  return categoryId && categoryId !== 'All' ? categoryId : undefined
}

function toQuery(params: ListParams): Record<string, unknown> {
  const query: Record<string, unknown> = {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 20,
  }

  const categoryId = realCategoryId(params.categoryId)
  if (categoryId) query.categoryId = categoryId
  if (params.status) query.status = params.status
  if (params.search?.trim()) query.search = params.search.trim()
  if (params.withThumbnails) query.withThumbnails = true

  return query
}

function toPage<T, U>(
  page: ApiOffsetPage<T>,
  map: (row: T) => U
): PaginatedResult<U> {
  return {
    items: page.items.map(map),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
  }
}

/** The list filters an export honours; paging does not apply to a file. */
export interface ExportProductsParams {
  categoryId?: string
  status?: string
  search?: string
}

/**
 * The catalogue as CSV (SOW M-13): the products matching the same filters the
 * list takes, every page of them. The first columns are the import template's,
 * in its order, so the file can be edited and imported back.
 */
export async function exportCsv(params?: ExportProductsParams): Promise<Blob> {
  const query: Record<string, unknown> = {}
  const categoryId = realCategoryId(params?.categoryId)
  if (categoryId) query.categoryId = categoryId
  if (params?.status) query.status = params.status
  if (params?.search?.trim()) query.search = params.search.trim()

  const body: unknown = await apiClient.get(`${PRODUCTS}/export`, {
    params: query,
    responseType: 'blob',
  })
  // The interceptor unwraps `response.data`, so this is already the body.
  return body instanceof Blob ? body : new Blob([String(body)], { type: CSV })
}

/** The bulk import template: the importer's header row and example rows. */
export async function importTemplateCsv(): Promise<Blob> {
  const body: unknown = await apiClient.get(`${PRODUCTS}/import/template`, {
    responseType: 'blob',
  })
  return body instanceof Blob ? body : new Blob([String(body)], { type: CSV })
}

const CSV = 'text/csv;charset=utf-8'

export async function list(
  params?: ListParams
): Promise<PaginatedResult<Product>> {
  const page: ApiOffsetPage<ApiProduct> = await apiClient.get(PRODUCTS, {
    params: toQuery({
      ...params,
      withThumbnails: params?.withThumbnails ?? true,
    }),
  })

  return toPage(page, toProduct)
}

export async function getById(id: string): Promise<Product | null> {
  try {
    const product: ApiProduct = await apiClient.get(
      `${PRODUCTS}/${encodeURIComponent(id)}`
    )
    return toProduct(product)
  } catch (error) {
    // A product the caller may not see is reported as missing rather than
    // forbidden — see the note in ProductsService.findById — so 404 is the one
    // failure that means "no such product" instead of "something went wrong".
    if (isNotFound(error)) return null
    throw error
  }
}

export async function create(input: Omit<Product, 'id'>): Promise<Product> {
  const created: ApiProduct = await apiClient.post(
    PRODUCTS,
    toCreateBody(input as Partial<Product> & { sku: string })
  )

  // Products are created DRAFT and published by a separate audited transition.
  // A catalogue screen that just created one means it to be orderable, so the
  // publish is issued here rather than left as a second thing to remember.
  if (input.status && input.status !== 'DRAFT') {
    return changeStatus(created.id, input.status, input.supersededBy?.id)
  }
  return toProduct(created)
}

export async function update(
  id: string,
  input: Partial<Product>
): Promise<Product> {
  const body = toUpdateBody(input)

  let current: ApiProduct | undefined
  if (Object.keys(body).length > 0) {
    current = await apiClient.patch(
      `${PRODUCTS}/${encodeURIComponent(id)}`,
      body
    )
  }

  // Status is its own endpoint, and only moves when it actually changed.
  if (input.status && input.status !== 'DRAFT') {
    const before: ApiProduct =
      current ?? (await apiClient.get(`${PRODUCTS}/${encodeURIComponent(id)}`))
    if (before.status !== input.status) {
      return changeStatus(id, input.status, input.supersededBy?.id)
    }
    return toProduct(before)
  }

  if (!current) throw new Error('Nothing to update')
  return toProduct(current)
}

/**
 * `supersededById` is required when superseding and refused otherwise, so the
 * successor is passed through from whatever screen chose it. Without one, the
 * API rejects the transition — which is the right answer: a discontinued
 * product with no replacement leaves a re-order with nowhere to go.
 */
async function changeStatus(
  id: string,
  status: Product['status'],
  supersededById?: string
): Promise<Product> {
  const updated: ApiProduct = await apiClient.post(
    `${PRODUCTS}/${encodeURIComponent(id)}/status`,
    {
      status,
      ...(status === 'SUPERSEDED' && supersededById ? { supersededById } : {}),
    }
  )
  return toProduct(updated)
}

export async function remove(id: string): Promise<void> {
  await apiClient.delete(`${PRODUCTS}/${encodeURIComponent(id)}`)
}

/**
 * The shop grid: the catalogue plus what this account actually pays.
 *
 * Two calls, not one per tile. `POST /pricing/quote` takes up to 200 lines, so
 * a page of products is priced in a single round trip; quoting per tile would
 * put the rate-card lookup on the critical path once for every card on screen.
 *
 * Quoted at each product's MOQ, because that is the quantity the grid displays
 * a price for. The detail page re-quotes at the quantity the buyer chooses.
 */
export async function listVisibleForAccount(
  accountId?: string,
  params?: ListParams & { includeUnavailable?: boolean }
): Promise<PaginatedResult<EffectiveProduct>> {
  const page: ApiOffsetPage<ApiProduct> = await apiClient.get(PRODUCTS, {
    params: toQuery({
      ...params,
      pageSize: params?.pageSize ?? 24,
      // Unavailable and superseded lines are still rendered, greyed out, so a
      // buyer looking for a discontinued item sees what replaced it.
      ...(params?.includeUnavailable ? {} : { status: 'ACTIVE' as const }),
      withThumbnails: true,
    }),
  })

  const products = page.items.map(toProduct)
  const quotes = await quoteAll(page.items, accountId)

  return {
    ...toPage(page, toProduct),
    items: products.map((product) =>
      withPricing(product, quotes.get(product.id))
    ),
  }
}

export async function getByIdWithPricing(
  id: string,
  accountId?: string
): Promise<EffectiveProduct | null> {
  const product = await getById(id)
  if (!product) return null

  const quotes = await quoteAll(
    [{ id: product.id, moq: product.moq } as ApiProduct],
    accountId
  )

  return withPricing(product, quotes.get(product.id))
}

export async function listCategories(): Promise<ProductCategory[]> {
  const categories: ApiCategory[] = await apiClient.get(CATEGORIES)
  return categories.map(toCategory)
}

export async function createCategory(
  input: Omit<ProductCategory, 'id' | 'itemCount'> & { sortOrder?: number }
): Promise<ProductCategory> {
  const created: ApiCategory = await apiClient.post(CATEGORIES, {
    code: input.code,
    name: input.name,
    ...(input.description?.trim()
      ? { description: input.description.trim() }
      : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  })
  return toCategory(created)
}

/**
 * The admin category table: status and sort order included, which the shop's
 * `ProductCategory` leaves out. `includeEmpty` defaults to true on the server.
 */
export async function listCategoriesAdmin(
  params?: CatalogCategoryListParams
): Promise<CatalogCategory[]> {
  const query: Record<string, unknown> = {}
  if (params?.status) query.status = params.status
  if (params?.includeEmpty === false) query.includeEmpty = false
  if (params?.visibility) query.visibility = params.visibility

  const categories: ApiCategory[] = await apiClient.get(CATEGORIES, {
    params: query,
  })
  return categories.map(toCatalogCategory)
}

/** Only the keys present are sent; `description: null` clears it. */
export async function updateCategory(
  id: string,
  input: UpdateCategoryInput
): Promise<CatalogCategory> {
  const body: Record<string, unknown> = {}
  if (input.name !== undefined) body.name = input.name
  if (input.description !== undefined) body.description = input.description
  if (input.sortOrder !== undefined) body.sortOrder = input.sortOrder
  if (input.status !== undefined) body.status = input.status

  const updated: ApiCategory = await apiClient.patch(
    `${CATEGORIES}/${encodeURIComponent(id)}`,
    body
  )
  return toCatalogCategory(updated)
}

/** The category's visibility and its stored allow-list, to pre-fill the editor. */
export async function getCategoryVisibility(
  id: string
): Promise<CategoryVisibilityDetail> {
  return apiClient.get(`${CATEGORIES}/${encodeURIComponent(id)}/visibility`)
}

/**
 * RESTRICTED replaces the whole allow-list. ALL_ACCOUNTS leaves the stored list
 * in place server-side, so no ids are sent with it.
 */
export async function setCategoryVisibility(
  id: string,
  input: VisibilityInput
): Promise<CatalogCategory> {
  const updated: ApiCategory = await apiClient.put(
    `${CATEGORIES}/${encodeURIComponent(id)}/visibility`,
    {
      visibility: input.visibility,
      accountIds: input.visibility === 'RESTRICTED' ? input.accountIds : [],
    }
  )
  return toCatalogCategory(updated)
}

/**
 * Soft delete. The API refuses while any product still points at the
 * category, and its message says how many — the caller shows it verbatim.
 */
export async function deactivateCategory(id: string): Promise<void> {
  await apiClient.delete(`${CATEGORIES}/${encodeURIComponent(id)}`)
}

/**
 * Sequential rather than `Promise.all`.
 *
 * @deprecated No screen uses this any more: the admin import page submits the
 * whole file to `POST /catalog/products/import` and polls the job (see
 * `importProducts`). Kept only so the service export stays stable.
 */
export async function bulkCreate(
  items: Omit<Product, 'id'>[]
): Promise<Product[]> {
  const created: Product[] = []
  for (const item of items) {
    created.push(await create(item))
  }
  return created
}

/**
 * A stock movement, not an assignment: the endpoint takes a signed delta and a
 * reason, so every change lands in the audit trail with an explanation.
 *
 * The response is the new shelf figure — `{ productId, variantId?,
 * stockOnHand }` — not a product. It used to be run through `toProduct`, which
 * threw on the missing `category`; callers that need the rest of the product
 * refetch it.
 */
export async function updateStock(
  id: string,
  deltaQty: number,
  options?: { reason?: string; variantId?: string }
): Promise<StockAdjustmentResult> {
  const result: ApiStockAdjustment = await apiClient.post(
    productPath(id, '/stock'),
    {
      delta: deltaQty,
      reason:
        options?.reason?.trim() ||
        (deltaQty >= 0 ? 'Stock received' : 'Stock adjustment'),
      ...(options?.variantId ? { variantId: options.variantId } : {}),
    }
  )

  return {
    productId: result.productId,
    stockOnHand: result.stockOnHand,
    ...(result.variantId ? { variantId: result.variantId } : {}),
  }
}

// --- Admin product detail -----------------------------------------------------

function productPath(id: string, suffix = ''): string {
  return `${PRODUCTS}/${encodeURIComponent(id)}${suffix}`
}

/**
 * One read for the admin detail page, returned in both shapes: the UI
 * `Product` the shared edit modal and option pricing editor take, and the
 * admin view the lifecycle, stock, variant, tier, visibility and asset panels
 * read. Null on 404, like `getById`.
 */
export async function getAdminById(
  id: string
): Promise<AdminProductDetail | null> {
  try {
    const api: ApiProduct = await apiClient.get(productPath(id))
    return { product: toProduct(api), view: toAdminProductView(api) }
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

/**
 * The audited status transition. The server owns the transition table; a
 * refused move comes back as a 422 whose message says why.
 */
export async function setStatus(
  id: string,
  input: ChangeProductStatusInput
): Promise<AdminProductView> {
  const updated: ApiProduct = await apiClient.post(productPath(id, '/status'), {
    status: input.status,
    ...(input.status === 'SUPERSEDED' && input.supersededById
      ? { supersededById: input.supersededById }
      : {}),
    ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
  })
  return toAdminProductView(updated)
}

export async function createVariant(
  id: string,
  input: CreateVariantInput
): Promise<AdminProductView> {
  const updated: ApiProduct = await apiClient.post(
    productPath(id, '/variants'),
    {
      sku: input.sku,
      attributes: input.attributes,
      ...(input.priceOverride ? { priceOverride: input.priceOverride } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
    }
  )
  return toAdminProductView(updated)
}

/** Only the keys present are sent; `priceOverride: null` clears the override. */
export async function updateVariant(
  id: string,
  variantId: string,
  input: UpdateVariantInput
): Promise<AdminProductView> {
  const body: Record<string, unknown> = {}
  if (input.priceOverride !== undefined)
    body.priceOverride = input.priceOverride
  if (input.status !== undefined) body.status = input.status
  if (input.sortOrder !== undefined) body.sortOrder = input.sortOrder

  const updated: ApiProduct = await apiClient.patch(
    productPath(id, `/variants/${encodeURIComponent(variantId)}`),
    body
  )
  return toAdminProductView(updated)
}

/** Soft: order lines reference the variant SKU. */
export async function removeVariant(
  id: string,
  variantId: string
): Promise<void> {
  await apiClient.delete(
    productPath(id, `/variants/${encodeURIComponent(variantId)}`)
  )
}

/** Replaces the whole ladder. An empty list removes every tier. */
export async function setVolumeTiers(
  id: string,
  tiers: VolumeTierInput[]
): Promise<AdminProductView> {
  const updated: ApiProduct = await apiClient.put(
    productPath(id, '/volume-tiers'),
    {
      tiers: tiers.map((tier) => ({
        minQuantity: tier.minQuantity,
        discountPercent: tier.discountPercent,
      })),
    }
  )
  return toAdminProductView(updated)
}

/**
 * RESTRICTED replaces the whole allow-list. ALL_ACCOUNTS leaves the stored
 * list in place server-side, so no ids are sent with it.
 */
export async function setVisibility(
  id: string,
  input: VisibilityInput
): Promise<AdminProductView> {
  const updated: ApiProduct = await apiClient.put(
    productPath(id, '/visibility'),
    {
      visibility: input.visibility,
      accountIds: input.visibility === 'RESTRICTED' ? input.accountIds : [],
    }
  )
  return toAdminProductView(updated)
}

// --- Assets --------------------------------------------------------------------

/**
 * Registers a file that is already in the image library (DAM) as a product
 * asset. The only attach there is: presign is gone, product files live in the
 * library, and the server copies the file into object storage itself. See
 * `@/services/asset-storage` for the contract.
 */
export async function attachDamAsset(
  id: string,
  input: AttachAssetInput & {
    damDocumentId: string
    damUrl: string
  }
): Promise<AdminProductView> {
  const updated: ApiProduct = await apiClient.post(productPath(id, '/assets'), {
    damDocumentId: input.damDocumentId,
    damUrl: input.damUrl,
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes,
    kind: input.kind,
    ...(input.altText?.trim() ? { altText: input.altText.trim() } : {}),
    sortOrder: input.sortOrder ?? 0,
  })
  return toAdminProductView(updated)
}

/**
 * Which product each image file is for, by SKU in its name. Read-only; the
 * files are uploaded and attached afterwards, one at a time.
 */
export async function matchImageFilenames(
  files: ImageFilenameInput[]
): Promise<ImageFilenameMatch[]> {
  const result: { matches: ImageFilenameMatch[] } = await apiClient.post(
    `${PRODUCTS}/image-matches`,
    { files }
  )
  return result.matches
}

export async function removeAsset(id: string, assetId: string): Promise<void> {
  await apiClient.delete(
    productPath(id, `/assets/${encodeURIComponent(assetId)}`)
  )
}

// --- Bulk import and stocktake ---------------------------------------------------

/** Answers 202 with a queued job; poll `getImportJob` for the outcome. */
export async function importProducts(
  input: ImportProductsInput
): Promise<ImportJob> {
  const job: ApiImportJob = await apiClient.post(`${PRODUCTS}/import`, {
    rows: input.rows,
    updateExisting: input.updateExisting,
    dryRun: input.dryRun,
  })
  return toImportJob(job)
}

/** Includes the per-row results. */
export async function getImportJob(jobId: string): Promise<ImportJob> {
  const job: ApiImportJob = await apiClient.get(
    `${PRODUCTS}/import/jobs/${encodeURIComponent(jobId)}`
  )
  return toImportJob(job)
}

/** Newest first, without per-row results. */
export async function listImportJobs(params?: {
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<ImportJob>> {
  const page: ApiOffsetPage<ApiImportJob> = await apiClient.get(
    `${PRODUCTS}/import/jobs`,
    { params: { page: params?.page ?? 1, pageSize: params?.pageSize ?? 10 } }
  )
  return toPage(page, toImportJob)
}

/** Absolute counts. `dryRun` reports the variances without writing them. */
export async function reconcileStock(
  input: ReconcileStockInput
): Promise<StockReconciliation> {
  const report: ApiStockReconciliation = await apiClient.post(
    '/catalog/inventory/reconcile',
    {
      counts: input.counts.map((count) => ({
        sku: count.sku,
        countedQuantity: count.countedQuantity,
        ...(count.note?.trim() ? { note: count.note.trim() } : {}),
      })),
      reason: input.reason,
      dryRun: input.dryRun,
    }
  )
  return {
    dryRun: report.dryRun,
    reason: report.reason,
    summary: report.summary,
    lines: report.lines,
  }
}

// --- Options ------------------------------------------------------------------

/**
 * One option axis as `PUT /catalog/products/:id/options` takes it.
 *
 * `sortOrder` is here, unlike on `Product.optionAxes`, because the call
 * replaces the whole set: an axis sent without its order would come back
 * reordered.
 */
export interface ProductOptionInput {
  name: string
  values: string[]
  sortOrder: number
  /** What each value adds to one pack, keyed by value. Zero adds nothing. */
  valuePrices: Record<string, number>
}

/** The option set exactly as stored, order included — for a replace-all edit. */
export async function getOptions(id: string): Promise<ProductOptionInput[]> {
  const product: ApiProduct = await apiClient.get(
    `${PRODUCTS}/${encodeURIComponent(id)}`
  )

  return product.options.map((option) => ({
    name: option.name,
    values: option.values,
    sortOrder: option.sortOrder,
    valuePrices: Object.fromEntries(
      option.values.map((value) => [value, valuePriceOf(option, value)])
    ),
  }))
}

/**
 * Replaces the product's whole option set. The API refuses to drop a value a
 * variant is built on, and names the variants when it does.
 */
export async function setOptions(
  id: string,
  options: ProductOptionInput[]
): Promise<Product> {
  const updated: ApiProduct = await apiClient.put(
    `${PRODUCTS}/${encodeURIComponent(id)}/options`,
    {
      options: options.map((option) => ({
        name: option.name,
        values: option.values,
        sortOrder: option.sortOrder,
        // Only values the option offers, and only ones that cost something:
        // the API refuses a price keyed on anything else, and stores zero as
        // absent regardless.
        valuePrices: Object.fromEntries(
          Object.entries(option.valuePrices).filter(
            ([value, amount]) => option.values.includes(value) && amount > 0
          )
        ),
      })),
    }
  )
  return toProduct(updated)
}

// --- Pricing ------------------------------------------------------------------

function withPricing(
  product: Product,
  quote?: ApiQuotedLine
): EffectiveProduct {
  if (!quote) {
    // No quote for this line — it was unpriceable, or the caller has no
    // pricing visibility. List price, and say plainly that nothing was applied.
    return {
      ...product,
      effectivePrice: product.basePrice,
      discountPct: 0,
      isCustomPriced: false,
    }
  }

  const discountPct = Number(quote.discountPercent)

  return {
    ...product,
    effectivePrice: Number(quote.unitPrice),
    discountPct,
    ...(quote.rateCardName ? { rateCardName: quote.rateCardName } : {}),
    isCustomPriced: quote.rateCardId !== null,
  }
}

/** Quote limit on the API side. Kept in step deliberately. */
const QUOTE_BATCH_SIZE = 200

async function quoteAll(
  products: readonly Pick<ApiProduct, 'id' | 'moq'>[],
  accountId?: string
): Promise<Map<string, ApiQuotedLine>> {
  const quoted = new Map<string, ApiQuotedLine>()
  if (products.length === 0) return quoted

  for (let offset = 0; offset < products.length; offset += QUOTE_BATCH_SIZE) {
    const batch = products.slice(offset, offset + QUOTE_BATCH_SIZE)

    try {
      const response: { lines: ApiQuotedLine[] } = await apiClient.post(
        '/pricing/quote',
        {
          lines: batch.map((product) => ({
            productId: product.id,
            quantity: Math.max(1, product.moq),
          })),
          // Only an administrator may quote on another account's behalf; the API
          // ignores it for everyone else, who are always quoted against their own.
          ...(accountId ? { accountId } : {}),
        }
      )

      for (const line of response.lines) quoted.set(line.productId, line)
    } catch {
      // Pricing being unavailable must not empty the catalogue. The grid falls
      // back to list price, which is what `withPricing` does with no quote.
      return quoted
    }
  }

  return quoted
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 404
  )
}

export { toMoney }
