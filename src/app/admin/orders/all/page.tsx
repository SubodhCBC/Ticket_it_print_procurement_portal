// src/app/admin/orders/all/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/TableState'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ShoppingCart, Search, ExternalLink, Truck, Eye } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { StatusPill } from '@/components/admin/StatusPill'
import { OrderActionModal } from '@/components/admin/OrderActionModal'
import { useOrders, useOrderMutations } from '@/hooks/useOrders'
import { Pager } from '@/components/ui/Pager'
import { ReportDownloadButtons } from '@/components/reports/ReportDownloadButtons'
import type { Order, OrderStatus } from '@/types'
import { useAuth } from '@/hooks/useAuth'
import { formatMoney, formatDate } from '@/lib/format'

/** A column label, as on the admin dashboard: grey, regular weight, no band. */
const th: React.CSSProperties = {
  padding: '10px 14px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}

/** The outer columns carry the table's 20px gutter. */
const thEdge: React.CSSProperties = { ...th, padding: '10px 20px' }

export default function AllOrdersPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | 'ALL'>(
    'ALL'
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)

  // The API searches order number, PO and customer reference; it waits for
  // typing to pause rather than asking on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchQuery.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const {
    data: ordersData,
    isLoading,
    isFetching,
    error: ordersError,
    refetch,
  } = useOrders({
    status: selectedStatus,
    search: search || undefined,
    page,
    pageSize: 25,
  })

  const { updateOrderStatus } = useOrderMutations()

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const handleOpenOrder = (order: Order) => {
    setSelectedOrder(order)
    setIsModalOpen(true)
  }

  const handleStatusUpdate = async (
    id: string,
    status: any,
    metadata?: any
  ) => {
    await updateOrderStatus(id, status, metadata)
    refetch()
  }

  const statusTabs: { id: OrderStatus | 'ALL'; label: string }[] = [
    { id: 'ALL', label: 'All Orders' },
    // "Received" was here: the API has no such status and the adapter sent it
    // as PROCESSING, so it was the next tab again under another name.
    { id: 'PENDING_APPROVAL', label: 'Awaiting approval' },
    { id: 'PROCESSING', label: 'Processing' },
    { id: 'DISPATCHED', label: 'Dispatched' },
    { id: 'DELIVERED', label: 'Delivered' },
  ]

  return (
    <>
      <AdminHeader
        title="All orders"
        subtitle="Every order across all accounts, with line items and dispatch tracking"
        actionButton={
          <div className="row-wrap" style={{ gap: '8px' }}>
            {/* Every matching order from the server, not the page showing.
                Search is not an export filter; status is. */}
            <ReportDownloadButtons
              report="orders/history"
              label="Export"
              params={
                selectedStatus === 'ALL' ? {} : { status: selectedStatus }
              }
            />
            {/* A pink border rather than none, so it stands the same height as
                the outlined button beside it. */}
            <Link
              href="/admin/orders/fulfilment"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                backgroundColor: '#F73582',
                border: '1px solid #F73582',
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              <Truck size={15} />
              <span>Fulfilment Board</span>
            </Link>
          </div>
        }
      />

      <main
        className="page-pad"
        style={{
          paddingBlock: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Status Filter Tabs & Search Bar */}
        <div
          className="row-wrap"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #F0E6EC',
            borderRadius: '14px',
            boxShadow:
              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
            padding: '12px 16px',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          {/* Status Pills Tabs. The selected tab is told apart by its white
              face and pink label; it no longer needs a shadow to lift it.
              Five tabs in one unwrapping row pushed "Delivered" off a 360px
              screen, so the strip wraps to a second line instead. */}
          <div
            className="row-wrap"
            style={{
              gap: '2px',
              backgroundColor: '#F5EEF2',
              padding: '3px',
              borderRadius: '10px',
            }}
          >
            {statusTabs.map((tab) => {
              const isActive = selectedStatus === tab.id
              return (
                <button
                  key={tab.id}
                  className="touch-target"
                  type="button"
                  onClick={() => {
                    setSelectedStatus(tab.id)
                    setPage(1)
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    fontSize: '0.78rem',
                    fontWeight: isActive ? 600 : 500,
                    backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                    color: isActive ? '#F73582' : '#6E6781',
                    transition: 'background-color 150ms ease, color 150ms ease',
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Search Box. The 280px floor was wider than the room left on a
              phone, so the field grows and shrinks with the bar instead. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #F0E6EC',
              borderRadius: '10px',
              padding: '8px 12px',
              flex: '1 1 200px',
              minWidth: 0,
            }}
          >
            <Search size={16} color="#A39BB3" />
            <input
              type="text"
              placeholder="Search by order #, PO or customer reference..."
              aria-label="Search orders"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                backgroundColor: 'transparent',
                fontSize: '0.84rem',
                color: '#2B253E',
                width: '100%',
                minWidth: 0,
              }}
            />
          </div>
        </div>

        {/* Orders Table */}
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
          {isLoading ? (
            <SkeletonTable rows={10} columns={7} label="Loading orders" />
          ) : ordersError ? (
            // Ahead of the empty check on purpose: a failed request used to
            // fall through to "No orders matching current filter", which reads
            // as a filter that found nothing rather than a service that is
            // down.
            <ErrorState
              title="Orders could not be loaded"
              detail="The orders service did not respond. Your filters are still set — try again."
              error={ordersError}
              onRetry={() => refetch()}
            />
          ) : !ordersData?.items.length ? (
            <EmptyState
              icon={ShoppingCart}
              title="No orders matching current filter"
              detail={
                selectedStatus === 'ALL' && !search
                  ? 'Orders placed by any site appear here as soon as they are submitted.'
                  : 'Try another status tab, or clear the search to see every order.'
              }
            />
          ) : (
            // Eight columns cannot fit a phone: the table keeps its width and
            // scrolls inside the card rather than widening the page.
            <div className="table-scroll">
              <table
                style={{
                  width: '100%',
                  minWidth: '960px',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.84rem',
                }}
              >
                <thead>
                  <tr>
                    <th style={thEdge}>Order #</th>
                    <th style={th}>Date Placed</th>
                    <th style={th}>Site & account</th>
                    <th style={th}>PO Reference</th>
                    <th style={th}>Status</th>
                    <th style={th}>Logistics / Waybill</th>
                    <th style={{ ...th, textAlign: 'right' }}>Total Amount</th>
                    <th style={{ ...thEdge, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {ordersData.items.map((order) => (
                    <tr
                      key={order.id}
                      onClick={() => handleOpenOrder(order)}
                      tabIndex={0}
                      aria-label={`Open order ${order.orderNumber}`}
                      onKeyDown={(e) => {
                        // Only the row's own keystrokes: a link or button
                        // inside it must not also open the dialog.
                        if (e.target !== e.currentTarget) return
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          handleOpenOrder(order)
                        }
                      }}
                      style={{
                        borderTop: '1px solid #F5EEF2',
                        cursor: 'pointer',
                        transition: 'background-color 120ms ease',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.backgroundColor = '#FCF7FA')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.backgroundColor = 'transparent')
                      }
                    >
                      <td
                        style={{
                          padding: '12px 20px',
                          fontWeight: 600,
                          color: '#2B253E',
                        }}
                      >
                        <Link
                          href={`/admin/orders/${order.id}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            color: '#2B253E',
                            textDecoration: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span>{order.orderNumber}</span>
                          <ExternalLink size={12} color="#A39BB3" />
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px', color: '#6E6781' }}>
                        {formatDate(order.createdAt)}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#2B253E' }}>
                        <div>{order.siteName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                          {order.accountName}
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
                        {order.poReference || '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <StatusPill status={order.status} />
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          color: '#6E6781',
                          fontSize: '0.78rem',
                        }}
                      >
                        <div>{order.carrier || 'Unassigned'}</div>
                        {/* Dark rather than pink: a waybill is a value to read,
                            not a link to follow. */}
                        {order.trackingNumber && (
                          <div
                            style={{
                              fontFamily: 'monospace',
                              color: '#2B253E',
                            }}
                          >
                            {order.trackingNumber}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: '#2B253E',
                        }}
                      >
                        {formatMoney(order.totalAmount)}
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                        {isAdmin ? (
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '6px',
                            }}
                          >
                            {/* A link and an outlined button, where there was a
                                grey chip and a solid dark button: one control
                                per row should not outweigh the order itself. */}
                            <Link
                              href={`/admin/orders/${order.id}`}
                              onClick={(e) => e.stopPropagation()}
                              style={{
                                padding: '5px 6px',
                                color: '#6E6781',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                textDecoration: 'none',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '4px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Eye size={13} />
                              <span>Full Details</span>
                            </Link>
                            <button
                              className="touch-target"
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleOpenOrder(order)
                              }}
                              style={{
                                padding: '5px 12px',
                                borderRadius: '10px',
                                backgroundColor: '#FFFFFF',
                                color: '#2B253E',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                border: '1px solid #F0E6EC',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              Manage
                            </button>
                          </div>
                        ) : (
                          <Link
                            href={`/head-office/orders/${order.id}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              padding: '5px 6px',
                              color: '#6E6781',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <Eye size={13} />
                            <span>Full Details</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager
            page={page}
            totalPages={ordersData?.totalPages ?? 1}
            total={ordersData?.total}
            isFetching={isFetching}
            onChange={setPage}
            style={{ borderTop: '1px solid #F5EEF2' }}
          />
        </div>
      </main>

      <OrderActionModal
        order={selectedOrder}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStatusUpdate={handleStatusUpdate}
      />
    </>
  )
}
