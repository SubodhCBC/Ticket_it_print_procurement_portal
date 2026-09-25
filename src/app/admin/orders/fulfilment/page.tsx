// src/app/admin/orders/fulfilment/page.tsx
'use client'

import { SkeletonBoard } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/TableState'
import React, { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowRight, RefreshCw, ExternalLink } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { OrderActionModal } from '@/components/admin/OrderActionModal'
import { useFulfilmentQueue, useOrderMutations } from '@/hooks/useOrders'
import { useAuth } from '@/hooks/useAuth'
import { toApiError } from '@/services'
import type { Order, OrderStatus } from '@/types'
import { formatMoney, formatTime } from '@/lib/format'

export default function FulfilmentKanbanPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'
  const { queue, isLoading, error: queueError, refetch } = useFulfilmentQueue()
  const { updateOrderStatus } = useOrderMutations()

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [boardError, setBoardError] = useState<string | null>(null)

  const handleOpenOrder = (order: Order) => {
    setSelectedOrder(order)
    setIsModalOpen(true)
  }

  const handleAdvanceStatus = async (
    order: Order,
    nextStatus: OrderStatus,
    e: React.MouseEvent
  ) => {
    e.stopPropagation()
    if (!isAdmin) return

    // Dispatch needs the NZ Post label (decision D1), and the label needs the
    // boxes weighed. Both happen in the order dialog, so the button opens it
    // rather than sending a status the server would refuse.
    if (nextStatus === 'DISPATCHED') {
      handleOpenOrder(order)
      return
    }

    setBoardError(null)
    try {
      await updateOrderStatus(order.id, nextStatus)
    } catch (err) {
      setBoardError(`${order.orderNumber}: ${toApiError(err).message}`)
    }
    refetch()
  }

  const handleStatusUpdate = async (
    id: string,
    status: any,
    metadata?: any
  ) => {
    if (!isAdmin) return
    await updateOrderStatus(id, status, metadata)
    refetch()
  }

  // `color` is the stage's signal, so it marks the dot beside the lane title
  // and nothing else. The count badge, the advance buttons and the card hover
  // used to repeat it in tints, which turned four lanes into four colour fields.
  const columns: {
    id: OrderStatus
    title: string
    items: Order[]
    color: string
    nextStatus?: OrderStatus
    nextLabel?: string
  }[] = [
    {
      // Approved is what the queue calls "received": the order has cleared
      // approval and is waiting for production to pick it up.
      id: 'APPROVED',
      title: 'Received',
      items: queue.received,
      color: '#F73582',
      nextStatus: 'PROCESSING',
      nextLabel: 'Start Processing',
    },
    {
      id: 'PROCESSING',
      title: 'Packaging & Staging',
      items: queue.processing,
      color: '#D97706',
      nextStatus: 'DISPATCHED',
      nextLabel: 'Label & Dispatch',
    },
    {
      id: 'DISPATCHED',
      title: 'In Transit / Courier',
      items: queue.dispatched,
      color: '#0284C7',
      nextStatus: 'DELIVERED',
      nextLabel: 'Confirm Delivery',
    },
    {
      id: 'DELIVERED',
      title: 'Completed & Delivered',
      items: queue.delivered,
      color: '#228B53',
    },
  ]

  return (
    <>
      <AdminHeader
        title="Fulfilment and dispatch"
        subtitle="Every active order, by the stage it has reached"
        actionButton={
          <button
            type="button"
            onClick={() => refetch()}
            className="touch-target"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              backgroundColor: '#FFFFFF',
              border: '1px solid #F0E6EC',
              color: '#2B253E',
              fontSize: '0.82rem',
              fontWeight: 600,
            }}
          >
            <RefreshCw size={15} />
            <span>Refresh Board</span>
          </button>
        }
      />

      <main
        className="page-pad"
        style={{
          paddingBlock: '24px',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minWidth: 0,
        }}
      >
        {boardError && (
          <div
            role="alert"
            style={{
              marginBottom: '14px',
              padding: '8px 12px',
              borderRadius: '10px',
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#DC2626',
              fontSize: '0.8rem',
              fontWeight: 500,
            }}
          >
            {boardError}
          </div>
        )}
        {isLoading ? (
          <SkeletonBoard
            columns={4}
            cards={3}
            label="Loading the fulfilment board"
          />
        ) : queueError ? (
          // Four empty lanes are what a finished day looks like, so a failed
          // fetch used to read as "nothing to do" — the worst possible lie for
          // a board people work from.
          <ErrorState
            title="The fulfilment board could not be loaded"
            detail="The orders service did not respond, so these lanes may not reflect what is really in the queue."
            error={queueError}
            onRetry={() => refetch()}
          />
        ) : (
          // Four lanes stay four lanes: this is a board people read across,
          // and stacking the stages vertically on a phone would put "Received"
          // and "In Transit" hundreds of pixels apart. The lanes keep a
          // readable 240px minimum and the BOARD scrolls sideways inside its
          // own wrapper instead — the same shape SkeletonBoard already loads
          // in, and the page itself never scrolls.
          <div className="table-scroll" style={{ paddingBottom: '4px' }}>
            <div
              style={{
                display: 'flex',
                gap: '14px',
                alignItems: 'flex-start',
              }}
            >
              {columns.map((col) => (
                <div
                  key={col.id}
                  style={{
                    // Grow to share the width when there is room, never
                    // squeeze below a card that can be read.
                    flex: '1 1 0',
                    minWidth: 'min(80vw, 240px)',
                    backgroundColor: '#FCF7FA',
                    borderRadius: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    maxHeight: 'calc(100vh - 180px)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Column Header. A lane is a fill on the page, not a framed
                    card with a white title band: the order cards inside it are
                    the only things with a border. */}
                  <div
                    style={{
                      padding: '14px 14px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                      }}
                    >
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: col.color,
                        }}
                      />
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: '0.86rem',
                          color: '#2B253E',
                        }}
                      >
                        {col.title}
                      </span>
                    </div>
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        backgroundColor: '#F5EEF2',
                        color: '#5C566E',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                      }}
                    >
                      {col.items.length}
                    </span>
                  </div>

                  {/* Cards Container */}
                  <div
                    style={{
                      padding: '0 10px 10px',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px',
                      flex: 1,
                    }}
                  >
                    {col.items.length === 0 ? (
                      <div
                        style={{
                          padding: '32px 12px',
                          textAlign: 'center',
                          color: '#A39BB3',
                          fontSize: '0.84rem',
                          border: '1px dashed #F0E6EC',
                          borderRadius: '10px',
                        }}
                      >
                        No orders in this stage
                      </div>
                    ) : (
                      col.items.map((order) => (
                        <motion.div
                          key={order.id}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          onClick={() => handleOpenOrder(order)}
                          style={{
                            backgroundColor: '#FFFFFF',
                            borderRadius: '14px',
                            boxShadow:
                              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                            padding: '14px',
                            border: '1px solid #F0E6EC',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px',
                            transition: 'border-color 150ms ease',
                          }}
                          // Hover darkens the hairline and nothing more. The lift
                          // and the stage-coloured border made each card under
                          // the pointer jump out of its lane.
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = '#DCD3E0'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = '#F0E6EC'
                          }}
                        >
                          {/* Order Header */}
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '8px',
                              minWidth: 0,
                            }}
                          >
                            <div
                              className="truncate"
                              title={order.orderNumber}
                              style={{
                                fontWeight: 700,
                                fontSize: '0.86rem',
                                color: '#2B253E',
                              }}
                            >
                              {order.orderNumber}
                            </div>
                            <span
                              style={{
                                fontSize: '0.72rem',
                                color: '#A39BB3',
                                flexShrink: 0,
                              }}
                            >
                              {formatTime(order.createdAt)}
                            </span>
                          </div>

                          {/* Branch & Requester */}
                          <div style={{ minWidth: 0 }}>
                            <div
                              className="truncate"
                              title={order.siteName}
                              style={{
                                fontSize: '0.82rem',
                                fontWeight: 500,
                                color: '#2B253E',
                              }}
                            >
                              {order.siteName}
                            </div>
                            <div
                              className="truncate"
                              style={{ fontSize: '0.72rem', color: '#A39BB3' }}
                            >
                              {order.accountName} • PO:{' '}
                              {order.poReference || '—'}
                            </div>
                          </div>

                          {/* Items Snapshot. No grey panel: inside a card the
                            spacing and the footer rule already separate it. */}
                          <div
                            style={{
                              fontSize: '0.75rem',
                              color: '#6E6781',
                            }}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                gap: '8px',
                                minWidth: 0,
                              }}
                            >
                              <div style={{ fontWeight: 500, minWidth: 0 }}>
                                {order.itemCount} unit(s) across{' '}
                                {order.lineItems.length} item(s)
                              </div>
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: '#2B253E',
                                  fontSize: '0.82rem',
                                  flexShrink: 0,
                                }}
                              >
                                {formatMoney(order.totalAmount)}
                              </span>
                            </div>
                            <div
                              className="truncate"
                              style={{
                                color: '#A39BB3',
                                fontSize: '0.7rem',
                                marginTop: '2px',
                              }}
                            >
                              {order.lineItems[0]?.productName}{' '}
                              {order.lineItems.length > 1
                                ? `+${order.lineItems.length - 1} more`
                                : ''}
                            </div>
                          </div>

                          {/* Card Footer with Advance Button */}
                          <div
                            className="row-wrap"
                            style={{
                              justifyContent: 'space-between',
                              borderTop: '1px solid #F5EEF2',
                              paddingTop: '8px',
                              marginTop: '2px',
                            }}
                          >
                            <Link
                              href={`/admin/orders/${order.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="touch-target"
                              style={{
                                fontSize: '0.76rem',
                                fontWeight: 600,
                                color: '#6E6781',
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                              }}
                            >
                              <ExternalLink size={12} /> Full Details
                            </Link>

                            {isAdmin && col.nextStatus && col.nextLabel ? (
                              <button
                                type="button"
                                onClick={(e) =>
                                  handleAdvanceStatus(order, col.nextStatus!, e)
                                }
                                className="touch-target"
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                  padding: '4px 10px',
                                  borderRadius: '10px',
                                  backgroundColor: '#FFFFFF',
                                  color: '#2B253E',
                                  border: '1px solid #F0E6EC',
                                  fontSize: '0.74rem',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                <span>{col.nextLabel}</span>
                                <ArrowRight size={12} />
                              </button>
                            ) : (
                              <span
                                style={{
                                  fontSize: '0.72rem',
                                  color: '#A39BB3',
                                  fontWeight: 500,
                                }}
                              >
                                {order.carrier
                                  ? `${order.carrier}`
                                  : 'In queue'}
                              </span>
                            )}
                          </div>
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <OrderActionModal
        order={selectedOrder}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onStatusUpdate={handleStatusUpdate}
        canManageShipping={isAdmin}
      />
    </>
  )
}
