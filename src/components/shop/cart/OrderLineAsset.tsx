// src/components/shop/cart/OrderLineAsset.tsx
'use client'

import type { OrderLineItem } from '@/types'
import {
  ORDER_RESERVED_KEYS,
  readOrderBackName,
  readOrderPreview,
} from '@/lib/design/order-artwork'
import { LineChips } from './LineChips'
import { LineThumbnail } from './LineThumbnail'
import { packsAndUnits } from './line-format'

/**
 * Whether an order line was made from a design.
 *
 * The order snapshot does not always name its template, but a personalised
 * line always carries the reserved artwork keys alongside its wording.
 */
function isDesignLine(line: OrderLineItem): boolean {
  if (line.templateId) return true
  const values = line.customizations ?? {}
  return ORDER_RESERVED_KEYS.some((key) => key in values)
}

/**
 * The "item" cell of an order line: the design's thumbnail when it has one, the
 * name, and the options and back it was ordered with.
 */
export function OrderLineAsset({
  line,
  showQuantity = false,
}: {
  line: OrderLineItem
  /** Adds "2 packs · 200 units" under the name. */
  showQuantity?: boolean
}) {
  const design = isDesignLine(line)
  const preview = readOrderPreview(line.customizations)
  const title = line.templateName ?? line.productName

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
      <LineThumbnail
        preview={preview}
        src={line.thumbnailUrl}
        alt={title}
        size={44}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          minWidth: 0,
        }}
      >
        <div>
          <span
            style={{
              display: 'block',
              fontWeight: 600,
              color: '#2B253E',
              lineHeight: 1.3,
            }}
          >
            {title}
          </span>
          {line.templateName && (
            <span
              style={{
                display: 'block',
                fontSize: '0.74rem',
                fontWeight: 400,
                color: '#6E6781',
              }}
            >
              {line.productName}
            </span>
          )}
          {showQuantity && (
            <span
              style={{
                display: 'block',
                fontSize: '0.74rem',
                fontWeight: 400,
                color: '#A39BB3',
              }}
            >
              {packsAndUnits(line.qty, line.packSize)}
            </span>
          )}
        </div>
        <LineChips
          options={line.options}
          backName={design ? readOrderBackName(line.customizations) : null}
          showBack={design}
        />
      </div>
    </div>
  )
}
