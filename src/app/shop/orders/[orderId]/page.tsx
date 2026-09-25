// src/app/shop/orders/[orderId]/page.tsx
'use client'

import { SkeletonDetail } from '@/components/ui/Skeleton'
import { LineNote } from '@/components/shop/cart/LineNote'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getOrderById } from '@/services/orders.service'
import type { Order } from '@/types'
import { OrderStatusBadge } from '@/components/shop/OrderStatusBadge'
import { OrderLineAsset } from '@/components/shop/cart/OrderLineAsset'
import {
  OrderTotals,
  useTaxBasisNote,
} from '@/components/shop/cart/OrderTotals'
import { STANDARD_DELIVERY_LABEL } from '@/components/shop/cart/line-format'
import { TrackingTimeline } from '@/components/shipping/TrackingTimeline'
import { ReorderButton } from '@/components/shop/ReorderButton'
import { ArrowLeft, Printer, CheckCircle2, Lock } from 'lucide-react'
import { formatMoney } from '@/lib/format'

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

/** Every value in ink. The PO, campaign and billing values were set in pink,
 *  indigo and green, which made three facts look like three warnings. */
const fieldValue: React.CSSProperties = {
  color: '#2B253E',
  fontSize: '0.84rem',
  fontWeight: 600,
  display: 'block',
  marginTop: '2px',
}

export default function SiteOrderDetailPage() {
  const params = useParams()
  const orderId = params?.orderId as string

  const [order, setOrder] = useState<Order | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // The figure a buyer remembers has to reconcile with the invoice, so the
  // total says which GST basis it is on rather than leaving it unstated.
  const taxNote = useTaxBasisNote('on account')

  useEffect(() => {
    async function loadOrder() {
      if (!orderId) return
      setIsLoading(true)
      try {
        const res = await getOrderById(orderId)
        setOrder(res)
      } catch (err) {
        console.error('Failed to load order', err)
      } finally {
        setIsLoading(false)
      }
    }

    loadOrder()
  }, [orderId])

  if (isLoading) {
    return <SkeletonDetail label="Loading the order" />
  }

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
        <h3
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            color: '#2B253E',
            margin: '0 0 6px 0',
          }}
        >
          Order Record Not Found
        </h3>
        <p
          style={{
            fontSize: '0.84rem',
            color: '#6E6781',
            margin: '0 0 16px 0',
          }}
        >
          This order does not exist or does not belong to your branch.
        </p>
        <Link
          href="/shop/orders/history"
          className="touch-target"
          style={{
            display: 'inline-flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '10px',
            backgroundColor: '#F73582',
            color: '#FFFFFF',
            fontSize: '0.82rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={14} /> Back to Order History
        </Link>
      </div>
    )
  }

  // Keyed on statuses the API actually sends. `RECEIVED` was neither a server
  // status nor reachable, so every approved order matched nothing and fell to
  // step 0 by accident rather than by rule.
  const statusSteps = [
    { key: 'APPROVED', label: 'Order Received', desc: 'Logged on-account' },
    {
      key: 'PROCESSING',
      label: 'In Fulfilment',
      desc: 'Central warehouse staging',
    },
    {
      key: 'DISPATCHED',
      label: 'Dispatched',
      desc: order.carrier ? `${order.carrier}` : 'In transit to branch',
    },
    { key: 'DELIVERED', label: 'Delivered', desc: 'Signed for at the branch' },
  ]

  const statusOrder: Record<string, number> = {
    APPROVED: 0,
    PROCESSING: 1,
    DISPATCHED: 2,
    DELIVERED: 3,
  }

  const currentStepIdx = statusOrder[order.status] ?? 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '1040px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      {/* 1. Header Navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            minWidth: 0,
          }}
        >
          <Link
            href="/shop/orders/history"
            className="touch-target"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#6E6781',
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={14} /> Back to my orders
          </Link>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 700,
                color: '#2B253E',
                letterSpacing: '-0.01em',
                margin: 0,
              }}
            >
              Order {order.orderNumber}
            </h1>
            <OrderStatusBadge status={order.status} size="md" />
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.7rem',
                fontWeight: 600,
                color: '#5C566E',
                backgroundColor: '#F5EEF2',
                padding: '2px 8px',
                borderRadius: '9999px',
              }}
            >
              <Lock size={11} /> Read-Only Record
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => window.print()}
            className="touch-target"
            style={{
              display: 'inline-flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #F0E6EC',
              backgroundColor: '#FFFFFF',
              color: '#2B253E',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Printer size={14} /> Print Summary
          </button>
          <ReorderButton orderId={order.id} orderNumber={order.orderNumber} />
        </div>
      </div>

      {/* 2. Status Progression Stepper */}
      <div
        style={{
          ...card,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <h3 style={cardTitle}>Fulfilment Tracking Progression</h3>
          <span style={{ fontSize: '0.76rem', color: '#A39BB3' }}>
            Managed by Platform Operations
          </span>
        </div>

        {/* A 1px rule and small dots. The steps were 36px green discs holding
            check marks and numbers; the current step is the one thing to read
            here, so it alone carries colour. Each step takes an equal share of
            the width, so the rule runs from the first dot's centre to the last. */}
        <div
          className="hide-sm"
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'flex-start',
            maxWidth: '720px',
            margin: '0 auto',
            width: '100%',
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: '4px',
              left: `${50 / statusSteps.length}%`,
              right: `${50 / statusSteps.length}%`,
              height: '1px',
              backgroundColor: '#F0E6EC',
              zIndex: 1,
            }}
          >
            <div
              style={{
                height: '100%',
                backgroundColor: '#A39BB3',
                width: `${(currentStepIdx / (statusSteps.length - 1)) * 100}%`,
                transition: 'width 0.3s ease-out',
              }}
            />
          </div>

          {statusSteps.map((step, idx) => {
            const isPassed = idx <= currentStepIdx
            const isCurrent = idx === currentStepIdx

            return (
              <div
                key={step.key}
                style={{
                  position: 'relative',
                  zIndex: 2,
                  flex: 1,
                  minWidth: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                }}
              >
                <div
                  style={{
                    width: '9px',
                    height: '9px',
                    borderRadius: '50%',
                    boxSizing: 'border-box',
                    backgroundColor: isCurrent
                      ? '#F73582'
                      : isPassed
                        ? '#A39BB3'
                        : '#FFFFFF',
                    border: isPassed ? 'none' : '1px solid #DCD3E0',
                  }}
                />

                <div
                  style={{
                    marginTop: '10px',
                    textAlign: 'center',
                    padding: '0 4px',
                  }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: isCurrent ? 600 : 500,
                      display: 'block',
                      color: isCurrent
                        ? '#2B253E'
                        : isPassed
                          ? '#5C566E'
                          : '#A39BB3',
                    }}
                  >
                    {step.label}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: '#A39BB3',
                      maxWidth: '100px',
                      display: 'block',
                      margin: '2px auto 0',
                    }}
                  >
                    {step.desc}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* The same four steps as a vertical list on a phone, where four
            fixed-width steps and their captions cannot share one line. */}
        <div
          className="show-sm"
          style={{ display: 'flex', flexDirection: 'column' }}
        >
          {statusSteps.map((step, idx) => {
            const isPassed = idx <= currentStepIdx
            const isCurrent = idx === currentStepIdx
            const isLast = idx === statusSteps.length - 1

            return (
              <div
                key={step.key}
                style={{ display: 'flex', gap: '10px', minWidth: 0 }}
              >
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    flexShrink: 0,
                    paddingTop: '5px',
                  }}
                >
                  <div
                    style={{
                      width: '9px',
                      height: '9px',
                      borderRadius: '50%',
                      boxSizing: 'border-box',
                      backgroundColor: isCurrent
                        ? '#F73582'
                        : isPassed
                          ? '#A39BB3'
                          : '#FFFFFF',
                      border: isPassed ? 'none' : '1px solid #DCD3E0',
                    }}
                  />
                  {!isLast && (
                    <div
                      style={{
                        width: '1px',
                        flex: 1,
                        minHeight: '20px',
                        backgroundColor:
                          idx < currentStepIdx ? '#A39BB3' : '#F0E6EC',
                      }}
                    />
                  )}
                </div>

                <div
                  style={{ minWidth: 0, paddingBottom: isLast ? 0 : '14px' }}
                >
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: isCurrent ? 600 : 500,
                      display: 'block',
                      color: isCurrent
                        ? '#2B253E'
                        : isPassed
                          ? '#5C566E'
                          : '#A39BB3',
                    }}
                  >
                    {step.label}
                  </span>
                  <span
                    style={{
                      fontSize: '0.72rem',
                      color: '#A39BB3',
                      display: 'block',
                      marginTop: '2px',
                    }}
                  >
                    {step.desc}
                  </span>
                </div>
              </div>
            )
          })}
        </div>

        {/* Tracking sits under a divider rather than in a violet panel with its
            own icon tile, so the card holds one surface instead of two. The
            scans are NZ Post's, newest first; a courier the portal does not
            track shows its number alone. */}
        {(order.trackingNumber ||
          order.status === 'DISPATCHED' ||
          order.status === 'DELIVERED') && (
          <div style={{ paddingTop: '16px', borderTop: '1px solid #F5EEF2' }}>
            <TrackingTimeline orderId={order.id} bare />
          </div>
        )}
      </div>

      {/* 3. Order Details & Line Items */}
      <div
        style={{
          ...card,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div
          className="grid-auto"
          style={
            {
              ['--min']: '180px',
              paddingBottom: '20px',
              borderBottom: '1px solid #F5EEF2',
              fontSize: '0.76rem',
            } as React.CSSProperties
          }
        >
          <div>
            <span style={fieldLabel}>Branch:</span>
            <strong style={fieldValue}>{order.siteName}</strong>
            <span style={{ color: '#A39BB3', fontFamily: 'monospace' }}>
              Code: {order.siteCode}
            </span>
          </div>

          <div>
            <span style={fieldLabel}>PO / Reference:</span>
            <strong style={{ ...fieldValue, fontFamily: 'monospace' }}>
              {order.poReference || '—'}
            </strong>
            <span style={{ color: '#6E6781' }}>
              Ordered by {order.userName}
            </span>
          </div>

          {order.customerReference && (
            <div>
              <span style={fieldLabel}>Your Reference:</span>
              <strong style={{ ...fieldValue, overflowWrap: 'anywhere' }}>
                {order.customerReference}
              </strong>
            </div>
          )}

          <div>
            <span style={fieldLabel}>Campaign Attribution:</span>
            <strong style={{ ...fieldValue, fontFamily: 'monospace' }}>
              {order.campaignCode || '—'}
            </strong>
            <span style={{ color: '#6E6781' }}>{order.projectCode || '—'}</span>
          </div>

          <div>
            <span style={fieldLabel}>Billing & Settlement:</span>
            <strong style={fieldValue}>Monthly Consolidated</strong>
            <span style={{ color: '#6E6781' }}>
              Account: {order.accountName}
            </span>
          </div>
        </div>

        {order.approvedBy && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              backgroundColor: '#ECFDF5',
              fontSize: '0.8rem',
              color: '#3F9C68',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
            <span>
              Authorised by{' '}
              <strong style={{ fontWeight: 600 }}>{order.approvedBy}</strong>{' '}
              {order.approvalNotes ? `(${order.approvalNotes})` : ''}
            </span>
          </div>
        )}

        {/* Line Items */}
        <div>
          <h3 style={{ ...cardTitle, marginBottom: '8px' }}>
            Itemized Collateral Assets ({order.itemCount} units)
          </h3>

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
                  <Th edge="start">Asset</Th>
                  <Th>SKU</Th>
                  <Th align="center">Pack Size</Th>
                  <Th align="center">Quantity</Th>
                  <Th align="right">Unit Price</Th>
                  <Th align="right" edge="end">
                    Line Total
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
                      <LineNote
                        note={line.notes}
                        style={{ marginTop: '6px' }}
                      />
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
        </div>

        {/* Totals and Notes. Both used to be tinted, bordered boxes inside this
            card; the divider above already separates them from the items. */}
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
              gap: '8px',
              color: '#5C566E',
            }}
          >
            <div>
              <span style={{ ...fieldLabel, marginBottom: '2px' }}>
                Delivery Method:
              </span>
              <p style={{ margin: 0, color: '#2B253E', fontWeight: 600 }}>
                {order.shippingMethodLabel ?? STANDARD_DELIVERY_LABEL}
              </p>
            </div>
            {order.deliveryNotes && (
              <div>
                <span style={{ ...fieldLabel, marginBottom: '2px' }}>
                  Delivery Instructions:
                </span>
                <p style={{ margin: 0, color: '#5C566E' }}>
                  {order.deliveryNotes}
                </p>
              </div>
            )}
          </div>

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
