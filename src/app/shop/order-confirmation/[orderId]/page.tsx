// src/app/shop/order-confirmation/[orderId]/page.tsx
'use client'

import { SkeletonDetail } from '@/components/ui/Skeleton'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { toApiError } from '@/services'
import { getOrderById } from '@/services/orders.service'
import { useCart } from '@/hooks/useCart'
import type { Order } from '@/types'
import { OrderStatusBadge } from '@/components/shop/OrderStatusBadge'
import { OrderLineAsset } from '@/components/shop/cart/OrderLineAsset'
import {
  OrderTotals,
  useTaxBasisNote,
} from '@/components/shop/cart/OrderTotals'
import { formatDate, formatMoney, formatDateTime } from '@/lib/format'
import {
  PAYMENT_METHOD_LABELS,
  STANDARD_DELIVERY_LABEL,
} from '@/components/shop/cart/line-format'
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Printer,
  ArrowRight,
  ShoppingBag,
  FileText,
} from 'lucide-react'

/**
 * A confirmation screen only has to say three things: it worked, here is the
 * order, here is what it contains. It used to say them with a ringed 76px check
 * disc, a green pill, five bordered reference tiles and a dark gradient panel
 * with pink numbered discs — which made the page about the celebration rather
 * than the order. The information is unchanged; the ceremony is gone.
 */

/** The shared card: hairline border and a soft shadow. */
const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: '1px solid #F0E6EC',
}

const cardTitle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#2B253E',
  margin: 0,
  letterSpacing: '-0.01em',
}

const fieldLabel: React.CSSProperties = {
  fontSize: '0.76rem',
  fontWeight: 500,
  color: '#A39BB3',
  display: 'block',
}

const fieldValue: React.CSSProperties = {
  color: '#2B253E',
  fontSize: '0.84rem',
  fontWeight: 600,
  display: 'block',
  marginTop: '2px',
}

const stepNumber: React.CSSProperties = {
  width: '20px',
  height: '20px',
  borderRadius: '50%',
  backgroundColor: '#F5EEF2',
  color: '#5C566E',
  fontWeight: 600,
  fontSize: '0.72rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}

const stepTitle: React.CSSProperties = {
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#2B253E',
  margin: 0,
}

const stepText: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#6E6781',
  lineHeight: 1.5,
  margin: 0,
}

const secondaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
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

const primaryButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  borderRadius: '10px',
  border: 'none',
  backgroundColor: '#F73582',
  color: '#FFFFFF',
  fontSize: '0.82rem',
  fontWeight: 600,
  textDecoration: 'none',
}

export default function OrderConfirmationPage() {
  const params = useParams()
  const orderId = params?.orderId as string

  const { reload } = useCart()

  // The figure a buyer remembers has to reconcile with the invoice, so the
  // total says which GST basis it is on rather than leaving it unstated.
  const taxNote = useTaxBasisNote('on account')
  const [order, setOrder] = useState<Order | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  /** Bumped by "Try again"; part of what a load answers for. */
  const [attempt, setAttempt] = useState(0)
  const loadKey = `${orderId}|${attempt}`
  const [loadedKey, setLoadedKey] = useState<string | null>(null)
  const isLoading = loadedKey !== loadKey

  // Placing the order emptied the local basket and paused loading it, so the
  // checkout guard would not bounce the buyer on the way here. This is where
  // that window ends: the next basket — a fresh, empty one — loads now, and the
  // header's cart count stops reading from a closed cart.
  const resumed = useRef(false)
  useEffect(() => {
    if (resumed.current) return
    resumed.current = true
    void reload()
  }, [reload])

  // State is only set once the answer is in; "loading" is derived above from
  // whether this order and attempt have been answered yet.
  useEffect(() => {
    if (!orderId) return
    let cancelled = false
    getOrderById(orderId)
      .then((res) => {
        if (cancelled) return
        setOrder(res)
        setLoadError(
          res
            ? null
            : 'This order could not be found, or it is not visible to your account.'
        )
      })
      .catch((err) => {
        if (!cancelled) setLoadError(toApiError(err).message)
      })
      .finally(() => {
        if (!cancelled) setLoadedKey(loadKey)
      })
    return () => {
      cancelled = true
    }
  }, [orderId, loadKey])

  const handlePrint = () => {
    window.print()
  }

  if (isLoading) {
    return <SkeletonDetail label="Loading your order" />
  }

  // A failed read is not a placed order. This used to say "Order Placed"
  // whatever went wrong — including for an id that never existed.
  if (!order) {
    return (
      <div
        style={{
          ...card,
          padding: '32px 24px',
          textAlign: 'center',
          maxWidth: '440px',
          margin: '48px auto',
        }}
      >
        <AlertCircle
          size={18}
          color="#DC2626"
          style={{ marginBottom: '8px' }}
        />
        <h3
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            color: '#2B253E',
            margin: '0 0 6px 0',
          }}
        >
          We couldn&apos;t load this order
        </h3>
        <p
          style={{
            fontSize: '0.84rem',
            color: '#6E6781',
            margin: '0 0 16px 0',
            lineHeight: 1.5,
          }}
        >
          {loadError ?? 'Something went wrong while loading the order.'} If you
          have just placed it, it will be in your order history.
        </p>
        <div className="row-wrap" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="touch-target"
            onClick={() => setAttempt((n) => n + 1)}
            style={secondaryButton}
          >
            Try again
          </button>
          <Link
            href="/shop/orders/history"
            className="touch-target"
            style={primaryButton}
          >
            <span>View My Orders</span>
            <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    )
  }

  /** Placed, but held for Head Office sign-off before fulfilment. */
  const awaitingApproval = order.status === 'PENDING_APPROVAL'

  return (
    <div
      style={{
        maxWidth: '920px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* 1. Success line, order number and references */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginBottom: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: awaitingApproval ? '#B45309' : '#3F9C68',
            }}
          >
            {awaitingApproval ? (
              <Clock size={16} style={{ flexShrink: 0 }} />
            ) : (
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            )}
            <span>
              {awaitingApproval
                ? 'Submitted for Approval • On-Account'
                : 'Order Successfully Recorded • On-Account'}
            </span>
          </div>

          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            {awaitingApproval
              ? `Order #${order.orderNumber} is Awaiting Approval`
              : `Thank you! Order #${order.orderNumber} is Confirmed`}
          </h1>

          <p
            style={{
              fontSize: '0.8rem',
              color: '#6E6781',
              maxWidth: '520px',
              margin: '4px 0 0',
              lineHeight: 1.5,
            }}
          >
            {awaitingApproval
              ? 'It has been sent to your Head Office approvers. Fulfilment starts once it is approved, and you will be notified of the decision.'
              : 'Your marketing collateral requisition has been routed to Central Fulfilment operations and scheduled for dispatch.'}
          </p>
        </div>

        {/* Reference tags row: label/value pairs in one card, not five tiles */}
        <div
          className="grid-auto"
          style={
            {
              ...card,
              padding: '16px 20px',
              ['--min']: '150px',
            } as React.CSSProperties
          }
        >
          <div>
            <span style={fieldLabel}>Order Reference</span>
            <strong style={{ ...fieldValue, fontFamily: 'monospace' }}>
              {order.orderNumber}
            </strong>
          </div>

          <div>
            <span style={fieldLabel}>PO Number</span>
            <strong style={{ ...fieldValue, fontFamily: 'monospace' }}>
              {order.poReference || 'N/A'}
            </strong>
          </div>

          {order.campaignCode && (
            <div>
              <span style={fieldLabel}>Campaign Allocation</span>
              <strong style={{ ...fieldValue, fontFamily: 'monospace' }}>
                {order.campaignCode}
              </strong>
            </div>
          )}

          {order.projectCode && (
            <div>
              <span style={fieldLabel}>Project Code</span>
              <strong style={{ ...fieldValue, fontFamily: 'monospace' }}>
                {order.projectCode}
              </strong>
            </div>
          )}

          {order.customerReference && (
            <div>
              <span style={fieldLabel}>Your Reference</span>
              <strong style={{ ...fieldValue, overflowWrap: 'anywhere' }}>
                {order.customerReference}
              </strong>
            </div>
          )}

          <div>
            <span style={fieldLabel}>Settlement Method</span>
            <strong style={fieldValue}>
              {order.paymentMethod
                ? PAYMENT_METHOD_LABELS[order.paymentMethod]
                : 'Consolidated Account'}
            </strong>
          </div>

          <div>
            <span style={fieldLabel}>Delivery Method</span>
            <strong style={fieldValue}>
              {order.shippingMethodLabel ?? STANDARD_DELIVERY_LABEL}
            </strong>
          </div>

          <div>
            <span style={{ ...fieldLabel, marginBottom: '4px' }}>Status</span>
            <OrderStatusBadge status={order.status} size="sm" />
          </div>
        </div>
      </motion.div>

      {/* 2. What Happens Next Roadmap Card */}
      <div
        style={{
          ...card,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <h3 style={cardTitle}>What Happens Next with Your Order</h3>

        <div
          className="grid-auto"
          style={{ ['--min']: '200px' } as React.CSSProperties}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={stepNumber}>1</span>
            <h4 style={stepTitle}>
              {awaitingApproval
                ? 'Head Office Approval'
                : 'Central Warehouse Staging'}
            </h4>
            <p style={stepText}>
              {awaitingApproval
                ? 'An approver reviews the order. If they request changes, you can update it and resubmit from the order record.'
                : 'Platform ops review specifications, pull print collateral from inventory, and stage for courier packing.'}
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={stepNumber}>2</span>
            <h4 style={stepTitle}>Dispatch and tracking</h4>
            <p style={stepText}>
              Sent by {order.shippingMethodLabel ?? 'standard delivery'} to your
              branch, with tracking and a signed receipt.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={stepNumber}>3</span>
            <h4 style={stepTitle}>Monthly Billing Roll-Up</h4>
            <p style={stepText}>
              This order ({formatMoney(order.totalAmount)}) is reconciled into
              your Head Office consolidated monthly billing report.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Requisition Breakdown Table Card */}
      <div
        style={{
          ...card,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={cardTitle}>Order Requisition Details</h3>
            <p
              style={{
                fontSize: '0.76rem',
                color: '#A39BB3',
                margin: '3px 0 0',
              }}
            >
              Placed on {formatDateTime(order.createdAt)}
            </p>
          </div>

          {/* Both secondary: the page's one primary action is at the bottom. */}
          <div className="row-wrap">
            <button
              onClick={handlePrint}
              className="touch-target"
              style={secondaryButton}
            >
              <Printer size={14} /> Print Receipt
            </button>

            <Link
              href={`/shop/orders/${order.id}`}
              className="touch-target"
              style={secondaryButton}
            >
              <FileText size={14} /> View Order Record
            </Link>
          </div>
        </div>

        {/* Line Items Table */}
        <div className="table-scroll">
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.84rem',
            }}
          >
            <thead>
              <tr>
                <Th edge="start">Product</Th>
                <Th>SKU</Th>
                <Th align="center">Pack / UOM</Th>
                <Th align="center">Quantity</Th>
                <Th align="right">Unit Price</Th>
                <Th align="right" edge="end">
                  Total
                </Th>
              </tr>
            </thead>
            <tbody>
              {order.lineItems.map((line) => (
                <tr key={line.id} style={{ borderTop: '1px solid #F5EEF2' }}>
                  <td
                    style={{
                      padding: '12px 14px 12px 0',
                      verticalAlign: 'top',
                    }}
                  >
                    <OrderLineAsset line={line} />
                  </td>
                  <td
                    style={{
                      padding: '12px 14px',
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      color: '#6E6781',
                    }}
                  >
                    {line.sku}
                  </td>
                  <td
                    style={{
                      padding: '12px 14px',
                      textAlign: 'center',
                      color: '#6E6781',
                    }}
                  >
                    {line.packSize || line.uom || 'Unit'}
                  </td>
                  <td
                    style={{
                      padding: '12px 14px',
                      textAlign: 'center',
                      color: '#2B253E',
                    }}
                  >
                    {line.qty}
                  </td>
                  <td
                    style={{
                      padding: '12px 14px',
                      textAlign: 'right',
                      color: '#6E6781',
                    }}
                  >
                    {formatMoney(line.unitPrice)}
                  </td>
                  <td
                    style={{
                      padding: '12px 0 12px 14px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: '#2B253E',
                    }}
                  >
                    {formatMoney(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Row */}
        <div
          className="grid-auto"
          style={
            {
              ['--min']: '240px',
              paddingTop: '16px',
              borderTop: '1px solid #F5EEF2',
              fontSize: '0.84rem',
            } as React.CSSProperties
          }
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              color: '#5C566E',
            }}
          >
            <p style={{ margin: 0 }}>
              <strong style={fieldLabel}>Branch:</strong>
              {order.siteName} ({order.siteCode})
            </p>
            <p style={{ margin: 0 }}>
              <strong style={fieldLabel}>Ordered By:</strong>
              {order.userName} ({order.userEmail})
            </p>
            {order.deliveryAddress && (
              <p style={{ margin: 0 }}>
                <strong style={fieldLabel}>Ship To:</strong>
                {[
                  order.deliveryAddress.street,
                  order.deliveryAddress.suite,
                  order.deliveryAddress.city,
                  order.deliveryAddress.postalCode,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
            {order.billingAddress && (
              <p style={{ margin: 0 }}>
                <strong style={fieldLabel}>Bill To:</strong>
                {[
                  order.billingAddress.street,
                  order.billingAddress.suite,
                  order.billingAddress.city,
                  order.billingAddress.postalCode,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </p>
            )}
            {order.recipientContact && (
              <p style={{ margin: 0 }}>
                <strong style={fieldLabel}>Receiving Contact:</strong>
                {[
                  order.recipientContact.name,
                  order.recipientContact.phone,
                  order.recipientContact.email,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {order.requestedDeliveryDate && (
              <p style={{ margin: 0 }}>
                <strong style={fieldLabel}>Requested Delivery:</strong>
                {formatDate(order.requestedDeliveryDate)}
              </p>
            )}
            {/* `deliveryNotes` is what checkout sends and what every other
                order screen and the courier label read. `notes` only carries
                instructions saved on a basket before that. */}
            {order.deliveryNotes && (
              <p style={{ margin: 0 }}>
                <strong style={fieldLabel}>Delivery Instructions:</strong>
                {order.deliveryNotes}
              </p>
            )}
            {order.notes && order.notes !== order.deliveryNotes && (
              <p style={{ margin: 0 }}>
                <strong style={fieldLabel}>Order Notes:</strong>
                {order.notes}
              </p>
            )}
            {order.nzPostDelivery && (
              <p style={{ margin: 0 }}>
                <strong style={fieldLabel}>NZ Post:</strong>
                {order.nzPostDelivery.kind === 'COLLECTION' &&
                order.nzPostDelivery.collectionPointName
                  ? `Collect from ${order.nzPostDelivery.collectionPointName}`
                  : (order.nzPostDelivery.fullAddress ?? 'Address confirmed')}
                {order.nzPostDelivery.serviceDescription && (
                  <span style={{ display: 'block', color: '#A39BB3' }}>
                    {order.nzPostDelivery.serviceDescription} · recorded for
                    dispatch, not billed
                  </span>
                )}
              </p>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {/* The order's own figures, frozen at placement. An order from
                before delivery was charged has no method and no cost. */}
            <OrderTotals
              subtotal={
                order.subtotalAmount ??
                order.totalAmount - (order.shippingCost ?? 0)
              }
              shippingMethod={
                order.shippingMethodLabel ?? STANDARD_DELIVERY_LABEL
              }
              shippingPrice={order.shippingCost ?? 0}
              total={order.totalAmount}
              totalLabel="Total Billed to Account"
              totalNote={taxNote}
              size="lg"
            />
          </div>
        </div>
      </div>

      {/* 4. Bottom Navigation CTA */}
      <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
        <Link
          href="/shop/catalogue"
          className="touch-target"
          style={secondaryButton}
        >
          <ShoppingBag size={14} /> Continue shopping
        </Link>

        <Link
          href="/shop/orders/history"
          className="touch-target"
          style={primaryButton}
        >
          <span>Go to my order history</span>
          <ArrowRight size={14} />
        </Link>
      </div>
    </div>
  )
}

/**
 * A column label. The table sits inside a padded card, so `edge` drops the
 * gutter on the side that meets the card's own padding.
 */
function Th({
  children,
  align = 'left',
  edge,
}: {
  children?: React.ReactNode
  align?: 'left' | 'center' | 'right'
  edge?: 'start' | 'end'
}) {
  return (
    <th
      style={{
        padding:
          edge === 'start'
            ? '10px 14px 10px 0'
            : edge === 'end'
              ? '10px 0 10px 14px'
              : '10px 14px',
        color: '#A39BB3',
        fontWeight: 500,
        fontSize: '0.74rem',
        textAlign: align,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  )
}
