// src/components/shop/cart/CartLineSummary.tsx
'use client'

import Link from 'next/link'
import { Pencil, Trash2 } from 'lucide-react'
import type { CartItem } from '@/store/cartSlice'
import { readOrderBackName, readOrderPreview } from '@/lib/design/order-artwork'
import { LineChips } from './LineChips'
import { LineThumbnail } from './LineThumbnail'
import { formatMoney } from '@/lib/format'
import { packsAndUnits, priceBasis } from './line-format'

/**
 * One basket line, as the basket page, the cart drawer and the review step all
 * show it.
 *
 * A personalised line leads with the design: its thumbnail, the template's name
 * as the title and the product underneath, the options and back it prints
 * with, and the way back into the customiser. A plain line reads as before.
 *
 * - `page`: roomy row; quantity control and remove sit on the right.
 * - `drawer`: narrow panel; the controls drop under the details.
 * - `review`: read-only; the total alone on the right.
 *
 * Below 768px the `page` and `review` rows stack (`.stack-sm`): the picture and
 * the details read as a block, and the quantity, the line total and Remove sit
 * together on a full-width row under them. Nothing is dropped on a phone — a
 * line that loses its price or its remove control is not a shorter line, it is
 * a broken one.
 *
 * The quantity control is passed in rather than built here, so the line stays
 * a picture of the data and the screen keeps the behaviour.
 */
export function CartLineSummary({
  item,
  variant,
  quantityControl,
  onRemove,
  onEditDesign,
  noteControl,
}: {
  item: CartItem
  variant: 'page' | 'drawer' | 'review'
  quantityControl?: React.ReactNode
  onRemove?: () => void
  /** Called as the Edit design link is followed — the drawer closes itself. */
  onEditDesign?: () => void
  /** The line-note editor, on the basket page. */
  noteControl?: React.ReactNode
}) {
  const { product, template } = item
  const preview = readOrderPreview(item.customisation)
  const isDesign = template !== null

  const thumbSize = variant === 'page' ? 84 : variant === 'drawer' ? 56 : 52
  const quantityText = packsAndUnits(item.qty, product.packSize)
  const basis = priceBasis(product.packSize)

  const title = (
    <span
      style={{
        display: 'block',
        fontSize: '0.84rem',
        fontWeight: 600,
        color: '#2B253E',
        lineHeight: 1.3,
      }}
      className="truncate"
      title={isDesign ? template.name : product.name}
    >
      {isDesign ? template.name : product.name}
    </span>
  )

  const secondary = (
    <span
      style={{
        display: 'block',
        fontSize: '0.74rem',
        color: '#6E6781',
      }}
      className="truncate"
    >
      {isDesign && <span>{product.name} · </span>}
      <span style={{ fontFamily: 'monospace', color: '#A39BB3' }}>
        {product.sku}
      </span>
    </span>
  )

  const designStatus = isDesign ? (
    template.available ? (
      <Link
        href={`/shop/templates/customize/${template.id}?line=${item.id}`}
        onClick={onEditDesign}
        style={{
          alignSelf: 'flex-start',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          marginTop: variant === 'page' ? '2px' : 0,
          padding: variant === 'page' ? '4px 10px' : 0,
          borderRadius: '999px',
          backgroundColor: variant === 'page' ? '#FDE8F1' : 'transparent',
          fontSize: '0.76rem',
          fontWeight: 600,
          color: '#F73582',
          textDecoration: 'none',
        }}
      >
        {variant === 'page' && <Pencil size={12} />}
        Edit design
      </Link>
    ) : (
      // Red only when the design has gone, because then the colour means
      // something: checkout will refuse this line.
      <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#DC2626' }}>
        This design is no longer available
      </span>
    )
  ) : null

  const chips = (
    <LineChips
      options={item.options}
      backName={isDesign ? readOrderBackName(item.customisation) : null}
      showBack={isDesign}
    />
  )

  const priceLine = (
    <span style={{ fontSize: '0.76rem', color: '#6E6781' }}>
      {quantityText}
      <span style={{ color: '#A39BB3' }}>
        {' '}
        · {formatMoney(item.unitPrice)} / {basis}
      </span>
    </span>
  )

  const lineTotal = (
    <span
      style={{
        fontSize: variant === 'page' ? '0.9rem' : '0.84rem',
        fontWeight: 700,
        color: '#2B253E',
        display: 'block',
        whiteSpace: 'nowrap',
      }}
    >
      {formatMoney(item.lineTotal)}
    </span>
  )

  if (variant === 'drawer') {
    return (
      <div style={{ display: 'flex', gap: '12px', minWidth: 0 }}>
        <LineThumbnail
          preview={preview}
          src={product.thumbnailUrl}
          alt={isDesign ? template.name : product.name}
          size={thumbSize}
        />

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              {title}
              {secondary}
            </div>
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                title="Remove item"
                aria-label="Remove item"
                className="touch-target"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#A39BB3',
                  cursor: 'pointer',
                  backgroundColor: 'transparent',
                  border: 'none',
                  padding: '4px',
                  flexShrink: 0,
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>

          {chips}
          {designStatus}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              marginTop: '4px',
            }}
          >
            {quantityControl}
            <div style={{ textAlign: 'right', marginLeft: 'auto' }}>
              {lineTotal}
              <span
                style={{
                  fontSize: '0.72rem',
                  color: '#A39BB3',
                  whiteSpace: 'nowrap',
                }}
              >
                {quantityText}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    // `.stack-sm` is the whole phone story for a basket line: a row beside its
    // controls on a tablet and up, a block with the controls under it below
    // 768px. It owns display/align-items/gap, so they are not set inline.
    <div className="stack-sm" style={{ justifyContent: 'space-between' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '14px',
          minWidth: 0,
          flex: 1,
        }}
      >
        <LineThumbnail
          preview={preview}
          src={product.thumbnailUrl}
          alt={isDesign ? template.name : product.name}
          size={thumbSize}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            minWidth: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            {title}
            {secondary}
          </div>
          {chips}
          {priceLine}
          {/* Review is read-only: its way back is the "Edit Cart" link. */}
          {variant === 'page' && designStatus}
          {variant === 'page' && noteControl}
          {variant === 'review' && item.notes && (
            <span
              style={{
                fontSize: '0.76rem',
                color: '#6E6781',
                whiteSpace: 'pre-wrap',
                overflowWrap: 'anywhere',
              }}
            >
              <span style={{ fontWeight: 600, color: '#5C566E' }}>Note: </span>
              {item.notes}
            </span>
          )}
          {variant === 'review' && isDesign && !template.available && (
            <span
              style={{ fontSize: '0.76rem', fontWeight: 600, color: '#DC2626' }}
            >
              This design is no longer available
            </span>
          )}
        </div>
      </div>

      {/* Content-width and right-aligned beside the details; full width under
          them on a phone, where `space-between` reads as quantity on the left
          and the money on the right. */}
      <div
        className="row-wrap"
        style={{ justifyContent: 'space-between', flexShrink: 0 }}
      >
        {quantityControl}

        <div style={{ textAlign: 'right', minWidth: '90px' }}>
          {lineTotal}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="touch-target"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '4px',
                fontSize: '0.76rem',
                fontWeight: 600,
                // Grey, not red: removing one line is ordinary, and a red link
                // on every row made the list look like a list of errors.
                color: '#6E6781',
                cursor: 'pointer',
                border: 'none',
                backgroundColor: 'transparent',
                padding: '4px 0',
                marginTop: '4px',
              }}
            >
              <Trash2 size={12} />
              <span>Remove</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
