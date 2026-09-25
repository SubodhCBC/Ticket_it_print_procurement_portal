// src/app/admin/orders/all/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
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
        title="Live Orders & Fulfilment Log"
        subtitle="Operational command center: monitor branch orders, inspect line items, assign dispatch tracking"
        actionButton={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Status Filter Tabs & Search Bar */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #F0E6EC',
            borderRadius: '14px',
            boxShadow:
              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          {/* Status Pills Tabs. The selected tab is told apart by its white
              face and pink label; it no longer needs a shadow to lift it. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
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

          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #F0E6EC',
              borderRadius: '10px',
              padding: '8px 12px',
              minWidth: '280px',
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
          ) : !ordersData?.items.length ? (
            <div
              style={{
                padding: '32px',
                textAlign: 'center',
                color: '#A39BB3',
                fontSize: '0.84rem',
              }}
            >
              <ShoppingCart
                size={24}
                color="#DCD3E0"
                style={{ margin: '0 auto 8px auto' }}
              />
              <div style={{ fontWeight: 500, color: '#6E6781' }}>
                No orders matching current filter
              </div>
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
                    <th style={thEdge}>Order #</th>
                    <th style={th}>Date Placed</th>
                    <th style={th}>Branch & Org</th>
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
                        {new Date(order.createdAt).toLocaleDateString()}
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
                        ${order.totalAmount.toFixed(2)}
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
