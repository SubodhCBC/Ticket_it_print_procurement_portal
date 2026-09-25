// src/components/reports/OrderAgeingReport.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AdminCard,
  AdminTable,
  Field,
  SectionHeading,
  SelectInput,
  StateBlock,
  Td,
  Th,
} from '@/components/admin/ProductAdminUi'
import { errorMessage } from '@/components/admin/ProductAdminUtils'
import { useOrderAgeing } from '@/hooks/useReports'
import type {
  ApiOpenOrderStatus,
  OrderAgeingParams,
} from '@/services/data-source/api/governance.types'
import { ReportDownloadButtons } from './ReportDownloadButtons'
import { formatDate, formatDateTime, formatMoney } from '@/lib/format'
import { ORDER_STATUS_LABELS } from './reportFormat'

const OPEN_STATUSES: ApiOpenOrderStatus[] = [
  'PENDING_APPROVAL',
  'CHANGES_REQUESTED',
  'APPROVED',
  'PROCESSING',
  'DISPATCHED',
]

/** Heat for the band columns: older bands are the ones to chase. */
const BAND_TONES = ['#ECFDF5', '#F0FDF4', '#FFFBEB', '#FEF3C7', '#FEE2E2']

/**
 * Order ageing (SOW §15): every open order and how long it has sat in its
 * current status, counted per status into age bands, longest-waiting first.
 *
 * A snapshot as of now — no date range, which would hide exactly the old orders
 * this exists to find. Shared by the admin and head-office portals.
 */
export function OrderAgeingReport({
  accountId,
  orderHref,
}: {
  accountId?: string
  orderHref: (orderId: string) => string
}) {
  const [status, setStatus] = useState<ApiOpenOrderStatus | ''>('')

  const params: OrderAgeingParams = useMemo(
    () => ({
      ...(accountId ? { accountId } : {}),
      ...(status ? { status } : {}),
    }),
    [accountId, status]
  )

  const { data, isLoading, isFetching, error } = useOrderAgeing(params)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <AdminCard>
        <SectionHeading
          title="Open orders by status and age"
          description={
            data
              ? `As of ${formatDateTime(data.asOf)}. Days are counted in the order's current status, not since it was placed.`
              : undefined
          }
          action={
            <ReportDownloadButtons
              report="orders/ageing"
              params={params}
              disabled={!data || data.orders.length === 0}
            />
          }
        />
        <Field
          label="Status"
          htmlFor="ageing-status"
          style={{ maxWidth: '260px' }}
        >
          <SelectInput
            id="ageing-status"
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as ApiOpenOrderStatus | '')
            }
          >
            <option value="">All open statuses</option>
            {OPEN_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ORDER_STATUS_LABELS[value]}
              </option>
            ))}
          </SelectInput>
        </Field>

        {error ? (
          <StateBlock
            tone="error"
            title="The ageing report could not be loaded"
            description={errorMessage(error, 'Try again in a moment.')}
          />
        ) : isLoading || !data ? (
          <SkeletonTable rows={6} columns={7} label="Loading open orders" />
        ) : data.byStatus.length === 0 ? (
          <StateBlock title="No open orders" />
        ) : (
          <div style={{ opacity: isFetching ? 0.6 : 1 }}>
            <AdminTable
              head={
                <>
                  <Th first>Status</Th>
                  <Th align="right">Orders</Th>
                  <Th align="right">Value</Th>
                  {data.bands.map((band) => (
                    <Th key={band} align="right">
                      {band}
                    </Th>
                  ))}
                  <Th align="right">Oldest</Th>
                </>
              }
            >
              {data.byStatus.map((row) => (
                <tr key={row.status} style={{ borderTop: '1px solid #F5EEF2' }}>
                  <Td first style={{ fontWeight: 600 }}>
                    {ORDER_STATUS_LABELS[row.status] ?? row.status}
                  </Td>
                  <Td align="right">{row.orders}</Td>
                  <Td align="right">{formatMoney(row.value)}</Td>
                  {data.bands.map((band, index) => {
                    const count = row.bands[band] ?? 0
                    return (
                      <Td
                        key={band}
                        align="right"
                        style={{
                          backgroundColor:
                            count > 0
                              ? BAND_TONES[
                                  Math.min(index, BAND_TONES.length - 1)
                                ]
                              : undefined,
                          fontWeight: count > 0 ? 600 : undefined,
                        }}
                      >
                        {count}
                      </Td>
                    )
                  })}
                  <Td align="right">{row.oldestDaysInStatus} d</Td>
                </tr>
              ))}
            </AdminTable>
          </div>
        )}
      </AdminCard>

      {data && data.orders.length > 0 && (
        <AdminCard style={{ opacity: isFetching ? 0.6 : 1 }}>
          <SectionHeading
            title={`Orders (${data.orders.length})`}
            description="Longest in their current status first."
          />
          <AdminTable
            head={
              <>
                <Th first>Order</Th>
                <Th>Status</Th>
                <Th align="right">Days in status</Th>
                <Th align="right">Days open</Th>
                <Th>Site</Th>
                <Th>Placed by</Th>
                <Th>PO</Th>
                <Th align="right">Total</Th>
                <Th>Placed</Th>
              </>
            }
          >
            {data.orders.map((row) => (
              <tr key={row.orderId} style={{ borderTop: '1px solid #F5EEF2' }}>
                <Td first>
                  <Link
                    href={orderHref(row.orderId)}
                    style={{
                      color: '#F73582',
                      fontWeight: 600,
                      textDecoration: 'none',
                      fontFamily: 'monospace',
                    }}
                  >
                    {row.orderNumber}
                  </Link>
                </Td>
                <Td style={{ whiteSpace: 'nowrap' }}>
                  {ORDER_STATUS_LABELS[row.status] ?? row.status}
                  <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                    since {formatDate(row.inStatusSince)}
                  </div>
                </Td>
                <Td align="right" style={{ fontWeight: 700 }}>
                  {row.daysInStatus}
                  <div
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 400,
                      color: '#A39BB3',
                    }}
                  >
                    {row.band}
                  </div>
                </Td>
                <Td align="right">{row.daysOpen}</Td>
                <Td>
                  {row.siteName}{' '}
                  <span style={{ color: '#A39BB3' }}>{row.siteCode}</span>
                </Td>
                <Td>{row.placedByName}</Td>
                <Td style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                  {row.poNumber ?? '—'}
                </Td>
                <Td align="right">{formatMoney(row.total)}</Td>
                <Td style={{ whiteSpace: 'nowrap' }}>
                  {formatDate(row.placedAt)}
                </Td>
              </tr>
            ))}
          </AdminTable>
        </AdminCard>
      )}
    </div>
  )
}
