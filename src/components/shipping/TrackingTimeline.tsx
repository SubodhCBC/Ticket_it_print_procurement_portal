// src/components/shipping/TrackingTimeline.tsx
'use client'

import { SkeletonList } from '@/components/ui/Skeleton'
import { useState } from 'react'
import { CheckCircle2, MapPin, RefreshCw, Truck } from 'lucide-react'
import { toApiError } from '@/services'
import { useOrderTracking, useShippingMutations } from '@/hooks/useShipping'
import { formatDateTime, panelStyles as s } from './shipping-format'

/**
 * An order's NZ Post tracking, newest scan first (decision D5).
 *
 * Shown to the buyer, head office and operators alike — the API lets anyone
 * who may see the order read it. The portal answers from what it already holds
 * and queues a refresh in the background when that is stale, so this never
 * waits on NZ Post; operators can also ask for a refresh and wait for it. The
 * delivered scan moves the order to DELIVERED on its own.
 */

interface TrackingTimelineProps {
  orderId: string
  /** Hide the whole card until there is something to track. */
  hideWhenEmpty?: boolean
  /** Operators: a button that polls NZ Post now. */
  allowRefresh?: boolean
  /** Drawn without its own card, inside a page's existing section. */
  bare?: boolean
}

export function TrackingTimeline({
  orderId,
  hideWhenEmpty = false,
  allowRefresh = false,
  bare = false,
}: TrackingTimelineProps) {
  const { tracking, isLoading, error } = useOrderTracking(orderId)
  const { refreshTracking, isRefreshing } = useShippingMutations()
  const [refreshNote, setRefreshNote] = useState<string | null>(null)

  const hasShipments = (tracking?.shipments.length ?? 0) > 0
  const references = [
    ...new Set(tracking?.shipments.flatMap((item) => item.trackingReferences)),
  ]
  const isEmpty =
    !tracking ||
    (!hasShipments && !tracking.trackingNumber && tracking.events.length === 0)

  if (hideWhenEmpty && !isLoading && (isEmpty || error)) return null

  const delivered = tracking?.events.find((event) => event.isDelivered)

  const refresh = async () => {
    setRefreshNote(null)
    try {
      const run = await refreshTracking(orderId)
      setRefreshNote(
        run.newEvents > 0
          ? `${run.newEvents} new scan${run.newEvents === 1 ? '' : 's'} from NZ Post.`
          : 'No new scans from NZ Post.'
      )
    } catch (err) {
      const apiError = toApiError(err)
      setRefreshNote(
        apiError.status === 503
          ? 'NZ Post tracking is not available right now.'
          : apiError.message
      )
    }
  }

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          flexWrap: 'wrap',
        }}
      >
        <h3
          style={{ ...s.title, display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <Truck size={16} color="#A39BB3" />
          Courier Tracking
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {delivered && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: '0.7rem',
                fontWeight: 600,
                color: '#3F9C68',
                backgroundColor: '#ECFDF5',
                padding: '2px 8px',
                borderRadius: '9999px',
              }}
            >
              <CheckCircle2 size={12} /> Delivered
            </span>
          )}
          {allowRefresh && hasShipments && (
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={isRefreshing}
              style={{ ...s.button, opacity: isRefreshing ? 0.5 : 1 }}
            >
              <RefreshCw
                size={13}
                style={
                  isRefreshing
                    ? { animation: 'spin 1s linear infinite' }
                    : undefined
                }
              />
              {isRefreshing ? 'Checking NZ Post…' : 'Refresh now'}
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <SkeletonList
          count={3}
          avatar={false}
          bordered={false}
          label="Loading tracking"
        />
      ) : error ? (
        <p style={s.error}>{toApiError(error).message}</p>
      ) : isEmpty || !tracking ? (
        <p style={s.muted}>
          Tracking appears here once the order has been dispatched.
        </p>
      ) : (
        <>
          <div style={{ fontSize: '0.8rem', color: '#6E6781' }}>
            <span style={{ color: '#2B253E', fontWeight: 600 }}>
              {tracking.carrier ?? 'Courier'}
            </span>
            {(references.length > 0 || tracking.trackingNumber) && (
              <>
                {' · '}
                <span style={{ fontFamily: 'monospace', color: '#2B253E' }}>
                  {references.length > 0
                    ? references.join(', ')
                    : tracking.trackingNumber}
                </span>
              </>
            )}
          </div>

          {tracking.events.length === 0 ? (
            <p style={s.muted}>
              {hasShipments
                ? 'No scans from NZ Post yet. They appear once the courier collects the parcel.'
                : 'This order was sent with a courier the portal does not track.'}
            </p>
          ) : (
            <ol
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {tracking.events.map((event, index) => (
                <li
                  key={`${event.trackingReference}-${event.occurredAt}-${index}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '14px 1fr',
                    gap: '10px',
                    paddingBottom:
                      index === tracking.events.length - 1 ? 0 : '12px',
                    position: 'relative',
                  }}
                >
                  <span
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      marginTop: '4px',
                      backgroundColor:
                        index === 0
                          ? event.isDelivered
                            ? '#3F9C68'
                            : '#F73582'
                          : '#DCD3E0',
                    }}
                  />
                  <div style={{ fontSize: '0.8rem' }}>
                    <div style={{ color: '#2B253E', fontWeight: 600 }}>
                      {event.description ?? event.status ?? 'Scanned'}
                    </div>
                    <div style={{ color: '#A39BB3', fontSize: '0.74rem' }}>
                      {formatDateTime(event.occurredAt)}
                      {event.depotName && (
                        <>
                          {' · '}
                          <MapPin
                            size={11}
                            style={{ verticalAlign: '-1px' }}
                          />{' '}
                          {event.depotName}
                        </>
                      )}
                      {event.signedByName &&
                        ` · Signed by ${event.signedByName}`}
                      {references.length > 1 && ` · ${event.trackingReference}`}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}

          {tracking.refreshQueued && (
            <p style={s.muted}>Checking NZ Post for newer scans…</p>
          )}
        </>
      )}

      {refreshNote && <p style={s.muted}>{refreshNote}</p>}
    </div>
  )

  if (bare) return content
  return <div style={{ ...s.card, padding: '20px' }}>{content}</div>
}
