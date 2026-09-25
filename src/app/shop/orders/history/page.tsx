// src/app/shop/orders/history/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import { ReorderButton } from '@/components/shop/ReorderButton'
import { useAuth } from '@/hooks/useAuth'
import { getOrders } from '@/services/orders.service'
import { OrderStatusBadge } from '@/components/shop/OrderStatusBadge'
import {
  ClipboardList,
  Search,
  Eye,
  Building2,
  Calendar,
  Package,
  Clock,
  Truck,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'

/** The clock, read when a filter is chosen rather than while rendering. */
function daysAgoIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

const PAGE_SIZE = 25

/** The tabs, in lifecycle order. Each is a status the API filters on. */
const STATUS_TABS = [
  { status: 'ALL', label: 'All Statuses' },
  { status: 'PENDING_APPROVAL', label: 'Awaiting approval' },
  { status: 'PROCESSING', label: 'Processing' },
  { status: 'DISPATCHED', label: 'Dispatched' },
  { status: 'DELIVERED', label: 'Delivered' },
] as const

type StatusTab = (typeof STATUS_TABS)[number]['status']

const pagerButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '6px 10px',
  borderRadius: '8px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
}

/** The shared card: hairline border and a soft shadow. */
const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: '1px solid #F0E6EC',
}

export default function SiteOrderHistoryPage() {
  const { user } = useAuth()
  // Without a branch the API scopes the list to what this user may see; a
  // made-up branch id would only ever return nothing.
  const siteId = user?.siteId || undefined

  const [statusFilter, setStatusFilter] = useState<StatusTab>('ALL')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState<'all' | '30d' | '90d'>('all')
  /** The start of the date window, fixed when the filter was chosen. */
  const [from, setFrom] = useState<string | undefined>(undefined)
  const [page, setPage] = useState(1)

  // Search runs on the server, so it waits for typing to pause.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const filters = {
    siteId,
    search: search || undefined,
    startDate: from,
  }

  const ordersQuery = useQuery({
    queryKey: ['orders', 'history', { ...filters, status: statusFilter, page }],
    queryFn: () =>
      getOrders({
        ...filters,
        status: statusFilter,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
    enabled: Boolean(user),
  })
  const orders = ordersQuery.data?.items ?? []
  const totalPages = ordersQuery.data?.totalPages ?? 1
  const isLoading = ordersQuery.isPending

  // One count per tab, from the API's own totals: a page of 25 cannot be
  // counted to say how many orders there are in each state.
  const counts = useQuery({
    queryKey: ['orders', 'history', 'counts', filters],
    queryFn: async () => {
      const totals = await Promise.all(
        STATUS_TABS.map((tab) =>
          getOrders({
            ...filters,
            status: tab.status,
            page: 1,
            pageSize: 1,
          }).then((result) => [tab.status, result.total] as const)
        )
      )
      return Object.fromEntries(totals) as Record<StatusTab, number>
    },
    placeholderData: keepPreviousData,
    enabled: Boolean(user),
  }).data

  const hasFilters =
    search !== '' || statusFilter !== 'ALL' || dateFilter !== 'all'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* 1. Header. The branch used to be a pink line above the title; it is
          context for the title, so it sits under the description in grey. */}
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
            Site Collateral Order History
          </h1>
          <p
            style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}
          >
            Read-only audit history of orders placed for this site branch.
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
            href="/shop/catalogue"
            style={{
              display: 'inline-flex',
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
            <Package size={14} /> New Collateral Order
          </Link>
        </div>
      </div>

      {/* 2. KPI Cards. The values were set in amber, green and pink with a
          matching pastel icon tile each; the labels already say what they are. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
        }}
      >
        <StatCard
          label="Total Site Orders"
          icon={ClipboardList}
          value={counts?.ALL ?? '—'}
        />

        <StatCard
          label="Awaiting Approval"
          icon={ShieldCheck}
          value={counts?.PENDING_APPROVAL ?? '—'}
        />

        <StatCard
          label="In Fulfilment"
          icon={Clock}
          value={counts?.PROCESSING ?? '—'}
        />

        <StatCard
          label="Dispatched & Delivered"
          icon={Truck}
          value={
            counts ? (counts.DISPATCHED ?? 0) + (counts.DELIVERED ?? 0) : '—'
          }
        />
      </div>

      {/* 3. Orders table. Search, date and status filters used to be a card of
          their own above it; they only act on this table, so they are its
          header now. */}
      <div style={{ ...card, overflow: 'hidden' }}>
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid #F5EEF2',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            {/* Search */}
            <div
              style={{
                position: 'relative',
                flex: 1,
                minWidth: '260px',
                maxWidth: '420px',
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
                placeholder="Search by order #, PO or your reference..."
                aria-label="Search orders"
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

            {/* Date Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar size={16} color="#A39BB3" />
              <select
                value={dateFilter}
                aria-label="Date placed"
                onChange={(e) => {
                  const next = e.target.value as 'all' | '30d' | '90d'
                  setDateFilter(next)
                  setFrom(
                    next === '30d'
                      ? daysAgoIso(30)
                      : next === '90d'
                        ? daysAgoIso(90)
                        : undefined
                  )
                  setPage(1)
                }}
                style={{
                  fontSize: '0.84rem',
                  color: '#2B253E',
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #F0E6EC',
                  borderRadius: '10px',
                  padding: '8px 12px',
                  outline: 'none',
                }}
              >
                <option value="all">All Dates</option>
                <option value="30d">Last 30 Days</option>
                <option value="90d">Last 90 Days</option>
              </select>
            </div>
          </div>

          {/* Status Filter Tabs */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              overflowX: 'auto',
            }}
          >
            {STATUS_TABS.map(({ status, label }) => {
              const isSelected = statusFilter === status
              const count = counts?.[status]

              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => {
                    setStatusFilter(status)
                    setPage(1)
                  }}
                  style={{
                    padding: '4px 12px',
                    borderRadius: '9999px',
                    fontSize: '0.78rem',
                    fontWeight: isSelected ? 600 : 500,
                    whiteSpace: 'nowrap',
                    cursor: 'pointer',
                    border: 'none',
                    backgroundColor: isSelected ? '#2B253E' : '#F5EEF2',
                    color: isSelected ? '#FFFFFF' : '#5C566E',
                    transition: 'background-color 0.15s ease, color 0.15s ease',
                  }}
                >
                  {label}
                  {count !== undefined ? ` (${count})` : ''}
                </button>
              )
            })}
          </div>
        </div>

        {isLoading ? (
          <SkeletonTable rows={8} columns={7} label="Loading your orders" />
        ) : ordersQuery.isError ? (
          <p
            role="alert"
            style={{
              padding: '32px',
              margin: 0,
              textAlign: 'center',
              color: '#DC2626',
              fontSize: '0.84rem',
            }}
          >
            Your orders could not be loaded. Refresh the page to try again.
          </p>
        ) : orders.length === 0 ? (
          <div
            style={{
              padding: '32px',
              textAlign: 'center',
              maxWidth: '420px',
              margin: '0 auto',
            }}
          >
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
                margin: '0 0 4px 0',
              }}
            >
              No Orders Found
            </h3>
            <p
              style={{
                fontSize: '0.84rem',
                color: '#A39BB3',
                margin: '0 0 16px 0',
                lineHeight: 1.5,
              }}
            >
              {hasFilters
                ? 'No past orders matched your filters. Try resetting the search or status filter.'
                : 'No collateral orders have been placed for this branch yet.'}
            </p>
            {/* Secondary: the page header already carries the primary action. */}
            <Link
              href="/shop/catalogue"
              style={{
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
              }}
            >
              Order Marketing Assets
            </Link>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
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
                  <Th edge>Order Number</Th>
                  <Th>Date Placed</Th>
                  <Th>PO Reference</Th>
                  <Th>Items / Assets</Th>
                  <Th>Fulfilment Status</Th>
                  <Th align="right">Order Total</Th>
                  <Th align="right" edge>
                    Actions
                  </Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
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
                      <Link
                        href={`/shop/orders/${order.id}`}
                        style={{
                          fontWeight: 600,
                          color: '#2B253E',
                          textDecoration: 'none',
                          display: 'block',
                        }}
                      >
                        {order.orderNumber}
                      </Link>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontFamily: 'monospace',
                          color: '#A39BB3',
                        }}
                      >
                        ID: {order.id}
                      </span>
                    </td>

                    <td
                      style={{
                        padding: '12px 14px',
                        color: '#6E6781',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {new Date(order.createdAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </td>

                    {/* Plain grey monospace, as on the dashboard. The grey chip
                        behind it made a reference look like a status. */}
                    <td
                      style={{
                        padding: '12px 14px',
                        fontFamily: 'monospace',
                        fontSize: '0.78rem',
                        color: '#6E6781',
                      }}
                    >
                      {order.poReference || '—'}
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <div style={{ maxWidth: '240px' }}>
                        <span
                          style={{
                            fontWeight: 500,
                            color: '#2B253E',
                            display: 'block',
                          }}
                        >
                          {order.itemCount} items ({order.lineItems.length}{' '}
                          lines)
                        </span>
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: '#A39BB3',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'block',
                          }}
                        >
                          {order.lineItems
                            .map((li) => li.productName)
                            .join(', ')}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '12px 14px' }}>
                      <OrderStatusBadge status={order.status} size="sm" />
                      {order.carrier && (
                        <span
                          style={{
                            fontSize: '0.72rem',
                            color: '#A39BB3',
                            display: 'block',
                            marginTop: '3px',
                          }}
                        >
                          {order.carrier}
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                      <span
                        style={{
                          fontWeight: 700,
                          color: '#2B253E',
                          display: 'block',
                        }}
                      >
                        ${order.totalAmount.toFixed(2)}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                        On-Account
                      </span>
                    </td>

                    <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          gap: '12px',
                          alignItems: 'center',
                        }}
                      >
                        <ReorderButton
                          orderId={order.id}
                          orderNumber={order.orderNumber}
                          compact
                        />
                        <Link
                          href={`/shop/orders/${order.id}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            color: '#F73582',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <Eye size={14} /> View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '12px 20px',
                  borderTop: '1px solid #F5EEF2',
                  fontSize: '0.8rem',
                  color: '#6E6781',
                }}
              >
                <span>
                  Page {page} of {totalPages}
                  {ordersQuery.isFetching ? ' · updating…' : ''}
                </span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    style={pagerButton}
                  >
                    <ChevronLeft size={14} /> Previous
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    style={pagerButton}
                  >
                    Next <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * A KPI tile, copied from the admin dashboard's StatCard: grey label, the icon
 * in the shared soft pink chip, the number in ink.
 */
function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: React.ReactNode
  icon: LucideIcon
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
    </div>
  )
}

/** A column label. `edge` carries the table's outer gutter. */
function Th({
  children,
  align = 'left',
  edge,
}: {
  children?: React.ReactNode
  align?: 'left' | 'center' | 'right'
  edge?: boolean
}) {
  return (
    <th
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
