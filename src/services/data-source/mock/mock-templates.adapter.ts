// src/lib/data-source/mock/mock-templates.adapter.ts
import initialTemplates from './fixtures/templates.json'
import type { PrintTemplate, PaginatedResult } from '@/types'
import { simulateLatency, paginate } from './utils'

let templatesStore: PrintTemplate[] = JSON.parse(
  JSON.stringify(initialTemplates)
)

export async function list(params?: {
  page?: number
  pageSize?: number
  category?: string
  productId?: string
  status?: PrintTemplate['status'] | 'ALL'
  theme?: string
  search?: string
}): Promise<PaginatedResult<PrintTemplate>> {
  await simulateLatency()
  let results = [...templatesStore]

  if (params?.category && params.category !== 'All') {
    results = results.filter(
      (t) => t.category.toLowerCase() === params.category!.toLowerCase()
    )
  }

  if (params?.productId && params.productId !== 'All') {
    results = results.filter((t) => t.productId === params.productId)
  }

  if (params?.status && params.status !== 'ALL') {
    results = results.filter((t) => t.status === params.status)
  }

  if (params?.theme && params.theme !== 'All') {
    results = results.filter((t) => t.theme === params.theme)
  }

  if (params?.search) {
    const q = params.search.toLowerCase().trim()
    results = results.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.productName.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
    )
  }

  // Sort newest first
  results.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )

  return paginate(results, params?.page ?? 1, params?.pageSize ?? 24)
}

export async function getById(id: string): Promise<PrintTemplate | null> {
  await simulateLatency()
  const template = templatesStore.find((t) => t.id === id)
  return template ? JSON.parse(JSON.stringify(template)) : null
}

export async function create(
  input: Omit<PrintTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version'>
): Promise<PrintTemplate> {
  await simulateLatency()
  const now = new Date().toISOString()
  const newTemplate: PrintTemplate = {
    ...input,
    id: `tpl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    version: 1,
    createdAt: now,
    updatedAt: now,
  }

  templatesStore.unshift(newTemplate)
  return JSON.parse(JSON.stringify(newTemplate))
}

export async function update(
  id: string,
  input: Partial<PrintTemplate>
): Promise<PrintTemplate> {
  await simulateLatency()
  const idx = templatesStore.findIndex((t) => t.id === id)
  if (idx === -1) {
    throw new Error(`Template with ID "${id}" not found`)
  }

  const current = templatesStore[idx]
  const updated: PrintTemplate = {
    ...current,
    ...input,
    version: (current.version || 1) + 1,
    updatedAt: new Date().toISOString(),
  }

  templatesStore[idx] = updated
  return JSON.parse(JSON.stringify(updated))
}

export async function remove(id: string): Promise<void> {
  await simulateLatency()
  const idx = templatesStore.findIndex((t) => t.id === id)
  if (idx === -1) {
    throw new Error(`Template with ID "${id}" not found`)
  }
  templatesStore = templatesStore.filter((t) => t.id !== id)
}

export async function setStatus(
  id: string,
  status: PrintTemplate['status']
): Promise<PrintTemplate> {
  return update(id, { status })
}
