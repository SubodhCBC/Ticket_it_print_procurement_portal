// src/components/shop/cart/OrderTotals.tsx
'use client'

import { useQuery } from '@tanstack/react-query'
import { formatMoney, formatNumber } from '@/lib/format'
import { queryKeys } from '@/lib/query/queryKeys'
import { getSettings } from '@/services/data-source/api/api-settings.adapter'
import { useAuth } from '@/hooks/useAuth'

/**
 * What the note says when the account's GST convention is not readable here.
 *
 * True on either basis. The screens used to print a flat `Excl. tax
 * (On-Account)`, which is simply wrong for an account whose prices include
 * GST, and a buyer who memorises that figure then cannot reconcile it against
 * the invoice.
 */
const UNKNOWN_BASIS_NOTE = 'GST per account settings'

/**
 * How this account's prices relate to GST, in words.
 *
 * The convention is per-account (`pricesIncludeGst`, `gstRatePercent`), and the
 * monthly invoice already honours it — so the checkout has to say the same
 * thing rather than assert a basis nobody checked.
 *
 * `GET /settings` needs `ACCOUNT_MANAGE`, which a branch buyer does not hold.
 * The request is therefore only made by a reader who can actually make it; for
 * everyone else the note falls back to a line that is true either way instead
 * of a 403 and a guess. The query key and stale time match `useSettings`, so
 * this shares that cache rather than opening a second one.
 *
 * @param suffix Appended after a separator — "on account", say.
 */
export function useTaxBasisNote(suffix?: string): string {
  const { hasPermission } = useAuth()

  const { data } = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: getSettings,
    enabled: hasPermission('ACCOUNT_MANAGE'),
    staleTime: 5 * 60_000,
  })

  // Older builds omit the field entirely; absent is unknown, not false.
  const basis =
    data?.pricesIncludeGst === undefined
      ? UNKNOWN_BASIS_NOTE
      : withRate(
          data.pricesIncludeGst ? 'Incl. GST' : 'Excl. GST',
          data.gstRatePercent
        )

  return suffix ? `${basis} · ${suffix}` : basis
}

/** "Excl. GST (15%)" when the rate is known, "Excl. GST" when it is not. */
function withRate(basis: string, ratePercent: string | undefined): string {
  const rate = formatNumber(ratePercent, '')
  return rate === '' ? basis : `${basis} (${rate}%)`
}

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
