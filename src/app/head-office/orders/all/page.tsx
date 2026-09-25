// src/app/head-office/orders/all/page.tsx
'use client'

import { Skeleton as UiSkeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/TableState'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Filter, ChevronRight, X } from 'lucide-react'
import { useOrders } from '@/hooks/useOrders'
import { useSites } from '@/hooks/useAccounts'
import { Pager } from '@/components/ui/Pager'
import { ReportDownloadButtons } from '@/components/reports/ReportDownloadButtons'
import { useAuth } from '@/hooks/useAuth'
import { StatusPill } from '@/components/admin/StatusPill'
import type { OrderStatus } from '@/types'
import { formatMoney, formatDate } from '@/lib/format'

const STATUSES: Array<{ id: OrderStatus | 'ALL'; label: string }> = [
  { id: 'ALL', label: 'All Statuses' },
  { id: 'PENDING_APPROVAL', label: 'Awaiting approval' },
  { id: 'CHANGES_REQUESTED', label: 'Changes requested' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'PROCESSING', label: 'Processing' },
  { id: 'DISPATCHED', label: 'Dispatched' },
  { id: 'DELIVERED', label: 'Delivered' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'CANCELLED', label: 'Cancelled' },
]

/** Inputs and selects in the filter bar share one quiet style. */
const field: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #F0E6EC',
  borderRadius: '10px',
  fontSize: '0.84rem',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  outline: 'none',
  // A select sizes itself to its widest option, and "SITE-014 — Auckland
  // Central Distribution" was wider than a phone, taking the page with it.
  maxWidth: '100%',
}

/** A table cell's padding; `edge` columns carry the table's 20px gutter. */
function cellPadding(idx: number, last: number, y = '12px') {
  if (idx === 0) return `${y} 14px ${y} 20px`
  if (idx === last) return `${y} 20px ${y} 14px`
  return `${y} 14px`
}

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

export default function HOOrdersAllPage() {
  const { user } = useAuth()
  // The account the signed-in user belongs to. The API scopes every
  // head-office read to it anyway; this is what the screen asks about.
  const accountId = user?.accountId ?? ''
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [siteFilter, setSiteFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'ALL'>('ALL')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [page, setPage] = useState(1)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  // The account's own branches. The list used to be three invented sites, so
  // the filter could only ever narrow a real account to nothing.
  const sites = useSites({ accountId: accountId || undefined, pageSize: 100 })

  // Every filter runs on the server. Filtering one page of 100 in the browser
  // hid every order past the hundredth.
  const from = startDate
    ? new Date(`${startDate}T00:00:00`).toISOString()
    : undefined
  const to = endDate
    ? new Date(`${endDate}T23:59:59.999`).toISOString()
    : undefined
  const {
    data: ordersData,
    isLoading,
    isFetching,
    error: ordersError,
    refetch,
  } = useOrders({
    accountId: accountId || undefined,
    status: statusFilter,
    siteId: siteFilter === 'all' ? undefined : siteFilter,
    search: search || undefined,
    startDate: from,
    endDate: to,
    page,
    pageSize: 25,
  })
  const filteredOrders = ordersData?.items ?? []

  const clearFilters = () => {
    setSearchInput('')
    setSearch('')
    setSiteFilter('all')
    setStatusFilter('ALL')
    setStartDate('')
    setEndDate('')
    setPage(1)
  }
  const hasFilters =
    searchInput ||
    siteFilter !== 'all' ||
    statusFilter !== 'ALL' ||
    startDate ||
    endDate

  // What the export is filtered by: the same as the table, less the search,
  // which the report does not take.
  const exportParams = {
    ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
    ...(siteFilter !== 'all' ? { siteId: siteFilter } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header */}
      <div
        className="stack-sm"
        style={{
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              marginBottom: '6px',
              fontSize: '0.76rem',
              color: '#A39BB3',
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
            <span style={{ color: '#6E6781', fontWeight: 500 }}>Orders</span>
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
            Orders across your sites
          </h1>
          <p
            style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}
          >
            All orders across your account&apos;s sites — read only
          </p>
        </div>
        <ReportDownloadButtons
          report="orders/history"
          label="Export"
          params={exportParams}
        />
      </div>

      {/* Filters */}
      <div
        className="row-wrap"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          padding: '14px 16px',
          border: '1px solid #F0E6EC',
        }}
      >
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '180px' }}>
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
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            aria-label="Search orders"
            className="touch-target"
            placeholder="Search order #, PO or customer reference..."
            style={{
              ...field,
              width: '100%',
              padding: '8px 12px 8px 36px',
            }}
          />
        </div>
        {/* Site filter */}
        <select
          value={siteFilter}
          aria-label="Site"
          className="touch-target"
          onChange={(e) => {
            setSiteFilter(e.target.value)
            setPage(1)
          }}
          style={field}
        >
          <option value="all">All Sites</option>
          {sites.data?.items.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} — {s.name}
            </option>
          ))}
        </select>
        {/* Status filter */}
        <select
          value={statusFilter}
          aria-label="Status"
          className="touch-target"
          onChange={(e) => {
            setStatusFilter(e.target.value as OrderStatus | 'ALL')
            setPage(1)
          }}
          style={field}
        >
          {STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {/* Date range */}
        <div className="row-wrap" style={{ flex: '0 1 auto' }}>
          <input
            type="date"
            value={startDate}
            aria-label="From date"
            className="touch-target"
            onChange={(e) => {
              setStartDate(e.target.value)
              setPage(1)
            }}
            style={field}
          />
          <span style={{ color: '#A39BB3', fontSize: '0.78rem' }}>to</span>
          <input
            type="date"
            value={endDate}
            aria-label="To date"
            className="touch-target"
            onChange={(e) => {
              setEndDate(e.target.value)
              setPage(1)
            }}
            style={field}
          />
        </div>
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="touch-target"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #F0E6EC',
              borderRadius: '10px',
              padding: '8px 14px',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: '#2B253E',
              cursor: 'pointer',
            }}
          >
            <X size={16} /> Clear
          </button>
        )}
      </div>

      {/* Results count */}
      <div
        style={{
          fontSize: '0.78rem',
          color: '#A39BB3',
          fontWeight: 500,
          marginTop: '-8px',
        }}
      >
        {isLoading ? (
          <UiSkeleton width="90px" height="10px" />
        ) : (
          `${ordersData?.total ?? 0} order${(ordersData?.total ?? 0) !== 1 ? 's' : ''} found`
        )}
      </div>

      {/* Table */}
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          border: '1px solid #F0E6EC',
          overflow: 'hidden',
        }}
      >
        <div className="table-scroll">
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.84rem',
            }}
          >
            {/* No filled header band: the column names are labels, set in
                grey, and each row's hairline does the separating. */}
            <thead>
              <tr>
                {[
                  'Order #',
                  'Site',
                  'Ordered By',
                  'PO Reference',
                  'Date',
                  'Items',
                  'Value',
                  'Status',
                  '',
                ].map((h, idx, arr) => (
                  <th
                    key={h}
                    style={{
                      padding: cellPadding(idx, arr.length - 1, '10px'),
                      textAlign:
                        h === 'Items'
                          ? 'center'
                          : h === 'Value'
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
              {isLoading ? (
                [0, 1, 2, 3, 4].map((i) => (
                  <tr key={i} style={{ borderTop: '1px solid #F5EEF2' }}>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((j) => (
                      <td key={j} style={{ padding: cellPadding(j, 8) }}>
                        <Skeleton
                          h="0.8rem"
                          w={j === 0 ? '100px' : j === 1 ? '140px' : '80px'}
                        />
                      </td>
                    ))}
                  </tr>
                ))
              ) : ordersError ? (
                // Before the empty check: a failed fetch used to render "No
                // orders match your filters", which invites the reader to widen
                // a filter that was never the problem.
                <tr>
                  <td colSpan={9} style={{ padding: 0 }}>
                    <ErrorState
                      title="Orders could not be loaded"
                      detail="The orders service did not respond. Your filters are still set — try again."
                      error={ordersError}
                      onRetry={() => refetch()}
                    />
                  </td>
                </tr>
              ) : (
                <AnimatePresence mode="popLayout">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        style={{
                          padding: '32px',
                          textAlign: 'center',
                          color: '#A39BB3',
                          fontSize: '0.84rem',
                        }}
                      >
                        <Filter
                          size={20}
                          style={{ display: 'block', margin: '0 auto 8px' }}
                        />
                        <div>No orders match your filters</div>
                        <button
                          onClick={clearFilters}
                          className="touch-target"
                          style={{
                            marginTop: '6px',
                            color: '#F73582',
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                          }}
                        >
                          Clear filters
                        </button>
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((o, idx) => (
                      <motion.tr
                        key={o.id}
                        layout
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.18, delay: idx * 0.02 }}
                        style={{
                          borderTop: '1px solid #F5EEF2',
                          cursor: 'default',
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor = '#FCF7FA')
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            'transparent')
                        }
                      >
                        <td
                          style={{
                            padding: cellPadding(0, 8),
                            fontWeight: 600,
                            color: '#2B253E',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {o.orderNumber}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div style={{ color: '#2B253E' }}>{o.siteName}</div>
                          <div
                            style={{ fontSize: '0.72rem', color: '#A39BB3' }}
                          >
                            {o.siteCode}
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            color: '#6E6781',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {o.userName}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            color: '#A39BB3',
                            fontFamily: 'monospace',
                            fontSize: '0.78rem',
                          }}
                        >
                          {o.poReference ?? '—'}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            color: '#6E6781',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatDate(o.createdAt)}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            textAlign: 'center',
                            color: '#6E6781',
                          }}
                        >
                          {o.itemCount}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#2B253E',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatMoney(o.totalAmount)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <StatusPill status={o.status as OrderStatus} />
                        </td>
                        <td
                          style={{
                            padding: cellPadding(8, 8),
                            textAlign: 'right',
                          }}
                        >
                          {/* A plain link, not a pink tile: every row has one,
                              and nine pink tiles out-shout the data. */}
                          <Link
                            href={`/head-office/orders/${o.id}`}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '2px',
                              color: '#6E6781',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              textDecoration: 'none',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            View <ChevronRight size={13} />
                          </Link>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              )}
            </tbody>
          </table>
        </div>
        <Pager
          page={page}
          totalPages={ordersData?.totalPages ?? 1}
          isFetching={isFetching}
          onChange={setPage}
          style={{ borderTop: '1px solid #F5EEF2' }}
        />
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
