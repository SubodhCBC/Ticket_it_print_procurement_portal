// src/app/head-office/orders/[orderId]/page.tsx
'use client'

import { Skeleton as UiSkeleton } from '@/components/ui/Skeleton'
import { EmptyState } from '@/components/ui/TableState'
import { DocketButton } from '@/components/orders/DocketButton'
import { LineNote } from '@/components/shop/cart/LineNote'
import React from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ChevronRight,
  Package,
  MapPin,
  FileText,
  Truck,
  Calendar,
  User,
  Lock,
} from 'lucide-react'
import { useOrder } from '@/hooks/useOrders'
import { useAuth } from '@/hooks/useAuth'
import { StatusPill } from '@/components/admin/StatusPill'
import { LineChips } from '@/components/shop/cart/LineChips'
import { STANDARD_DELIVERY_LABEL } from '@/components/shop/cart/line-format'
import { TrackingTimeline } from '@/components/shipping/TrackingTimeline'
import type { Order, OrderStatus } from '@/types'
import { formatMoney, formatDate } from '@/lib/format'

/** The page's placeholder bar, drawn by the shared skeleton. */
function Skeleton({
  w = '100%',
  h = '1rem',
  br = '8px',
}: {
  w?: string
  h?: string
  br?: string
}) {
  return <UiSkeleton width={w} height={h} radius={br} />
}

/** A field label: grey, sentence-set, the data beside it does the talking. */
const label: React.CSSProperties = {
  fontSize: '0.74rem',
  fontWeight: 500,
  color: '#A39BB3',
}

function InfoRow({
  label: text,
  value,
}: {
  label: string
  value?: string | null
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <span style={label}>{text}</span>
      <span
        style={{
          fontSize: '0.84rem',
          fontWeight: 500,
          color: value ? '#2B253E' : '#DCD3E0',
        }}
      >
        {value || '—'}
      </span>
    </div>
  )
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        boxShadow:
          '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
        border: '1px solid #F0E6EC',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '14px 20px',
          borderBottom: '1px solid #F5EEF2',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span style={{ display: 'flex', color: '#A39BB3' }}>{icon}</span>
        <h2
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: '#2B253E',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          {title}
        </h2>
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </motion.div>
  )
}

export default function HOOrderDetailPage() {
  const { user } = useAuth()
  // The account the signed-in user belongs to. The API scopes every
  // head-office read to it anyway; this is what the screen asks about.
  const accountId = user?.accountId ?? ''
  const params = useParams()
  const orderId = params.orderId as string
  const { order, isLoading } = useOrder(orderId)

  // Guard: if order doesn't belong to this account, show access denied
  const accessDenied = !isLoading && order && order.accountId !== accountId

  if (isLoading) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          maxWidth: '1000px',
        }}
      >
        <Skeleton h="0.8rem" w="200px" />
        <Skeleton h="1.5rem" w="340px" />
        <div
          className="grid-auto"
          style={{ ['--min']: '280px' } as React.CSSProperties}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                boxShadow:
                  '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                padding: '20px',
                border: '1px solid #F0E6EC',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <Skeleton h="0.7rem" w="50%" />
              {[0, 1, 2].map((j) => (
                <Skeleton key={j} h="0.85rem" w={j % 2 === 0 ? '80%' : '60%'} />
              ))}
            </div>
          ))}
        </div>
        <style>{`@keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0}}`}</style>
      </div>
    )
  }

  if (accessDenied || !order) {
    return (
      <div
        style={{
          padding: '32px',
          textAlign: 'center',
          color: '#A39BB3',
          fontSize: '0.84rem',
          maxWidth: '600px',
          margin: '40px auto',
        }}
      >
        <Lock
          size={24}
          color="#A39BB3"
          style={{ display: 'block', margin: '0 auto 12px' }}
        />
        <h2
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#2B253E',
            letterSpacing: '-0.01em',
            margin: '0 0 4px',
          }}
        >
          Order Not Found
        </h2>
        <p style={{ margin: 0 }}>
          This order doesn't exist or doesn't belong to your account.
        </p>
        <Link
          href="/head-office/orders/all"
          className="touch-target"
          style={{
            marginTop: '16px',
            display: 'inline-block',
            color: '#F73582',
            fontSize: '0.8rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ← Back to Orders
        </Link>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '1040px',
      }}
    >
      {/* Header. The breadcrumb sits inside it, directly over the title, so it
          reads as part of the heading rather than a separate row. */}
      <div
        className="stack-sm"
        style={{
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          {/* Breadcrumb */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '0.76rem',
              color: '#A39BB3',
              marginBottom: '6px',
            }}
          >
            <Link
              href="/head-office/dashboard"
              style={{
                color: '#A39BB3',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Dashboard
            </Link>
            <ChevronRight size={13} />
            <Link
              href="/head-office/orders/all"
              style={{
                color: '#A39BB3',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Orders
            </Link>
            <ChevronRight size={13} />
            <span style={{ color: '#6E6781', fontWeight: 500 }}>
              {order.orderNumber}
            </span>
          </div>

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
              {order.orderNumber}
            </h1>
            <StatusPill status={order.status as OrderStatus} />
            <span
              style={{
                backgroundColor: '#F5EEF2',
                color: '#5C566E',
                padding: '2px 8px',
                borderRadius: '9999px',
                fontSize: '0.7rem',
                fontWeight: 600,
              }}
            >
              Read only
            </span>
          </div>
          <p
            style={{
              fontSize: '0.8rem',
              color: '#6E6781',
              margin: '4px 0 0',
            }}
          >
            {order.siteName} · {formatDate(order.createdAt)}
          </p>
        </div>
        <div className="row-wrap">
          <DocketButton orderId={order.id} orderNumber={order.orderNumber} />
          <div
            style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            {formatMoney(order.totalAmount)}
          </div>
        </div>
      </div>

      {/* Order & Delivery Info grid */}
      <div
        className="grid-auto"
        style={{ ['--min']: '280px' } as React.CSSProperties}
      >
        {/* Order Info */}
        <SectionCard title="Order Details" icon={<FileText size={16} />}>
          <div className="grid-2">
            <InfoRow label="Order Number" value={order.orderNumber} />
            <InfoRow label="Account" value={order.accountName} />
            <InfoRow label="Site" value={order.siteName} />
            <InfoRow label="Site Code" value={order.siteCode} />
            <InfoRow label="PO Reference" value={order.poReference} />
            {order.customerReference && (
              <InfoRow
                label="Customer Reference"
                value={order.customerReference}
              />
            )}
            <InfoRow label="Order Date" value={formatDate(order.createdAt)} />
            <InfoRow label="Items" value={String(order.itemCount)} />
            <InfoRow
              label="Order Total"
              value={formatMoney(order.totalAmount)}
            />
          </div>
        </SectionCard>

        {/* Ordered By */}
        <SectionCard title="Ordered By" icon={<User size={16} />}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <InfoRow label="Name" value={order.userName} />
            <InfoRow label="Email" value={order.userEmail} />
            {order.userRole && (
              <InfoRow
                label="Role when ordered"
                value={
                  (
                    {
                      ADMIN: 'Administrator',
                      HEAD_OFFICE: 'Head office',
                      SITE_USER: 'Site user',
                    } as Record<string, string>
                  )[order.userRole] ?? order.userRole
                }
              />
            )}
          </div>
        </SectionCard>

        {/* Delivery */}
        <SectionCard title="Delivery & Fulfilment" icon={<Truck size={16} />}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <InfoRow
              label="Shipping Method"
              value={`${order.shippingMethodLabel ?? STANDARD_DELIVERY_LABEL} · ${formatMoney(order.shippingCost ?? 0)}`}
            />
            <InfoRow label="Carrier" value={order.carrier} />
            <InfoRow label="Tracking Number" value={order.trackingNumber} />
            <InfoRow
              label="Dispatched"
              value={
                order.dispatchedAt ? formatDate(order.dispatchedAt) : undefined
              }
            />
            <InfoRow
              label="Delivered"
              value={
                order.deliveredAt ? formatDate(order.deliveredAt) : undefined
              }
            />
            <InfoRow
              label="Delivery Instructions"
              value={order.deliveryNotes}
            />
          </div>
        </SectionCard>

        {/* Bill-To / Ship-To */}
        <SectionCard title="Address Information" icon={<MapPin size={16} />}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div>
              <span style={{ ...label, display: 'block', marginBottom: '4px' }}>
                Ship To
              </span>
              <div
                style={{
                  fontSize: '0.84rem',
                  color: '#2B253E',
                  lineHeight: 1.6,
                }}
              >
                {order.siteName}
                <br />
                {order.deliveryAddress
                  ? formatAddress(order.deliveryAddress)
                  : order.siteCode}
              </div>
            </div>
            <div>
              <span style={{ ...label, display: 'block', marginBottom: '4px' }}>
                Bill To
              </span>
              <div
                style={{
                  fontSize: '0.84rem',
                  color: '#2B253E',
                  lineHeight: 1.6,
                }}
              >
                {order.accountName}
                <br />
                {/* The address frozen at placement. Older orders predate it. */}
                {order.billingAddress
                  ? formatAddress(order.billingAddress)
                  : 'Not recorded on this order'}
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* NZ Post scans, once the order has been dispatched. */}
      <TrackingTimeline orderId={order.id} hideWhenEmpty />

      {/* Status Timeline */}
      <SectionCard title="Status History" icon={<Calendar size={16} />}>
        <div style={{ display: 'flex', gap: '0', flexWrap: 'wrap' }}>
          {(
            [
              'APPROVED',
              'PROCESSING',
              'DISPATCHED',
              'DELIVERED',
            ] as OrderStatus[]
          ).map((st, i, arr) => {
            const statusOrder: Record<string, number> = {
              APPROVED: 0,
              PROCESSING: 1,
              DISPATCHED: 2,
              DELIVERED: 3,
            }
            const currentIdx = statusOrder[order.status] ?? -1
            const thisIdx = statusOrder[st] ?? 0
            const isPast = thisIdx < currentIdx
            const isCurrent = thisIdx === currentIdx
            const dateMap: Partial<Record<OrderStatus, string | undefined>> = {
              APPROVED: order.createdAt,
              PROCESSING: order.updatedAt,
              DISPATCHED: order.dispatchedAt,
              DELIVERED: order.deliveredAt,
            }

            return (
              <div
                key={st}
                style={{
                  flex: 1,
                  minWidth: '120px',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  position: 'relative',
                }}
              >
                {/* Solid connectors, and no glow ring on the current step: the
                    pink dot alone marks where the order is. */}
                {i < arr.length - 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '11px',
                      left: '50%',
                      right: '-50%',
                      height: '2px',
                      backgroundColor:
                        isPast || isCurrent ? '#DCD3E0' : '#F5EEF2',
                      zIndex: 0,
                    }}
                  />
                )}
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    zIndex: 1,
                    backgroundColor: isCurrent
                      ? '#F73582'
                      : isPast
                        ? '#3F9C68'
                        : '#F0E6EC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {isPast ? (
                    <span
                      style={{
                        color: '#FFFFFF',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                      }}
                    >
                      ✓
                    </span>
                  ) : isCurrent ? (
                    <span
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: '#FFFFFF',
                      }}
                    />
                  ) : null}
                </div>
                <div style={{ marginTop: '8px', textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      letterSpacing: '0.02em',
                      color: isCurrent
                        ? '#F73582'
                        : isPast
                          ? '#3F9C68'
                          : '#A39BB3',
                    }}
                  >
                    {st}
                  </div>
                  {dateMap[st] && (isPast || isCurrent) && (
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: '#A39BB3',
                        marginTop: '2px',
                      }}
                    >
                      {formatDate(dateMap[st])}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>

      {/* Line Items */}
      <SectionCard
        title={`Line Items (${order.lineItems.length})`}
        icon={<Package size={16} />}
      >
        <div className="table-scroll">
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.84rem',
            }}
          >
            {/* The card body already carries the 20px gutter, so the outer
                columns sit flush with it instead of adding their own. */}
            <thead>
              <tr>
                {[
                  'Product',
                  'SKU',
                  'Pack Size',
                  'UOM',
                  'Qty',
                  'Unit Price',
                  'Line Total',
                ].map((h, idx, arr) => (
                  <th
                    key={h}
                    style={{
                      padding:
                        idx === 0
                          ? '0 12px 10px 0'
                          : idx === arr.length - 1
                            ? '0 0 10px 12px'
                            : '0 12px 10px',
                      textAlign:
                        h === 'Qty' || h === 'Unit Price' || h === 'Line Total'
                          ? 'right'
                          : 'left',
                      fontSize: '0.74rem',
                      fontWeight: 500,
                      color: '#A39BB3',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.lineItems.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 0 }}>
                    <EmptyState
                      icon={Package}
                      title="No line items on this order"
                      detail="Nothing was recorded against it. Your print administrator can confirm what was ordered."
                    />
                  </td>
                </tr>
              )}
              {order.lineItems.map((li) => (
                <tr key={li.id} style={{ borderTop: '1px solid #F5EEF2' }}>
                  <td style={{ padding: '12px 12px 12px 0' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      {li.thumbnailUrl && (
                        <img
                          src={li.thumbnailUrl}
                          alt={li.productName}
                          style={{
                            width: '36px',
                            height: '36px',
                            objectFit: 'cover',
                            borderRadius: '10px',
                          }}
                        />
                      )}
                      <div>
                        <span style={{ fontWeight: 600, color: '#2B253E' }}>
                          {li.productName}
                        </span>
                        <LineChips
                          options={li.options}
                          style={{ marginTop: '4px' }}
                        />
                        <LineNote
                          note={li.notes}
                          style={{ marginTop: '4px' }}
                        />
                      </div>
                    </div>
                  </td>
                  <td
                    style={{
                      padding: '12px',
                      fontFamily: 'monospace',
                      fontSize: '0.78rem',
                      color: '#A39BB3',
                    }}
                  >
                    {li.sku}
                  </td>
                  <td style={{ padding: '12px', color: '#6E6781' }}>
                    {li.packSize ?? '—'}
                  </td>
                  <td style={{ padding: '12px', color: '#6E6781' }}>
                    {li.uom ?? '—'}
                  </td>
                  <td
                    style={{
                      padding: '12px',
                      textAlign: 'right',
                      color: '#2B253E',
                    }}
                  >
                    {li.qty}
                  </td>
                  <td
                    style={{
                      padding: '12px',
                      textAlign: 'right',
                      color: '#6E6781',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatMoney(li.unitPrice)}
                  </td>
                  <td
                    style={{
                      padding: '12px 0 12px 12px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: '#2B253E',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatMoney(li.lineTotal)}
                  </td>
                </tr>
              ))}
              {/* What the lines came to and what delivery added, above the
                  total they make. */}
              <tr style={{ borderTop: '1px solid #F0E6EC' }}>
                <td
                  colSpan={6}
                  style={{
                    padding: '12px 12px 4px',
                    textAlign: 'right',
                    fontSize: '0.8rem',
                    color: '#6E6781',
                  }}
                >
                  Subtotal
                </td>
                <td
                  style={{
                    padding: '12px 0 4px 12px',
                    textAlign: 'right',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: '#2B253E',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatMoney(
                    order.subtotalAmount ??
                      order.totalAmount - (order.shippingCost ?? 0)
                  )}
                </td>
              </tr>
              <tr>
                <td
                  colSpan={6}
                  style={{
                    padding: '4px 12px 12px',
                    textAlign: 'right',
                    fontSize: '0.8rem',
                    color: '#6E6781',
                  }}
                >
                  Shipping (
                  {order.shippingMethodLabel ?? STANDARD_DELIVERY_LABEL})
                </td>
                <td
                  style={{
                    padding: '4px 0 12px 12px',
                    textAlign: 'right',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: '#2B253E',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatMoney(order.shippingCost ?? 0)}
                </td>
              </tr>
              <tr style={{ borderTop: '1px solid #F5EEF2' }}>
                <td
                  colSpan={6}
                  style={{
                    padding: '12px',
                    textAlign: 'right',
                    fontWeight: 600,
                    fontSize: '0.84rem',
                    color: '#6E6781',
                  }}
                >
                  Order Total
                </td>
                <td
                  style={{
                    padding: '12px 0 12px 12px',
                    textAlign: 'right',
                    fontWeight: 700,
                    fontSize: '0.95rem',
                    color: '#2B253E',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatMoney(order.totalAmount)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionCard>

      {/* Read-only notice */}
      <div
        style={{
          backgroundColor: '#FCF7FA',
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.78rem',
          fontWeight: 500,
          color: '#6E6781',
        }}
      >
        <Lock size={16} color="#A39BB3" style={{ flexShrink: 0 }} />
        <span>
          This order is read-only. Status updates and edits require Admin Portal
          access.
        </span>
      </div>

      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0}}
      `}</style>
    </div>
  )
}

function formatAddress(address: NonNullable<Order['billingAddress']>): string {
  return [
    address.street,
    address.suite,
    [address.city, address.state].filter(Boolean).join(', '),
    address.postalCode,
    address.country,
  ]
    .filter(Boolean)
    .join(', ')
}
