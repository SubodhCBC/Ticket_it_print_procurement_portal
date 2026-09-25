// src/hooks/useProducts.ts
'use client'

import { useEffect, useRef, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getProducts,
  getProductById,
  createProduct as createProductService,
  updateProduct as updateProductService,
  deleteProduct as deleteProductService,
  getProductCategories,
  bulkCreateProducts as bulkCreateService,
  updateProductStock as updateStockService,
  setProductOptions as setOptionsService,
  setProductOptionPrices as setOptionPricesService,
  getAdminProductDetail,
  changeCatalogProductStatus,
  adjustCatalogProductStock,
  createCatalogProductVariant,
  updateCatalogProductVariant,
  removeCatalogProductVariant,
  setCatalogProductVolumeTiers,
  setCatalogProductVisibility,
  uploadCatalogProductAsset,
  removeCatalogProductAsset,
  setCatalogProductOptionAxes,
  getCatalogCategories,
  createCatalogCategory,
  updateCatalogCategory,
  deactivateCatalogCategory,
  getCatalogCategoryVisibility,
  setCatalogCategoryVisibility,
  startCatalogImport,
  getCatalogImportJob,
  getCatalogImportJobs,
  reconcileCatalogStock,
  type ProductOptionInput,
} from '@/services/products.service'
import { queryKeys } from '@/lib/query/queryKeys'
import type { Product } from '@/types'
import type {
  AssetUploadStage,
  CatalogCategoryListParams,
  ChangeProductStatusInput,
  CreateCategoryInput,
  CreateVariantInput,
  ImportJob,
  ImportProductsInput,
  OptionAxisInput,
  ReconcileStockInput,
  StockAdjustmentInput,
  UpdateCategoryInput,
  UpdateVariantInput,
  UploadAssetInput,
  VisibilityInput,
  VolumeTierInput,
} from '@/types/catalog-admin'

/** Option name → value → what choosing it adds to one pack. */
export type OptionValuePrices = Record<string, Record<string, number>>

/**
 * Keys for the catalogue admin screens.
 *
 * Kept here rather than in `QueryProvider` so this module owns them. The
 * product and category keys sit under `['products', ...]` on purpose: every
 * existing product mutation invalidates that prefix, so an edit made from any
 * catalogue screen also refreshes these.
 */
const catalogAdminKeys = {
  adminProduct: (id: string) => ['products', 'admin-detail', id] as const,
  categories: (params?: CatalogCategoryListParams) =>
    ['products', 'categories', 'admin', params ?? {}] as const,
  importJobs: (params: { page: number; pageSize: number }) =>
    ['catalog-import-jobs', 'list', params] as const,
  importJob: (id: string) => ['catalog-import-jobs', 'detail', id] as const,
  categoryVisibility: (id: string) =>
    ['products', 'categories', 'visibility', id] as const,
}

const IMPORT_POLL_MS = 2_000

/** A job still QUEUED this long after it was created is probably not going to be picked up. */
const QUEUED_TOO_LONG_MS = 2 * 60_000

export function useProducts(
  params?: Parameters<typeof getProducts>[0],
  options?: {
    /**
     * Keep the page on screen while the next one loads. Opt-in, so screens
     * that treat a filter change as a fresh load keep doing so.
     */
    keepPreviousPage?: boolean
  }
) {
  const query = useQuery({
    queryKey: queryKeys.products(params),
    queryFn: () => getProducts(params),
    ...(options?.keepPreviousPage ? { placeholderData: keepPreviousData } : {}),
  })

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useProduct(id: string) {
  const query = useQuery({
    queryKey: queryKeys.product(id),
    queryFn: () => getProductById(id),
    enabled: Boolean(id),
  })

  return {
    product: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useProductCategories() {
  const query = useQuery({
    queryKey: queryKeys.categories(),
    queryFn: getProductCategories,
    // The taxonomy is eight rows that change about never, and half the
    // catalogue screens ask for it. Five minutes, not thirty seconds.
    staleTime: 5 * 60_000,
  })

  return {
    categories: query.data ?? [],
    isLoading: query.isPending,
    refetch: query.refetch,
  }
}

export function useProductMutations() {
  const client = useQueryClient()

  /**
   * Products, and the reports that count them.
   *
   * Categories too, because a product moving between them changes their item
   * counts — which is exactly the sort of second-order effect a hand-patched
   * cache gets wrong.
   */
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['products'] })
    void client.invalidateQueries({ queryKey: ['reports'] })
  }

  const create = useMutation({
    mutationFn: (input: Omit<Product, 'id'>) => createProductService(input),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: (vars: { id: string; input: Partial<Product> }) =>
      updateProductService(vars.id, vars.input),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteProductService(id),
    onSuccess: invalidate,
  })

  const bulkCreate = useMutation({
    mutationFn: (items: Omit<Product, 'id'>[]) => bulkCreateService(items),
    onSuccess: invalidate,
  })

  const adjustStock = useMutation({
    mutationFn: (vars: { id: string; deltaQty: number }) =>
      updateStockService(vars.id, vars.deltaQty),
    onSuccess: invalidate,
  })

  // The option set feeds variant prices, so the shop's quotes move with it —
  // the same `['products']` sweep covers the detail page and the grid.
  const setOptions = useMutation({
    mutationFn: (vars: { id: string; options: ProductOptionInput[] }) =>
      setOptionsService(vars.id, vars.options),
    onSuccess: invalidate,
  })

  const setOptionPrices = useMutation({
    mutationFn: (vars: { id: string; prices: OptionValuePrices }) =>
      setOptionPricesService(vars.id, vars.prices),
    onSuccess: invalidate,
  })

  return {
    isPending:
      create.isPending ||
      update.isPending ||
      remove.isPending ||
      bulkCreate.isPending ||
      adjustStock.isPending ||
      setOptions.isPending ||
      setOptionPrices.isPending,
    createProduct: (input: Omit<Product, 'id'>) => create.mutateAsync(input),
    updateProduct: (id: string, input: Partial<Product>) =>
      update.mutateAsync({ id, input }),
    deleteProduct: (id: string) => remove.mutateAsync(id),
    bulkCreateProducts: (items: Omit<Product, 'id'>[]) =>
      bulkCreate.mutateAsync(items),
    updateProductStock: (id: string, deltaQty: number) =>
      adjustStock.mutateAsync({ id, deltaQty }),
    setProductOptions: (id: string, options: ProductOptionInput[]) =>
      setOptions.mutateAsync({ id, options }),
    setProductOptionPrices: (id: string, prices: OptionValuePrices) =>
      setOptionPrices.mutateAsync({ id, prices }),
  }
}

// --- Catalogue administration ----------------------------------------------------

/**
 * The admin detail page's one read: the UI product and the admin view from a
 * single request.
 */
export function useAdminProduct(id: string) {
  const query = useQuery({
    queryKey: catalogAdminKeys.adminProduct(id),
    queryFn: () => getAdminProductDetail(id),
    enabled: Boolean(id),
  })

  return {
    product: query.data?.product ?? null,
    view: query.data?.view ?? null,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Every write the admin product page makes.
 *
 * Each resolves only after the product has been refetched (`onSuccess` returns
 * the invalidation), so a panel's pending state covers the refresh and the
 * screen never shows the old figures next to a success message. The mutation
 * responses are not written into the cache: they are rendered without
 * presigned asset links, and caching them would blank every image.
 */
export function useProductAdminMutations(productId: string) {
  const client = useQueryClient()

  const refresh = async () => {
    void client.invalidateQueries({ queryKey: ['reports'] })
    await client.invalidateQueries({ queryKey: ['products'] })
  }

  const changeStatus = useMutation({
    mutationFn: (input: ChangeProductStatusInput) =>
      changeCatalogProductStatus(productId, input),
    onSuccess: refresh,
  })

  const deleteDraft = useMutation({
    mutationFn: () => deleteProductService(productId),
    // No refetch of the detail — it is gone. The lists still need to drop it.
    onSuccess: () => {
      client.removeQueries({
        queryKey: catalogAdminKeys.adminProduct(productId),
      })
      void client.invalidateQueries({ queryKey: ['products'] })
    },
  })

  const adjustStock = useMutation({
    mutationFn: (input: StockAdjustmentInput) =>
      adjustCatalogProductStock(productId, input),
    onSuccess: refresh,
  })

  const createVariant = useMutation({
    mutationFn: (input: CreateVariantInput) =>
      createCatalogProductVariant(productId, input),
    onSuccess: refresh,
  })

  const updateVariant = useMutation({
    mutationFn: (vars: { variantId: string; input: UpdateVariantInput }) =>
      updateCatalogProductVariant(productId, vars.variantId, vars.input),
    onSuccess: refresh,
  })

  const removeVariant = useMutation({
    mutationFn: (variantId: string) =>
      removeCatalogProductVariant(productId, variantId),
    onSuccess: refresh,
  })

  const setOptionAxes = useMutation({
    mutationFn: (axes: OptionAxisInput[]) =>
      setCatalogProductOptionAxes(productId, axes),
    onSuccess: refresh,
  })

  const setVolumeTiers = useMutation({
    mutationFn: (tiers: VolumeTierInput[]) =>
      setCatalogProductVolumeTiers(productId, tiers),
    onSuccess: refresh,
  })

  const setVisibility = useMutation({
    mutationFn: (input: VisibilityInput) =>
      setCatalogProductVisibility(productId, input),
    onSuccess: refresh,
  })

  const uploadAsset = useMutation({
    mutationFn: (vars: {
      input: UploadAssetInput
      onStage?: (stage: AssetUploadStage) => void
    }) => uploadCatalogProductAsset(productId, vars.input, vars.onStage),
    onSuccess: refresh,
  })

  const removeAsset = useMutation({
    mutationFn: (assetId: string) =>
      removeCatalogProductAsset(productId, assetId),
    onSuccess: refresh,
  })

  return {
    changeStatus,
    deleteDraft,
    adjustStock,
    createVariant,
    updateVariant,
    removeVariant,
    setOptionAxes,
    setVolumeTiers,
    setVisibility,
    uploadAsset,
    removeAsset,
  }
}

/** The admin category table, with status and the empty-category switch. */
export function useCatalogCategories(params?: CatalogCategoryListParams) {
  const query = useQuery({
    queryKey: catalogAdminKeys.categories(params),
    queryFn: () => getCatalogCategories(params),
  })

  return {
    categories: query.data ?? [],
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useCategoryMutations() {
  const client = useQueryClient()

  // `['products']` covers both category lists and every product row that
  // prints a category name.
  const refresh = () => client.invalidateQueries({ queryKey: ['products'] })

  const create = useMutation({
    mutationFn: (input: CreateCategoryInput) => createCatalogCategory(input),
    onSuccess: refresh,
  })

  const update = useMutation({
    mutationFn: (vars: { id: string; input: UpdateCategoryInput }) =>
      updateCatalogCategory(vars.id, vars.input),
    onSuccess: refresh,
  })

  const deactivate = useMutation({
    mutationFn: (id: string) => deactivateCatalogCategory(id),
    onSuccess: refresh,
  })

  // Under `['products']`, so every product list refetches too: what a customer
  // sees in them depends on this.
  const setVisibility = useMutation({
    mutationFn: (vars: { id: string; input: VisibilityInput }) =>
      setCatalogCategoryVisibility(vars.id, vars.input),
    onSuccess: refresh,
  })

  return { create, update, deactivate, setVisibility }
}

/** A category's stored allow-list, fetched only while its editor is open. */
export function useCategoryVisibility(id: string | null) {
  const query = useQuery({
    queryKey: catalogAdminKeys.categoryVisibility(id ?? ''),
    queryFn: () => getCatalogCategoryVisibility(id!),
    enabled: id !== null,
  })

  return {
    data: query.data ?? null,
    isLoading: id !== null && query.isPending,
    error: query.error,
  }
}

export function useImportJobs(page: number, enabled = true, pageSize = 10) {
  const query = useQuery({
    queryKey: catalogAdminKeys.importJobs({ page, pageSize }),
    queryFn: () => getCatalogImportJobs({ page, pageSize }),
    enabled,
    // A running job's row changes under us; the detail poll refreshes this
    // when one finishes, so a short stale window is enough.
    staleTime: 5_000,
  })

  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Whether something will still change this job.
 *
 * A QUEUED row with `error` set was never handed to the queue (`enqueueImport`
 * records why and gives up), so nothing will ever pick it up. Polling it would
 * go on for as long as the page is open.
 */
function isRunning(job: Pick<ImportJob, 'status' | 'error'> | null): boolean {
  if (!job) return false
  if (job.status === 'RUNNING') return true
  return job.status === 'QUEUED' && !job.error
}

/**
 * True once a job has sat in QUEUED past `QUEUED_TOO_LONG_MS`.
 *
 * A timer rather than a clock read during render: an unchanged poll response
 * keeps the same data reference and does not re-render, so a `Date.now()` in
 * render would never notice the threshold passing.
 */
function useQueuedTooLong(job: ImportJob | null): boolean {
  const since = job?.status === 'QUEUED' && !job.error ? job.createdAt : null
  const [passedFor, setPassedFor] = useState<string | null>(null)

  useEffect(() => {
    if (!since) return
    const remaining =
      new Date(since).getTime() + QUEUED_TOO_LONG_MS - Date.now()
    const timer = setTimeout(() => setPassedFor(since), Math.max(0, remaining))
    return () => clearTimeout(timer)
  }, [since])

  return since !== null && passedFor === since
}

/**
 * One import job, polled while it is queued or running.
 *
 * Polling stops on a failed read: a 404 or 403 will not become true on the
 * next attempt, and the query's own retry policy has already covered a
 * transient failure by the time the status is `error`. The caller shows the
 * error with a retry (`refetch`), which resumes polling if the job is still
 * running.
 *
 * When a real (non-dry) run finishes, the product lists are invalidated once,
 * and the history list either way so its row stops saying RUNNING.
 */
export function useImportJob(jobId: string | null) {
  const client = useQueryClient()

  const query = useQuery({
    queryKey: catalogAdminKeys.importJob(jobId ?? ''),
    queryFn: () => getCatalogImportJob(jobId as string),
    enabled: Boolean(jobId),
    staleTime: 0,
    refetchInterval: (current) => {
      if (current.state.status === 'error') return false
      return !current.state.data || isRunning(current.state.data)
        ? IMPORT_POLL_MS
        : false
    },
  })

  const job = query.data ?? null
  const queuedTooLong = useQueuedTooLong(job)
  const settledFor = useRef<string | null>(null)

  useEffect(() => {
    if (!job || isRunning(job) || settledFor.current === job.id) return
    settledFor.current = job.id

    void client.invalidateQueries({
      queryKey: ['catalog-import-jobs', 'list'],
    })
    if (!job.dryRun && job.status === 'COMPLETED') {
      void client.invalidateQueries({ queryKey: ['products'] })
      void client.invalidateQueries({ queryKey: ['reports'] })
    }
  }, [client, job])

  return {
    job,
    isLoading: Boolean(jobId) && query.isPending,
    // `isPending` alone is true for a disabled query, hence the `jobId` check;
    // a failed read is not polling, whatever the last good status said.
    isPolling:
      Boolean(jobId) && !query.isError && (query.isPending || isRunning(job)),
    /** Still QUEUED after two minutes — the import worker may not be running. */
    queuedTooLong,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useCatalogImport() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: ImportProductsInput) => startCatalogImport(input),
    onSuccess: () =>
      client.invalidateQueries({ queryKey: ['catalog-import-jobs', 'list'] }),
  })
}

export function useStockReconcile() {
  const client = useQueryClient()

  return useMutation({
    mutationFn: (input: ReconcileStockInput) => reconcileCatalogStock(input),
    onSuccess: (report) => {
      if (report.dryRun) return
      void client.invalidateQueries({ queryKey: ['products'] })
      void client.invalidateQueries({ queryKey: ['reports'] })
    },
  })
}
