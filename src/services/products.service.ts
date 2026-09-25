// src/lib/services/products.service.ts
import { getDataSource } from '@/services/data-source'
import type { ProductOptionInput } from '@/services/data-source/api/api-products.adapter'
import type {
  Product,
  ProductCategory,
  PaginatedResult,
  EffectiveProduct,
} from '@/types'
import type {
  AdminProductDetail,
  AdminProductView,
  AssetUploadStage,
  CatalogCategory,
  CatalogCategoryListParams,
  CategoryVisibilityDetail,
  ChangeProductStatusInput,
  CreateCategoryInput,
  CreateVariantInput,
  ImportJob,
  ImportProductsInput,
  OptionAxisInput,
  ReconcileStockInput,
  StockAdjustmentInput,
  StockAdjustmentResult,
  StockReconciliation,
  UpdateCategoryInput,
  UpdateVariantInput,
  UploadAssetInput,
  ImageFilenameInput,
  ImageFilenameMatch,
  VisibilityInput,
  VolumeTierInput,
} from '@/types/catalog-admin'

/**
 * These functions are thin: every write goes straight to the API, which
 * validates it, applies the tenant scope and writes its own audit entry
 * against the authenticated actor. There is deliberately no client-side
 * audit call — one would invent an actor and record a second, fictional
 * entry beside the real one.
 */

export async function getProducts(params?: {
  page?: number
  pageSize?: number
  categoryId?: string
  status?: Product['status']
  search?: string
  /** Defaults to true; pass false when no thumbnail is shown. */
  withThumbnails?: boolean
}): Promise<PaginatedResult<Product>> {
  const ds = getDataSource()
  return ds.products.list(params)
}

export async function getProductById(id: string): Promise<Product | null> {
  const ds = getDataSource()
  return ds.products.getById(id)
}

export async function getProductWithPricing(
  id: string,
  accountId?: string
): Promise<EffectiveProduct | null> {
  const ds = getDataSource()
  return ds.products.getByIdWithPricing(id, accountId)
}

export async function createProduct(
  input: Omit<Product, 'id'>
): Promise<Product> {
  const ds = getDataSource()
  const created = await ds.products.create(input)

  return created
}

export async function updateProduct(
  id: string,
  input: Partial<Product>
): Promise<Product> {
  const ds = getDataSource()
  const updated = await ds.products.update(id, input)

  return updated
}

export async function deleteProduct(id: string): Promise<void> {
  const ds = getDataSource()
  await ds.products.remove(id)
}

export async function getProductCategories(): Promise<ProductCategory[]> {
  const ds = getDataSource()
  return ds.products.listCategories()
}

export async function getVisibleProductsForAccount(
  accountId?: string,
  params?: {
    page?: number
    pageSize?: number
    categoryId?: string
    search?: string
    includeUnavailable?: boolean
  }
): Promise<PaginatedResult<EffectiveProduct>> {
  const ds = getDataSource()
  return ds.products.listVisibleForAccount(accountId, params)
}

export async function bulkCreateProducts(
  items: Omit<Product, 'id'>[]
): Promise<Product[]> {
  const ds = getDataSource()
  const createdList = await ds.products.bulkCreate(items)

  return createdList
}

/**
 * A signed stock movement. Resolves to the new shelf figure, not a product —
 * refetch the product for the rest of it.
 */
export async function updateProductStock(
  id: string,
  deltaQty: number,
  options?: { reason?: string; variantId?: string }
): Promise<StockAdjustmentResult> {
  const ds = getDataSource()
  return ds.products.updateStock(id, deltaQty, options)
}

// --- Catalogue administration ----------------------------------------------------
//
// Named with a `Catalog`/`Product` prefix because `@/services` re-exports every
// service with `export *`, and a bare `updateCategory` or `reconcileStock` is
// one rename away from colliding with another module.

export async function getAdminProductDetail(
  id: string
): Promise<AdminProductDetail | null> {
  return getDataSource().products.getAdminById(id)
}

export async function changeCatalogProductStatus(
  id: string,
  input: ChangeProductStatusInput
): Promise<AdminProductView> {
  return getDataSource().products.setStatus(id, input)
}

export async function adjustCatalogProductStock(
  id: string,
  input: StockAdjustmentInput
): Promise<StockAdjustmentResult> {
  return getDataSource().products.updateStock(id, input.delta, {
    reason: input.reason,
    ...(input.variantId ? { variantId: input.variantId } : {}),
  })
}

export async function createCatalogProductVariant(
  id: string,
  input: CreateVariantInput
): Promise<AdminProductView> {
  return getDataSource().products.createVariant(id, input)
}

export async function updateCatalogProductVariant(
  id: string,
  variantId: string,
  input: UpdateVariantInput
): Promise<AdminProductView> {
  return getDataSource().products.updateVariant(id, variantId, input)
}

export async function removeCatalogProductVariant(
  id: string,
  variantId: string
): Promise<void> {
  return getDataSource().products.removeVariant(id, variantId)
}

export async function setCatalogProductVolumeTiers(
  id: string,
  tiers: VolumeTierInput[]
): Promise<AdminProductView> {
  return getDataSource().products.setVolumeTiers(id, tiers)
}

export async function setCatalogProductVisibility(
  id: string,
  input: VisibilityInput
): Promise<AdminProductView> {
  return getDataSource().products.setVisibility(id, input)
}

/**
 * Stores a product file, then attaches it.
 *
 * Into the image library (see `@/services/asset-storage`), then attach — two
 * calls because the row must not claim a file that never finished uploading.
 * `onStage` lets the screen say which step it is waiting on.
 */
export async function uploadCatalogProductAsset(
  id: string,
  input: UploadAssetInput,
  onStage?: (stage: AssetUploadStage) => void
): Promise<AdminProductView> {
  const ds = getDataSource()
  const contentType = input.file.type || 'application/octet-stream'
  const details = {
    filename: input.file.name,
    contentType,
    sizeBytes: input.file.size,
    kind: input.kind,
    ...(input.altText ? { altText: input.altText } : {}),
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  }
  const { damFolderForProduct, storeOwnedFileInDam } =
    await import('@/services/asset-storage')

  onStage?.('uploading-library')
  const stored = await storeOwnedFileInDam(input.file, {
    fileName: input.file.name,
    folderPath: damFolderForProduct(id),
  })
  onStage?.('attaching')
  return ds.products.attachDamAsset(id, {
    damDocumentId: stored.damDocumentId,
    damUrl: stored.damUrl,
    ...details,
    contentType: stored.contentType,
  })
}

/**
 * Downloads the catalogue as CSV, filtered as the product list is (SOW M-13).
 * Resolves with the file to save; the name carries the day it was taken.
 */
export async function exportCatalogProducts(params?: {
  categoryId?: string
  status?: string
  search?: string
}): Promise<{ blob: Blob; filename: string }> {
  const blob = await getDataSource().products.exportCsv(params)
  const day = new Date().toISOString().slice(0, 10)
  return { blob, filename: `products-${day}.csv` }
}

/**
 * The bulk import template (SOW M-13), from the server. Built here from the
 * same column list when the server does not serve it yet (404), so the button
 * works before the endpoint is deployed; any other failure is reported.
 */
export async function downloadProductImportTemplate(): Promise<{
  blob: Blob
  filename: string
}> {
  const { IMPORT_TEMPLATE_CSV, IMPORT_TEMPLATE_FILENAME } =
    await import('@/components/admin/productImportTemplate')
  try {
    const blob = await getDataSource().products.importTemplateCsv()
    return { blob, filename: IMPORT_TEMPLATE_FILENAME }
  } catch (error) {
    const { toApiError } = await import('@/services/api.service')
    if (toApiError(error).status !== 404) throw error
    return {
      // A byte-order mark, so Excel opens the file as UTF-8.
      blob: new Blob(['\uFEFF' + IMPORT_TEMPLATE_CSV], {
        type: 'text/csv;charset=utf-8',
      }),
      filename: IMPORT_TEMPLATE_FILENAME,
    }
  }
}

/** How many file names go in one matcher call; the server takes up to 500. */
const IMAGE_MATCH_BATCH = 500

/**
 * Resolves image file names to products by the SKU in each name, in batches the
 * server accepts. Results come back in the order the files were given.
 */
export async function matchCatalogImageFilenames(
  files: ImageFilenameInput[]
): Promise<ImageFilenameMatch[]> {
  const ds = getDataSource()
  const matches: ImageFilenameMatch[] = []
  for (let i = 0; i < files.length; i += IMAGE_MATCH_BATCH) {
    matches.push(
      ...(await ds.products.matchImageFilenames(
        files.slice(i, i + IMAGE_MATCH_BATCH)
      ))
    )
  }
  return matches
}

export async function removeCatalogProductAsset(
  id: string,
  assetId: string
): Promise<void> {
  return getDataSource().products.removeAsset(id, assetId)
}

/**
 * Replaces the option axes — names, values and order — keeping each surviving
 * value's surcharge. Read fresh for the same reason as `setProductOptionPrices`.
 */
export async function setCatalogProductOptionAxes(
  productId: string,
  axes: OptionAxisInput[]
): Promise<Product> {
  const ds = getDataSource()
  const current = await ds.products.getOptions(productId)
  const byName = new Map(current.map((option) => [option.name, option]))

  return ds.products.setOptions(
    productId,
    axes.map((axis, index) => {
      const existing = byName.get(axis.name)
      return {
        name: axis.name,
        values: axis.values,
        sortOrder: index,
        valuePrices: Object.fromEntries(
          axis.values.map((value) => [value, existing?.valuePrices[value] ?? 0])
        ),
      }
    })
  )
}

export async function getCatalogCategories(
  params?: CatalogCategoryListParams
): Promise<CatalogCategory[]> {
  return getDataSource().products.listCategoriesAdmin(params)
}

export async function createCatalogCategory(
  input: CreateCategoryInput
): Promise<ProductCategory> {
  return getDataSource().products.createCategory({
    code: input.code,
    name: input.name,
    description: input.description ?? '',
    ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
  })
}

export async function updateCatalogCategory(
  id: string,
  input: UpdateCategoryInput
): Promise<CatalogCategory> {
  return getDataSource().products.updateCategory(id, input)
}

export async function getCatalogCategoryVisibility(
  id: string
): Promise<CategoryVisibilityDetail> {
  return getDataSource().products.getCategoryVisibility(id)
}

export async function setCatalogCategoryVisibility(
  id: string,
  input: VisibilityInput
): Promise<CatalogCategory> {
  return getDataSource().products.setCategoryVisibility(id, input)
}

export async function deactivateCatalogCategory(id: string): Promise<void> {
  return getDataSource().products.deactivateCategory(id)
}

export async function startCatalogImport(
  input: ImportProductsInput
): Promise<ImportJob> {
  return getDataSource().products.importProducts(input)
}

export async function getCatalogImportJob(jobId: string): Promise<ImportJob> {
  return getDataSource().products.getImportJob(jobId)
}

export async function getCatalogImportJobs(params?: {
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<ImportJob>> {
  return getDataSource().products.listImportJobs(params)
}

export async function reconcileCatalogStock(
  input: ReconcileStockInput
): Promise<StockReconciliation> {
  return getDataSource().products.reconcileStock(input)
}

export type { ProductOptionInput }

/** Replaces the product's whole option set — names, values, order and prices. */
export async function setProductOptions(
  productId: string,
  options: ProductOptionInput[]
): Promise<Product> {
  const ds = getDataSource()
  return ds.products.setOptions(productId, options)
}

/**
 * Surcharges only: option name → value → amount per pack.
 *
 * The option set is read fresh and sent back unchanged apart from the prices.
 * `Product.optionAxes` carries no sort order, and a replace-all built from a
 * page loaded minutes ago would quietly undo anything changed since. A value
 * with no edited price keeps the one it has; a price for a value the option no
 * longer offers is dropped rather than refused.
 */
export async function setProductOptionPrices(
  productId: string,
  prices: Record<string, Record<string, number>>
): Promise<Product> {
  const ds = getDataSource()
  const current = await ds.products.getOptions(productId)

  const options = current.map((option) => {
    const edited = prices[option.name] ?? {}
    return {
      ...option,
      valuePrices: Object.fromEntries(
        option.values.map((value) => [
          value,
          edited[value] ?? option.valuePrices[value] ?? 0,
        ])
      ),
    }
  })

  return ds.products.setOptions(productId, options)
}
