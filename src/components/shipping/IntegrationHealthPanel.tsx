// src/components/shipping/IntegrationHealthPanel.tsx
'use client'

import Link from 'next/link'
import type {
  ApiIntegrationCallWindow,
  ApiShippingStatus,
} from '@/services/data-source/api/shipping.types'
import { formatNumber, formatDateTime } from '@/lib/format'

/**
 * NZ Post integration health (SOW §15, Administrator): call success rate,
 * latency, retry volume, dead-letter count and the last reconciliation.
 *
 * `compact` is the dashboard tile — one window and a link to the full view on
 * the shipping page.
 */
export function IntegrationHealthPanel({
  status,
  compact = false,
}: {
  status: ApiShippingStatus
  compact?: boolean
}) {
  const windows = status.calls ?? []
  const shown = compact ? windows.filter((w) => w.window === '24h') : windows
  const reconciliation = status.lastReconciliation ?? null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {windows.length === 0 ? (
        <p style={muted}>
          No call metrics yet. This API build does not report them, or no NZ
          Post call has been made.
        </p>
      ) : (
        shown.map((window) => (
          <CallWindow key={window.window} window={window} compact={compact} />
        ))
      )}

      <div
        className="grid-auto"
        style={{ ['--min']: '130px' } as React.CSSProperties}
      >
        <Tile
          label="Dead letters"
          value={formatNumber(status.shipments.failed)}
          hint="Labels that exhausted their retries"
          tone={status.shipments.failed > 0 ? 'bad' : 'ok'}
        />
        <Tile
          label="Last reconciliation"
          value={
            reconciliation
              ? reconciliation.outcome.replace(/_/g, ' ').toLowerCase()
              : 'Not run yet'
          }
          hint={
            reconciliation
              ? `${formatDateTime(reconciliation.finishedAt ?? reconciliation.startedAt)}${
                  reconciliation.flagged !== null
                    ? ` · ${reconciliation.flagged} flagged`
                    : ''
                }`
              : 'Daily unscanned-label check'
          }
          tone={
            !reconciliation
              ? 'neutral'
              : /fail|error/i.test(reconciliation.outcome)
                ? 'bad'
                : (reconciliation.flagged ?? 0) > 0
                  ? 'warn'
                  : 'ok'
          }
        />
      </div>
      {!compact && reconciliation?.message && (
        <p style={muted}>{reconciliation.message}</p>
      )}

      {compact && (
        <Link
          href="/admin/orders/shipping"
          className="touch-target"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            alignSelf: 'flex-start',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: '#F73582',
            textDecoration: 'none',
          }}
        >
          Shipping &amp; integration detail →
        </Link>
      )}
    </div>
  )
}

function CallWindow({
  window,
  compact,
}: {
  window: ApiIntegrationCallWindow
  compact: boolean
}) {
  const rate = window.successRatePercent
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '0.74rem', fontWeight: 600, color: '#6E6781' }}>
        Last {window.window === '24h' ? '24 hours' : '7 days'} ·{' '}
        {formatNumber(window.calls)} call{window.calls === 1 ? '' : 's'}
        {window.mockCalls > 0 ? ` (${window.mockCalls} mock)` : ''}
      </div>
      <div
        className="grid-auto"
        style={{ ['--min']: '130px' } as React.CSSProperties}
      >
        <Tile
          label="Success rate"
          value={rate === null ? '—' : `${rate.toFixed(1)}%`}
          hint={`${formatNumber(window.failed)} failed`}
          tone={
            rate === null
              ? 'neutral'
              : rate >= 99
                ? 'ok'
                : rate >= 95
                  ? 'warn'
                  : 'bad'
          }
        />
        <Tile
          label="Latency p95"
          value={
            window.latencyMs ? `${Math.round(window.latencyMs.p95)} ms` : '—'
          }
          hint={
            window.latencyMs
              ? `p50 ${Math.round(window.latencyMs.p50)} ms · max ${Math.round(window.latencyMs.max)} ms`
              : 'No timed calls'
          }
          tone="neutral"
        />
        <Tile
          label="Retries"
          value={formatNumber(window.retries)}
          hint="Calls made as a retry"
          tone={window.retries > 0 ? 'warn' : 'ok'}
        />
      </div>
      {!compact && window.byOperation.length > 0 && (
        <div className="table-scroll">
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.78rem',
            }}
          >
            <thead>
              <tr>
                {['Operation', 'Calls', 'Failed', 'Average'].map((h, i) => (
                  <th
                    key={h}
                    style={{
                      textAlign: i === 0 ? 'left' : 'right',
                      padding: '6px 8px',
                      color: '#A39BB3',
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {window.byOperation.map((op) => (
                <tr
                  key={op.operation}
                  style={{ borderTop: '1px solid #F5EEF2' }}
                >
                  <td style={{ padding: '6px 8px', color: '#2B253E' }}>
                    {op.operation}
                  </td>
                  <td style={num}>{formatNumber(op.calls)}</td>
                  <td
                    style={{
                      ...num,
                      color: op.failed > 0 ? '#DC2626' : '#6E6781',
                    }}
                  >
                    {formatNumber(op.failed)}
                  </td>
                  <td style={num}>{Math.round(op.averageMs)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const TONES = {
  ok: '#228B53',
  warn: '#B45309',
  bad: '#DC2626',
  neutral: '#2B253E',
} as const

function Tile({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone: keyof typeof TONES
}) {
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: '10px',
        backgroundColor: '#FCF7FA',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>{label}</div>
      <div
        style={{
          fontSize: '1rem',
          fontWeight: 700,
          color: TONES[tone],
          textTransform: 'capitalize',
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: '0.7rem', color: '#A39BB3' }}>{hint}</div>
    </div>
  )
}

const muted: React.CSSProperties = {
  margin: 0,
  fontSize: '0.76rem',
  color: '#6E6781',
}
const num: React.CSSProperties = {
  padding: '6px 8px',
  textAlign: 'right',
  color: '#6E6781',
}
