import type { CategoryWithCount } from './categories.service'

export interface CategoryView {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly description: string | null
  readonly sortOrder: number
  readonly status: CategoryWithCount['status']
  /** ALL_ACCOUNTS or RESTRICTED. The allow-list itself is its own endpoint. */
  readonly visibility: CategoryWithCount['visibility']
  readonly itemCount: number
}

export function toCategoryView(category: CategoryWithCount): CategoryView {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    description: category.description,
    sortOrder: category.sortOrder,
    status: category.status,
    visibility: category.visibility,
    // Named `itemCount` rather than `productCount` to match the field the admin
    // catalogue screen already reads.
    itemCount: category._count.products,
  }
}
