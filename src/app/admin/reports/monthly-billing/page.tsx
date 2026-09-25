// src/app/admin/reports/monthly-billing/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useState } from 'react'
import { FileSpreadsheet, Download, Printer } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { StatusPill } from '@/components/admin/StatusPill'
import { useMonthlyBillingReport } from '@/hooks/useReports'
import { InvoicesPanel } from '@/components/billing/InvoicesPanel'
import { exportBillingReportCSV, downloadCSV } from '@/utils/export/csv'
import { exportBillingReportXLSX } from '@/utils/export/xlsx'
import { printBillingReportPDF } from '@/utils/export/pdf'

/** The shared card: hairline border and a soft shadow, as on the admin dashboard. */
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
  letterSpacing: '-0.01em',
  margin: 0,
}

const cardSubtitle: React.CSSProperties = {
  fontSize: '0.76rem',
  color: '#A39BB3',
  margin: '3px 0 0',
}

/** A column label: grey, regular weight, no filled band behind it. */
const th: React.CSSProperties = {
  padding: '10px 14px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}

/** The outer columns carry the table's 20px gutter. */
const thEdge: React.CSSProperties = { ...th, padding: '10px 20px' }

/** Label and value of a summary figure, as in the dashboard's StatCard. */
const kpiLabel: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 500,
  color: '#6E6781',
}

const kpiValue: React.CSSProperties = {
  marginTop: '4px',
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#2B253E',
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
}

const secondaryButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  borderRadius: '10px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #F0E6EC',
  color: '#2B253E',
  fontSize: '0.82rem',
  fontWeight: 600,
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
      label: date.toLocaleDateString('en-GB', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }),
      shortLabel: date.toLocaleDateString('en-GB', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      }),
    }
  })
}

export default function MonthlyBillingReportPage() {
  const periods = recentBillingPeriods()
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0].key)
  const { data: report, isLoading } = useMonthlyBillingReport(selectedPeriod)

  // These three export the period report as it is on screen, across every
  // account. An account's invoice documents are rendered by the server and
  // downloaded from the Invoices panel below, one invoice at a time.
  const handleExportCSV = () => {
    if (!report) return
    downloadCSV(
      exportBillingReportCSV(report),
      `billing-report-${selectedPeriod}.csv`
    )
  }

  const handleExportXLSX = () => {
    if (report) exportBillingReportXLSX(report)
  }

  const handlePrintPDF = () => {
    if (report) printBillingReportPDF(report)
  }

  return (
    <>
      <AdminHeader
        title="Monthly Consolidated Billing & Spend Report"
        subtitle="Consolidated multi-site invoicing, collateral category allocations, and verified contract billing"
        actionButton={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={handlePrintPDF}
              style={secondaryButton}
            >
              <Printer size={15} />
              <span>Print report</span>
            </button>
            <button
              type="button"
              onClick={handleExportCSV}
              style={secondaryButton}
            >
              <Download size={15} />
              <span>Report CSV</span>
            </button>
            {/* A pink border rather than none, so it stands the same height as
                the outlined buttons beside it. */}
            <button
              type="button"
              onClick={handleExportXLSX}
              style={{
                ...secondaryButton,
                backgroundColor: '#F73582',
                border: '1px solid #F73582',
                color: '#FFFFFF',
              }}
            >
              <FileSpreadsheet size={15} />
              <span>Report Excel</span>
            </button>
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
        {/* Period Selector & Top Invoicing Summary */}
        <div
          style={{
            ...card,
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '20px',
          }}
        >
          <div>
            <div
              style={{
                fontSize: '0.78rem',
                color: '#5C566E',
                fontWeight: 600,
              }}
            >
              Invoicing period
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                marginTop: '6px',
              }}
            >
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #F0E6EC',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: '#2B253E',
                  backgroundColor: '#FFFFFF',
                }}
              >
                {periods.map((period, index) => (
                  <option key={period.key} value={period.key}>
                    {period.label}
                    {index === 0 ? ' (current)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {report && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <div>
                <div style={kpiLabel}>Total Consolidated Spend</div>
                <div style={kpiValue}>
                  $
                  {report.totalSpend.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
              <div
                style={{ borderLeft: '1px solid #F5EEF2', paddingLeft: '20px' }}
              >
                <div style={kpiLabel}>Active Site Branches</div>
                <div style={kpiValue}>{report.activeSitesCount}</div>
              </div>
              <div
                style={{ borderLeft: '1px solid #F5EEF2', paddingLeft: '20px' }}
              >
                <div style={kpiLabel}>Total Fulfilled Orders</div>
                <div style={kpiValue}>{report.totalOrders}</div>
              </div>
            </div>
          )}
        </div>

        <InvoicesPanel
          billingPeriod={selectedPeriod}
          subtitle="Build, issue, record payment or void each account's invoice, and download the documents the server renders from it"
        />

        {/* Site Breakdown Table */}
        <div style={{ ...card, overflow: 'hidden' }}>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #F5EEF2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h3 style={cardTitle}>Branch-by-Branch Spend Allocation</h3>
              <p style={cardSubtitle}>
                Breakdown feeding the monthly consolidated healthcare network
                invoice
              </p>
            </div>
          </div>

          {isLoading ? (
            <SkeletonTable
              rows={6}
              columns={7}
              label="Loading the billing statement"
            />
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
                    <th style={thEdge}>Site Branch</th>
                    <th style={th}>Site Code</th>
                    <th style={th}>Parent Account</th>
                    <th style={{ ...th, textAlign: 'center' }}>Orders</th>
                    <th style={th}>Top Collateral Category</th>
                    <th style={{ ...th, textAlign: 'right' }}>
                      Total Spend (USD)
                    </th>
                    <th style={{ ...thEdge, textAlign: 'right' }}>
                      Billing Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report?.siteBreakdowns.map((site) => (
                    <tr
                      key={site.siteId}
                      style={{ borderTop: '1px solid #F5EEF2' }}
                    >
                      <td
                        style={{
                          padding: '12px 20px',
                          fontWeight: 600,
                          color: '#2B253E',
                        }}
                      >
                        {site.siteName}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          fontFamily: 'monospace',
                          color: '#6E6781',
                          fontSize: '0.78rem',
                        }}
                      >
                        {site.siteCode}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#2B253E' }}>
                        {site.accountName}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          textAlign: 'center',
                          color: '#6E6781',
                        }}
                      >
                        {site.ordersCount}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#6E6781' }}>
                        {site.topCategory}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: '#2B253E',
                        }}
                      >
                        $
                        {site.totalSpend.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                        <StatusPill status={site.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Category Spend Allocation */}
        {report && (
          <div style={{ ...card, padding: '20px' }}>
            <h3 style={{ ...cardTitle, marginBottom: '16px' }}>
              Category Spend Distribution (% of Total Budget)
            </h3>
            {/* Plain columns on the card rather than framed tiles inside it;
                the spacing separates them and the pink is left to the bars. */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: '20px',
              }}
            >
              {report.categoryBreakdown.map((cat, idx) => (
                <div key={idx}>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 500,
                      color: '#6E6781',
                    }}
                  >
                    {cat.category}
                  </div>
                  <div
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: 700,
                      color: '#2B253E',
                      letterSpacing: '-0.02em',
                      marginTop: '4px',
                    }}
                  >
                    $
                    {cat.spend.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginTop: '8px',
                    }}
                  >
                    <div
                      style={{
                        flex: 1,
                        height: '6px',
                        backgroundColor: '#F5EEF2',
                        borderRadius: '9999px',
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${cat.percentage}%`,
                          height: '100%',
                          backgroundColor: '#F73582',
                          borderRadius: '9999px',
                        }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: '#6E6781',
                      }}
                    >
                      {cat.percentage}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </>
  )
}
