// src/components/dashboard/DashboardInsights.tsx
'use client'

import {
  SkeletonTable,
  SkeletonText,
  SkeletonList,
} from '@/components/ui/Skeleton'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import { useShippingStatus } from '@/hooks/useShipping'
import { apiClient, toApiError } from '@/services/api.service'
import { getOrderAgeing } from '@/services/data-source/api/api-reports.adapter'
import { IntegrationHealthPanel } from '@/components/shipping/IntegrationHealthPanel'
import { formatMoney, formatNumber } from '@/lib/format'

const STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'Awaiting approval',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  PROCESSING: 'In production',
  DISPATCHED: 'In transit',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

interface InsightRow {
  label: string
  orders: number
  value: number
  share: number
}

interface DashboardInsightData {
  byStatus: InsightRow[]
  topCategories: InsightRow[]
}

/** The two dashboard sections the headline cards do not show. */
async function getInsights(
  scope: 'platform' | 'account'
): Promise<DashboardInsightData> {
  type Raw = {
    byStatus?: {
      status: string
      orders: number
      value: string
      sharePercent: number
    }[]
    topCategories?: {
      label: string
      orders: number
      spend: string
      sharePercent: number
    }[]
  }
  const params = { granularity: 'month', topSites: 5, topCategories: 6 }
  let report: Raw
  try {
    report = await apiClient.get('/reports/dashboard', {
      params: scope === 'platform' ? { ...params, scope: 'platform' } : params,
    })
  } catch (error) {
    // An administrator's platform scope can be refused; fall back to their own
    // account, as the headline cards do.
    if (scope !== 'platform') throw error
    report = await apiClient.get('/reports/dashboard', { params })
  }

  return {
    byStatus: (report.byStatus ?? [])
      .filter((row) => row.orders > 0)
      .map((row) => ({
        label: STATUS_LABELS[row.status] ?? row.status,
        orders: row.orders,
        value: Number(row.value),
        share: row.sharePercent,
      })),
    topCategories: (report.topCategories ?? []).map((row) => ({
      label: row.label,
      orders: row.orders,
      value: Number(row.spend),
      share: row.sharePercent,
    })),
  }
}

/**
 * Orders by status, top categories and order ageing (SOW §15: executive spend
 * and order operations), plus NZ Post integration health for administrators.
 */
export function DashboardInsights({
  scope,
  ageingHref,
}: {
  scope: 'platform' | 'account'
  ageingHref: string
}) {
  const { hasPermission } = useAuth()
  const canSeeIntegration = hasPermission('INTEGRATION_MANAGE')

  const insights = useQuery({
    queryKey: ['reports', 'dashboard-insights', scope],
    queryFn: () => getInsights(scope),
    staleTime: 60_000,
  })
  const ageing = useQuery({
    queryKey: ['reports', 'dashboard-ageing'],
    queryFn: () => getOrderAgeing(),
    staleTime: 60_000,
  })
  const shipping = useShippingStatus(canSeeIntegration)

  return (
    <div
      className="grid-auto"
      style={{ ['--min']: '260px', gap: '16px' } as React.CSSProperties}
    >
      <Card title="Orders by status" subtitle="Last 30 days, every status">
        <Bars
          query={insights}
          rows={insights.data?.byStatus}
          valueLabel={(row) =>
            `${formatNumber(row.orders)} · ${formatMoney(row.value)}`
          }
          empty="No orders in the last 30 days."
        />
      </Card>

      <Card title="Top categories" subtitle="Spend, last 30 days">
        <Bars
          query={insights}
          rows={insights.data?.topCategories}
          valueLabel={(row) =>
            `${formatMoney(row.value)} · ${row.share.toFixed(1)}%`
          }
          empty="No category spend in the last 30 days."
        />
      </Card>

      <Card
        title="Order ageing"
        subtitle="Open orders by time in their current status"
        action={
          <Link href={ageingHref} style={linkStyle}>
            Full report →
          </Link>
        }
      >
        {ageing.isPending ? (
          <SkeletonTable
            rows={3}
            columns={5}
            padding="8px 4px"
            label="Loading order ageing"
          />
        ) : ageing.isError ? (
          <p style={error}>{toApiError(ageing.error).message}</p>
        ) : ageing.data.byStatus.length === 0 ? (
          <p style={muted}>No open orders.</p>
        ) : (
          <div className="table-scroll">
            <table style={table}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: 'left' }}>Status</th>
                  {ageing.data.bands.map((band) => (
                    <th key={band} style={th}>
                      {band}
                    </th>
                  ))}
                  <th style={th}>Oldest</th>
                </tr>
              </thead>
              <tbody>
                {ageing.data.byStatus.map((row) => (
                  <tr
                    key={row.status}
                    style={{ borderTop: '1px solid #F5EEF2' }}
                  >
                    <td style={{ ...td, textAlign: 'left', color: '#2B253E' }}>
                      {STATUS_LABELS[row.status] ?? row.status}
                    </td>
                    {ageing.data.bands.map((band, index) => {
                      const count = row.bands[band] ?? 0
                      const old = index === ageing.data.bands.length - 1
                      return (
                        <td
                          key={band}
                          style={{
                            ...td,
                            color: count > 0 && old ? '#DC2626' : td.color,
                            fontWeight: count > 0 && old ? 700 : 400,
                          }}
                        >
                          {count || '—'}
                        </td>
                      )
                    })}
                    <td style={td}>{row.oldestDaysInStatus}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {canSeeIntegration && (
        <Card title="Integration health" subtitle="NZ Post">
          {shipping.isLoading ? (
            <SkeletonText lines={4} />
          ) : shipping.error ? (
            <p style={error}>{toApiError(shipping.error).message}</p>
          ) : shipping.status ? (
            <IntegrationHealthPanel status={shipping.status} compact />
          ) : null}
        </Card>
      )}
    </div>
  )
}

function Bars({
  query,
  rows,
  valueLabel,
  empty,
}: {
  query: { isPending: boolean; isError: boolean; error: unknown }
  rows: InsightRow[] | undefined
  valueLabel: (row: InsightRow) => string
  empty: string
}) {
  if (query.isPending)
    return (
      <SkeletonList count={4} avatar={false} bordered={false} label="Loading" />
    )
  if (query.isError)
    return <p style={error}>{toApiError(query.error).message}</p>
  if (!rows || rows.length === 0) return <p style={muted}>{empty}</p>

  const max = Math.max(...rows.map((row) => row.share), 1)
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'grid',
        gap: '10px',
      }}
    >
      {rows.map((row) => (
        <li key={row.label} style={{ minWidth: 0 }}>
          {/* A long category name pushed the figure beside it out of the card;
              the name gives way instead. */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '8px',
              fontSize: '0.78rem',
              marginBottom: '4px',
              minWidth: 0,
            }}
          >
            <span
              className="truncate"
              title={row.label}
              style={{ color: '#2B253E', fontWeight: 500 }}
            >
              {row.label}
            </span>
            <span style={{ color: '#6E6781', whiteSpace: 'nowrap' }}>
              {valueLabel(row)}
            </span>
          </div>
          <div
            style={{
              height: '6px',
              borderRadius: '9999px',
              backgroundColor: '#F5EEF2',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${Math.max(2, (row.share / max) * 100)}%`,
                height: '100%',
                borderRadius: '9999px',
                backgroundColor: '#F73582',
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string
  subtitle: string
  action?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '14px',
        border: '1px solid #F0E6EC',
        boxShadow:
          '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '8px',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: '0.92rem',
              fontWeight: 700,
              color: '#2B253E',
            }}
          >
            {title}
          </h3>
          <p
            style={{ margin: '2px 0 0', fontSize: '0.74rem', color: '#A39BB3' }}
          >
            {subtitle}
          </p>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

const muted: React.CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  color: '#A39BB3',
}
const error: React.CSSProperties = {
  margin: 0,
  fontSize: '0.8rem',
  color: '#DC2626',
}
const linkStyle: React.CSSProperties = {
  fontSize: '0.76rem',
  fontWeight: 600,
  color: '#F73582',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}
const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.76rem',
}
const th: React.CSSProperties = {
  padding: '6px 6px',
  color: '#A39BB3',
  fontWeight: 500,
  textAlign: 'right',
  whiteSpace: 'nowrap',
}
const td: React.CSSProperties = {
  padding: '6px 6px',
  textAlign: 'right',
  color: '#6E6781',
}
