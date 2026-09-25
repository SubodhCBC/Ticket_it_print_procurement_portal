// src/components/shop/ReorderButton.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, RotateCcw, XCircle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import { toApiError } from '@/services/api.service'
import { reorderOrder } from '@/services/orders.service'
import type {
  ApiReorderLine,
  ApiReorderReasonCode,
} from '@/services/data-source/api/governance.types'

/** What a buyer can do about a line that did not go back in. */
const REASON_HINTS: Partial<Record<ApiReorderReasonCode, string>> = {
  DESIGN_REQUIRED:
    'Choose a design for this item from the template gallery, then add it to your basket.',
  DESIGN_WITHDRAWN:
    'The design is no longer published. Pick a current design from the template gallery.',
}

/**
 * One-click re-order (SOW M-08).
 *
 * Puts the order's lines back in the basket — the basket is added to, never
 * replaced — priced at today's prices, and then says line by line what went in
 * and what did not, with the reason and, for a replaced product, a link to its
 * successor. Nothing is substituted on the buyer's behalf.
 *
 * Hidden without ORDER_CREATE: the API needs it, and a button that can only
 * ever be refused is worse than no button.
 */
export function ReorderButton({
  orderId,
  orderNumber,
  compact = false,
}: {
  orderId: string
  orderNumber?: string
  /** A small link-style button, for a table row. */
  compact?: boolean
}) {
  const { hasPermission } = useAuth()
  const { reload } = useCart()
  const [pending, setPending] = useState(false)
  const [lines, setLines] = useState<ApiReorderLine[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!hasPermission('ORDER_CREATE')) return null

  const reorder = async () => {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      const result = await reorderOrder(orderId)
      setLines(result.lines)
      // The basket changed on the server; the header count and drawer follow.
      if (result.lines.some((line) => line.outcome === 'ADDED')) void reload()
    } catch (err) {
      setLines(null)
      setError(toApiError(err).message || 'This order could not be re-ordered.')
    } finally {
      setPending(false)
    }
  }

  const added = lines?.filter((line) => line.outcome === 'ADDED') ?? []
  const notAdded = lines?.filter((line) => line.outcome !== 'ADDED') ?? []
  const isOpen = lines !== null || error !== null
  const close = () => {
    setLines(null)
    setError(null)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void reorder()}
        disabled={pending}
        title="Put this order's items back in your basket at today's prices"
        style={
          compact
            ? {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                border: 'none',
                background: 'transparent',
                color: '#F73582',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: pending ? 'wait' : 'pointer',
                padding: 0,
                whiteSpace: 'nowrap',
              }
            : {
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid transparent',
                backgroundColor: '#F73582',
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: pending ? 'wait' : 'pointer',
                opacity: pending ? 0.7 : 1,
              }
        }
      >
        <RotateCcw size={14} />
        {pending ? 'Re-ordering…' : 'Re-order'}
      </button>

      <Modal
        isOpen={isOpen}
        onClose={close}
        title={orderNumber ? `Re-order ${orderNumber}` : 'Re-order this order'}
        maxWidth="560px"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error ? (
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#B91C1C' }}>
              {error}
            </p>
          ) : (
            <p style={{ margin: 0, fontSize: '0.84rem', color: '#2B253E' }}>
              {added.length > 0
                ? `${added.length} of ${lines?.length ?? 0} item${(lines?.length ?? 0) === 1 ? '' : 's'} added to your basket at today's prices.`
                : 'None of the items could be added to your basket.'}
            </p>
          )}

          {lines && lines.length > 0 && (
            <ul
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '360px',
                overflowY: 'auto',
              }}
            >
              {[...added, ...notAdded].map((line) => {
                const ok = line.outcome === 'ADDED'
                const hint = line.reasonCode
                  ? REASON_HINTS[line.reasonCode]
                  : undefined
                return (
                  <li
                    key={line.orderLineId}
                    style={{
                      display: 'flex',
                      gap: '10px',
                      padding: '10px 12px',
                      borderRadius: '10px',
                      border: '1px solid #F0E6EC',
                      backgroundColor: ok ? '#FFFFFF' : '#FFFBF5',
                      fontSize: '0.8rem',
                    }}
                  >
                    {ok ? (
                      <CheckCircle2
                        size={16}
                        color="#047857"
                        style={{ flexShrink: 0, marginTop: '1px' }}
                      />
                    ) : (
                      <XCircle
                        size={16}
                        color="#B45309"
                        style={{ flexShrink: 0, marginTop: '1px' }}
                      />
                    )}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, color: '#2B253E' }}>
                        {line.name}{' '}
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 400,
                            color: '#A39BB3',
                          }}
                        >
                          {line.sku}
                        </span>
                      </div>
                      <div style={{ color: '#6E6781' }}>
                        Quantity {line.quantity}
                        {ok ? ' · added' : ''}
                      </div>
                      {!ok && line.reason && (
                        <div style={{ color: '#B45309', marginTop: '2px' }}>
                          {line.reason}
                        </div>
                      )}
                      {!ok && hint && (
                        <div style={{ color: '#6E6781', marginTop: '2px' }}>
                          {hint}
                        </div>
                      )}
                      {line.replacedBy && (
                        <Link
                          href={`/shop/catalogue/${line.replacedBy.productId}`}
                          onClick={close}
                          style={{
                            display: 'inline-block',
                            marginTop: '4px',
                            color: '#F73582',
                            fontWeight: 600,
                            textDecoration: 'none',
                          }}
                        >
                          View {line.replacedBy.sku} — {line.replacedBy.name}
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
          >
            {notAdded.some(
              (line) =>
                line.reasonCode === 'DESIGN_REQUIRED' ||
                line.reasonCode === 'DESIGN_WITHDRAWN'
            ) && (
              <Link
                href="/shop/templates"
                onClick={close}
                style={secondaryLink}
              >
                Template gallery
              </Link>
            )}
            <button type="button" onClick={close} style={secondaryLink}>
              Close
            </button>
            {added.length > 0 && (
              <Link href="/shop/cart" onClick={close} style={primaryLink}>
                Go to basket
              </Link>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

const secondaryLink: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '8px 14px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  fontSize: '0.82rem',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
}

const primaryLink: React.CSSProperties = {
  ...secondaryLink,
  border: '1px solid transparent',
  backgroundColor: '#F73582',
  color: '#FFFFFF',
}
