// src/components/shop/ProductAvailability.tsx
'use client'

import Link from 'next/link'
import { ArrowRight, PackageCheck, PackageX, AlertTriangle } from 'lucide-react'
import type { Product } from '@/types'
import { packCount } from './cart/line-format'

/**
 * What a buyer can still order of a stocked product.
 *
 * `stockRemaining` is the API's `availableStock` — on hand less what placed
 * orders have reserved — and is only set for products that track inventory.
 * Print-on-demand has no stock to speak of, so nothing renders for it.
 */
export function StockAvailability({
  product,
  size = 'sm',
}: {
  product: Pick<
    Product,
    'stockRemaining' | 'isLowStock' | 'lowStockThreshold' | 'uom'
  >
  size?: 'sm' | 'md'
}) {
  const remaining = product.stockRemaining
  if (remaining === undefined || remaining === null) return null

  const isOut = remaining <= 0
  const isLow =
    !isOut &&
    (product.isLowStock === true ||
      (product.lowStockThreshold !== undefined &&
        remaining <= product.lowStockThreshold))

  const tone = isOut
    ? { color: '#DC2626', background: '#FEF2F2' }
    : isLow
      ? { color: '#B45309', background: '#FFFBEB' }
      : { color: '#3F9C68', background: '#ECFDF5' }
  const Icon = isOut ? PackageX : isLow ? AlertTriangle : PackageCheck
  // What the number counts, said out loud. It is a count of PACKS — the thing
  // a buyer orders — and it is what is still available: on hand less what
  // placed orders have reserved. "120 in stock" read as pieces on a shelf, and
  // was neither.
  const available = packCount(remaining)
  const label = isOut
    ? 'Out of stock'
    : isLow
      ? `Low stock: ${available} available`
      : `${available} available`

  return (
    <span
      title={
        isOut
          ? 'No packs available to order'
          : `${available} to order — on hand, less what placed orders have reserved`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: size === 'md' ? '3px 10px' : '2px 8px',
        borderRadius: '9999px',
        fontSize: size === 'md' ? '0.76rem' : '0.7rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color: tone.color,
        backgroundColor: tone.background,
      }}
    >
      <Icon size={size === 'md' ? 13 : 11} />
      {label}
    </span>
  )
}

/**
 * Where a superseded product's replacement lives.
 *
 * Renders only when the API names a successor; a product withdrawn with no
 * replacement says nothing more than its status already does.
 */
export function SupersededNotice({
  supersededBy,
  compact = false,
}: {
  supersededBy: Product['supersededBy']
  compact?: boolean
}) {
  if (!supersededBy) return null

  return (
    <Link
      href={`/shop/catalogue/${encodeURIComponent(supersededBy.id)}`}
      className="touch-target"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: compact ? '0.74rem' : '0.8rem',
        fontWeight: 600,
        color: '#F73582',
        textDecoration: 'none',
        overflowWrap: 'anywhere',
      }}
    >
      <span>
        Replaced by {supersededBy.name}
        {!compact && (
          <span
            style={{
              fontFamily: 'monospace',
              fontWeight: 500,
              color: '#A39BB3',
            }}
          >
            {' '}
            ({supersededBy.sku})
          </span>
        )}
      </span>
      <ArrowRight size={compact ? 12 : 14} style={{ flexShrink: 0 }} />
    </Link>
  )
}
