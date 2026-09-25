// src/lib/data-source/mock/utils.ts

/**
 * Simulates realistic network and DB query latency.
 * Forces components and hooks to render skeletons and handle loading states properly.
 */
export const simulateLatency = (ms = 250): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms + Math.random() * 150))

export function paginate<T>(
  items: T[],
  page = 1,
  pageSize = 20
): {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
} {
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const validPage = Math.max(1, Math.min(page, totalPages))
  const start = (validPage - 1) * pageSize
  const paginatedItems = items.slice(start, start + pageSize)

  return {
    items: paginatedItems,
    total,
    page: validPage,
    pageSize,
    totalPages,
  }
}
