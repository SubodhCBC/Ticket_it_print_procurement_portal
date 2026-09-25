// src/components/shop/stock-label.ts
import type { Product } from '@/types'
import { formatNumber } from '@/lib/format'

/**
 * What a buyer can still order, in words. Null when stock is not counted —
 * print-on-demand has no shelf to run out of, so it says nothing.
 */
export function stockLabel(product: Product): {
  text: string
  color: string
} | null {
  if (!product.trackInventory || product.stockRemaining === undefined)
    return null
  const left = product.stockRemaining
  if (left <= 0) return { text: 'Out of stock', color: '#DC2626' }
  if (product.isLowStock)
    return {
      text: `Low stock · ${formatNumber(left)} left`,
      color: '#B45309',
    }
  return { text: 'In stock', color: '#047857' }
}
