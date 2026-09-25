// src/app/head-office/billing/monthly/page.tsx
'use client'

import { Skeleton as UiSkeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/TableState'
import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileSpreadsheet,
  Download,
  ChevronRight,
  Calendar,
  RefreshCw,
  BarChart3,
} from 'lucide-react'
import { StatusPill } from '@/components/admin/StatusPill'
import { useHOMonthlyBillingReport } from '@/hooks/useHeadOffice'
import { useAuth } from '@/hooks/useAuth'
import { InvoicesPanel } from '@/components/billing/InvoicesPanel'
import { exportBackingLinesCSV } from '@/utils/export/csv'
import {
  formatMoney,
  formatMoneyWhole,
  formatDate,
  formatMonthYear,
  formatMonthYearLong,
} from '@/lib/format'

/** The face of a full-width state panel: the same card as everything else. */
const panelCard: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: '1px solid #F0E6EC',
}

/**
 * The last twelve billing periods, newest first.
 *
 * Generated rather than listed: the fixture-era dropdown named three fixed
 * months, so with real data the screen opened on a period that had nothing in
 * it. `key` is the `YYYY-MM` the API bills by.
 */
function recentBillingPeriods(
  count = 12
): { key: string; label: string; shortLabel: string }[] {
  const now = new Date()

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1)
    )
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

    return {
      key,
      label: formatMonthYearLong(date),
      shortLabel: formatMonthYear(date),
    }
  })
}

const AVAILABLE_PERIODS = recentBillingPeriods()

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

function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
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
        padding: '18px',
        border: '1px solid #F0E6EC',
      }}
    >
      <div style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6E6781' }}>
        {label}
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
      {sub && (
        <div
          style={{ fontSize: '0.76rem', color: '#A39BB3', marginTop: '8px' }}
        >
          {sub}
        </div>
      )}
    </motion.div>
  )
}

function CategoryBar({
  category,
  spend,
  pct,
  index,
}: {
  category: string
  spend: number
  pct: number
  index: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.04 }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: '8px',
          marginBottom: '6px',
          fontSize: '0.8rem',
        }}
      >
        <span style={{ fontWeight: 500, color: '#2B253E' }}>{category}</span>
        <span
          style={{ fontWeight: 600, color: '#2B253E', whiteSpace: 'nowrap' }}
        >
          {formatMoneyWhole(spend)}{' '}
          <span style={{ color: '#A39BB3', fontWeight: 500 }}>
            ({pct.toFixed(1)}%)
          </span>
        </span>
      </div>
      <div
        style={{
          height: '6px',
          backgroundColor: '#F5EEF2',
          borderRadius: '9999px',
          overflow: 'hidden',
          marginBottom: '14px',
        }}
      >
        {/* Solid, not a pink-to-coral gradient: the length is the information,
            so the fill only has to be visible against the track. */}
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.3, delay: index * 0.04, ease: 'easeOut' }}
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

export default function HOMonthlyBillingPage() {
  const { user } = useAuth()
  // The account the signed-in user belongs to. The API scopes every
  // head-office read to it anyway; this is what the screen asks about.
  const accountId = user?.accountId ?? ''
  const [selectedPeriod, setSelectedPeriod] = useState(AVAILABLE_PERIODS[0].key)
  const {
    data: report,
    isLoading,
    error: reportError,
    refetch: refetchReport,
  } = useHOMonthlyBillingReport(accountId, selectedPeriod)
  const [showBacking, setShowBacking] = useState(false)

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header. The period picker and the exports sit in the header's action
          slot rather than in a card of their own: they drive the whole page,
          and a bordered strip made them read as content. */}
      <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
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
            <ChevronRight size={12} />
            <span style={{ color: '#6E6781', fontWeight: 500 }}>
              Monthly Billing
            </span>
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
            Monthly billing
          </h1>
          <p
            style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}
          >
            Generate monthly billing summaries with full transaction-level
            reconciliation detail.
          </p>
        </div>

        {/* Period selector + Actions */}
        <div className="row-wrap">
          <div className="row-wrap">
            <Calendar size={16} color="#A39BB3" />
            <span
              style={{ fontSize: '0.78rem', fontWeight: 600, color: '#5C566E' }}
            >
              Billing Period:
            </span>
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="touch-target"
              style={{
                flex: '1 1 150px',
                padding: '8px 12px',
                border: '1px solid #F0E6EC',
                borderRadius: '10px',
                fontSize: '0.84rem',
                color: '#2B253E',
                backgroundColor: '#FFFFFF',
                outline: 'none',
              }}
            >
              {AVAILABLE_PERIODS.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setShowBacking(!showBacking)}
            className="touch-target"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: 600,
              border: '1px solid #F0E6EC',
              backgroundColor: showBacking ? '#FCF7FA' : '#FFFFFF',
              color: showBacking ? '#F73582' : '#2B253E',
              cursor: 'pointer',
            }}
          >
            <BarChart3 size={16} />
            {showBacking ? 'Hide' : 'Show'} Line Detail
          </button>

          {report && (
            <button
              onClick={() =>
                exportBackingLinesCSV(
                  report.lineItems,
                  selectedPeriod,
                  report.accountName
                )
              }
              className="touch-target"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: '#F73582',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '10px',
                padding: '8px 14px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Download size={16} /> Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div
              className="grid-auto"
              style={
                {
                  ['--min']: '220px',
                  marginBottom: '20px',
                } as React.CSSProperties
              }
            >
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow:
                      '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                    padding: '18px',
                    border: '1px solid #F0E6EC',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  <Skeleton h="0.7rem" w="60%" />
                  <Skeleton h="1.5rem" w="80%" />
                  <Skeleton h="0.7rem" w="40%" />
                </div>
              ))}
            </div>
            <div
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
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}
                >
                  <Skeleton h="0.8rem" w={`${40 + i * 5}%`} />
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: '16px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                color: '#A39BB3',
                fontSize: '0.8rem',
                fontWeight: 500,
              }}
            >
              <RefreshCw
                size={14}
                style={{ animation: 'spin 1s linear infinite' }}
              />
              Generating billing report…
            </div>
          </motion.div>
        ) : reportError ? (
          // Ahead of the `report ? …` branch: a failed request rendered
          // nothing at all below the period picker, which reads as a month
          // with no spend in it.
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={panelCard}
          >
            <ErrorState
              title="The billing statement could not be loaded"
              detail="The billing service did not respond. Nothing has been billed differently — try again."
              error={reportError}
              onRetry={() => refetchReport()}
            />
          </motion.div>
        ) : report ? (
          <motion.div
            key={selectedPeriod}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {/* Summary Cards */}
            <div
              className="grid-auto"
              style={
                {
                  ['--min']: '220px',
                  marginBottom: '20px',
                } as React.CSSProperties
              }
            >
              <SummaryCard
                label="Total Amount Owed"
                value={formatMoney(report.totalSpend)}
                sub={`Invoice: ${report.invoiceRef}`}
              />
              <SummaryCard
                label="Total Orders"
                value={String(report.totalOrders)}
                sub={`in ${report.periodLabel}`}
              />
              <SummaryCard
                label="Line Items"
                value={String(report.totalLineItems)}
                sub="across all orders"
              />
              <SummaryCard
                label="Active Sites"
                value={String(report.activeSitesCount)}
                sub="with orders this period"
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <InvoicesPanel
                billingPeriod={selectedPeriod}
                accountId={accountId || undefined}
                title="Invoice documents"
                subtitle="The issued invoice as billed: PDF, and the CSV and Excel backing file, rendered by the server"
              />
            </div>

            {/* Site Breakdown + Category Breakdown */}
            <div
              className="grid-auto"
              style={
                {
                  ['--min']: '300px',
                  marginBottom: '20px',
                } as React.CSSProperties
              }
            >
              {/* Site Breakdown Table */}
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
                <div
                  className="row-wrap"
                  style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #F5EEF2',
                    justifyContent: 'space-between',
                  }}
                >
                  <h2
                    style={{
                      fontSize: '0.95rem',
                      fontWeight: 700,
                      color: '#2B253E',
                      letterSpacing: '-0.01em',
                      margin: 0,
                    }}
                  >
                    Site Breakdown
                  </h2>
                  <span style={{ fontSize: '0.76rem', color: '#A39BB3' }}>
                    {report.periodLabel}
                  </span>
                </div>
                <div className="table-scroll">
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      fontSize: '0.84rem',
                    }}
                  >
                    <thead>
                      <tr>
                        {['Site', 'Orders', 'Total Spend', '% of Total'].map(
                          (h) => (
                            <th
                              key={h}
                              style={{
                                padding:
                                  h === 'Site'
                                    ? '10px 14px 10px 20px'
                                    : h === '% of Total'
                                      ? '10px 20px 10px 14px'
                                      : '10px 14px',
                                textAlign: h === 'Site' ? 'left' : 'right',
                                fontSize: '0.74rem',
                                fontWeight: 500,
                                color: '#A39BB3',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {h}
                            </th>
                          )
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {report.siteBreakdowns.length === 0 && (
                        <tr>
                          <td colSpan={4} style={{ padding: 0 }}>
                            <EmptyState
                              title="No site spend this period"
                              detail="Each site that orders in this period appears here with its share of the invoice."
                            />
                          </td>
                        </tr>
                      )}
                      {report.siteBreakdowns.map((s) => (
                        <tr
                          key={s.siteId}
                          style={{ borderTop: '1px solid #F5EEF2' }}
                        >
                          <td style={{ padding: '12px 14px 12px 20px' }}>
                            <div style={{ fontWeight: 600, color: '#2B253E' }}>
                              {s.siteName}
                            </div>
                            <div
                              style={{ fontSize: '0.72rem', color: '#A39BB3' }}
                            >
                              {s.siteCode}
                            </div>
                          </td>
                          <td
                            style={{
                              padding: '12px 14px',
                              textAlign: 'right',
                              color: '#6E6781',
                            }}
                          >
                            {s.ordersCount}
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
                            {formatMoney(s.totalSpend)}
                          </td>
                          <td
                            style={{
                              padding: '12px 20px 12px 14px',
                              textAlign: 'right',
                              color: '#6E6781',
                            }}
                          >
                            {s.percentageOfTotal.toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Category Breakdown */}
              <div
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  boxShadow:
                    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                  border: '1px solid #F0E6EC',
                  padding: '20px',
                }}
              >
                <h2
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    letterSpacing: '-0.01em',
                    margin: '0 0 16px',
                  }}
                >
                  Spend by Category
                </h2>
                {report.categoryBreakdown.map((c, i) => (
                  <CategoryBar
                    key={c.category}
                    category={c.category}
                    spend={c.spend}
                    pct={c.percentage}
                    index={i}
                  />
                ))}
              </div>
            </div>

            {/* Backing Detail Table */}
            <AnimatePresence>
              {showBacking && (
                <motion.div
                  key="backing"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    boxShadow:
                      '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                    border: '1px solid #F0E6EC',
                    overflow: 'hidden',
                    marginBottom: '20px',
                  }}
                >
                  <div
                    className="row-wrap"
                    style={{
                      padding: '16px 20px',
                      borderBottom: '1px solid #F5EEF2',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div>
                      <h2
                        style={{
                          fontSize: '0.95rem',
                          fontWeight: 700,
                          color: '#2B253E',
                          letterSpacing: '-0.01em',
                          margin: 0,
                        }}
                      >
                        Transaction-Level Reconciliation Detail
                      </h2>
                      <p
                        style={{
                          fontSize: '0.76rem',
                          color: '#A39BB3',
                          margin: '3px 0 0',
                        }}
                      >
                        {report.totalLineItems} line items · all reconciliation
                        fields
                      </p>
                    </div>
                    <button
                      onClick={() =>
                        exportBackingLinesCSV(
                          report.lineItems,
                          selectedPeriod,
                          report.accountName
                        )
                      }
                      className="touch-target"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #F0E6EC',
                        borderRadius: '10px',
                        padding: '8px 14px',
                        color: '#2B253E',
                        fontSize: '0.82rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      <Download size={16} /> Export
                    </button>
                  </div>
                  <div
                    className="table-scroll"
                    style={{ maxHeight: '600px', overflowY: 'auto' }}
                  >
                    <table
                      style={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: '0.8rem',
                      }}
                    >
                      {/* Sticky, so it keeps a white ground to scroll under;
                          no filled band and no rule of its own. */}
                      <thead
                        style={{
                          backgroundColor: '#FFFFFF',
                          position: 'sticky',
                          top: 0,
                          zIndex: 2,
                        }}
                      >
                        <tr>
                          {[
                            'Order #',
                            'Date',
                            'Account',
                            'Site',
                            'Site Code',
                            'Ordered By',
                            'PO Ref',
                            'Product',
                            'SKU',
                            'Pack',
                            'UOM',
                            'Qty',
                            'Unit Price',
                            'Line Value',
                            'Tax',
                            'Order Total',
                            'Ship To',
                            'Bill To',
                            'Status',
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                padding:
                                  h === 'Order #'
                                    ? '10px 14px 10px 20px'
                                    : h === 'Status'
                                      ? '10px 20px 10px 14px'
                                      : '10px 14px',
                                textAlign: [
                                  'Qty',
                                  'Unit Price',
                                  'Line Value',
                                  'Order Total',
                                ].includes(h)
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
                        {report.lineItems.length === 0 && (
                          <tr>
                            <td colSpan={19} style={{ padding: 0 }}>
                              <EmptyState
                                title="No backing lines for this period"
                                detail="Every billed item appears here once orders are placed — one row per product, with its SKU, quantity and GST."
                              />
                            </td>
                          </tr>
                        )}
                        {report.lineItems.map((li, i) => (
                          <tr
                            key={`${li.orderNumber}-${li.sku}-${i}`}
                            style={{
                              borderTop: '1px solid #F5EEF2',
                              color: '#2B253E',
                              transition: 'background-color 120ms ease',
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.backgroundColor =
                                '#FCF7FA')
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.backgroundColor =
                                'transparent')
                            }
                          >
                            <td
                              style={{
                                padding: '10px 14px 10px 20px',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {li.orderNumber}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                color: '#A39BB3',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {formatDate(li.orderDate)}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {li.accountName}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {li.siteName}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                fontFamily: 'monospace',
                                fontSize: '0.76rem',
                                color: '#A39BB3',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {li.siteCode}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {li.orderedByUser}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                fontFamily: 'monospace',
                                fontSize: '0.76rem',
                                color: '#A39BB3',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {li.poReference || '—'}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                maxWidth: '160px',
                                fontWeight: 500,
                              }}
                            >
                              {li.productName}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                fontFamily: 'monospace',
                                color: '#A39BB3',
                                fontSize: '0.74rem',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {li.sku}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                color: '#6E6781',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {li.packSize || '—'}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                color: '#6E6781',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {li.uom || '—'}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                textAlign: 'right',
                              }}
                            >
                              {li.qty}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                textAlign: 'right',
                                color: '#6E6781',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {formatMoney(li.unitPrice)}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                textAlign: 'right',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {formatMoney(li.lineValue)}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                color: '#A39BB3',
                                whiteSpace: 'nowrap',
                                fontSize: '0.74rem',
                              }}
                            >
                              {li.taxTreatment}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                textAlign: 'right',
                                fontWeight: 600,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {formatMoney(li.orderTotal)}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                color: '#6E6781',
                                maxWidth: '160px',
                                fontSize: '0.74rem',
                              }}
                            >
                              {li.shipToAddress}
                            </td>
                            <td
                              style={{
                                padding: '10px 14px',
                                color: '#6E6781',
                                maxWidth: '160px',
                                fontSize: '0.74rem',
                              }}
                            >
                              {li.billToAddress}
                            </td>
                            <td
                              style={{
                                padding: '10px 20px 10px 14px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <StatusPill status={li.status} size="sm" />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Historical period links */}
            <div
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                boxShadow:
                  '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                padding: '20px',
                border: '1px solid #F0E6EC',
              }}
            >
              <h2
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: '#2B253E',
                  letterSpacing: '-0.01em',
                  margin: '0 0 12px',
                }}
              >
                Historical Reports
              </h2>
              <div className="row-wrap">
                {AVAILABLE_PERIODS.map((p) => (
                  <Link
                    key={p.key}
                    href={`/head-office/billing/monthly/${p.key}`}
                    className="touch-target"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '6px 12px',
                      borderRadius: '10px',
                      border: '1px solid #F0E6EC',
                      backgroundColor:
                        p.key === selectedPeriod ? '#FCF7FA' : '#FFFFFF',
                      color: p.key === selectedPeriod ? '#F73582' : '#2B253E',
                      fontSize: '0.8rem',
                      fontWeight: p.key === selectedPeriod ? 600 : 500,
                      textDecoration: 'none',
                    }}
                  >
                    <FileSpreadsheet
                      size={14}
                      color={p.key === selectedPeriod ? '#F73582' : '#A39BB3'}
                    />{' '}
                    {p.label}
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={panelCard}
          >
            <EmptyState
              icon={FileSpreadsheet}
              title="No statement for this period yet"
              detail="Pick another month above, or come back once this account's first order has been placed."
            />
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0}}
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)}}
      `}</style>
    </div>
  )
}
