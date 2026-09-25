// src/app/head-office/dashboard/page.tsx
'use client'

import { Skeleton as UiSkeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/TableState'
import React from 'react'
import Link from 'next/link'
import { DashboardPdfButton } from '@/components/reports/DashboardPdfButton'
import { DashboardInsights } from '@/components/dashboard/DashboardInsights'
import { motion, type Variants } from 'framer-motion'
import {
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Building2,
  DollarSign,
  ChevronRight,
  ArrowUpRight,
  FileSpreadsheet,
  BarChart3,
  Scale,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useHODashboardKPIs } from '@/hooks/useHeadOffice'
import { useOrders } from '@/hooks/useOrders'
import { StatusPill } from '@/components/admin/StatusPill'
import type { OrderStatus } from '@/types'
import { formatMoney, formatDate } from '@/lib/format'

// ─── Constants ───────────────────────────────────────────────────────────────

/** The shared card: hairline border and a soft shadow, as on the admin dashboard. */
const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  border: '1px solid #F0E6EC',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
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

const button: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  borderRadius: '10px',
  padding: '8px 14px',
  fontSize: '0.82rem',
  fontWeight: 600,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

const secondaryButton: React.CSSProperties = {
  ...button,
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  border: '1px solid #F0E6EC',
}

const primaryButton: React.CSSProperties = {
  ...button,
  backgroundColor: '#F73582',
  color: '#FFFFFF',
  border: '1px solid transparent',
}

// ─── Animation Variants ──────────────────────────────────────────────────────
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
}
/**
 * `Variants`, not an inferred object literal: without the annotation TypeScript
 * widens `ease` to `string`, which framer-motion's `Easing` union rejects.
 */
const cardVariants: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: 'easeOut' },
  },
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
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

// ─── Spend Trend SVG Chart ────────────────────────────────────────────────────
function SpendTrendChart({
  data,
}: {
  data: { month: string; spend: number }[]
}) {
  if (!data || data.length === 0) return null
  const maxSpend = Math.max(...data.map((d) => d.spend), 1)
  const W = 480,
    H = 120,
    PAD = 16
  const points = data.map((d, i) => ({
    x: PAD + (i / (data.length - 1)) * (W - 2 * PAD),
    y: H - PAD - (d.spend / maxSpend) * (H - 2 * PAD),
    spend: d.spend,
    month: d.month,
  }))
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ')
  const areaD = `${pathD} L ${points[points.length - 1].x} ${H - PAD} L ${points[0].x} ${H - PAD} Z`

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', overflow: 'visible' }}
    >
      {/* Grid lines */}
      {[0.25, 0.5, 0.75, 1].map((pct) => (
        <line
          key={pct}
          x1={PAD}
          y1={H - PAD - pct * (H - 2 * PAD)}
          x2={W - PAD}
          y2={H - PAD - pct * (H - 2 * PAD)}
          stroke="#F5EEF2"
          strokeWidth="1"
        />
      ))}
      {/* Area fill — flat, not a pink fade: the line carries the data. */}
      <motion.path
        d={areaD}
        fill="#FCF7FA"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
      {/* Line */}
      <motion.path
        d={pathD}
        fill="none"
        stroke="#A39BB3"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      />
      {/* Points. As on the admin chart, the current month is the one being
          read, so it alone carries the accent. */}
      {points.map((p, i) => {
        const isCurrent = i === points.length - 1
        return (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={isCurrent ? '4' : '3'}
              fill={isCurrent ? '#F73582' : '#FFFFFF'}
              stroke={isCurrent ? '#FFFFFF' : '#A39BB3'}
              strokeWidth="2"
            />
            <text
              x={p.x}
              y={H}
              textAnchor="middle"
              fontSize="9"
              fill={isCurrent ? '#2B253E' : '#A39BB3'}
              fontFamily="inherit"
              fontWeight={isCurrent ? '600' : '500'}
            >
              {p.month}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Bar chart for site spend ─────────────────────────────────────────────────
function SiteSpendBar({
  siteName,
  spend,
  pct,
  index,
}: {
  siteName: string
  spend: number
  pct: number
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.2 }}
      style={{ marginBottom: '14px' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '12px',
          marginBottom: '6px',
          minWidth: 0,
        }}
      >
        <span
          className="truncate"
          style={{ fontSize: '0.8rem', fontWeight: 500, color: '#2B253E' }}
        >
          {siteName}
        </span>
        <span
          style={{
            fontSize: '0.8rem',
            fontWeight: 600,
            color: '#2B253E',
            whiteSpace: 'nowrap',
          }}
        >
          {formatMoney(spend)}
        </span>
      </div>
      <div
        style={{
          height: '6px',
          backgroundColor: '#F5EEF2',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.2, delay: index * 0.04, ease: 'easeOut' }}
          style={{
            height: '100%',
            backgroundColor: '#F73582',
            borderRadius: '9999px',
          }}
        />
      </div>
    </motion.div>
  )
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KPICard({
  label,
  value,
  delta,
  deltaPositive,
  icon,
  subtitle,
  note,
}: {
  label: string
  value: string
  delta?: string
  deltaPositive?: boolean
  icon: React.ReactNode
  subtitle?: string
  /** Stands in for the delta when there is no prior period to compare with. */
  note?: string
}) {
  return (
    <motion.div variants={cardVariants} style={{ ...card, padding: '18px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span
          style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6E6781' }}
        >
          {label}
        </span>
        {/* The same soft pink chip as the admin tiles: one shared tint, so it
            marks the tile's subject without outshouting its number. */}
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
          {icon}
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
      {subtitle && (
        <div
          style={{
            fontSize: '0.76rem',
            color: '#A39BB3',
            marginTop: '8px',
          }}
        >
          {subtitle}
        </div>
      )}
      {delta && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '3px',
            marginTop: '4px',
            fontSize: '0.76rem',
            fontWeight: 600,
            color: deltaPositive ? '#3F9C68' : '#DC2626',
          }}
        >
          {deltaPositive ? (
            <TrendingUp size={13} />
          ) : (
            <TrendingDown size={13} />
          )}
          {delta} vs last month
        </div>
      )}
      {!delta && note && (
        <div
          style={{
            marginTop: '4px',
            fontSize: '0.76rem',
            fontWeight: 600,
            color: '#A39BB3',
          }}
        >
          {note}
        </div>
      )}
    </motion.div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────
export default function HODashboardPage() {
  const { user } = useAuth()
  // The account the signed-in user belongs to. The API scopes every
  // head-office read to it anyway; this is what the screen asks about.
  const accountId = user?.accountId ?? ''
  const { data: kpis, isLoading } = useHODashboardKPIs(accountId)
  // The order list is its own query rather than part of the KPI bundle, so it
  // shares a cache key with every other screen showing recent orders.
  const {
    data: ordersData,
    error: ordersError,
    refetch: refetchOrders,
  } = useOrders({ pageSize: 6 })
  const recentOrders = ordersData?.items ?? []

  return (
    // No outer padding: SaaSLayout's <main> already pads the page.
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header. This was a dark gradient banner with a decorative
          "customer head office · multi-site visibility" chip; the account name
          is the one thing it said that the sidebar doesn't, so it is the title. */}
      <div
        className="stack-sm"
        style={{
          justifyContent: 'space-between',
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
            {isLoading ? (
              <UiSkeleton width={240} height={22} />
            ) : (
              (kpis?.accountName ?? 'Head Office Dashboard')
            )}
          </h1>
          <p
            style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}
          >
            Consolidated spend visibility across all sites — read-only access,
            monthly billing & reporting.
          </p>
        </div>
        <div className="row-wrap">
          {/* The same filters this dashboard is fetched with. */}
          <DashboardPdfButton
            params={{
              ...(accountId ? { accountId } : {}),
              granularity: 'month',
              topSites: 20,
            }}
          />
          <Link
            href="/head-office/approvals"
            className="touch-target"
            style={secondaryButton}
          >
            <Scale size={16} /> Approvals Queue
          </Link>
          <Link
            href="/head-office/orders/all"
            className="touch-target"
            style={secondaryButton}
          >
            <ShoppingCart size={16} /> All Orders
          </Link>
          <Link
            href="/head-office/billing/monthly"
            className="touch-target"
            style={primaryButton}
          >
            <FileSpreadsheet size={16} /> Monthly Billing
          </Link>
        </div>
      </div>

      {/* KPI Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid-auto"
        style={{ ['--min']: '220px' } as React.CSSProperties}
      >
        {isLoading ? (
          [0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                ...card,
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              <Skeleton h="0.7rem" w="60%" />
              <Skeleton h="1.5rem" w="80%" />
              <Skeleton h="0.7rem" w="50%" />
            </div>
          ))
        ) : (
          <>
            <KPICard
              label="Total Spend This Month"
              // Money always carries its cents. `minimumFractionDigits: 0`
              // rendered a real 3505.60 as "$3,505.6", which reads as a
              // truncation rather than a total.
              value={formatMoney(kpis?.totalSpendThisMonth ?? 0)}
              // Null, not zero, when there is no prior month to compare
              // against: the card then says so instead of drawing a green
              // "+0.0%" over a comparison nobody can make.
              delta={
                kpis?.spendDeltaPct == null
                  ? undefined
                  : `${Math.abs(kpis.spendDeltaPct).toFixed(1)}%`
              }
              deltaPositive={(kpis?.spendDeltaPct ?? 0) >= 0}
              note={
                kpis?.spendDeltaPct == null ? '— no prior period' : undefined
              }
              icon={<DollarSign size={16} />}
              subtitle="Across all account sites"
            />
            <KPICard
              label="Orders This Month"
              value={String(kpis?.orderCountThisMonth ?? 0)}
              delta={
                kpis?.ordersDeltaPct == null
                  ? undefined
                  : `${Math.abs(kpis.ordersDeltaPct).toFixed(1)}%`
              }
              deltaPositive={(kpis?.ordersDeltaPct ?? 0) >= 0}
              note={
                kpis?.ordersDeltaPct == null ? '— no prior period' : undefined
              }
              icon={<ShoppingCart size={16} />}
              subtitle={`vs ${kpis?.orderCountLastMonth ?? 0} last month`}
            />
            <KPICard
              label="Active Sites"
              value={String(kpis?.activeSitesCount ?? 0)}
              icon={<Building2 size={16} />}
              subtitle="Sites under this account"
            />
            <KPICard
              label="Top Ordering Site"
              // The branch's NAME. `siteCode` is `sublabel ?? id` in the
              // adapter, so a branch with no code put a raw cuid on the card.
              value={kpis?.topSite?.siteName || '—'}
              icon={<TrendingUp size={16} />}
              subtitle={`${formatMoney(kpis?.topSite?.spend ?? 0)} this month`}
            />
          </>
        )}
      </motion.div>

      {/* Spend Trend + Site Breakdown. A wrapping flex row rather than a fixed
          `1fr 380px` grid, so the breakdown drops under the chart on a narrow
          screen instead of squeezing it. */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        {/* Trend Chart */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{ ...card, padding: '20px', flex: '2 1 420px', minWidth: 0 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <div>
              <h2 style={cardTitle}>Monthly Spend Trend</h2>
              <p style={cardSubtitle}>
                6-month rolling — {kpis?.accountName ?? 'account'}
              </p>
            </div>
            <Link href="/head-office/reports/spend-by-site" style={sectionLink}>
              Full Report <ArrowUpRight size={14} />
            </Link>
          </div>
          <div style={{ height: '130px', position: 'relative' }}>
            {isLoading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  gap: '8px',
                  height: '100%',
                }}
              >
                {[60, 80, 50, 90, 70, 100].map((h, i) => (
                  <div
                    key={i}
                    style={{
                      flex: 1,
                      height: `${h}%`,
                      borderRadius: '4px 4px 0 0',
                      backgroundColor: '#F5EEF2',
                    }}
                  />
                ))}
              </div>
            ) : (
              <SpendTrendChart data={kpis?.spendTrend ?? []} />
            )}
          </div>
        </motion.div>

        {/* Site Spend Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{ ...card, padding: '20px', flex: '1 1 300px', minWidth: 0 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px',
            }}
          >
            <h2 style={cardTitle}>Spend by Site</h2>
            <BarChart3 size={16} color="#A39BB3" />
          </div>
          {isLoading
            ? [0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    marginBottom: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  <Skeleton h="0.75rem" w="70%" />
                  <Skeleton h="6px" />
                </div>
              ))
            : kpis?.spendBySite?.map((s, i) => (
                <SiteSpendBar
                  key={s.siteId}
                  siteName={s.siteName}
                  spend={s.totalSpend}
                  pct={s.percentageOfTotal}
                  index={i}
                />
              ))}
        </motion.div>
      </div>

      {/* Recent Orders */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        style={{ ...card, overflow: 'hidden' }}
      >
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #F5EEF2',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <h2 style={cardTitle}>Recent Orders</h2>
            <p style={cardSubtitle}>Latest across all sites — read only</p>
          </div>
          <Link href="/head-office/orders/all" style={sectionLink}>
            View All <ChevronRight size={14} />
          </Link>
        </div>

        {isLoading ? (
          [0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                padding: '12px 20px',
                borderTop: i > 0 ? '1px solid #F5EEF2' : 'none',
                display: 'flex',
                gap: '14px',
                alignItems: 'center',
              }}
            >
              <Skeleton h="2.25rem" w="2.25rem" br="50%" />
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                }}
              >
                <Skeleton h="0.8rem" w="40%" />
                <Skeleton h="0.7rem" w="60%" />
              </div>
              <Skeleton h="1.25rem" w="80px" br="9999px" />
            </div>
          ))
        ) : ordersError ? (
          // A failed fetch used to fall through to an empty table, so an outage
          // read as "this account has never ordered".
          <ErrorState
            title="Recent orders could not be loaded"
            detail="The orders service did not respond. Nothing has been lost — try again."
            error={ordersError}
            onRetry={() => refetchOrders()}
          />
        ) : recentOrders.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="No orders yet"
            detail="Orders placed by any site on this account appear here as they are submitted."
          />
        ) : (
          <div className="table-scroll">
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
                fontSize: '0.84rem',
              }}
            >
              {/* No filled header band or heavy rule: the column names are
                  labels, so they sit back in grey and each row's hairline does
                  the separating. */}
              <thead>
                <tr>
                  {[
                    'Order #',
                    'Site',
                    'Ordered By',
                    'PO Reference',
                    'Date',
                    'Value',
                    'Status',
                    '',
                  ].map((h, idx, arr) => (
                    <th
                      key={h}
                      style={{
                        padding:
                          idx === 0
                            ? '10px 14px 10px 20px'
                            : idx === arr.length - 1
                              ? '10px 20px 10px 14px'
                              : '10px 14px',
                        textAlign: h === 'Value' ? 'right' : 'left',
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
                {recentOrders.map((o) => (
                  <tr
                    key={o.id}
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
                    <td
                      style={{
                        padding: '12px 14px 12px 20px',
                        fontWeight: 600,
                        color: '#2B253E',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {o.orderNumber}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#2B253E' }}>
                      {o.siteName}
                    </td>
                    <td style={{ padding: '12px 14px', color: '#6E6781' }}>
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
                    <td style={{ padding: '12px 20px 12px 14px' }}>
                      <Link
                        href={`/head-office/orders/${o.id}`}
                        style={{
                          fontSize: '0.78rem',
                          fontWeight: 600,
                          color: '#6E6781',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'flex-end',
                          gap: '2px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        View <ChevronRight size={13} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <DashboardInsights
        scope="account"
        ageingHref="/head-office/reports/order-ageing"
      />

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  )
}
