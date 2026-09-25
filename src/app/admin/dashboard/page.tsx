// src/app/admin/dashboard/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/TableState'
import { useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  DollarSign,
  ShoppingCart,
  Kanban,
  Building2,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { DashboardPdfButton } from '@/components/reports/DashboardPdfButton'
import { DashboardInsights } from '@/components/dashboard/DashboardInsights'
import { StatusPill } from '@/components/admin/StatusPill'
import { OrderActionModal } from '@/components/admin/OrderActionModal'
import { useDashboardKPIs } from '@/hooks/useReports'
import { useOrders, useOrderMutations } from '@/hooks/useOrders'
import type { Order } from '@/types'
import { formatMoney, formatDate } from '@/lib/format'

/**
 * ---------------------------------------------------------------------------
 * Why this page is quieter than it was
 * ---------------------------------------------------------------------------
 * Every surface used to carry a shadow, a border, a pastel icon tile and an
 * uppercase label, and the header carried four coloured shortcut buttons on top
 * of that. Nothing was wrong with any one of them; the sum was the problem —
 * with everything emphasised, the numbers the page exists to show competed with
 * their own decoration.
 *
 * So emphasis is spent rather than sprinkled. Every card is the same hairline
 * border and one soft shadow, labels sit back in grey, the tile icons share a
 * single soft pink chip, and full-strength pink is kept for links, the primary
 * button and the current month's bar. The layout, the data and the interactions
 * are unchanged.
 */

/** The shared card: a hairline border and one soft shadow on the blush page. */
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

const cardSubtitle: React.CSSProperties = {
  fontSize: '0.76rem',
  color: '#A39BB3',
  margin: '3px 0 0',
}

const sectionLink: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#F73582',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

/**
 * A button that wears the cell it sits in: the keyboard gets a real control
 * where the row's click already was, and the table looks untouched.
 */
const rowButton: React.CSSProperties = {
  display: 'block',
  width: '100%',
  padding: 0,
  border: 'none',
  background: 'none',
  textAlign: 'left',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  fontWeight: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
}

export default function AdminDashboardPage() {
  const { data: kpis } = useDashboardKPIs()
  const {
    data: ordersData,
    isLoading: isOrdersLoading,
    error: ordersError,
    refetch: refetchOrders,
  } = useOrders({ pageSize: 6 })
  const { updateOrderStatus } = useOrderMutations()

  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false)

  // Null where the API has no earlier window to compare against; the tile
  // says so rather than drawing a green "+0.0%" over an unknown.
  const revenueDelta = kpis?.revenueDeltaPct ?? null
  const revenueUp = (revenueDelta ?? 0) >= 0
  // The bars were scaled against a hard-coded $40,000 ceiling, so a month over
  // it drew past the top of the card and a quiet quarter drew as slivers.
  // Scaling to the tallest bar makes the chart describe its own data.
  const trendMax = Math.max(
    1,
    ...(kpis?.revenueTrend.map((point) => point.spend) ?? [])
  )

  const handleOpenOrder = (order: Order) => {
    setSelectedOrder(order)
    setIsOrderModalOpen(true)
  }

  const handleStatusUpdate = async (
    id: string,
    status: any,
    metadata?: any
  ) => {
    await updateOrderStatus(id, status, metadata)
    refetchOrders()
  }

  return (
    <>
      {/* No `actionButton`. Every destination it linked to is one click away in
          the sidebar, which is where an administrator navigates from; repeating
          them as coloured chips made the first thing on the page a row of
          buttons rather than the numbers underneath it. */}
      <AdminHeader
        title="Dashboard"
        subtitle="Orders, fulfilment and consolidated revenue across every site"
        // The one action here: the same platform dashboard, as a PDF.
        actionButton={<DashboardPdfButton params={{ scope: 'platform' }} />}
      />

      {/* A flat 24px gutter left a phone with only 312px of card between the
          edges; the page gutter shrinks with the screen instead. */}
      <main
        className="page-pad"
        style={{
          paddingBlock: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* KPIs */}
        <div
          className="grid-auto"
          style={{ ['--min']: '230px' } as React.CSSProperties}
        >
          <StatCard
            // The figure behind this is the last 30 days, which its own footer
            // says; calling it "monthly" invited the reader to reconcile it
            // against a calendar month it was never counting.
            label="Last 30 days"
            icon={DollarSign}
            index={0}
            value={formatMoney(kpis?.totalRevenueMonth ?? 0)}
            footer={
              revenueDelta === null ? (
                <>
                  <span style={{ fontWeight: 600, color: '#6E6781' }}>—</span>
                  <span>no prior period</span>
                </>
              ) : (
                <>
                  <span
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px',
                      fontWeight: 600,
                      color: revenueUp ? '#3F9C68' : '#DC2626',
                    }}
                  >
                    {revenueUp ? (
                      <TrendingUp size={13} />
                    ) : (
                      <TrendingDown size={13} />
                    )}
                    {revenueUp ? '+' : ''}
                    {revenueDelta.toFixed(1)}%
                  </span>
                  {/* The window is the last thirty days against the thirty
                      before it, not two calendar months — comparing a 31-day
                      January against a 28-day February makes every February a
                      downturn. */}
                  <span>vs previous 30 days</span>
                </>
              )
            }
          />

          <StatCard
            label="Active orders"
            icon={ShoppingCart}
            index={1}
            value={kpis?.openOrdersCount ?? 0}
            footer={
              <>
                <span style={{ fontWeight: 600, color: '#6E6781' }}>
                  {kpis?.awaitingApprovalCount ?? 0} awaiting approval
                </span>
                <span>· {kpis?.inTransitCount ?? 0} in transit</span>
              </>
            }
          />

          <StatCard
            label="In fulfilment"
            icon={Kanban}
            index={2}
            value={kpis?.inFulfilmentCount ?? 0}
            footer={
              <Link href="/admin/orders/fulfilment" style={sectionLink}>
                Open the board
                <ArrowUpRight size={13} />
              </Link>
            }
          />

          <StatCard
            label="Client sites"
            icon={Building2}
            index={3}
            value={kpis?.activeSitesCount ?? 0}
            footer={
              <>
                <span style={{ fontWeight: 600, color: '#6E6781' }}>
                  {kpis?.activeAccountsCount ?? 0} accounts
                </span>
                <span>· tiered rate cards</span>
              </>
            }
          />
        </div>

        {/* Recent orders */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div
            className="row-wrap"
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #F5EEF2',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <h3 style={cardTitle}>Recent orders</h3>
              <p style={cardSubtitle}>
                Select a row to inspect line items, assign tracking or move an
                order through fulfilment.
              </p>
            </div>
            <Link href="/admin/orders/all" style={sectionLink}>
              View all
              <ArrowUpRight size={14} />
            </Link>
          </div>

          {isOrdersLoading ? (
            <SkeletonTable rows={5} columns={6} label="Loading recent orders" />
          ) : ordersError ? (
            // Before this branch a failed request fell through to an empty
            // table, so a backend hiccup was indistinguishable from a quiet
            // month. The error itself goes to the console, not the page.
            <ErrorState
              title="Recent orders could not be loaded"
              detail="The orders service did not respond. Nothing has been lost — try again."
              error={ordersError}
              onRetry={() => refetchOrders()}
            />
          ) : !ordersData?.items.length ? (
            <EmptyState
              icon={ShoppingCart}
              title="No orders yet"
              detail="Orders placed by any site appear here as soon as they are submitted."
            />
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
                {/* No filled header band. The column names are labels, not
                    data, so they are set in grey and the rule under them does
                    the separating. */}
                <thead>
                  <tr>
                    <Th edge>Order</Th>
                    <Th>Site</Th>
                    <Th>PO reference</Th>
                    <Th>Status</Th>
                    <Th align="center">Items</Th>
                    <Th align="right">Total</Th>
                    <Th align="right" edge />
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
                          padding: '13px 20px',
                          fontWeight: 600,
                          color: '#2B253E',
                        }}
                      >
                        {/* The row itself is clickable for the mouse; this is
                            the same action as a control the keyboard can
                            reach, drawn to inherit so nothing moves. */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleOpenOrder(order)
                          }}
                          aria-label={`Open order ${order.orderNumber}`}
                          style={rowButton}
                        >
                          <div>{order.orderNumber}</div>
                          <div
                            style={{ fontSize: '0.72rem', color: '#A39BB3' }}
                          >
                            {formatDate(order.createdAt)}
                          </div>
                        </button>
                      </td>
                      <td style={{ padding: '13px 14px', color: '#2B253E' }}>
                        <div>{order.siteName}</div>
                        <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                          {order.accountName}
                        </div>
                      </td>
                      <td
                        style={{
                          padding: '13px 14px',
                          color: '#A39BB3',
                          fontFamily: 'monospace',
                          fontSize: '0.78rem',
                        }}
                      >
                        {order.poReference || '—'}
                      </td>
                      <td style={{ padding: '13px 14px' }}>
                        <StatusPill status={order.status} />
                      </td>
                      <td
                        style={{
                          padding: '13px 14px',
                          textAlign: 'center',
                          color: '#6E6781',
                        }}
                      >
                        {order.itemCount}
                      </td>
                      <td
                        style={{
                          padding: '13px 14px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: '#2B253E',
                        }}
                      >
                        {formatMoney(order.totalAmount)}
                      </td>
                      {/* One link where there were two controls. "Manage"
                          opened the same modal the row click opens, so it was a
                          second button for what the row already does; what is
                          left is the one destination the row cannot reach. */}
                      <td style={{ padding: '13px 20px', textAlign: 'right' }}>
                        <Link
                          href={`/admin/orders/${order.id}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '2px',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            color: '#6E6781',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Details
                          <ChevronRight size={13} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Trend and shortcuts. A 320px minimum was wider than a 360px phone's
            content column, so the chart could not shrink into it. */}
        <div
          className="grid-auto"
          style={{ ['--min']: '280px', gap: '16px' } as React.CSSProperties}
        >
          <div style={{ ...card, padding: '20px', minWidth: 0 }}>
            <div
              className="row-wrap"
              style={{ justifyContent: 'space-between' }}
            >
              <div style={{ minWidth: 0 }}>
                <h3 style={cardTitle}>Monthly spend</h3>
                <p style={cardSubtitle}>
                  Across all sites and active rate cards
                </p>
              </div>
              <Link href="/admin/reports/monthly-billing" style={sectionLink}>
                Full report
                <ArrowUpRight size={14} />
              </Link>
            </div>

            {/* A CSS bar chart: six values, nothing worth loading a library for. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: '8px',
                height: '150px',
                paddingTop: '18px',
              }}
            >
              {kpis?.revenueTrend.map((point, idx) => {
                const isCurrent = idx === kpis.revenueTrend.length - 1
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      flex: 1,
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: isCurrent ? '#2B253E' : '#A39BB3',
                      }}
                    >
                      ${(point.spend / 1000).toFixed(1)}k
                    </div>
                    <div
                      style={{
                        width: '100%',
                        maxWidth: '34px',
                        height: `${(point.spend / trendMax) * 100}px`,
                        // The current month is the one being read. The rest are
                        // context, so they sit back instead of competing.
                        backgroundColor: isCurrent ? '#F73582' : '#F3D9E4',
                        borderRadius: '4px 4px 0 0',
                      }}
                    />
                    <div style={{ fontSize: '0.7rem', color: '#A39BB3' }}>
                      {point.month}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div style={{ ...card, padding: '20px' }}>
            <h3 style={cardTitle}>Shortcuts</h3>
            <p style={{ ...cardSubtitle, marginBottom: '12px' }}>
              Everyday administrator workflows
            </p>

            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}
            >
              <Shortcut
                href="/admin/orders/fulfilment"
                icon={Kanban}
                label="Fulfilment board"
              />
              <Shortcut
                href="/admin/pricing/rate-cards"
                icon={DollarSign}
                label="Rate cards & pricing"
              />
              <Shortcut
                href="/admin/catalogue/products"
                icon={ShoppingCart}
                label="Product catalogue"
              />
            </div>
          </div>
        </div>
        <DashboardInsights
          scope="platform"
          ageingHref="/admin/reports/order-ageing"
        />
      </main>

      <OrderActionModal
        order={selectedOrder}
        isOpen={isOrderModalOpen}
        onClose={() => setIsOrderModalOpen(false)}
        onStatusUpdate={handleStatusUpdate}
      />
    </>
  )
}

/**
 * The four KPI tiles, which were four copies of the same seventy lines.
 *
 * Copies drift: these had already picked up four different pastel icon chips
 * and three different animation durations, none of which meant anything.
 */
function StatCard({
  label,
  value,
  icon: Icon,
  footer,
  index,
}: {
  label: string
  value: React.ReactNode
  icon: LucideIcon
  footer: React.ReactNode
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
      style={{ ...card, padding: '18px' }}
    >
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
        {/* One soft pink chip, the same on all four tiles, so the eye finds each
            tile's subject before its number. A different pastel per card made
            the icons the loudest thing in the row; one shared tint does not. */}
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
          fontSize: '1.6rem',
          fontWeight: 700,
          color: '#2B253E',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          marginTop: '8px',
          fontSize: '0.76rem',
          color: '#A39BB3',
        }}
      >
        {footer}
      </div>
    </motion.div>
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

function Shortcut({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: LucideIcon
  label: string
}) {
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '11px 10px',
        borderRadius: '10px',
        textDecoration: 'none',
        color: '#2B253E',
        fontSize: '0.83rem',
        fontWeight: 500,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#FCF7FA')}
      onMouseLeave={(e) =>
        (e.currentTarget.style.backgroundColor = 'transparent')
      }
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <Icon size={15} color="#A39BB3" />
        {label}
      </span>
      <ChevronRight size={14} color="#DCD3E0" />
    </Link>
  )
}
