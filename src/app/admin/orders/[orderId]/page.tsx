// src/app/admin/orders/[orderId]/page.tsx
'use client'

import { SkeletonDetail } from '@/components/ui/Skeleton'
import { DocketButton } from '@/components/orders/DocketButton'
import { LineNote } from '@/components/shop/cart/LineNote'
import { useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft, Package, CheckCircle, ShieldCheck } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { StatusPill } from '@/components/admin/StatusPill'
import { OrderActionModal } from '@/components/admin/OrderActionModal'
import { OrderApprovalPanel } from '@/components/admin/OrderApprovalPanel'
import { useOrder, useOrderMutations } from '@/hooks/useOrders'
import { useAuth } from '@/hooks/useAuth'
import { LineChips } from '@/components/shop/cart/LineChips'
import { STANDARD_DELIVERY_LABEL } from '@/components/shop/cart/line-format'
import { ShipmentLabelPanel } from '@/components/shipping/ShipmentLabelPanel'
import { TrackingTimeline } from '@/components/shipping/TrackingTimeline'

/** The shared card: hairline border and a soft shadow, as on the admin dashboard. */
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
  letterSpacing: '-0.01em',
  margin: 0,
}

/** A column label: grey, regular weight, no filled band behind it. */
const th: React.CSSProperties = {
  padding: '10px 14px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}

/** The outer columns carry the card's 20px gutter. */
const thEdge: React.CSSProperties = { ...th, padding: '10px 20px' }

export default function SingleOrderDetailPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const backHref = isAdmin ? '/admin/orders/all' : '/head-office/orders/all'
  const params = useParams()
  const orderId = (params.orderId as string) || ''

  const { order, isLoading, refetch } = useOrder(orderId)
  const { updateOrderStatus } = useOrderMutations()
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleStatusUpdate = async (
    id: string,
    status: any,
    metadata?: any
  ) => {
    if (!isAdmin) return
    await updateOrderStatus(id, status, metadata)
    refetch()
  }

  if (isLoading) {
    return (
      <>
        <AdminHeader title="Order Detail" />
        <main style={{ padding: '24px' }}>
          <SkeletonDetail label="Loading order" />
        </main>
      </>
    )
  }

  if (!order) {
    return (
      <>
        <AdminHeader title="Order Not Found" />
        <div
          style={{
            padding: '32px',
            textAlign: 'center',
            color: '#A39BB3',
            fontSize: '0.84rem',
          }}
        >
          <Package
            size={28}
            color="#DCD3E0"
            style={{ margin: '0 auto 10px auto' }}
          />
          <div
            style={{ fontWeight: 700, fontSize: '0.95rem', color: '#2B253E' }}
          >
            Order not found
          </div>
          <Link
            href={backHref}
            style={{
              display: 'inline-block',
              marginTop: '12px',
              color: '#F73582',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            ← Back to Orders
          </Link>
        </div>
      </>
    )
  }

  const steps = [
    { label: 'Received', active: true, date: order.createdAt },
    {
      label: 'Processing',
      active:
        order.status === 'PROCESSING' ||
        order.status === 'DISPATCHED' ||
        order.status === 'DELIVERED',
      date: order.status !== 'RECEIVED' ? order.updatedAt : undefined,
    },
    {
      label: 'Dispatched',
      active: order.status === 'DISPATCHED' || order.status === 'DELIVERED',
      date: order.dispatchedAt,
    },
    {
      label: 'Delivered',
      active: order.status === 'DELIVERED',
      date: order.deliveredAt,
    },
  ]

  return (
    <>
      <AdminHeader
        title={`Order ${order.orderNumber}`}
        subtitle={`Branch: ${order.siteName} • PO: ${order.poReference || 'None'}`}
        actionButton={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Link
              href={backHref}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                backgroundColor: '#FFFFFF',
                border: '1px solid #F0E6EC',
                color: '#2B253E',
                fontSize: '0.82rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <ArrowLeft size={15} />
              <span>Back</span>
            </Link>
            <DocketButton orderId={order.id} orderNumber={order.orderNumber} />
            {isAdmin ? (
              // A pink border rather than none, so it stands the same height
              // as the outlined Back link beside it.
              <button
                type="button"
                onClick={() => setIsModalOpen(true)}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#F73582',
                  color: '#FFFFFF',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  border: '1px solid #F73582',
                }}
              >
                Update Order Status
              </button>
            ) : (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#FFFBEB',
                  color: '#B45309',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                <ShieldCheck size={16} />
                <span>Multi-Site Status (Read-Only)</span>
              </div>
            )}
          </div>
        }
      />

      <main
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Status Stepper Card */}
        <div style={{ ...card, padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <div style={cardTitle}>Operational Fulfillment Lifecycle</div>
            <StatusPill status={order.status} size="lg" />
          </div>

          {/* Top-aligned, not centred: a step with a date is taller than one
              without, and centring them put the circles — and so the line
              joining them — at different heights. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              position: 'relative',
            }}
          >
            {steps.map((step, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  flex: 1,
                  textAlign: 'center',
                  position: 'relative',
                  zIndex: 2,
                }}
              >
                {/* The line to the next step: from this circle's centre to the
                    next one's, stopping short of both. Pink once the next
                    step has been reached. */}
                {idx < steps.length - 1 && (
                  <div
                    aria-hidden
                    style={{
                      position: 'absolute',
                      top: '13px',
                      left: 'calc(50% + 22px)',
                      right: 'calc(-50% + 22px)',
                      height: '2px',
                      borderRadius: '9999px',
                      backgroundColor: steps[idx + 1].active
                        ? '#F73582'
                        : '#F0E6EC',
                    }}
                  />
                )}
                {/* The filled circle is the step's state, so it keeps its
                    colour; the pink glow around it was decoration. */}
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    backgroundColor: step.active ? '#F73582' : '#F5EEF2',
                    color: step.active ? '#FFFFFF' : '#A39BB3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                  }}
                >
                  {step.active ? <CheckCircle size={16} /> : idx + 1}
                </div>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '0.8rem',
                    color: step.active ? '#2B253E' : '#A39BB3',
                    marginTop: '8px',
                  }}
                >
                  {step.label}
                </div>
                {step.date && (
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: '#A39BB3',
                      marginTop: '2px',
                    }}
                  >
                    {new Date(step.date).toLocaleDateString()}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* The approval this order is waiting on. Renders nothing when the
            order never needed one. */}
        <OrderApprovalPanel orderId={order.id} />

        {/* Breakdown Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr',
            gap: '20px',
          }}
        >
          {/* Left: Line items. The gutter lives on the title, the cells and the
              total rather than on the card, so the row rules run edge to edge
              as they do on the dashboard's table. */}
          <div style={card}>
            <h3 style={{ ...cardTitle, padding: '16px 20px 6px' }}>
              Order Line Items ({order.lineItems.length})
            </h3>
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
                  <th style={thEdge}>Item</th>
                  <th style={th}>SKU</th>
                  <th style={{ ...th, textAlign: 'center' }}>Qty</th>
                  <th style={{ ...th, textAlign: 'right' }}>Price</th>
                  <th style={{ ...thEdge, textAlign: 'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {order.lineItems.map((item, idx) => (
                  <tr key={idx} style={{ borderTop: '1px solid #F5EEF2' }}>
                    <td
                      style={{
                        padding: '12px 20px',
                        fontWeight: 600,
                        color: '#2B253E',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                        }}
                      >
                        {item.thumbnailUrl && (
                          <img
                            src={item.thumbnailUrl}
                            alt={item.productName}
                            style={{
                              width: '32px',
                              height: '32px',
                              borderRadius: '6px',
                              objectFit: 'cover',
                            }}
                          />
                        )}
                        <div>
                          <div>{item.productName}</div>
                          <LineChips
                            options={item.options}
                            style={{ marginTop: '4px' }}
                          />
                          <LineNote
                            note={item.notes}
                            style={{ marginTop: '4px' }}
                          />
                        </div>
                      </div>
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        fontFamily: 'monospace',
                        fontSize: '0.78rem',
                        color: '#6E6781',
                      }}
                    >
                      {item.sku}
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        textAlign: 'center',
                        color: '#2B253E',
                      }}
                    >
                      {item.qty}
                    </td>
                    <td
                      style={{
                        padding: '12px 14px',
                        textAlign: 'right',
                        color: '#6E6781',
                      }}
                    >
                      ${item.unitPrice.toFixed(2)}
                    </td>
                    <td
                      style={{
                        padding: '12px 20px',
                        textAlign: 'right',
                        fontWeight: 600,
                        color: '#2B253E',
                      }}
                    >
                      ${item.lineTotal.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* What the lines came to and what delivery added, above the
                total they make. */}
            <div
              style={{
                padding: '14px 20px 0',
                borderTop: '1px solid #F5EEF2',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '6px',
                fontSize: '0.8rem',
                color: '#6E6781',
              }}
            >
              <div style={{ display: 'flex', gap: '16px' }}>
                <span>Subtotal:</span>
                <span
                  style={{
                    minWidth: '80px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: '#2B253E',
                  }}
                >
                  $
                  {(
                    order.subtotalAmount ??
                    order.totalAmount - (order.shippingCost ?? 0)
                  ).toFixed(2)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '16px' }}>
                <span>
                  Shipping (
                  {order.shippingMethodLabel ?? STANDARD_DELIVERY_LABEL}):
                </span>
                <span
                  style={{
                    minWidth: '80px',
                    textAlign: 'right',
                    fontWeight: 600,
                    color: '#2B253E',
                  }}
                >
                  ${(order.shippingCost ?? 0).toFixed(2)}
                </span>
              </div>
            </div>
            <div
              style={{
                padding: '10px 20px 14px',
                display: 'flex',
                justifyContent: 'flex-end',
                alignItems: 'baseline',
                gap: '16px',
              }}
            >
              <span style={{ fontSize: '0.8rem', color: '#6E6781' }}>
                Total Amount Due:
              </span>
              {/* The page's one pink figure: what the order comes to. */}
              <span
                style={{
                  fontWeight: 700,
                  fontSize: '1.1rem',
                  color: '#F73582',
                }}
              >
                ${order.totalAmount.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Right: Logistics & Destination */}
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
          >
            {/* The label first: while an order is in Processing it is the
                next thing to do. Operators only — it renders nothing else. */}
            <ShipmentLabelPanel orderId={order.id} canManage={isAdmin} />

            <div style={{ ...card, padding: '20px' }}>
              <div style={{ ...cardTitle, marginBottom: '12px' }}>
                Logistics & Carrier Details
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  fontSize: '0.84rem',
                }}
              >
                <div>
                  <span style={{ color: '#6E6781' }}>Shipping Method:</span>{' '}
                  <strong style={{ fontWeight: 600, color: '#2B253E' }}>
                    {order.shippingMethodLabel ?? STANDARD_DELIVERY_LABEL}
                  </strong>{' '}
                  <span style={{ color: '#6E6781' }}>
                    · ${(order.shippingCost ?? 0).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span style={{ color: '#6E6781' }}>Carrier:</span>{' '}
                  <strong style={{ fontWeight: 600, color: '#2B253E' }}>
                    {order.carrier || 'Unassigned'}
                  </strong>
                </div>
                {/* Dark rather than pink: a waybill is a value to read, not a
                    link to follow. */}
                <div>
                  <span style={{ color: '#6E6781' }}>Waybill Tracking:</span>{' '}
                  <span
                    style={{
                      fontFamily: 'monospace',
                      color: '#2B253E',
                      fontWeight: 500,
                    }}
                  >
                    {order.trackingNumber || 'Pending pickup'}
                  </span>
                </div>
                {order.deliveryNotes && (
                  <div
                    style={{
                      padding: '10px 12px',
                      backgroundColor: '#FCF7FA',
                      borderRadius: '10px',
                      marginTop: '4px',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        color: '#2B253E',
                        marginBottom: '2px',
                      }}
                    >
                      Instructions:
                    </div>
                    <div style={{ color: '#6E6781' }}>
                      {order.deliveryNotes}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ ...card, padding: '20px' }}>
              <div style={{ ...cardTitle, marginBottom: '12px' }}>
                Ordering Organization
              </div>
              <div
                style={{
                  fontSize: '0.84rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <div>
                  <strong style={{ fontWeight: 600, color: '#2B253E' }}>
                    {order.siteName}
                  </strong>
                </div>
                <div style={{ color: '#6E6781' }}>
                  {order.accountName} ({order.siteCode})
                </div>
                <div style={{ color: '#6E6781', marginTop: '4px' }}>
                  User: {order.userName} ({order.userEmail})
                  {order.userRole &&
                    ` · ${({ ADMIN: 'Administrator', HEAD_OFFICE: 'Head office', SITE_USER: 'Site user' } as Record<string, string>)[order.userRole] ?? order.userRole}`}
                </div>
                <div style={{ color: '#6E6781', marginTop: '4px' }}>
                  Bill to:{' '}
                  <strong style={{ fontWeight: 600, color: '#2B253E' }}>
                    {order.billingAddress
                      ? [
                          order.billingAddress.street,
                          order.billingAddress.suite,
                          order.billingAddress.city,
                          order.billingAddress.postalCode,
                          order.billingAddress.country,
                        ]
                          .filter(Boolean)
                          .join(', ')
                      : 'Not recorded on this order'}
                  </strong>
                </div>
                {order.customerReference && (
                  <div
                    style={{
                      color: '#6E6781',
                      marginTop: '4px',
                      overflowWrap: 'anywhere',
                    }}
                  >
                    Customer reference:{' '}
                    <strong style={{ fontWeight: 600, color: '#2B253E' }}>
                      {order.customerReference}
                    </strong>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* NZ Post scans. Hidden until the order has something to track. */}
        <TrackingTimeline
          orderId={order.id}
          allowRefresh={isAdmin}
          hideWhenEmpty={!isAdmin}
        />
      </main>

      <OrderActionModal
        order={order}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStatusUpdate={handleStatusUpdate}
        canManageShipping={isAdmin}
      />
    </>
  )
}
