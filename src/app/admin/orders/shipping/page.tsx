// src/app/admin/orders/shipping/page.tsx
'use client'

import {
  SkeletonStatCards,
  SkeletonTable,
  SkeletonList,
} from '@/components/ui/Skeleton'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  Loader2,
  PlugZap,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { useAuth } from '@/hooks/useAuth'
import {
  usePickups,
  useShipmentQueue,
  useShippingMutations,
  useShippingStatus,
} from '@/hooks/useShipping'
import { toApiError } from '@/services'
import { getShippingStatus } from '@/services/data-source/api/api-shipping.adapter'
import type { ShipmentQueueParams } from '@/services/data-source/api/api-shipping.adapter'
import type { ApiShippingStatus } from '@/services/data-source/api/shipping.types'
import {
  PICKUP_STATUS_COLOR,
  formatDateTime,
  newIdempotencyKey,
  panelStyles as s,
  trackingReferencesOf,
} from '@/components/shipping/shipping-format'
import { StatusChip } from '@/components/shipping/StatusChip'
import { IntegrationHealthPanel } from '@/components/shipping/IntegrationHealthPanel'

/** Checked when booking, against the clock at that moment. */
function isInThePast(epochMs: number): boolean {
  return epochMs < Date.now()
}

/**
 * NZ Post operations: is the integration working, which labels need a hand,
 * and booking the courier who collects them (SOW INT-05, §15).
 *
 * Everything per order — making, voiding and retrying a label — lives on the
 * order itself. This page is the warehouse view across orders.
 */

const th: React.CSSProperties = {
  padding: '8px 10px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  textAlign: 'left',
  whiteSpace: 'nowrap',
}

const td: React.CSSProperties = {
  padding: '10px',
  fontSize: '0.8rem',
  color: '#2B253E',
  verticalAlign: 'top',
}

const QUEUE_FILTERS: {
  id: string
  label: string
  params: ShipmentQueueParams
}[] = [
  { id: 'failed', label: 'Failed', params: { status: 'FAILED' } },
  {
    id: 'awaiting',
    label: 'Awaiting pickup',
    params: { awaitingPickup: true },
  },
  { id: 'flagged', label: 'Not scanned', params: { flagged: true } },
  { id: 'labelled', label: 'Labelled', params: { status: 'LABELLED' } },
  { id: 'all', label: 'All labels', params: {} },
]

/** Two hours from now, on the hour, as a datetime-local value. */
function defaultPickupTime(): string {
  const at = new Date(Date.now() + 2 * 60 * 60_000)
  at.setMinutes(0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}T${pad(at.getHours())}:00`
}

export default function ShippingOperationsPage() {
  const { role } = useAuth()
  const isAdmin = role === 'admin'

  if (!isAdmin) {
    return (
      <>
        <AdminHeader title="Shipping & Pickups" />
        <main style={{ padding: '24px' }}>
          <p style={s.muted}>
            NZ Post labels and pickups are managed by portal administrators.
          </p>
        </main>
      </>
    )
  }

  return <ShippingOperations />
}

function ShippingOperations() {
  const status = useShippingStatus()
  const [filterId, setFilterId] = useState('failed')
  const [page, setPage] = useState(1)
  const filter = QUEUE_FILTERS.find((item) => item.id === filterId)!
  const queueParams = useMemo(
    () => ({ ...filter.params, page, pageSize: 20 }),
    [filter, page]
  )
  const queue = useShipmentQueue(queueParams)
  const pickups = usePickups(1)

  return (
    <>
      <AdminHeader
        title="Shipping & Pickups"
        subtitle="NZ Post labels, courier pickups and integration health"
        actionButton={
          <button
            type="button"
            onClick={() => {
              void status.refetch()
              void queue.refetch()
              void pickups.refetch()
            }}
            style={{ ...s.button, padding: '8px 14px' }}
          >
            <RefreshCw size={15} /> Refresh
          </button>
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
        <IntegrationCard
          status={status.status}
          isLoading={status.isLoading}
          error={status.error}
          onPickFilter={(id) => {
            setFilterId(id)
            setPage(1)
          }}
        />

        <div style={{ ...s.card, padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              marginBottom: '12px',
            }}
          >
            <h3 style={s.title}>Label queue</h3>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {QUEUE_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setFilterId(item.id)
                    setPage(1)
                  }}
                  style={{
                    ...s.button,
                    padding: '5px 10px',
                    borderColor: item.id === filterId ? '#F73582' : '#F0E6EC',
                    color: item.id === filterId ? '#F73582' : '#2B253E',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <LabelQueue
            page={queue.page}
            isLoading={queue.isLoading}
            error={queue.error}
            onPage={setPage}
          />
        </div>

        <PickupsCard
          overview={pickups.overview}
          isLoading={pickups.isLoading}
          error={pickups.error}
        />
      </main>
    </>
  )
}

// --- Integration -----------------------------------------------------------------

function IntegrationCard({
  status,
  isLoading,
  error,
  onPickFilter,
}: {
  status: ApiShippingStatus | null
  isLoading: boolean
  error: unknown
  onPickFilter: (id: string) => void
}) {
  const [probe, setProbe] = useState<ApiShippingStatus['token']>(null)
  const [probing, setProbing] = useState(false)
  const [probeError, setProbeError] = useState<string | null>(null)

  const testCredentials = async () => {
    setProbing(true)
    setProbeError(null)
    try {
      setProbe((await getShippingStatus(true)).token)
    } catch (err) {
      setProbeError(toApiError(err).message)
    } finally {
      setProbing(false)
    }
  }

  const modeLook =
    status?.mode === 'live'
      ? { text: 'Live', color: '#3F9C68', bg: '#ECFDF5' }
      : status?.mode === 'mock'
        ? { text: 'Mock (no real labels)', color: '#B45309', bg: '#FFFBEB' }
        : { text: 'Switched off', color: '#DC2626', bg: '#FEF2F2' }

  return (
    <div style={{ ...s.card, padding: '20px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '12px',
        }}
      >
        <h3
          style={{ ...s.title, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <PlugZap size={16} color="#A39BB3" /> NZ Post integration
        </h3>
        {status && (
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 600,
              color: modeLook.color,
              backgroundColor: modeLook.bg,
              padding: '3px 10px',
              borderRadius: '9999px',
            }}
          >
            {modeLook.text}
          </span>
        )}
      </div>

      {isLoading ? (
        <SkeletonStatCards
          count={4}
          minWidth={160}
          label="Loading integration status"
        />
      ) : error ? (
        <p style={s.error}>
          {toApiError(error).status === 403
            ? 'Integration status needs the integration-management permission.'
            : toApiError(error).message}
        </p>
      ) : status ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: '10px',
            }}
          >
            <CountTile
              label="Failed labels"
              value={status.shipments.failed}
              tone={status.shipments.failed > 0 ? 'bad' : 'ok'}
              onClick={() => onPickFilter('failed')}
            />
            <CountTile
              label="Awaiting pickup"
              value={status.shipments.awaitingPickup}
              tone={status.shipments.awaitingPickup > 0 ? 'warn' : 'ok'}
              onClick={() => onPickFilter('awaiting')}
            />
            <CountTile
              label="Not scanned in time"
              value={status.shipments.flaggedUnscanned}
              tone={status.shipments.flaggedUnscanned > 0 ? 'warn' : 'ok'}
              onClick={() => onPickFilter('flagged')}
            />
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                backgroundColor: '#FCF7FA',
              }}
            >
              <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                Last tracking poll
              </div>
              <div
                style={{
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  color: '#2B253E',
                }}
              >
                {formatDateTime(status.shipments.lastTrackedAt)}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                every {status.settings.trackingPollMinutes} min
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {status.capabilities.map((capability) => (
              <span
                key={capability.capability}
                title={
                  capability.missing.length
                    ? `Missing: ${capability.missing.join(', ')}`
                    : 'Ready for live calls'
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '3px 8px',
                  borderRadius: '9999px',
                  color: capability.liveReady ? '#3F9C68' : '#6E6781',
                  backgroundColor: capability.liveReady ? '#ECFDF5' : '#F5EEF2',
                  textTransform: 'capitalize',
                }}
              >
                {capability.liveReady ? (
                  <CheckCircle2 size={11} />
                ) : (
                  <XCircle size={11} />
                )}
                {capability.capability}
              </span>
            ))}
          </div>

          <IntegrationHealthPanel status={status} />

          {status.mode !== 'live' && (
            <p style={s.muted}>
              {status.mode === 'mock'
                ? 'Mock mode: labels, pickups and scans come from a built-in fake and nothing reaches NZ Post.'
                : 'Shipping is switched off: labels cannot be made and dispatch accepts a typed carrier and tracking number.'}
            </p>
          )}

          {status.capabilities.some((c) => c.missing.length > 0) && (
            <details style={{ fontSize: '0.76rem', color: '#6E6781' }}>
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                What live mode still needs
              </summary>
              <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
                {status.capabilities
                  .filter((c) => c.missing.length > 0)
                  .map((c) => (
                    <li key={c.capability}>
                      <strong style={{ textTransform: 'capitalize' }}>
                        {c.capability}
                      </strong>
                      : <code>{c.missing.join(', ')}</code>
                    </li>
                  ))}
              </ul>
            </details>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={() => void testCredentials()}
              disabled={probing || !status.credentialsConfigured}
              style={{
                ...s.button,
                opacity: probing || !status.credentialsConfigured ? 0.5 : 1,
              }}
            >
              {probing ? (
                <Loader2
                  size={13}
                  style={{ animation: 'spin 1s linear infinite' }}
                />
              ) : (
                <PlugZap size={13} />
              )}
              Test NZ Post credentials
            </button>
            <span style={s.muted}>
              {!status.credentialsConfigured
                ? 'No client id and secret configured.'
                : probe
                  ? probe.ok
                    ? `Credentials work — token valid for ${Math.round(probe.expiresInSeconds / 3600)} h.`
                    : `Credentials refused: ${probe.error}`
                  : status.apiHost
                    ? `API host ${status.apiHost}`
                    : ''}
            </span>
          </div>
          {probeError && <p style={s.error}>{probeError}</p>}
        </div>
      ) : null}
    </div>
  )
}

function CountTile({
  label,
  value,
  tone,
  onClick,
}: {
  label: string
  value: number
  tone: 'ok' | 'warn' | 'bad'
  onClick: () => void
}) {
  const color =
    tone === 'bad' ? '#DC2626' : tone === 'warn' ? '#B45309' : '#2B253E'
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: '12px 14px',
        borderRadius: '10px',
        backgroundColor: '#FCF7FA',
        border: 'none',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color }}>{value}</div>
    </button>
  )
}

// --- Label queue -------------------------------------------------------------------

function LabelQueue({
  page,
  isLoading,
  error,
  onPage,
}: {
  page: ReturnType<typeof useShipmentQueue>['page']
  isLoading: boolean
  error: unknown
  onPage: (page: number) => void
}) {
  const mutations = useShippingMutations()
  const [rowError, setRowError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const act = async (id: string, action: () => Promise<unknown>) => {
    setBusyId(id)
    setRowError(null)
    try {
      await action()
    } catch (err) {
      setRowError(toApiError(err).message)
    } finally {
      setBusyId(null)
    }
  }

  if (isLoading)
    return <SkeletonTable rows={5} columns={6} label="Loading labels" />
  if (error) return <p style={s.error}>{toApiError(error).message}</p>
  if (!page || page.items.length === 0)
    return <p style={s.muted}>No labels in this view.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {rowError && <p style={s.error}>{rowError}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Order</th>
              <th style={th}>Account / branch</th>
              <th style={th}>Label</th>
              <th style={th}>Tracking</th>
              <th style={th}>Created</th>
              <th style={{ ...th, textAlign: 'right' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {page.items.map((item) => {
              const references = trackingReferencesOf(item.parcels)
              return (
                <tr key={item.id} style={{ borderTop: '1px solid #F5EEF2' }}>
                  <td style={td}>
                    <Link
                      href={`/admin/orders/${item.orderId}`}
                      style={{
                        color: '#F73582',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {item.orderNumber}
                    </Link>
                    <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                      {item.orderStatus}
                    </div>
                  </td>
                  <td style={td}>
                    {item.siteName}
                    <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                      {item.accountName}
                    </div>
                  </td>
                  <td style={td}>
                    <StatusChip status={item.status} />
                    {item.unscannedFlaggedAt && (
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: '#B45309',
                          marginTop: 4,
                          display: 'flex',
                          gap: 4,
                          alignItems: 'center',
                        }}
                      >
                        <AlertTriangle size={11} /> Not scanned
                      </div>
                    )}
                    {item.lastError && (
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: '#DC2626',
                          marginTop: 4,
                          maxWidth: '260px',
                        }}
                      >
                        {item.lastError}
                      </div>
                    )}
                  </td>
                  <td
                    style={{
                      ...td,
                      fontFamily: 'monospace',
                      fontSize: '0.74rem',
                    }}
                  >
                    {references.length > 0
                      ? references.join(', ')
                      : (item.consignmentId ?? '—')}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {formatDateTime(item.labelledAt ?? item.createdAt)}
                  </td>
                  <td
                    style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}
                  >
                    {item.status === 'FAILED' &&
                    item.orderStatus === 'PROCESSING' ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void act(item.id, () =>
                            mutations.retryLabel(item.orderId, item.id)
                          )
                        }
                        style={{
                          ...s.button,
                          opacity: busyId === item.id ? 0.5 : 1,
                        }}
                      >
                        <RotateCcw size={13} /> Retry
                      </button>
                    ) : item.labelReady && item.voidedAt === null ? (
                      <button
                        type="button"
                        disabled={busyId === item.id}
                        onClick={() =>
                          void act(item.id, () =>
                            mutations.openLabel(item.orderId, item.id)
                          )
                        }
                        style={{
                          ...s.button,
                          opacity: busyId === item.id ? 0.5 : 1,
                        }}
                      >
                        <Download size={13} /> Label
                      </button>
                    ) : (
                      <Link
                        href={`/admin/orders/${item.orderId}`}
                        style={{ ...s.button, textDecoration: 'none' }}
                      >
                        Open order
                      </Link>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {page.totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.78rem',
            color: '#6E6781',
          }}
        >
          <button
            type="button"
            disabled={page.page <= 1}
            onClick={() => onPage(page.page - 1)}
            style={{ ...s.button, opacity: page.page <= 1 ? 0.5 : 1 }}
          >
            Previous
          </button>
          <span>
            Page {page.page} of {page.totalPages}
          </span>
          <button
            type="button"
            disabled={page.page >= page.totalPages}
            onClick={() => onPage(page.page + 1)}
            style={{
              ...s.button,
              opacity: page.page >= page.totalPages ? 0.5 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}
    </div>
  )
}

// --- Pickups -------------------------------------------------------------------------

function PickupsCard({
  overview,
  isLoading,
  error,
}: {
  overview: ReturnType<typeof usePickups>['overview']
  isLoading: boolean
  error: unknown
}) {
  const mutations = useShippingMutations()
  const waiting = overview?.awaitingPickup ?? []

  // Nothing ticked means "every waiting parcel" — what the API books by default.
  const [unticked, setUnticked] = useState<Set<string>>(new Set())
  const [pickupAt, setPickupAt] = useState(defaultPickupTime)
  const [instructions, setInstructions] = useState('')
  const [bookError, setBookError] = useState<string | null>(null)
  const [booked, setBooked] = useState<string | null>(null)
  // Reused until NZ Post answers: a courier booked twice turns up twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    newIdempotencyKey('pickup')
  )

  const selected = waiting.filter((item) => !unticked.has(item.id))
  const selectedWeight = selected
    .flatMap((item) => item.parcels)
    .reduce((sum, parcel) => sum + parcel.weightKg, 0)
  const selectedBoxes = selected.reduce(
    (sum, item) => sum + item.parcels.length,
    0
  )

  const toggle = (id: string) => {
    setUnticked((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setIdempotencyKey(newIdempotencyKey('pickup'))
  }

  const book = async () => {
    setBookError(null)
    setBooked(null)
    const when = new Date(pickupAt)
    if (Number.isNaN(when.getTime()) || isInThePast(when.getTime())) {
      setBookError('Choose a pickup time that has not passed.')
      return
    }
    if (selected.length === 0) {
      setBookError('Tick at least one labelled order to collect.')
      return
    }
    try {
      const booking = await mutations.bookPickup({
        pickupAt: when.toISOString(),
        shipmentIds: selected.map((item) => item.id),
        instructions,
        idempotencyKey,
      })
      setBooked(
        booking.status === 'REJECTED'
          ? `NZ Post rejected the booking${booking.rejectCode ? ` (${booking.rejectCode})` : ''}. The parcels are still waiting.`
          : `Pickup booked for ${formatDateTime(booking.pickupAt)}${booking.carrierJobNumber ? ` — job ${booking.carrierJobNumber}` : ''}.`
      )
      setInstructions('')
      setUnticked(new Set())
      setIdempotencyKey(newIdempotencyKey('pickup'))
    } catch (err) {
      const apiError = toApiError(err)
      setBookError(
        apiError.status === 503
          ? 'Pickups are not available: NZ Post shipping is switched off, not configured for pickups, or could not be reached. Nothing was booked.'
          : apiError.message
      )
    }
  }

  return (
    <div style={{ ...s.card, padding: '20px' }}>
      <h3
        style={{
          ...s.title,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: '12px',
        }}
      >
        <CalendarClock size={16} color="#A39BB3" /> Courier pickups
      </h3>

      {isLoading ? (
        <SkeletonList count={3} avatar={false} label="Loading pickups" />
      ) : error ? (
        <p style={s.error}>{toApiError(error).message}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
          >
            <strong style={{ fontSize: '0.84rem', color: '#2B253E' }}>
              Waiting for a courier ({waiting.length})
            </strong>
            {waiting.length === 0 ? (
              <p style={s.muted}>
                No labelled parcels are waiting. Labels appear here once they
                are made on an order.
              </p>
            ) : (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...th, width: 28 }} />
                        <th style={th}>Consignment</th>
                        <th style={th}>Boxes</th>
                        <th style={th}>Weight</th>
                        <th style={th}>Labelled</th>
                        <th style={th}>Order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {waiting.map((item) => (
                        <tr
                          key={item.id}
                          style={{ borderTop: '1px solid #F5EEF2' }}
                        >
                          <td style={td}>
                            <input
                              type="checkbox"
                              checked={!unticked.has(item.id)}
                              onChange={() => toggle(item.id)}
                              aria-label={`Collect ${item.consignmentId ?? item.id}`}
                              style={{ accentColor: '#F73582' }}
                            />
                          </td>
                          <td style={{ ...td, fontFamily: 'monospace' }}>
                            {item.consignmentId ?? '—'}
                          </td>
                          <td style={td}>{item.parcels.length}</td>
                          <td style={td}>
                            {item.parcels
                              .reduce((sum, parcel) => sum + parcel.weightKg, 0)
                              .toFixed(2)}{' '}
                            kg
                          </td>
                          <td style={td}>{formatDateTime(item.labelledAt)}</td>
                          <td style={td}>
                            <Link
                              href={`/admin/orders/${item.orderId}`}
                              style={{ color: '#F73582', fontWeight: 600 }}
                            >
                              Open
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(180px, 220px) 1fr auto',
                    gap: '10px',
                    alignItems: 'end',
                  }}
                >
                  <div>
                    <label style={s.label} htmlFor="pickup-at">
                      Collect at
                    </label>
                    <input
                      id="pickup-at"
                      type="datetime-local"
                      value={pickupAt}
                      onChange={(e) => {
                        setPickupAt(e.target.value)
                        setIdempotencyKey(newIdempotencyKey('pickup'))
                      }}
                      style={s.input}
                    />
                  </div>
                  <div>
                    <label style={s.label} htmlFor="pickup-instructions">
                      Instructions for the courier
                    </label>
                    <input
                      id="pickup-instructions"
                      value={instructions}
                      maxLength={500}
                      placeholder="e.g. Loading dock at the rear, ask for dispatch"
                      onChange={(e) => setInstructions(e.target.value)}
                      style={s.input}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void book()}
                    disabled={mutations.isBooking || selected.length === 0}
                    style={{
                      ...s.primaryButton,
                      padding: '8px 14px',
                      opacity:
                        mutations.isBooking || selected.length === 0 ? 0.5 : 1,
                    }}
                  >
                    {mutations.isBooking
                      ? 'Booking…'
                      : `Book pickup (${selectedBoxes} ${selectedBoxes === 1 ? 'box' : 'boxes'}, ${selectedWeight.toFixed(1)} kg)`}
                  </button>
                </div>
              </>
            )}
            {bookError && <p style={s.error}>{bookError}</p>}
            {booked && (
              <p
                style={
                  booked.startsWith('NZ Post rejected') ? s.notice : s.muted
                }
              >
                {booked}
              </p>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <strong style={{ fontSize: '0.84rem', color: '#2B253E' }}>
              Booked pickups
            </strong>
            {(overview?.bookings.items.length ?? 0) === 0 ? (
              <p style={s.muted}>No pickups have been booked yet.</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={th}>Pickup</th>
                      <th style={th}>Status</th>
                      <th style={th}>Parcels</th>
                      <th style={th}>Weight</th>
                      <th style={th}>NZ Post job</th>
                      <th style={th}>Booked by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {overview!.bookings.items.map((booking) => (
                      <tr
                        key={booking.id}
                        style={{ borderTop: '1px solid #F5EEF2' }}
                      >
                        <td style={td}>
                          {formatDateTime(booking.pickupAt)}
                          {booking.instructions && (
                            <div
                              style={{ fontSize: '0.72rem', color: '#A39BB3' }}
                            >
                              {booking.instructions}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            ...td,
                            fontWeight: 600,
                            color:
                              PICKUP_STATUS_COLOR[booking.status] ?? '#2B253E',
                          }}
                        >
                          {booking.status}
                          {booking.rejectCode && (
                            <div
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 400,
                                color: '#DC2626',
                              }}
                            >
                              {booking.rejectCode}
                            </div>
                          )}
                        </td>
                        <td style={td}>{booking.parcelQuantity}</td>
                        <td style={td}>
                          {booking.estimatedWeightKg.toFixed(1)} kg
                        </td>
                        <td style={{ ...td, fontFamily: 'monospace' }}>
                          {booking.carrierJobNumber ??
                            booking.carrierJobId ??
                            '—'}
                        </td>
                        <td style={td}>
                          {booking.requestedByName}
                          <div
                            style={{ fontSize: '0.72rem', color: '#A39BB3' }}
                          >
                            {formatDateTime(booking.createdAt)}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
