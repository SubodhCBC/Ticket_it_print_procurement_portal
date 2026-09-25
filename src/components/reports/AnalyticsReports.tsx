// src/components/reports/AnalyticsReports.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useMemo, useState } from 'react'
import {
  ActionButton,
  AdminCard,
  AdminTable,
  Field,
  Notice,
  ReadOnlyNotice,
  SectionHeading,
  SelectInput,
  StatTile,
  StateBlock,
  Td,
  TextInput,
  Th,
} from '@/components/admin/ProductAdminUi'
import { errorMessage } from '@/components/admin/ProductAdminUtils'
import { useAuth } from '@/hooks/useAuth'
import { useReportData } from '@/hooks/useReports'
import type { ReportFileKey } from '@/services/data-source/api/governance.types'
import { ReportDownloadButtons } from './ReportDownloadButtons'
import {
  REPORT_CATALOG,
  type ColumnKind,
  type ReportDef,
} from './reportCatalog'
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
} from '@/lib/format'
import { dateInputToIso, ORDER_STATUS_LABELS } from './reportFormat'

const HISTORY_PAGE_SIZE = 50

const STOCK_STATUS_LABELS: Record<string, string> = {
  OUT_OF_STOCK: 'Out of stock',
  LOW: 'Low',
  HEALTHY: 'Healthy',
}

const HISTORY_STATUSES = [
  'PENDING_APPROVAL',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PROCESSING',
  'DISPATCHED',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
]

function formatCell(kind: ColumnKind, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  switch (kind) {
    case 'money':
      return formatMoney(value as string | number)
    case 'integer':
      return formatNumber(value as string | number)
    case 'percent':
      return `${Number(value).toFixed(1)}%`
    case 'decimal':
      return formatNumber(value as string | number)
    case 'date':
      return formatDate(String(value))
    case 'datetime':
      return formatDateTime(String(value))
    case 'status':
      return (
        ORDER_STATUS_LABELS[String(value)] ??
        STOCK_STATUS_LABELS[String(value)] ??
        String(value)
      )
    default:
      return String(value)
  }
}

const NUMERIC: readonly ColumnKind[] = [
  'integer',
  'money',
  'percent',
  'decimal',
]

/**
 * The tabular reports (SOW §15), each with CSV and XLSX.
 *
 * One screen for all of them: pick a report, set its filters, read the table,
 * download the file. The table and the file come from the same API route and
 * query — the file is that route with `.csv` or `.xlsx` appended — and the
 * columns here mirror the server's export definition, so what is on screen is
 * what is in the file.
 *
 * Only reports the signed-in user may open are offered. Account-scoped reports
 * take the `accountId` the page passes; platform-wide ones ignore it.
 */
export function AnalyticsReports({
  accountId,
  initialReport,
}: {
  accountId?: string
  initialReport?: ReportFileKey
}) {
  const { hasPermission } = useAuth()
  const available = useMemo(
    () => REPORT_CATALOG.filter((report) => hasPermission(report.permission)),
    [hasPermission]
  )

  const [selectedKey, setSelectedKey] = useState<ReportFileKey | null>(
    initialReport ?? null
  )
  const report: ReportDef | undefined =
    available.find((r) => r.key === selectedKey) ?? available[0]

  if (!report) {
    return (
      <ReadOnlyNotice>
        None of the analytics reports is available to your role.
      </ReadOnlyNotice>
    )
  }

  const groups = [...new Set(available.map((r) => r.group))]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <AdminCard>
        <Field
          label="Report"
          htmlFor="analytics-report"
          style={{ maxWidth: '360px' }}
        >
          <SelectInput
            id="analytics-report"
            value={report.key}
            onChange={(e) => setSelectedKey(e.target.value as ReportFileKey)}
          >
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {available
                  .filter((r) => r.group === group)
                  .map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.title}
                    </option>
                  ))}
              </optgroup>
            ))}
          </SelectInput>
        </Field>
        <div style={{ fontSize: '0.8rem', color: '#6E6781', lineHeight: 1.5 }}>
          {report.description}
          {!report.accountScoped && accountId && (
            <>
              {' '}
              This report covers the whole platform; the account choice does not
              apply.
            </>
          )}
        </div>
      </AdminCard>

      {/* Keyed by report, so each one starts from its own empty filters. */}
      <ReportPanel
        key={report.key}
        report={report}
        accountId={report.accountScoped ? accountId : undefined}
      />
    </div>
  )
}

function ReportPanel({
  report,
  accountId,
}: {
  report: ReportDef
  accountId?: string
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [granularity, setGranularity] = useState('')
  const [by, setBy] = useState<'spend' | 'quantity'>('spend')
  const [limit, setLimit] = useState(
    report.key.startsWith('inventory') ? '100' : '10'
  )
  const [status, setStatus] = useState('')
  const [page, setPage] = useState(1)

  const { filters } = report
  const rangeProblem =
    filters.range && from && to && from > to ? 'From is after To.' : null
  const limitNumber = Number(limit)
  const limitMax = report.key.startsWith('inventory') ? 500 : 100
  const limitProblem =
    (filters.limit || filters.topProducts) &&
    (!Number.isInteger(limitNumber) ||
      limitNumber < 1 ||
      limitNumber > limitMax)
      ? `Show between 1 and ${limitMax} rows.`
      : null

  /** The query for the table and, without paging, for the files. */
  const fileParams = useMemo(
    () => ({
      ...(accountId ? { accountId } : {}),
      ...(filters.range && from ? { from: dateInputToIso(from, 'start') } : {}),
      ...(filters.range && to
        ? { to: dateInputToIso(to, 'endExclusive') }
        : {}),
      ...(filters.granularity && granularity ? { granularity } : {}),
      ...(filters.topProducts ? { by, limit: limitNumber } : {}),
      ...(filters.limit ? { limit: limitNumber } : {}),
      ...(filters.orderStatus && status ? { status } : {}),
    }),
    [accountId, filters, from, to, granularity, by, limitNumber, status]
  )
  const params = useMemo(
    () =>
      report.paged
        ? { ...fileParams, page, pageSize: HISTORY_PAGE_SIZE }
        : fileParams,
    [fileParams, report.paged, page]
  )

  const valid = !rangeProblem && !limitProblem
  const { data, isLoading, isFetching, error } = useReportData(
    report.key,
    params,
    valid
  )
  const rows = data ? report.rows(data) : []
  const pageInfo = report.paged
    ? (data as { total?: number; totalPages?: number } | null)
    : null

  // A filter change starts the history over at its first page.
  const changed =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value)
      setPage(1)
    }

  return (
    <>
      <AdminCard>
        <SectionHeading
          title="Filters"
          description={
            filters.range
              ? 'Leave the dates empty for the default window.'
              : undefined
          }
          action={
            <ReportDownloadButtons
              report={report.key}
              params={fileParams}
              disabled={!valid || rows.length === 0}
            />
          }
        />
        <div
          className="grid-auto"
          style={{ ['--min']: '170px', gap: '12px' } as React.CSSProperties}
        >
          {filters.range && (
            <>
              <Field label="From" htmlFor="analytics-from">
                <TextInput
                  id="analytics-from"
                  type="date"
                  value={from}
                  onChange={(e) => changed(setFrom)(e.target.value)}
                />
              </Field>
              <Field label="To" htmlFor="analytics-to">
                <TextInput
                  id="analytics-to"
                  type="date"
                  value={to}
                  invalid={Boolean(rangeProblem)}
                  onChange={(e) => changed(setTo)(e.target.value)}
                />
              </Field>
            </>
          )}
          {filters.granularity && (
            <Field label="Period" htmlFor="analytics-granularity">
              <SelectInput
                id="analytics-granularity"
                value={granularity}
                onChange={(e) => setGranularity(e.target.value)}
              >
                <option value="">Automatic</option>
                <option value="day">Day</option>
                <option value="week">Week</option>
                <option value="month">Month</option>
              </SelectInput>
            </Field>
          )}
          {filters.topProducts && (
            <Field label="Rank by" htmlFor="analytics-by">
              <SelectInput
                id="analytics-by"
                value={by}
                onChange={(e) => setBy(e.target.value as 'spend' | 'quantity')}
              >
                <option value="spend">Spend</option>
                <option value="quantity">Quantity</option>
              </SelectInput>
            </Field>
          )}
          {(filters.topProducts || filters.limit) && (
            <Field label="Rows" htmlFor="analytics-limit">
              <TextInput
                id="analytics-limit"
                type="number"
                min={1}
                max={limitMax}
                value={limit}
                invalid={Boolean(limitProblem)}
                onChange={(e) => setLimit(e.target.value)}
              />
            </Field>
          )}
          {filters.orderStatus && (
            <Field label="Status" htmlFor="analytics-status">
              <SelectInput
                id="analytics-status"
                value={status}
                onChange={(e) => changed(setStatus)(e.target.value)}
              >
                <option value="">All statuses</option>
                {HISTORY_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {ORDER_STATUS_LABELS[value] ?? value}
                  </option>
                ))}
              </SelectInput>
            </Field>
          )}
        </div>
        {(rangeProblem || limitProblem) && (
          <Notice tone="error">{rangeProblem ?? limitProblem}</Notice>
        )}
        {report.paged && (
          <div style={{ fontSize: '0.76rem', color: '#A39BB3' }}>
            The table is paged; the CSV and XLSX carry every line in the window.
          </div>
        )}
      </AdminCard>

      {report.summary && data !== null && (
        <AdminCard>
          <div
            className="grid-auto"
            style={{ ['--min']: '150px', gap: '12px' } as React.CSSProperties}
          >
            {report.summary.map((tile) => (
              <StatTile
                key={tile.label}
                label={tile.label}
                value={tile.value(data as Record<string, unknown>)}
              />
            ))}
          </div>
        </AdminCard>
      )}

      <AdminCard style={{ opacity: isFetching && !isLoading ? 0.6 : 1 }}>
        <SectionHeading title={report.title} />
        {!valid ? (
          <StateBlock title="Fix the filters above to run the report" />
        ) : error ? (
          <StateBlock
            tone="error"
            title="The report could not be loaded"
            description={errorMessage(error, 'Try again in a moment.')}
          />
        ) : isLoading || data === null ? (
          <SkeletonTable rows={8} columns={5} label="Loading report" />
        ) : rows.length === 0 ? (
          <StateBlock title="Nothing to show for these filters" />
        ) : (
          <AdminTable
            head={
              <>
                {report.columns.map((column, index) => (
                  <Th
                    key={column.key}
                    first={index === 0}
                    align={NUMERIC.includes(column.kind) ? 'right' : 'left'}
                  >
                    {column.header}
                  </Th>
                ))}
              </>
            }
          >
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} style={{ borderTop: '1px solid #F5EEF2' }}>
                {report.columns.map((column, index) => (
                  <Td
                    key={column.key}
                    first={index === 0}
                    align={NUMERIC.includes(column.kind) ? 'right' : 'left'}
                    style={{
                      whiteSpace:
                        column.kind === 'datetime' ? 'nowrap' : undefined,
                    }}
                  >
                    {formatCell(column.kind, row[column.key])}
                  </Td>
                ))}
              </tr>
            ))}
          </AdminTable>
        )}

        {/* The count and both buttons were one unwrapping row, so "Next" left
            the card on a phone. */}
        {report.paged && pageInfo && (pageInfo.totalPages ?? 0) > 1 && (
          <div
            className="row-wrap"
            style={{
              justifyContent: 'space-between',
              fontSize: '0.8rem',
              color: '#6E6781',
            }}
          >
            <span>
              Page {page} of {pageInfo.totalPages} ·{' '}
              {formatNumber(pageInfo.total ?? 0)} lines
            </span>
            <div className="row-wrap">
              <ActionButton
                className="touch-target"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </ActionButton>
              <ActionButton
                className="touch-target"
                size="sm"
                disabled={page >= (pageInfo.totalPages ?? 1) || isFetching}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </ActionButton>
            </div>
          </div>
        )}
      </AdminCard>
    </>
  )
}
