// src/app/head-office/billing/monthly/[period]/page.tsx
'use client'

import { Skeleton as UiSkeleton } from '@/components/ui/Skeleton'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { ChevronRight, Download, FileSpreadsheet } from 'lucide-react'
import { StatusPill } from '@/components/admin/StatusPill'
import { useHOMonthlyBillingReport } from '@/hooks/useHeadOffice'
import { useAuth } from '@/hooks/useAuth'
import { InvoicesPanel } from '@/components/billing/InvoicesPanel'
import { exportBackingLinesCSV } from '@/utils/export/csv'

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

export default function HOBillingPeriodPage() {
  const { user } = useAuth()
  // The account the signed-in user belongs to. The API scopes every
  // head-office read to it anyway; this is what the screen asks about.
  const accountId = user?.accountId ?? ''
  const params = useParams()
  const period = params.period as string
  const { data: report, isLoading } = useHOMonthlyBillingReport(
    accountId,
    period
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* Header. The breadcrumb sits over the title rather than as a row of its
          own, so the page opens on one block instead of two. */}
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
          {/* Breadcrumb */}
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
            <Link
              href="/head-office/billing/monthly"
              style={{
                color: '#A39BB3',
                textDecoration: 'none',
                fontWeight: 500,
              }}
            >
              Monthly Billing
            </Link>
            <ChevronRight size={12} />
            <span style={{ color: '#6E6781', fontWeight: 500 }}>
              {report?.periodLabel ?? period}
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
            {isLoading ? (
              <UiSkeleton width={260} height={22} />
            ) : (
              `${report?.periodLabel} — Billing Report`
            )}
          </h1>
          <p
            style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}
          >
            {isLoading
              ? ''
              : `${report?.accountName} · Invoice Ref: ${report?.invoiceRef}`}
          </p>
        </div>
        {!isLoading && report && (
          <button
            onClick={() =>
              exportBackingLinesCSV(
                report.lineItems,
                period,
                report.accountName
              )
            }
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
            <Download size={16} /> Export Full CSV
          </button>
        )}
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
            }}
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
                <Skeleton h="0.7rem" w="50%" />
                <Skeleton h="1.5rem" w="70%" />
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
              <Skeleton key={i} h="0.8rem" w={`${50 + i * 6}%`} />
            ))}
          </div>
        </div>
      ) : !report ? (
        <div
          style={{
            textAlign: 'center',
            padding: '32px',
            color: '#A39BB3',
            fontSize: '0.84rem',
          }}
        >
          <FileSpreadsheet
            size={20}
            color="#A39BB3"
            style={{ display: 'block', margin: '0 auto 8px' }}
          />
          <p style={{ margin: '0 0 8px' }}>
            No billing data found for this period.
          </p>
          <Link
            href="/head-office/billing/monthly"
            style={{
              color: '#F73582',
              fontSize: '0.8rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            ← Back to Billing
          </Link>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
        >
          {/* Summary Cards */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '14px',
            }}
          >
            {[
              {
                label: 'Total Amount Owed',
                value: `$${report.totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
                sub: `Invoice: ${report.invoiceRef}`,
              },
              {
                label: 'Total Orders',
                value: String(report.totalOrders),
                sub: `in ${report.periodLabel}`,
              },
              {
                label: 'Line Items',
                value: String(report.totalLineItems),
                sub: 'across all orders',
              },
              {
                label: 'Active Sites',
                value: String(report.activeSitesCount),
                sub: 'with orders this period',
              },
            ].map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.04 }}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  boxShadow:
                    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                  padding: '18px',
                  border: '1px solid #F0E6EC',
                }}
              >
                <div
                  style={{
                    fontSize: '0.78rem',
                    fontWeight: 500,
                    color: '#6E6781',
                  }}
                >
                  {c.label}
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
                  {c.value}
                </div>
                <div
                  style={{
                    fontSize: '0.76rem',
                    color: '#A39BB3',
                    marginTop: '8px',
                  }}
                >
                  {c.sub}
                </div>
              </motion.div>
            ))}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <InvoicesPanel
              billingPeriod={period}
              accountId={accountId || undefined}
              title="Invoice documents"
              subtitle="The issued invoice as billed: PDF, and the CSV and Excel backing file, rendered by the server"
            />
          </div>

          {/* Site Breakdown */}
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
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #F5EEF2',
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
                Site Breakdown — {report.periodLabel}
              </h2>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.84rem',
                }}
              >
                <thead>
                  <tr>
                    {[
                      'Site',
                      'Site Code',
                      'Orders',
                      'Total Spend',
                      '% of Total',
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding:
                            h === 'Site'
                              ? '10px 14px 10px 20px'
                              : h === '% of Total'
                                ? '10px 20px 10px 14px'
                                : '10px 14px',
                          textAlign:
                            h === 'Site' || h === 'Site Code'
                              ? 'left'
                              : 'right',
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
                  {report.siteBreakdowns.map((s) => (
                    <tr
                      key={s.siteId}
                      style={{ borderTop: '1px solid #F5EEF2' }}
                    >
                      <td
                        style={{
                          padding: '12px 14px 12px 20px',
                          fontWeight: 600,
                          color: '#2B253E',
                        }}
                      >
                        {s.siteName}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          fontFamily: 'monospace',
                          fontSize: '0.76rem',
                          color: '#A39BB3',
                        }}
                      >
                        {s.siteCode}
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
                        $
                        {s.totalSpend.toLocaleString('en-US', {
                          minimumFractionDigits: 2,
                        })}
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

          {/* Full Reconciliation Table */}
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
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #F5EEF2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap',
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
                  Full Transaction-Level Detail
                </h2>
                <p
                  style={{
                    fontSize: '0.76rem',
                    color: '#A39BB3',
                    margin: '3px 0 0',
                  }}
                >
                  {report.totalLineItems} line items · all reconciliation fields
                </p>
              </div>
              <button
                onClick={() =>
                  exportBackingLinesCSV(
                    report.lineItems,
                    period,
                    report.accountName
                  )
                }
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
              style={{
                overflowX: 'auto',
                maxHeight: '560px',
                overflowY: 'auto',
              }}
            >
              <table
                style={{
                  width: '100%',
                  borderCollapse: 'collapse',
                  fontSize: '0.8rem',
                }}
              >
                {/* Sticky, so it keeps a white ground to scroll under; no
                    filled band and no rule of its own. */}
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
                      'Site',
                      'Ordered By',
                      'PO Ref',
                      'Product',
                      'SKU',
                      'Qty',
                      'Unit Price',
                      'Line Value',
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
                  {report.lineItems.map((li, i) => (
                    <tr
                      key={`${li.orderNumber}-${li.sku}-${i}`}
                      style={{
                        borderTop: '1px solid #F5EEF2',
                        color: '#2B253E',
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
                        {new Date(li.orderDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })}
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
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {li.orderedByUser}
                      </td>
                      <td
                        style={{
                          padding: '10px 14px',
                          fontFamily: 'monospace',
                          color: '#A39BB3',
                          whiteSpace: 'nowrap',
                          fontSize: '0.76rem',
                        }}
                      >
                        {li.poReference || '—'}
                      </td>
                      <td
                        style={{
                          padding: '10px 14px',
                          maxWidth: '140px',
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
                        ${li.unitPrice.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: '10px 14px',
                          textAlign: 'right',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ${li.lineValue.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: '10px 14px',
                          textAlign: 'right',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ${li.orderTotal.toFixed(2)}
                      </td>
                      <td
                        style={{
                          padding: '10px 14px',
                          color: '#6E6781',
                          maxWidth: '140px',
                          fontSize: '0.74rem',
                        }}
                      >
                        {li.shipToAddress}
                      </td>
                      <td
                        style={{
                          padding: '10px 14px',
                          color: '#6E6781',
                          maxWidth: '140px',
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
          </div>

          {/* Back link */}
          <div>
            <Link
              href="/head-office/billing/monthly"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                color: '#6E6781',
                textDecoration: 'none',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              ← Back to Billing Periods
            </Link>
          </div>
        </motion.div>
      )}

      <style>{`
        @keyframes shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0}}
      `}</style>
    </div>
  )
}
