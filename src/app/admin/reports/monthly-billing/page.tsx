// src/app/admin/reports/monthly-billing/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState } from '@/components/ui/TableState'
import { useState } from 'react'
import { FileSpreadsheet, Download, Printer } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { StatusPill } from '@/components/admin/StatusPill'
import { useMonthlyBillingReport } from '@/hooks/useReports'
import { InvoicesPanel } from '@/components/billing/InvoicesPanel'
import { exportBillingReportCSV, downloadCSV } from '@/utils/export/csv'
import { exportBillingReportXLSX } from '@/utils/export/xlsx'
import { printBillingReportPDF } from '@/utils/export/pdf'
import { formatMoney, formatMonthYear, formatMonthYearLong } from '@/lib/format'

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
      label: formatMonthYearLong(date),
      shortLabel: formatMonthYear(date),
    }
  })
}

export default function MonthlyBillingReportPage() {
  const periods = recentBillingPeriods()
  const [selectedPeriod, setSelectedPeriod] = useState(periods[0].key)
  const {
    data: report,
    isLoading,
    error: reportError,
    refetch: refetchReport,
  } = useMonthlyBillingReport(selectedPeriod)

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
        title="Monthly billing"
        subtitle="One consolidated invoice per account each month, and what each site spent"
        actionButton={
          /* Three export buttons side by side ran off the header on a phone. */
          <div className="row-wrap" style={{ gap: '8px' }}>
            <button
              type="button"
              className="touch-target"
              onClick={handlePrintPDF}
              style={secondaryButton}
            >
              <Printer size={15} />
              <span>Print report</span>
            </button>
            <button
              type="button"
              className="touch-target"
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
              className="touch-target"
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
        className="page-pad"
        style={{
          paddingBlock: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Period Selector & Top Invoicing Summary */}
        <div
          className="row-wrap"
          style={{
            ...card,
            padding: '20px',
            justifyContent: 'space-between',
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
                className="touch-target"
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                style={{
                  maxWidth: '100%',
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
            // Three figures held in one unbreakable row pushed the card wider
            // than the screen; they now fit as many per row as there is room.
            <div
              className="grid-auto"
              style={
                {
                  ['--min']: '150px',
                  flex: '1 1 260px',
                  gap: '20px',
                } as React.CSSProperties
              }
            >
              <div>
                <div style={kpiLabel}>Total Consolidated Spend</div>
                <div style={kpiValue}>{formatMoney(report.totalSpend)}</div>
              </div>
              <div
                style={{ borderLeft: '1px solid #F5EEF2', paddingLeft: '20px' }}
              >
                <div style={kpiLabel}>Active Sites</div>
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
            className="row-wrap"
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #F5EEF2',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h3 style={cardTitle}>Spend by site</h3>
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
          ) : reportError ? (
            // Ahead of the empty check: a failed request drew a bare header
            // over white space, which reads as a month in which nobody ordered.
            <ErrorState
              title="The billing statement could not be loaded"
              detail="The reporting service did not respond. No figures here are final until it does — try again."
              error={reportError}
              onRetry={() => refetchReport()}
            />
          ) : !report?.siteBreakdowns.length ? (
            <EmptyState
              icon={FileSpreadsheet}
              title={`No site spend recorded for ${formatMonthYearLong(`${selectedPeriod}-01`)}`}
              detail="Each site that places an order in this period appears here with its share of the consolidated invoice."
            />
          ) : (
            <div className="table-scroll">
              {/* Seven columns of site, code, account and money: it keeps its
                  width and scrolls in the card rather than squeezing. */}
              <table
                style={{
                  width: '100%',
                  minWidth: '880px',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.84rem',
                }}
              >
                <thead>
                  <tr>
                    <th style={thEdge}>Site</th>
                    <th style={th}>Site Code</th>
                    <th style={th}>Parent Account</th>
                    <th style={{ ...th, textAlign: 'center' }}>Orders</th>
                    <th style={th}>Top Collateral Category</th>
                    {/* NZD. The portal bills in New Zealand dollars and
                        `formatMoney` renders them; the header said USD. */}
                    <th style={{ ...th, textAlign: 'right' }}>
                      Total Spend (NZD)
                    </th>
                    <th style={{ ...thEdge, textAlign: 'right' }}>
                      Billing Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {report.siteBreakdowns.map((site) => (
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
                        {formatMoney(site.totalSpend)}
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
            {/* Four fixed columns left each category about 60px on a phone —
                enough for neither its name nor its figure. */}
            <div
              className="grid-auto"
              style={{ ['--min']: '180px', gap: '20px' } as React.CSSProperties}
            >
              {report.categoryBreakdown.map((cat) => (
                <div key={cat.category}>
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
                    {formatMoney(cat.spend)}
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
