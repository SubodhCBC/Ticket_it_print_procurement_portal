// src/app/admin/reports/analytics/_components/ReportAnalytics.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, FileSpreadsheet, RotateCw } from 'lucide-react'
import { AuditAccountPicker } from '@/components/admin/AuditAccountPicker'
import { StatusPill } from '@/components/admin/StatusPill'
import { useAuth } from '@/hooks/useAuth'
import { ApiError } from '@/services/api.service'
import {
  downloadReportExport,
  getInventoryReport,
  getInventoryTurnover,
  getOrderVelocity,
  getOrdersByStatus,
  getSpendByAccount,
  getSpendByRegion,
  getSpendOverTime,
  getSpendSummary,
  getTopProducts,
  saveBlob,
} from '@/services/data-source/api/api-reports.adapter'
import type {
  ApiDimensionRow,
  ApiGranularity,
  ApiReportExportFormat,
  ApiReportExportName,
  ApiReportRangeQuery,
} from '@/services/data-source/api/report.types'
import {
  formatMoney,
  formatNumber,
  formatDate,
  formatMonthYear,
} from '@/lib/format'

/**
 * The analytics reports, one card per endpoint.
 *
 * Shared by the admin and head-office screens. Each card owns its own query,
 * so one refused or failing report shows its own message and leaves the rest of
 * the page standing. Which cards appear is decided by the signed-in user's
 * permissions — the same ones the routes check — so nobody is shown a card that
 * can only ever answer 403.
 */

const REPORT_STALE_TIME = 60_000
const INVENTORY_LIMIT = 100

// --- Styles --------------------------------------------------------------------

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

const th: React.CSSProperties = {
  padding: '10px 14px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
  textAlign: 'left',
}

const td: React.CSSProperties = {
  padding: '11px 14px',
  color: '#2B253E',
}

const tdMuted: React.CSSProperties = { ...td, color: '#6E6781' }

const tdMono: React.CSSProperties = {
  ...td,
  fontFamily: 'monospace',
  fontSize: '0.78rem',
  color: '#6E6781',
}

const right: React.CSSProperties = { textAlign: 'right' }

const kpiLabel: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 500,
  color: '#6E6781',
}

const kpiValue: React.CSSProperties = {
  marginTop: '4px',
  fontSize: '1.4rem',
  fontWeight: 700,
  color: '#2B253E',
  letterSpacing: '-0.02em',
  lineHeight: 1.2,
}

const secondaryButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: '10px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #F0E6EC',
  color: '#2B253E',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const controlStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#2B253E',
  backgroundColor: '#FFFFFF',
}

const fieldLabel: React.CSSProperties = {
  fontSize: '0.74rem',
  color: '#5C566E',
  fontWeight: 600,
  marginBottom: '6px',
}

const stateBox: React.CSSProperties = {
  padding: '28px 20px',
  textAlign: 'center',
  color: '#A39BB3',
  fontSize: '0.84rem',
}

// --- Formatting ------------------------------------------------------------------

function percent(value: number | null | undefined, signed = false): string {
  if (value == null) return '—'
  const sign = signed && value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

function growthColor(value: number | null | undefined): string {
  if (value == null || value === 0) return '#2B253E'
  return value > 0 ? '#3F9C68' : '#DC2626'
}

/** Buckets are UTC starts; a month bucket reads as a month, the rest as a day. */
function bucketLabel(bucket: string, granularity: ApiGranularity): string {
  const date = new Date(bucket)
  if (Number.isNaN(date.getTime())) return bucket
  return granularity === 'month' ? formatMonthYear(date) : formatDate(date)
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403)
      return 'You do not have permission to view this report.'
    return error.message
  }
  return error instanceof Error ? error.message : 'Could not load this report.'
}

// --- Filters -----------------------------------------------------------------------

/** `YYYY-MM-DD` in local time, as a date input speaks it. */
function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

interface Filters {
  /** Inclusive, `YYYY-MM-DD`. */
  from: string
  /** Inclusive on screen; sent to the API as the start of the next day. */
  to: string
  granularity: '' | ApiGranularity
  accountId: string
}

function defaultFilters(): Filters {
  const today = new Date()
  const from = new Date(today)
  from.setDate(today.getDate() - 29)
  return {
    from: toDateInput(from),
    to: toDateInput(today),
    granularity: '',
    accountId: '',
  }
}

/**
 * The filter bar's values as the API wants them.
 *
 * The API's `to` is exclusive, so the last day picked is sent as the midnight
 * after it — otherwise "to 17 September" would leave out the 17th.
 */
function toRangeQuery(filters: Filters): ApiReportRangeQuery {
  const query: ApiReportRangeQuery = {}
  if (filters.from) {
    const from = new Date(`${filters.from}T00:00:00`)
    if (!Number.isNaN(from.getTime())) query.from = from.toISOString()
  }
  if (filters.to) {
    const to = new Date(`${filters.to}T00:00:00`)
    if (!Number.isNaN(to.getTime())) {
      to.setDate(to.getDate() + 1)
      query.to = to.toISOString()
    }
  }
  if (filters.granularity) query.granularity = filters.granularity
  if (filters.accountId) query.accountId = filters.accountId
  return query
}

// --- Building blocks -------------------------------------------------------------

type ExportQuery = Parameters<typeof downloadReportExport>[2]

function ExportButtons({
  name,
  query,
}: {
  name: ApiReportExportName
  query: ExportQuery
}) {
  const [busy, setBusy] = useState<ApiReportExportFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (format: ApiReportExportFormat) => {
    setBusy(format)
    setError(null)
    try {
      const { blob, filename } = await downloadReportExport(name, format, query)
      saveBlob(blob, filename)
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 403
          ? 'Export not permitted.'
          : 'Export failed.'
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    // The export pair sat in the card header next to the title, so on a phone
    // the failure message and the second button were pushed off the card.
    <div className="row-wrap">
      {error && (
        <span style={{ fontSize: '0.74rem', color: '#DC2626' }}>{error}</span>
      )}
      <button
        type="button"
        className="touch-target"
        onClick={() => run('csv')}
        disabled={busy !== null}
        style={{ ...secondaryButton, opacity: busy ? 0.6 : 1 }}
      >
        <Download size={14} />
        <span>{busy === 'csv' ? 'Exporting...' : 'CSV'}</span>
      </button>
      <button
        type="button"
        className="touch-target"
        onClick={() => run('xlsx')}
        disabled={busy !== null}
        style={{ ...secondaryButton, opacity: busy ? 0.6 : 1 }}
      >
        <FileSpreadsheet size={14} />
        <span>{busy === 'xlsx' ? 'Exporting...' : 'XLSX'}</span>
      </button>
    </div>
  )
}

/**
 * A report card: header, export buttons, and exactly one of loading, error,
 * empty or the table.
 */
function ReportSection({
  title,
  subtitle,
  exportName,
  exportQuery,
  controls,
  isLoading,
  error,
  isEmpty,
  emptyMessage = 'Nothing to report for this window.',
  onRetry,
  children,
}: {
  title: string
  subtitle?: string
  exportName?: ApiReportExportName
  exportQuery?: ExportQuery
  controls?: React.ReactNode
  isLoading: boolean
  error: unknown
  isEmpty: boolean
  emptyMessage?: string
  onRetry: () => void
  children: React.ReactNode
}) {
  let body: React.ReactNode
  if (isLoading) {
    body = <SkeletonTable rows={8} columns={5} label="Loading report" />
  } else if (error) {
    body = (
      <div
        style={{
          ...stateBox,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
        }}
      >
        <span style={{ color: '#DC2626' }}>{errorMessage(error)}</span>
        <button
          type="button"
          className="touch-target"
          onClick={onRetry}
          style={secondaryButton}
        >
          <RotateCw size={14} />
          <span>Retry</span>
        </button>
      </div>
    )
  } else if (isEmpty) {
    body = <div style={stateBox}>{emptyMessage}</div>
  } else {
    body = children
  }

  return (
    <section style={{ ...card, overflow: 'hidden' }}>
      <div
        className="row-wrap"
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #F5EEF2',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <h3 style={cardTitle}>{title}</h3>
          {subtitle && <p style={cardSubtitle}>{subtitle}</p>}
        </div>
        <div className="row-wrap">
          {controls}
          {exportName && (
            <ExportButtons name={exportName} query={exportQuery} />
          )}
        </div>
      </div>
      {body}
    </section>
  )
}

function Table({
  head,
  children,
}: {
  head: React.ReactNode
  children: React.ReactNode
}) {
  return (
    // Eight-column report tables scroll inside their own card rather than
    // taking the whole page sideways with them.
    <div className="table-scroll">
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.84rem',
        }}
      >
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const rowStyle: React.CSSProperties = { borderTop: '1px solid #F5EEF2' }

function ShareBar({ value }: { value: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: '8px',
      }}
    >
      <div
        style={{
          width: '80px',
          height: '6px',
          backgroundColor: '#F5EEF2',
          borderRadius: '9999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, value))}%`,
            height: '100%',
            backgroundColor: '#F73582',
            borderRadius: '9999px',
          }}
        />
      </div>
      <span style={{ fontSize: '0.76rem', color: '#6E6781', minWidth: '44px' }}>
        {percent(value)}
      </span>
    </div>
  )
}

function useReport<T>(
  name: string,
  params: unknown,
  fetcher: () => Promise<T>,
  enabled = true
) {
  return useQuery({
    queryKey: ['reports', 'analytics', name, params],
    queryFn: fetcher,
    staleTime: REPORT_STALE_TIME,
    enabled,
  })
}

// --- Sections ----------------------------------------------------------------------

function SpendSummarySection({ query }: { query: ApiReportRangeQuery }) {
  const report = useReport('spend-summary', query, () => getSpendSummary(query))
  const data = report.data

  const figures = data
    ? [
        { label: 'Total spend', value: formatMoney(data.totalSpend) },
        { label: 'Orders', value: formatNumber(data.orderCount) },
        {
          label: 'Average order value',
          value: formatMoney(data.averageOrderValue),
        },
        { label: 'Ordering sites', value: formatNumber(data.siteCount) },
        {
          label: 'Previous window spend',
          value: formatMoney(data.previous.totalSpend),
        },
        {
          label: 'Spend growth',
          value: percent(data.spendGrowthPercent, true),
          color: growthColor(data.spendGrowthPercent),
        },
        {
          label: 'Previous window orders',
          value: formatNumber(data.previous.orderCount),
        },
        {
          label: 'Order growth',
          value: percent(data.orderGrowthPercent, true),
          color: growthColor(data.orderGrowthPercent),
        },
      ]
    : []

  return (
    <ReportSection
      title="Spend Summary"
      subtitle="Committed spend in the window, against the same-length window before it"
      isLoading={report.isPending}
      error={report.error}
      isEmpty={!data}
      onRetry={() => void report.refetch()}
    >
      <div
        className="grid-auto"
        style={
          {
            padding: '20px',
            gap: '20px',
            ['--min']: '170px',
          } as React.CSSProperties
        }
      >
        {figures.map((figure) => (
          <div key={figure.label}>
            <div style={kpiLabel}>{figure.label}</div>
            <div style={{ ...kpiValue, color: figure.color ?? '#2B253E' }}>
              {figure.value}
            </div>
          </div>
        ))}
      </div>
    </ReportSection>
  )
}

function SpendOverTimeSection({ query }: { query: ApiReportRangeQuery }) {
  const report = useReport('spend-over-time', query, () =>
    getSpendOverTime(query)
  )
  const data = report.data

  return (
    <ReportSection
      title="Spend Over Time"
      subtitle={
        data
          ? `Spend and orders per ${data.granularity}, quiet periods included`
          : 'Spend and orders per period, quiet periods included'
      }
      exportName="spend/over-time"
      exportQuery={query}
      isLoading={report.isPending}
      error={report.error}
      isEmpty={!data || data.buckets.length === 0}
      onRetry={() => void report.refetch()}
    >
      {data && (
        <Table
          head={
            <>
              <th style={{ ...th, paddingLeft: '20px' }}>Period</th>
              <th style={{ ...th, ...right }}>Orders</th>
              <th style={{ ...th, ...right, paddingRight: '20px' }}>Spend</th>
            </>
          }
        >
          {data.buckets.map((bucket) => (
            <tr key={bucket.bucket} style={rowStyle}>
              <td style={{ ...td, paddingLeft: '20px', fontWeight: 600 }}>
                {bucketLabel(bucket.bucket, data.granularity)}
              </td>
              <td style={{ ...tdMuted, ...right }}>
                {formatNumber(bucket.orders)}
              </td>
              <td
                style={{
                  ...td,
                  ...right,
                  paddingRight: '20px',
                  fontWeight: 700,
                }}
              >
                {formatMoney(bucket.spend)}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </ReportSection>
  )
}

function DimensionTable({
  rows,
  labelHeading,
  sublabelHeading,
}: {
  rows: ApiDimensionRow[]
  labelHeading: string
  sublabelHeading?: string
}) {
  return (
    <Table
      head={
        <>
          <th style={{ ...th, paddingLeft: '20px' }}>{labelHeading}</th>
          {sublabelHeading && <th style={th}>{sublabelHeading}</th>}
          <th style={{ ...th, ...right }}>Orders</th>
          <th style={{ ...th, ...right }}>Spend</th>
          <th style={{ ...th, ...right, paddingRight: '20px' }}>Share</th>
        </>
      }
    >
      {rows.map((row) => (
        <tr key={row.id} style={rowStyle}>
          <td style={{ ...td, paddingLeft: '20px', fontWeight: 600 }}>
            {row.label}
          </td>
          {sublabelHeading && <td style={tdMono}>{row.sublabel ?? '—'}</td>}
          <td style={{ ...tdMuted, ...right }}>{formatNumber(row.orders)}</td>
          <td style={{ ...td, ...right, fontWeight: 700 }}>
            {formatMoney(row.spend)}
          </td>
          <td style={{ ...td, paddingRight: '20px' }}>
            <ShareBar value={row.sharePercent} />
          </td>
        </tr>
      ))}
    </Table>
  )
}

function SpendByAccountSection({ query }: { query: ApiReportRangeQuery }) {
  // Cross-tenant by nature: the account filter does not apply.
  const range = { from: query.from, to: query.to }
  const report = useReport('spend-by-account', range, () =>
    getSpendByAccount(range)
  )

  return (
    <ReportSection
      title="Spend by Account"
      subtitle="Every customer account on the platform — ignores the account filter"
      exportName="spend/by-account"
      exportQuery={range}
      isLoading={report.isPending}
      error={report.error}
      isEmpty={!report.data || report.data.length === 0}
      onRetry={() => void report.refetch()}
    >
      {report.data && (
        <DimensionTable
          rows={report.data}
          labelHeading="Account"
          sublabelHeading="Account code"
        />
      )}
    </ReportSection>
  )
}

function SpendByRegionSection({ query }: { query: ApiReportRangeQuery }) {
  const report = useReport('spend-by-region', query, () =>
    getSpendByRegion(query)
  )

  return (
    <ReportSection
      title="Spend by Region"
      subtitle="By delivery region as recorded on each order; orders with no region are grouped"
      exportName="spend/by-region"
      exportQuery={query}
      isLoading={report.isPending}
      error={report.error}
      isEmpty={!report.data || report.data.length === 0}
      onRetry={() => void report.refetch()}
    >
      {report.data && (
        <DimensionTable rows={report.data} labelHeading="Region" />
      )}
    </ReportSection>
  )
}

function OrdersByStatusSection({ query }: { query: ApiReportRangeQuery }) {
  const report = useReport('orders-by-status', query, () =>
    getOrdersByStatus(query)
  )

  return (
    <ReportSection
      title="Orders by Status"
      subtitle="Every status, rejected and cancelled included; shares are of the order count"
      exportName="orders/by-status"
      exportQuery={query}
      isLoading={report.isPending}
      error={report.error}
      isEmpty={!report.data || report.data.length === 0}
      onRetry={() => void report.refetch()}
    >
      {report.data && (
        <Table
          head={
            <>
              <th style={{ ...th, paddingLeft: '20px' }}>Status</th>
              <th style={{ ...th, ...right }}>Orders</th>
              <th style={{ ...th, ...right }}>Value</th>
              <th style={{ ...th, ...right, paddingRight: '20px' }}>Share</th>
            </>
          }
        >
          {report.data.map((row) => (
            <tr key={row.status} style={rowStyle}>
              <td style={{ ...td, paddingLeft: '20px' }}>
                <StatusPill status={row.status} size="sm" />
              </td>
              <td style={{ ...tdMuted, ...right }}>
                {formatNumber(row.orders)}
              </td>
              <td style={{ ...td, ...right, fontWeight: 700 }}>
                {formatMoney(row.value)}
              </td>
              <td style={{ ...td, paddingRight: '20px' }}>
                <ShareBar value={row.sharePercent} />
              </td>
            </tr>
          ))}
        </Table>
      )}
    </ReportSection>
  )
}

function OrderVelocitySection({ query }: { query: ApiReportRangeQuery }) {
  const report = useReport('order-velocity', query, () =>
    getOrderVelocity(query)
  )
  const data = report.data

  return (
    <ReportSection
      title="Order Velocity"
      subtitle="How fast orders are arriving, independent of their value"
      exportName="orders/velocity"
      exportQuery={query}
      isLoading={report.isPending}
      error={report.error}
      isEmpty={!data}
      onRetry={() => void report.refetch()}
    >
      {data && (
        <>
          <div
            className="grid-auto"
            style={
              {
                padding: '20px',
                gap: '20px',
                borderBottom: '1px solid #F5EEF2',
                ['--min']: '160px',
              } as React.CSSProperties
            }
          >
            <div>
              <div style={kpiLabel}>Orders</div>
              <div style={kpiValue}>{formatNumber(data.orders)}</div>
            </div>
            <div>
              <div style={kpiLabel}>Orders per day</div>
              <div style={kpiValue}>{data.ordersPerDay.toFixed(1)}</div>
            </div>
            <div>
              <div style={kpiLabel}>Busiest {data.granularity}</div>
              <div style={kpiValue}>
                {data.busiestBucket
                  ? `${bucketLabel(data.busiestBucket, data.granularity)} (${formatNumber(data.busiestBucketOrders)})`
                  : '—'}
              </div>
            </div>
            <div>
              <div style={kpiLabel}>Velocity growth</div>
              <div
                style={{
                  ...kpiValue,
                  color: growthColor(data.velocityGrowthPercent),
                }}
              >
                {percent(data.velocityGrowthPercent, true)}
              </div>
            </div>
          </div>
          {data.buckets.length === 0 ? (
            <div style={stateBox}>No periods in this window.</div>
          ) : (
            <Table
              head={
                <>
                  <th style={{ ...th, paddingLeft: '20px' }}>Period</th>
                  <th style={{ ...th, ...right }}>Orders</th>
                  <th style={{ ...th, ...right, paddingRight: '20px' }}>
                    Spend
                  </th>
                </>
              }
            >
              {data.buckets.map((bucket) => (
                <tr key={bucket.bucket} style={rowStyle}>
                  <td style={{ ...td, paddingLeft: '20px', fontWeight: 600 }}>
                    {bucketLabel(bucket.bucket, data.granularity)}
                  </td>
                  <td style={{ ...td, ...right, fontWeight: 700 }}>
                    {formatNumber(bucket.orders)}
                  </td>
                  <td style={{ ...tdMuted, ...right, paddingRight: '20px' }}>
                    {formatMoney(bucket.spend)}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </ReportSection>
  )
}

function TopProductsSection({ query }: { query: ApiReportRangeQuery }) {
  const [by, setBy] = useState<'spend' | 'quantity'>('spend')
  const [limit, setLimit] = useState(10)
  const params = { ...query, by, limit }
  const report = useReport('top-products', params, () => getTopProducts(params))

  return (
    <ReportSection
      title="Top Products"
      subtitle="Grouped on the SKU and name as ordered"
      exportName="products/top"
      exportQuery={params}
      controls={
        <>
          {/* Both selects were about 28px tall — too small to hit on a phone. */}
          <select
            aria-label="Rank by"
            className="touch-target"
            value={by}
            onChange={(e) => setBy(e.target.value as 'spend' | 'quantity')}
            style={{
              ...controlStyle,
              padding: '6px 10px',
              fontSize: '0.78rem',
            }}
          >
            <option value="spend">By spend</option>
            <option value="quantity">By units</option>
          </select>
          <select
            aria-label="Number of products"
            className="touch-target"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{
              ...controlStyle,
              padding: '6px 10px',
              fontSize: '0.78rem',
            }}
          >
            {[10, 25, 50, 100].map((n) => (
              <option key={n} value={n}>
                Top {n}
              </option>
            ))}
          </select>
        </>
      }
      isLoading={report.isPending}
      error={report.error}
      isEmpty={!report.data || report.data.length === 0}
      emptyMessage="No products ordered in this window."
      onRetry={() => void report.refetch()}
    >
      {report.data && (
        <Table
          head={
            <>
              <th style={{ ...th, paddingLeft: '20px' }}>#</th>
              <th style={th}>Product</th>
              <th style={th}>SKU</th>
              <th style={th}>Category</th>
              <th style={{ ...th, ...right }}>Orders</th>
              <th style={{ ...th, ...right }}>Units</th>
              <th style={{ ...th, ...right, paddingRight: '20px' }}>Spend</th>
            </>
          }
        >
          {report.data.map((row, index) => (
            <tr key={`${row.productId}-${row.sku}`} style={rowStyle}>
              <td style={{ ...tdMuted, paddingLeft: '20px' }}>{index + 1}</td>
              <td style={{ ...td, fontWeight: 600 }}>{row.name}</td>
              <td style={tdMono}>{row.sku}</td>
              <td style={tdMuted}>{row.categoryName}</td>
              <td style={{ ...tdMuted, ...right }}>
                {formatNumber(row.orders)}
              </td>
              <td
                style={{
                  ...td,
                  ...right,
                  fontWeight: by === 'quantity' ? 700 : 400,
                }}
              >
                {formatNumber(row.quantity)}
              </td>
              <td
                style={{
                  ...td,
                  ...right,
                  paddingRight: '20px',
                  fontWeight: by === 'spend' ? 700 : 400,
                }}
              >
                {formatMoney(row.spend)}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </ReportSection>
  )
}

const STOCK_STATUS: Record<
  'OUT_OF_STOCK' | 'LOW' | 'HEALTHY',
  { label: string; color: string; bg: string }
> = {
  OUT_OF_STOCK: { label: 'Out of stock', color: '#DC2626', bg: '#FEF2F2' },
  LOW: { label: 'Low', color: '#B45309', bg: '#FFFBEB' },
  HEALTHY: { label: 'Healthy', color: '#3F9C68', bg: '#F0FDF4' },
}

function InventorySection() {
  const params = { limit: INVENTORY_LIMIT }
  const report = useReport('inventory', params, () =>
    getInventoryReport(params)
  )
  const data = report.data

  return (
    <ReportSection
      title="Inventory"
      subtitle="Stock needing attention across the global catalogue, as of now — ignores the filters"
      exportName="inventory"
      exportQuery={params}
      isLoading={report.isPending}
      error={report.error}
      isEmpty={!data}
      onRetry={() => void report.refetch()}
    >
      {data && (
        <>
          <div
            className="grid-auto"
            style={
              {
                padding: '20px',
                gap: '20px',
                borderBottom: '1px solid #F5EEF2',
                ['--min']: '150px',
              } as React.CSSProperties
            }
          >
            {[
              { label: 'Tracked products', value: data.trackedProducts },
              { label: 'Low stock', value: data.lowStock },
              { label: 'Out of stock', value: data.outOfStock },
              { label: 'Units on hand', value: data.totalUnitsOnHand },
              { label: 'Units reserved', value: data.totalUnitsReserved },
            ].map((figure) => (
              <div key={figure.label}>
                <div style={kpiLabel}>{figure.label}</div>
                <div style={kpiValue}>{formatNumber(figure.value)}</div>
              </div>
            ))}
          </div>
          {data.items.length === 0 ? (
            <div style={stateBox}>No stock lines need attention.</div>
          ) : (
            <Table
              head={
                <>
                  <th style={{ ...th, paddingLeft: '20px' }}>Product</th>
                  <th style={th}>SKU</th>
                  <th style={th}>Status</th>
                  <th style={{ ...th, ...right }}>On hand</th>
                  <th style={{ ...th, ...right }}>Reserved</th>
                  <th style={{ ...th, ...right }}>Available</th>
                  <th style={{ ...th, ...right }}>Low threshold</th>
                  <th style={{ ...th, ...right, paddingRight: '20px' }}>
                    Reorder qty
                  </th>
                </>
              }
            >
              {data.items.map((item) => {
                const status = STOCK_STATUS[item.status]
                return (
                  <tr key={item.productId} style={rowStyle}>
                    <td style={{ ...td, paddingLeft: '20px', fontWeight: 600 }}>
                      {item.name}
                    </td>
                    <td style={tdMono}>{item.sku}</td>
                    <td style={td}>
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          color: status.color,
                          backgroundColor: status.bg,
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td style={{ ...td, ...right }}>
                      {formatNumber(item.stockOnHand)}
                    </td>
                    <td style={{ ...tdMuted, ...right }}>
                      {formatNumber(item.stockReserved)}
                    </td>
                    <td style={{ ...td, ...right, fontWeight: 700 }}>
                      {formatNumber(item.available)}
                    </td>
                    <td style={{ ...tdMuted, ...right }}>
                      {formatNumber(item.lowStockThreshold)}
                    </td>
                    <td style={{ ...tdMuted, ...right, paddingRight: '20px' }}>
                      {item.reorderQuantity == null
                        ? '—'
                        : formatNumber(item.reorderQuantity)}
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
        </>
      )}
    </ReportSection>
  )
}

function InventoryTurnoverSection({ query }: { query: ApiReportRangeQuery }) {
  // Global catalogue: only the window applies.
  const params = { from: query.from, to: query.to, limit: INVENTORY_LIMIT }
  const report = useReport('inventory-turnover', params, () =>
    getInventoryTurnover(params)
  )

  return (
    <ReportSection
      title="Inventory Turnover"
      subtitle="Units shipped (dispatched and delivered) against stock on hand, with days of cover"
      exportName="inventory/turnover"
      exportQuery={params}
      isLoading={report.isPending}
      error={report.error}
      isEmpty={!report.data || report.data.length === 0}
      emptyMessage="No tracked stock to report on."
      onRetry={() => void report.refetch()}
    >
      {report.data && (
        <Table
          head={
            <>
              <th style={{ ...th, paddingLeft: '20px' }}>Product</th>
              <th style={th}>SKU</th>
              <th style={{ ...th, ...right }}>Units shipped</th>
              <th style={{ ...th, ...right }}>On hand</th>
              <th style={{ ...th, ...right }}>Turnover ratio</th>
              <th style={{ ...th, ...right, paddingRight: '20px' }}>
                Days of cover
              </th>
            </>
          }
        >
          {report.data.map((row) => (
            <tr key={row.productId} style={rowStyle}>
              <td style={{ ...td, paddingLeft: '20px', fontWeight: 600 }}>
                {row.name}
              </td>
              <td style={tdMono}>{row.sku}</td>
              <td style={{ ...td, ...right, fontWeight: 700 }}>
                {formatNumber(row.unitsShipped)}
              </td>
              <td style={{ ...tdMuted, ...right }}>
                {formatNumber(row.stockOnHand)}
              </td>
              <td style={{ ...td, ...right }}>
                {formatNumber(row.turnoverRatio)}
              </td>
              <td style={{ ...tdMuted, ...right, paddingRight: '20px' }}>
                {row.daysOfCover == null ? '—' : formatNumber(row.daysOfCover)}
              </td>
            </tr>
          ))}
        </Table>
      )}
    </ReportSection>
  )
}

// --- The screen ---------------------------------------------------------------------

export function ReportAnalytics({
  includeAdminReports,
}: {
  /**
   * Whether the platform-wide cards (spend by account, inventory, turnover)
   * may appear at all. They still need the matching permission; this keeps
   * them off the head-office screen even for an administrator visiting it.
   */
  includeAdminReports: boolean
}) {
  const { user, role, hasPermission } = useAuth()
  const [filters, setFilters] = useState<Filters>(defaultFilters)

  const canViewReports = hasPermission('REPORT_VIEW')
  const canViewAccounts = includeAdminReports && hasPermission('ACCOUNT_MANAGE')
  const canViewInventory =
    includeAdminReports && hasPermission('INVENTORY_MANAGE')
  // The API honours `accountId` for administrators only.
  const canPickAccount = role === 'admin' && hasPermission('ACCOUNT_MANAGE')

  const query = toRangeQuery(
    canPickAccount ? filters : { ...filters, accountId: '' }
  )
  const update = (patch: Partial<Filters>) =>
    setFilters((prev) => ({ ...prev, ...patch }))

  const nothingVisible =
    !canViewReports && !canViewAccounts && !canViewInventory

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Filter bar. Four controls and a reset in one unwrapping row ran off a
          phone; each field now takes the next line when it has to. */}
      <div
        className="row-wrap"
        style={{
          ...card,
          padding: '16px 20px',
          gap: '16px',
        }}
      >
        <label>
          <div style={fieldLabel}>From</div>
          <input
            type="date"
            className="touch-target"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => update({ from: e.target.value })}
            style={controlStyle}
          />
        </label>
        <label>
          <div style={fieldLabel}>To</div>
          <input
            type="date"
            className="touch-target"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => update({ to: e.target.value })}
            style={controlStyle}
          />
        </label>
        <label>
          <div style={fieldLabel}>Granularity</div>
          <select
            className="touch-target"
            value={filters.granularity}
            onChange={(e) =>
              update({ granularity: e.target.value as Filters['granularity'] })
            }
            style={controlStyle}
          >
            <option value="">Automatic</option>
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        </label>
        {canPickAccount && (
          <label>
            <div style={fieldLabel}>Account</div>
            <AuditAccountPicker
              value={filters.accountId}
              ownAccountId={user?.accountId}
              ownAccountName={user?.accountName}
              onChange={(accountId) => update({ accountId })}
              style={controlStyle}
            />
          </label>
        )}
        <button
          type="button"
          className="touch-target"
          onClick={() => setFilters(defaultFilters())}
          style={{ ...secondaryButton, padding: '8px 14px' }}
        >
          <RotateCw size={14} />
          <span>Last 30 days</span>
        </button>
      </div>

      {nothingVisible && (
        <div style={{ ...card, ...stateBox }}>
          Your role does not include access to these reports.
        </div>
      )}

      {canViewReports && <SpendSummarySection query={query} />}
      {canViewReports && <SpendOverTimeSection query={query} />}
      {canViewAccounts && <SpendByAccountSection query={query} />}
      {canViewReports && <SpendByRegionSection query={query} />}
      {canViewReports && <OrdersByStatusSection query={query} />}
      {canViewReports && <OrderVelocitySection query={query} />}
      {canViewReports && <TopProductsSection query={query} />}
      {canViewInventory && <InventorySection />}
      {canViewInventory && <InventoryTurnoverSection query={query} />}
    </div>
  )
}
