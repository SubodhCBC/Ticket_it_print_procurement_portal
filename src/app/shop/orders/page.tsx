// src/app/shop/orders/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ClipboardList,
  Search,
  Building2,
  Clock,
  Truck,
  ShieldCheck,
  Layers,
  Sparkles,
  Check,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { getOrders } from '@/services/orders.service'
import { useQuery, keepPreviousData } from '@tanstack/react-query'
import { Pager } from '@/components/ui/Pager'
import type { Order, OrderStatus } from '@/types'

// These labels are this page's own wording, so the pill stays local rather than
// becoming OrderStatusBadge. Its colours are the three status tones plus grey:
// amber waits on someone, green is settled, red is final, and grey is simply
// work in progress — eight hues had turned the column into a legend.
const STATUS_PIPELINE: {
  key: OrderStatus
  label: string
  bg: string
  color: string
  desc: string
}[] = [
  {
    key: 'PENDING_APPROVAL',
    label: 'Pending HO Approval',
    bg: '#FFFBEB',
    color: '#B45309',
    desc: 'Submitted to Head Office',
  },
  {
    key: 'CHANGES_REQUESTED',
    label: 'Changes Requested',
    bg: '#FFFBEB',
    color: '#B45309',
    desc: 'Head Office requested edits',
  },
  {
    key: 'APPROVED',
    label: 'Approved (Payment Pending)',
    bg: '#ECFDF5',
    color: '#3F9C68',
    desc: 'Approved by Head Office',
  },
  {
    // Payment is tracked on its own axis, so there is no lifecycle stage for
    // it; production is PROCESSING, which is what the API actually reports.
    key: 'PROCESSING',
    label: 'In Production',
    bg: '#F5EEF2',
    color: '#5C566E',
    desc: 'Being printed and packed',
  },
  {
    key: 'DISPATCHED',
    label: 'Shipped',
    bg: '#F5EEF2',
    color: '#5C566E',
    desc: 'In transit to branch',
  },
  {
    key: 'DELIVERED',
    label: 'Delivered',
    bg: '#ECFDF5',
    color: '#3F9C68',
    desc: 'Delivered to branch desk',
  },
  {
    key: 'REJECTED',
    label: 'Rejected',
    bg: '#FEF2F2',
    color: '#DC2626',
    desc: 'Declined by Head Office',
  },
]

/** The shared card: hairline border and a soft shadow. */
const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: '1px solid #F0E6EC',
}

export default function SiteUserOrdersPage() {
  const { user } = useAuth()
  // No branch means "everything this user may see"; a made-up branch id
  // would only ever return nothing.
  const siteId = user?.siteId || undefined

  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'ALL'>(
    'ALL'
  )
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [activeProofOrder, setActiveProofOrder] = useState<Order | null>(null)

  // Searching asks the API, so it waits for the typing to stop.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const filters = { siteId, search: searchQuery || undefined }

  const ordersQuery = useQuery({
    queryKey: [
      'orders',
      'pipeline',
      { ...filters, status: selectedStatus, page },
    ],
    queryFn: () =>
      getOrders({ ...filters, status: selectedStatus, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
    enabled: Boolean(user),
  })
  const filteredOrders = ordersQuery.data?.items ?? []
  const isLoading = ordersQuery.isPending
  const totalPages = ordersQuery.data?.totalPages ?? 1

  // The pipeline figures are the API's totals: a page of 25 cannot be counted
  // to say how many orders are waiting on Head Office.
  const counts = useQuery({
    queryKey: ['orders', 'pipeline', 'counts', filters],
    queryFn: async () => {
      const ask = (status: OrderStatus | 'ALL') =>
        getOrders({ ...filters, status, page: 1, pageSize: 1 }).then(
          (result) => result.total
        )
      const [pending, production, dispatched, delivered] = await Promise.all([
        ask('PENDING_APPROVAL'),
        ask('PROCESSING'),
        ask('DISPATCHED'),
        ask('DELIVERED'),
      ])
      return {
        pending,
        production,
        shipped: dispatched + delivered,
      }
    },
    placeholderData: keepPreviousData,
    enabled: Boolean(user),
  }).data

  const pendingApprovalsCount = counts?.pending ?? 0
  const inProductionCount = counts?.production ?? 0
  const shippedCount = counts?.shipped ?? 0

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* 1. Page header. This was a bordered banner with a pink branch chip;
          the branch is context for the title, so it now sits under it in grey. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            Branch purchase orders
          </h1>

          <p
            style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}
          >
            Track your branch&apos;s print proofs, Head Office approval and
            delivery. Orders are billed to Head Office, not to your branch.
          </p>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '6px',
              fontSize: '0.76rem',
              color: '#A39BB3',
            }}
          >
            <Building2 size={14} />
            <span>
              {user?.siteName
                ? `${user.siteName}${user.siteCode ? ` (${user.siteCode})` : ''}`
                : 'All branches you can see'}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <Link
            href="/shop/templates"
            className="touch-target"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
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
            <Sparkles size={14} />
            New print order
          </Link>
        </div>
      </div>

      {/* 2. Pipeline Summary KPI Cards */}
      <div
        className="grid-auto"
        style={{ ['--min']: '200px' } as React.CSSProperties}
      >
        <StatCard
          label="Pending Head Office Approval"
          icon={Clock}
          value={pendingApprovalsCount}
          footer="Awaiting controller approval"
        />

        <StatCard
          label="Approved / In Production"
          icon={Layers}
          value={inProductionCount}
          footer="Paid & printing in progress"
        />

        <StatCard
          label="Dispatched & Delivered"
          icon={Truck}
          value={shippedCount}
          footer="Shipped via direct carrier"
        />

        <StatCard
          label="Charged to your branch"
          icon={ShieldCheck}
          value="$0.00"
          footer="Billed to Head Office"
        />
      </div>

      {/* 3. Orders & PO table. The search and status filter used to be a card of
          their own above this one; they only act on this table, so they are its
          header now. */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div
          className="row-wrap"
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #F5EEF2',
            justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              position: 'relative',
              flex: 1,
              minWidth: '160px',
              maxWidth: '440px',
            }}
          >
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#A39BB3',
              }}
            />
            <input
              type="text"
              className="touch-target"
              placeholder="Search by order #, PO or your reference..."
              aria-label="Search purchase orders"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '36px',
                paddingRight: '12px',
                paddingTop: '8px',
                paddingBottom: '8px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                fontSize: '0.84rem',
                color: '#2B253E',
                backgroundColor: '#FFFFFF',
                outline: 'none',
              }}
            />
          </div>

          <div className="row-wrap">
            <span
              style={{ fontSize: '0.78rem', color: '#5C566E', fontWeight: 600 }}
            >
              Filter Status:
            </span>
            <select
              className="touch-target"
              value={selectedStatus}
              aria-label="Filter by status"
              onChange={(e) => {
                setSelectedStatus(e.target.value as OrderStatus | 'ALL')
                setPage(1)
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                fontSize: '0.84rem',
                color: '#2B253E',
                backgroundColor: '#FFFFFF',
              }}
            >
              <option value="ALL">All PO Statuses</option>
              <option value="PENDING_APPROVAL">Pending Approval</option>
              <option value="CHANGES_REQUESTED">Changes Requested</option>
              <option value="APPROVED">Approved</option>
              <option value="PROCESSING">In Production</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="DELIVERED">Delivered</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} columns={6} label="Loading purchase orders" />
        ) : filteredOrders.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center' }}>
            <ClipboardList
              size={20}
              color="#A39BB3"
              style={{ display: 'block', margin: '0 auto 8px auto' }}
            />
            <h3
              style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: '#2B253E',
                margin: 0,
              }}
            >
              No Purchase Orders Found
            </h3>
            <p
              style={{
                fontSize: '0.84rem',
                color: '#A39BB3',
                margin: '4px 0 0',
              }}
            >
              You have not created any purchase orders matching the current
              filter.
            </p>
          </div>
        ) : (
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
                  <Th edge>PO Reference / Order #</Th>
                  <Th>Print Product & Customised Artwork</Th>
                  <Th>Qty & Price</Th>
                  <Th>Status</Th>
                  <Th className="hide-sm">Delivery Destination</Th>
                  <Th align="right" edge>
                    Actions
                  </Th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map((order) => {
                  const firstItem = order.lineItems[0]
                  const meta = STATUS_PIPELINE.find(
                    (p) => p.key === order.status
                  ) || {
                    label: order.status,
                    bg: '#F5EEF2',
                    color: '#5C566E',
                    desc: 'In system',
                  }

                  return (
                    <tr
                      key={order.id}
                      style={{
                        borderTop: '1px solid #F5EEF2',
                        transition: 'background-color 120ms ease',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = '#FCF7FA')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = 'transparent')
                      }
                    >
                      <td style={{ padding: '12px 20px' }}>
                        <strong
                          style={{
                            color: '#2B253E',
                            display: 'block',
                            fontWeight: 600,
                          }}
                        >
                          {order.poReference || 'N/A'}
                        </strong>
                        <span style={{ fontSize: '0.74rem', color: '#6E6781' }}>
                          {order.orderNumber}
                        </span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: '#A39BB3',
                            display: 'block',
                          }}
                        >
                          {new Date(order.createdAt).toLocaleDateString()}
                        </span>
                        <span
                          className="show-sm"
                          style={{
                            fontSize: '0.72rem',
                            color: '#A39BB3',
                            display: 'block',
                          }}
                        >
                          {order.siteName}
                        </span>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                          }}
                        >
                          <div
                            style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '10px',
                              backgroundColor: '#F5EEF2',
                              position: 'relative',
                              overflow: 'hidden',
                              flexShrink: 0,
                            }}
                          >
                            <Image
                              src={
                                firstItem?.thumbnailUrl ||
                                '/product-placeholder.svg'
                              }
                              alt="Proof thumbnail"
                              fill
                              unoptimized
                              style={{ objectFit: 'cover' }}
                            />
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: '#2B253E' }}>
                              {firstItem?.productName}
                            </div>
                            {firstItem?.customizations && (
                              <span
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                  fontSize: '0.74rem',
                                  color: '#6E6781',
                                }}
                              >
                                <Check size={12} style={{ flexShrink: 0 }} />
                                Personalised for{' '}
                                {firstItem.customizations.businessName ||
                                  user?.siteName}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <strong style={{ color: '#2B253E', fontWeight: 600 }}>
                          ${order.totalAmount.toFixed(2)}
                        </strong>
                        <span
                          style={{
                            fontSize: '0.74rem',
                            color: '#6E6781',
                            display: 'block',
                          }}
                        >
                          {order.itemCount} units
                        </span>
                        <span style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                          HO Corporate Billed
                        </span>
                      </td>

                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: '9999px',
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            backgroundColor: meta.bg,
                            color: meta.color,
                          }}
                        >
                          {meta.label}
                        </span>
                        {order.changesRequestedNotes && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'flex-start',
                              gap: '4px',
                              fontSize: '0.74rem',
                              color: '#B45309',
                              marginTop: '4px',
                              maxWidth: '200px',
                            }}
                          >
                            <AlertTriangle
                              size={12}
                              style={{ flexShrink: 0, marginTop: '2px' }}
                            />
                            <span>
                              HO Feedback: &quot;{order.changesRequestedNotes}
                              &quot;
                            </span>
                          </div>
                        )}
                        {order.trackingNumber && (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.74rem',
                              color: '#6E6781',
                              marginTop: '4px',
                            }}
                          >
                            <Truck size={12} style={{ flexShrink: 0 }} />
                            <span>
                              {order.carrier}: {order.trackingNumber}
                            </span>
                          </div>
                        )}
                      </td>

                      <td
                        className="hide-sm"
                        style={{ padding: '12px 14px', color: '#2B253E' }}
                      >
                        <div>{order.siteName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                          {order.recipientContact?.name || user?.name}
                        </div>
                      </td>

                      <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                        <button
                          onClick={() => setActiveProofOrder(order)}
                          className="touch-target"
                          style={{
                            padding: 0,
                            backgroundColor: 'transparent',
                            border: 'none',
                            color: '#F73582',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                          }}
                        >
                          View Artwork Proof
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <Pager
          page={page}
          totalPages={totalPages}
          total={ordersQuery.data?.total}
          isFetching={ordersQuery.isFetching}
          onChange={setPage}
          style={{ borderTop: '1px solid #F5EEF2' }}
        />
      </div>

      {/* 5. Artwork Proof Inspection Modal */}
      <AnimatePresence>
        {activeProofOrder && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              padding: '16px',
            }}
          >
            <motion.div
              className="dialog-cap"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #F0E6EC',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
                padding: '20px',
                maxWidth: '650px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                overflowY: 'auto',
              }}
            >
              <div
                className="row-wrap"
                style={{ justifyContent: 'space-between' }}
              >
                <div style={{ minWidth: 0 }}>
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      margin: 0,
                      color: '#2B253E',
                    }}
                  >
                    Artwork Proof: PO #
                    {activeProofOrder.poReference ||
                      activeProofOrder.orderNumber}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: '#6E6781' }}>
                    Status:{' '}
                    <strong style={{ fontWeight: 600, color: '#2B253E' }}>
                      {activeProofOrder.status}
                    </strong>
                  </span>
                </div>
                <button
                  onClick={() => setActiveProofOrder(null)}
                  className="touch-target"
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#FFFFFF',
                    border: '1px solid #F0E6EC',
                    color: '#2B253E',
                    fontSize: '0.82rem',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Close
                </button>
              </div>

              {/* Artwork Container */}
              <div
                style={{
                  position: 'relative',
                  width: '100%',
                  height: '280px',
                  borderRadius: '10px',
                  backgroundColor: '#FCF7FA',
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Image
                  src={
                    activeProofOrder.customizedArtwork?.previewUrl ||
                    activeProofOrder.lineItems[0]?.thumbnailUrl ||
                    '/product-placeholder.svg'
                  }
                  alt="Customised artwork proof"
                  fill
                  unoptimized
                  style={{ objectFit: 'contain' }}
                />
              </div>

              {/* Status Audit Log */}
              {activeProofOrder.statusHistory &&
                activeProofOrder.statusHistory.length > 0 && (
                  <div
                    style={{
                      borderTop: '1px solid #F5EEF2',
                      paddingTop: '12px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.76rem',
                        fontWeight: 500,
                        color: '#A39BB3',
                      }}
                    >
                      Audit & Approval History
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        marginTop: '6px',
                      }}
                    >
                      {activeProofOrder.statusHistory.map((h) => (
                        <div
                          key={`${h.timestamp}-${h.status}`}
                          style={{ fontSize: '0.8rem', color: '#5C566E' }}
                        >
                          <span style={{ fontWeight: 600, color: '#2B253E' }}>
                            {h.actorName}
                          </span>{' '}
                          ({h.actorRole}) •{' '}
                          <span style={{ color: '#A39BB3' }}>
                            {new Date(h.timestamp).toLocaleTimeString()}
                          </span>
                          : <em>{h.comment || h.status}</em>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

/**
 * A KPI tile, copied from the admin dashboard's StatCard. The four tiles used
 * to set their labels in four different status colours; none of the colours
 * meant anything the label did not already say.
 */
function StatCard({
  label,
  value,
  icon: Icon,
  footer,
}: {
  label: string
  value: React.ReactNode
  icon: LucideIcon
  footer: React.ReactNode
}) {
  return (
    <div style={{ ...card, padding: '18px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <span
          style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6E6781' }}
        >
          {label}
        </span>
        <span
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            backgroundColor: '#FDE8F1',
            color: '#E02874',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon size={16} />
        </span>
      </div>

      <div
        style={{
          marginTop: '12px',
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#2B253E',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>

      <div style={{ marginTop: '8px', fontSize: '0.76rem', color: '#A39BB3' }}>
        {footer}
      </div>
    </div>
  )
}

/** A column label. `edge` carries the table's outer gutter. */
function Th({
  children,
  align = 'left',
  edge,
  className,
}: {
  children?: React.ReactNode
  align?: 'left' | 'center' | 'right'
  edge?: boolean
  className?: string
}) {
  return (
    <th
      className={className}
      style={{
        padding: edge ? '10px 20px' : '10px 14px',
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
