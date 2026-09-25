import initialProducts from './fixtures/products.json'
import initialCategories from './fixtures/categories.json'
import type {
  Product,
  ProductCategory,
  PaginatedResult,
  EffectiveProduct,
} from '@/types'
import { calculateItemPrice } from './mock-pricing.adapter'
import { simulateLatency, paginate } from './utils'

let productsStore: Product[] = [...(initialProducts as Product[])]
let categoriesStore: ProductCategory[] = [
  ...(initialCategories as ProductCategory[]),
]

export async function list(params?: {
  page?: number
  pageSize?: number
  categoryId?: string
  status?: Product['status']
  search?: string
}): Promise<PaginatedResult<Product>> {
  await simulateLatency()
  let results = [...productsStore]

  if (params?.categoryId && params.categoryId !== 'All') {
    results = results.filter((p) => p.categoryId === params.categoryId)
  }

  if (params?.status) {
    results = results.filter((p) => p.status === params.status)
  }

  if (params?.search) {
    const q = params.search.toLowerCase().trim()
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q))
    )
  }

  return paginate(results, params?.page ?? 1, params?.pageSize ?? 20)
}

export async function getById(id: string): Promise<Product | null> {
  await simulateLatency()
  const product = productsStore.find((p) => p.id === id || p.sku === id)
  return product ? { ...product } : null
}

export async function create(input: Omit<Product, 'id'>): Promise<Product> {
  await simulateLatency()
  const newProduct: Product = {
    ...input,
    id: `prod-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  productsStore.unshift(newProduct)
  return { ...newProduct }
}

export async function update(
  id: string,
  input: Partial<Product>
): Promise<Product> {
  await simulateLatency()
  const idx = productsStore.findIndex((p) => p.id === id)
  if (idx === -1) {
    throw new Error(`Product with ID "${id}" not found`)
  }

  productsStore[idx] = {
    ...productsStore[idx],
    ...input,
    updatedAt: new Date().toISOString(),
  }

  return { ...productsStore[idx] }
}

export async function remove(id: string): Promise<void> {
  await simulateLatency()
  const idx = productsStore.findIndex((p) => p.id === id)
  if (idx === -1) {
    throw new Error(`Product with ID "${id}" not found`)
  }
  productsStore = productsStore.filter((p) => p.id !== id)
}

export async function listVisibleForAccount(
  accountId?: string,
  params?: {
    page?: number
    pageSize?: number
    categoryId?: string
    search?: string
    includeUnavailable?: boolean
  }
): Promise<PaginatedResult<EffectiveProduct>> {
  await simulateLatency()
  let results = [...productsStore]

  // If includeUnavailable is false, we keep products that are active, or if true, we include all so UI can show disabled state
  if (params?.categoryId && params.categoryId !== 'All') {
    results = results.filter((p) => p.categoryId === params.categoryId)
  }

  if (params?.search) {
    const q = params.search.toLowerCase().trim()
    results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        (p.categoryName && p.categoryName.toLowerCase().includes(q))
    )
  }

  // Calculate pricing for each product
  const effectiveItems: EffectiveProduct[] = await Promise.all(
    results.map(async (p) => {
      const pricing = await calculateItemPrice(p.id, p.basePrice, accountId)
      return {
        ...p,
        effectivePrice: pricing.effectivePrice,
        discountPct: pricing.discountPct,
        rateCardName: pricing.rateCardName,
        isCustomPriced: pricing.discountPct > 0 || !!pricing.rateCardName,
      }
    })
  )

  return paginate(effectiveItems, params?.page ?? 1, params?.pageSize ?? 24)
}

export async function getByIdWithPricing(
  id: string,
  accountId?: string
): Promise<EffectiveProduct | null> {
  await simulateLatency()
  const product = productsStore.find((p) => p.id === id || p.sku === id)
  if (!product) return null

  const pricing = await calculateItemPrice(
    product.id,
    product.basePrice,
    accountId
  )
  return {
    ...product,
    effectivePrice: pricing.effectivePrice,
    discountPct: pricing.discountPct,
    rateCardName: pricing.rateCardName,
    isCustomPriced: pricing.discountPct > 0 || !!pricing.rateCardName,
  }
}

export async function listCategories(): Promise<ProductCategory[]> {
  await simulateLatency()
  return categoriesStore.map((cat) => ({
    ...cat,
    itemCount: productsStore.filter((p) => p.categoryId === cat.id).length,
  }))
}

export async function createCategory(
  input: Omit<ProductCategory, 'id' | 'itemCount'>
): Promise<ProductCategory> {
  await simulateLatency()
  const newCategory: ProductCategory = {
    ...input,
    id: `cat-${input.code.toLowerCase()}`,
    itemCount: 0,
  }
  categoriesStore.push(newCategory)
  return { ...newCategory }
}

export async function bulkCreate(
  items: Omit<Product, 'id'>[]
): Promise<Product[]> {
  await simulateLatency()
  const createdList: Product[] = items.map((input, idx) => ({
    ...input,
    id: `prod-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 5)}`,
    stockRemaining: input.stockRemaining ?? 100,
    lowStockThreshold: input.lowStockThreshold ?? 15,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }))

  productsStore = [...createdList, ...productsStore]
  return createdList
}

export async function updateStock(
  id: string,
  deltaQty: number
): Promise<Product> {
  await simulateLatency()
  const idx = productsStore.findIndex((p) => p.id === id)
  if (idx === -1) {
    throw new Error(`Product with ID "${id}" not found`)
  }

  const currentStock = productsStore[idx].stockRemaining ?? 100
  const newStock = Math.max(0, currentStock + deltaQty)

  productsStore[idx] = {
    ...productsStore[idx],
    stockRemaining: newStock,
    updatedAt: new Date().toISOString(),
  }

  return { ...productsStore[idx] }
}
