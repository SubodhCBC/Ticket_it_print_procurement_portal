// src/components/shop/checkout/NzPostDeliveryPanel.tsx
'use client'

import { SkeletonText } from '@/components/ui/Skeleton'
import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertCircle, MapPin, X } from 'lucide-react'
import { toApiError } from '@/services'
import {
  clearCartShipping,
  getCartShipping,
  getCollectionPoints,
  getShippingRates,
  searchDeliveryAddresses,
  selectCollectionPoint,
  selectDeliveryAddress,
  selectShippingService,
} from '@/services/data-source/api/api-cart.adapter'
import type {
  ApiAddressSuggestion,
  ApiCartShipping,
  ApiCollectionPoint,
  ApiShippingRates,
} from '@/services/data-source/api/cart.types'
import { formatMoney } from '@/components/shop/cart/line-format'

/**
 * The basket's NZ Post delivery choice: a validated address, then a service or
 * a nearby collection point.
 *
 * Optional, and recorded rather than billed. It tells dispatch how the parcel
 * should travel; what the order pays for delivery is still the shipping method
 * chosen above it. So nothing here can block checkout — an integration that is
 * switched off says so and gets out of the way.
 *
 * The server keeps the steps in order and so does this: choosing an address
 * clears the point and the service, choosing a point clears the service. Every
 * write answers with the whole selection, which replaces what is shown.
 */

/** NZ Post refuses fewer; its guidance is to start after five. */
const MIN_QUERY_LENGTH = 4
const SEARCH_DEBOUNCE_MS = 300

const sectionTitle: React.CSSProperties = {
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#2B253E',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  margin: 0,
}

const note: React.CSSProperties = {
  margin: 0,
  fontSize: '0.76rem',
  color: '#6E6781',
  lineHeight: 1.45,
}

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  fontSize: '0.84rem',
  color: '#2B253E',
  outline: 'none',
}

const linkButton: React.CSSProperties = {
  border: 'none',
  background: 'none',
  padding: 0,
  fontSize: '0.76rem',
  fontWeight: 600,
  color: '#F73582',
  cursor: 'pointer',
}

function optionCard(selected: boolean, busy: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: '12px',
    border: selected ? '1px solid #F73582' : '1px solid #F0E6EC',
    backgroundColor: selected ? '#FDE8F1' : '#FFFFFF',
    cursor: busy ? 'wait' : 'pointer',
  }
}

function distance(metres: number | null): string | null {
  if (metres === null) return null
  return metres < 1000
    ? `${Math.round(metres)} m`
    : `${(metres / 1000).toFixed(1)} km`
}

export function NzPostDeliveryPanel() {
  const [shipping, setShipping] = useState<ApiCartShipping | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  /** Set once NZ Post answers 503: the step is skipped, not failed. */
  const [unavailable, setUnavailable] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Which write is in flight, so only its control shows progress. */
  const [busy, setBusy] = useState<string | null>(null)

  const [query, setQuery] = useState('')
  /** The latest answer, kept with the text it answers. */
  const [searchResult, setSearchResult] = useState<{
    query: string
    items: ApiAddressSuggestion[]
  } | null>(null)
  const searchSeq = useRef(0)

  /** Rates, kept with the selection they were quoted for. */
  const [ratesResult, setRatesResult] = useState<{
    key: string
    rates: ApiShippingRates | null
  } | null>(null)
  const [points, setPoints] = useState<ApiCollectionPoint[] | null>(null)
  /** The address whose collection points could not be loaded. */
  const [pointsFailedFor, setPointsFailedFor] = useState<string | null>(null)

  const selection = shipping?.selection ?? null
  const addressId = selection?.nzPostAddressId ?? null
  const deliveryKind = selection?.deliveryKind ?? 'ADDRESS'
  const pointId = selection?.collectionPoint?.id ?? null

  // Derived during render rather than set from the effects below: each is
  // "the current request has not been answered yet".
  const searchText = query.trim()
  const searchActive = searchText.length >= MIN_QUERY_LENGTH && !unavailable
  const suggestions =
    searchActive && searchResult?.query === searchText ? searchResult.items : []
  const isSearching = searchActive && searchResult?.query !== searchText

  const ratesKey =
    addressId && !unavailable
      ? `${addressId}|${deliveryKind}|${pointId ?? ''}`
      : null
  const rates =
    ratesKey && ratesResult?.key === ratesKey ? ratesResult.rates : null
  const isLoadingRates = ratesKey !== null && ratesResult?.key !== ratesKey

  const wantsPoints =
    addressId !== null && deliveryKind === 'COLLECTION' && !unavailable
  const isLoadingPoints =
    wantsPoints && points === null && pointsFailedFor !== addressId

  /** A 503 turns the panel into a note; anything else is shown and retried. */
  const handleError = useCallback((cause: unknown) => {
    const apiError = toApiError(cause)
    if (apiError.status === 503) {
      setUnavailable(apiError.message)
      setError(null)
      return
    }
    setError(apiError.message)
  }, [])

  // What the basket already holds. A read of the portal's own record, so it
  // does not depend on NZ Post being reachable.
  useEffect(() => {
    let cancelled = false
    getCartShipping()
      .then((view) => {
        if (!cancelled) setShipping(view)
      })
      .catch((cause) => {
        if (!cancelled) handleError(cause)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [handleError])

  // Type-ahead. Debounced, and a late answer to an older query is dropped so a
  // slow response cannot overwrite the suggestions for what is typed now.
  useEffect(() => {
    if (!searchActive) return

    const seq = ++searchSeq.current
    const timer = setTimeout(() => {
      searchDeliveryAddresses(searchText)
        .then((items) => {
          if (seq === searchSeq.current)
            setSearchResult({ query: searchText, items })
        })
        .catch((cause) => {
          if (seq !== searchSeq.current) return
          setSearchResult({ query: searchText, items: [] })
          handleError(cause)
        })
    }, SEARCH_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [searchText, searchActive, handleError])

  // Rates for whatever is chosen now. Re-read whenever the address or the
  // collection point changes, because the server cleared the old quote.
  useEffect(() => {
    if (!ratesKey) return
    let cancelled = false
    getShippingRates()
      .then((result) => {
        if (!cancelled) setRatesResult({ key: ratesKey, rates: result })
      })
      .catch((cause) => {
        if (cancelled) return
        setRatesResult({ key: ratesKey, rates: null })
        handleError(cause)
      })
    return () => {
      cancelled = true
    }
  }, [ratesKey, handleError])

  // Collection points, only while the buyer is collecting.
  useEffect(() => {
    if (!wantsPoints || !addressId || points !== null) return
    if (pointsFailedFor === addressId) return
    let cancelled = false
    getCollectionPoints()
      .then((items) => {
        if (!cancelled) setPoints(items)
      })
      .catch((cause) => {
        if (cancelled) return
        setPointsFailedFor(addressId)
        handleError(cause)
      })
    return () => {
      cancelled = true
    }
  }, [wantsPoints, addressId, points, pointsFailedFor, handleError])

  /** Runs one write, and shows the selection it answers with. */
  const write = async (
    key: string,
    request: () => Promise<ApiCartShipping>
  ): Promise<boolean> => {
    if (busy) return false
    setBusy(key)
    setError(null)
    try {
      setShipping(await request())
      return true
    } catch (cause) {
      handleError(cause)
      return false
    } finally {
      setBusy(null)
    }
  }

  const chooseAddress = async (suggestion: ApiAddressSuggestion) => {
    const saved = await write(`address:${suggestion.addressId}`, () =>
      selectDeliveryAddress(suggestion.addressId)
    )
    if (saved) {
      // Clearing the query clears the suggestions derived from it.
      setQuery('')
      setPoints(null)
      setPointsFailedFor(null)
    }
  }

  const collect = async (wantsCollection: boolean) => {
    if (wantsCollection === (deliveryKind === 'COLLECTION')) return
    if (wantsCollection) {
      // Nothing is written until a point is picked: the server has no
      // "collecting, point to follow" state.
      setShipping((current) =>
        current?.selection
          ? {
              ...current,
              selection: { ...current.selection, deliveryKind: 'COLLECTION' },
            }
          : current
      )
      return
    }
    await write('kind:address', () => selectCollectionPoint(null))
  }

  const choosePoint = (id: string) =>
    write(`point:${id}`, () => selectCollectionPoint(id))

  const chooseService = (code: string) =>
    write(`service:${code}`, () => selectShippingService(code))

  const clear = async () => {
    const saved = await write('clear', () => clearCartShipping())
    if (saved) {
      // Forget the quote without asking again for the same selection.
      setRatesResult((current) =>
        current ? { key: current.key, rates: null } : current
      )
      setPoints(null)
      setPointsFailedFor(null)
    }
  }

  const header = (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
      }}
    >
      <h4 style={sectionTitle}>
        <MapPin size={16} color="#A39BB3" />
        <span>NZ Post Delivery Details</span>
      </h4>
      <span
        style={{
          fontSize: '0.7rem',
          fontWeight: 600,
          color: '#5C566E',
          backgroundColor: '#F5EEF2',
          padding: '2px 8px',
          borderRadius: '9999px',
        }}
      >
        Optional
      </span>
    </div>
  )

  const wrapper: React.CSSProperties = {
    paddingTop: '20px',
    borderTop: '1px solid #F5EEF2',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  }

  if (unavailable) {
    return (
      <div style={wrapper}>
        {header}
        <p style={note}>
          NZ Post address lookup is not available right now ({unavailable}). You
          can continue — the order ships to the branch address above.
        </p>
      </div>
    )
  }

  return (
    <div style={wrapper}>
      {header}
      <p style={note}>
        Confirm the address with NZ Post to record a courier service or a nearby
        collection point for dispatch. This does not change the order total —
        delivery is charged by the shipping method above.
      </p>

      {isLoading ? (
        <SkeletonText lines={3} />
      ) : !selection ? (
        /* 1. Find the address. */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Enter would submit the delivery form around this panel.
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.preventDefault()
            }}
            placeholder="Start typing the delivery address"
            aria-label="Search NZ Post addresses"
            autoComplete="off"
            maxLength={120}
            style={input}
          />
          {query.trim().length > 0 &&
            query.trim().length < MIN_QUERY_LENGTH && (
              <p style={{ ...note, color: '#A39BB3' }}>
                Type at least {MIN_QUERY_LENGTH} characters.
              </p>
            )}
          {isSearching && (
            <p style={{ ...note, color: '#A39BB3' }}>Searching NZ Post…</p>
          )}
          {!isSearching &&
            query.trim().length >= MIN_QUERY_LENGTH &&
            suggestions.length === 0 && (
              <p style={{ ...note, color: '#A39BB3' }}>
                No matching addresses.
              </p>
            )}
          {suggestions.length > 0 && (
            <div
              role="listbox"
              aria-label="Address suggestions"
              style={{
                display: 'flex',
                flexDirection: 'column',
                border: '1px solid #F0E6EC',
                borderRadius: '10px',
                overflow: 'hidden',
              }}
            >
              {suggestions.map((suggestion, index) => (
                <button
                  key={suggestion.addressId}
                  type="button"
                  role="option"
                  aria-selected={false}
                  disabled={busy !== null}
                  onClick={() => void chooseAddress(suggestion)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    border: 'none',
                    borderTop: index === 0 ? 'none' : '1px solid #F5EEF2',
                    backgroundColor: '#FFFFFF',
                    fontSize: '0.8rem',
                    color: '#2B253E',
                    cursor: busy ? 'wait' : 'pointer',
                  }}
                >
                  {busy === `address:${suggestion.addressId}`
                    ? 'Checking with NZ Post…'
                    : suggestion.fullAddress}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* 2. The chosen address. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '0.8rem',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <strong style={{ color: '#2B253E', display: 'block' }}>
                {selection.fullAddress ?? 'Address chosen'}
              </strong>
              {selection.isRural && (
                <span style={{ ...note, display: 'block' }}>
                  Rural delivery — NZ Post adds a surcharge.
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => void clear()}
              disabled={busy !== null}
              style={{ ...linkButton, display: 'inline-flex', gap: 4 }}
            >
              <X size={12} /> {busy === 'clear' ? 'Clearing…' : 'Change'}
            </button>
          </div>

          {shipping?.matchesSavedAddress === false && (
            <p style={{ ...note, color: '#B45309' }}>
              This postcode differs from the branch ship-to address above. Check
              that both are the same place.
            </p>
          )}

          {/* 3. Delivered, or collected. */}
          <div
            role="radiogroup"
            aria-label="NZ Post delivery kind"
            style={{ display: 'flex', gap: '16px', fontSize: '0.8rem' }}
          >
            {(
              [
                ['ADDRESS', 'Deliver to this address'],
                ['COLLECTION', 'Collect from a nearby point'],
              ] as const
            ).map(([kind, label]) => (
              <label
                key={kind}
                style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <input
                  type="radio"
                  name="nzpostDeliveryKind"
                  checked={deliveryKind === kind}
                  disabled={busy !== null}
                  onChange={() => void collect(kind === 'COLLECTION')}
                  style={{ margin: 0, accentColor: '#F73582' }}
                />
                {label}
              </label>
            ))}
          </div>

          {deliveryKind === 'COLLECTION' && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              {isLoadingPoints && (
                <p style={note}>Finding collection points…</p>
              )}
              {points?.length === 0 && (
                <p style={note}>No collection points near this address.</p>
              )}
              {points?.map((point) => (
                <label
                  key={point.id}
                  style={optionCard(point.id === pointId, busy !== null)}
                >
                  <input
                    type="radio"
                    name="nzpostCollectionPoint"
                    checked={point.id === pointId}
                    disabled={busy !== null}
                    onChange={() => void choosePoint(point.id)}
                    style={{ margin: '2px 0 0', accentColor: '#F73582' }}
                  />
                  <span style={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}>
                    <strong style={{ display: 'block', color: '#2B253E' }}>
                      {point.name}
                    </strong>
                    <span style={{ color: '#6E6781' }}>
                      {point.fullAddress}
                    </span>
                  </span>
                  {distance(point.distanceMetres) && (
                    <span style={{ fontSize: '0.74rem', color: '#A39BB3' }}>
                      {distance(point.distanceMetres)}
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}

          {/* 4. The service. Offered once there is something to quote for. */}
          {(deliveryKind === 'ADDRESS' || pointId) && (
            <div
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <span
                style={{
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: '#5C566E',
                }}
              >
                Courier service
              </span>
              {isLoadingRates && <p style={note}>Getting NZ Post rates…</p>}
              {rates && rates.source === 'FLAT_RATE' && (
                <p style={note}>
                  Live NZ Post rates could not be fetched; the portal&apos;s
                  flat rate is shown instead.
                </p>
              )}
              {rates && rates.options.length === 0 && (
                <p style={note}>
                  {rates.message ??
                    'No NZ Post services are available for this address right now.'}
                </p>
              )}
              {rates?.options.map((option) => {
                const selected = selection.service?.code === option.serviceCode
                return (
                  <label
                    key={option.serviceCode}
                    style={optionCard(selected, busy !== null)}
                  >
                    <input
                      type="radio"
                      name="nzpostService"
                      checked={selected}
                      disabled={busy !== null}
                      onChange={() => void chooseService(option.serviceCode)}
                      style={{ margin: '2px 0 0', accentColor: '#F73582' }}
                    />
                    <span style={{ flex: 1, minWidth: 0, fontSize: '0.8rem' }}>
                      <strong style={{ display: 'block', color: '#2B253E' }}>
                        {option.description}
                      </strong>
                      <span style={{ color: '#6E6781' }}>
                        {[
                          option.trackingIncluded ? 'Tracked' : null,
                          option.signatureIncluded ? 'Signature' : null,
                          ...option.mandatoryAddons.map(
                            (addon) => addon.description
                          ),
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        color: '#2B253E',
                        whiteSpace: 'nowrap',
                        textAlign: 'right',
                      }}
                    >
                      {formatMoney(Number(option.totalInclGst))}
                      <span
                        style={{
                          display: 'block',
                          fontSize: '0.7rem',
                          fontWeight: 400,
                          color: '#A39BB3',
                        }}
                      >
                        incl. GST · not billed
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}
        </>
      )}

      {error && (
        <p
          role="alert"
          style={{
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.76rem',
            fontWeight: 500,
            color: '#DC2626',
          }}
        >
          <AlertCircle size={12} color="#DC2626" />
          {error}
        </p>
      )}
    </div>
  )
}
