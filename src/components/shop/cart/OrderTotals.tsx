// src/components/shop/cart/OrderTotals.tsx
'use client'

import { formatMoney } from './line-format'

const row: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
  color: '#6E6781',
}

/**
 * Subtotal, shipping and total, as the server priced them.
 *
 * Used by the basket, every checkout step and the order screens, so a buyer
 * reads the same three lines in the same order wherever money is shown.
 * Nothing here computes a figure: the total is the server's, including
 * delivery.
 *
 * `shippingMethod` null means no method has been chosen yet, and the row says
 * what will happen instead of printing a zero that reads as free delivery.
 */
export function OrderTotals({
  subtotal,
  shippingMethod,
  shippingPrice,
  total,
  pendingShippingText = 'Calculated at checkout',
  totalLabel = 'Total',
  totalNote,
  leadingRows,
  extraRows,
  size = 'md',
}: {
  subtotal: number
  shippingMethod: string | null
  shippingPrice: number | null
  total: number
  pendingShippingText?: string
  totalLabel?: string
  totalNote?: React.ReactNode
  /** Rows that explain the subtotal — a catalogue price, a saving. */
  leadingRows?: React.ReactNode
  /** Rows that belong between shipping and the total — a budget position. */
  extraRows?: React.ReactNode
  size?: 'md' | 'lg'
}) {
  const hasShipping = shippingMethod !== null

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        fontSize: '0.8rem',
      }}
    >
      {leadingRows}

      <div style={row}>
        <span>Subtotal</span>
        <strong style={{ color: '#2B253E', fontWeight: 600 }}>
          {formatMoney(subtotal)}
        </strong>
      </div>

      <div style={row}>
        <span style={{ minWidth: 0 }}>
          Shipping
          {hasShipping && (
            <span
              style={{
                display: 'block',
                fontSize: '0.74rem',
                color: '#A39BB3',
                marginTop: '1px',
              }}
            >
              {shippingMethod}
            </span>
          )}
        </span>
        {hasShipping ? (
          <strong
            style={{ color: '#2B253E', fontWeight: 600, whiteSpace: 'nowrap' }}
          >
            {formatMoney(shippingPrice ?? 0)}
          </strong>
        ) : (
          <span
            style={{ color: '#A39BB3', fontWeight: 500, textAlign: 'right' }}
          >
            {pendingShippingText}
          </span>
        )}
      </div>

      {extraRows}

      <div
        style={{
          marginTop: '4px',
          paddingTop: '12px',
          borderTop: '1px solid #F5EEF2',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: '12px',
        }}
      >
        <div>
          <span
            style={{
              fontSize: '0.84rem',
              fontWeight: 600,
              color: '#2B253E',
              display: 'block',
            }}
          >
            {totalLabel}
          </span>
          {totalNote && (
            <span style={{ fontSize: '0.74rem', color: '#A39BB3' }}>
              {totalNote}
            </span>
          )}
        </div>
        <span
          style={{
            fontSize: size === 'lg' ? '1.1rem' : '1rem',
            fontWeight: 700,
            color: '#2B253E',
            whiteSpace: 'nowrap',
          }}
        >
          {formatMoney(total)}
        </span>
      </div>
    </div>
  )
}
