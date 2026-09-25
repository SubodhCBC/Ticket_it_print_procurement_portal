// src/components/shipping/ShipmentLabelPanel.tsx
'use client'

import { SkeletonList } from '@/components/ui/Skeleton'
import { useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  Download,
  Loader2,
  Plus,
  RotateCcw,
  Tag,
  Trash2,
  XCircle,
} from 'lucide-react'
import { toApiError } from '@/services'
import { useOrder } from '@/hooks/useOrders'
import {
  isLabelInProgress,
  isLiveLabel,
  useOrderShipments,
  useShippingMutations,
} from '@/hooks/useShipping'
import type {
  ApiShipment,
  CreateShipmentInput,
} from '@/services/data-source/api/shipping.types'
import type { Order } from '@/types'
import { formatDateTime } from '@/lib/format'
import {
  newIdempotencyKey,
  panelStyles as s,
  trackingReferencesOf,
} from './shipping-format'
import { StatusChip } from './StatusChip'
import { FieldError, fieldOutline } from '@/components/ui/FormField'

/**
 * The NZ Post label for one order (decisions D1 and D2).
 *
 * Staff pack the order while it is PROCESSING, weigh and measure each box, and
 * request the label here. The label is made in the background, so the panel
 * polls until it is ready, then offers the PDF. A wrong label is voided and made
 * again; a failed one is retried. Dispatch then takes its tracking references
 * from this label — nobody types a tracking number.
 */

const MAX_PARCELS = 20

interface ParcelRow {
  /**
   * This box's identity, so the row keeps its own DOM node when a box above it
   * is removed. Keyed by position, deleting box 1 of 3 handed box 2's values to
   * box 1's inputs — including the caret of whoever was typing in them.
   */
  id: string
  weightKg: string
  lengthCm: string
  widthCm: string
  heightCm: string
  description: string
}

interface AddressForm {
  companyName: string
  streetNumber: string
  street: string
  suburb: string
  city: string
  postcode: string
}

/** Ids only have to be unique within this form, and never leave it. */
let parcelSeq = 0
function nextParcelId(): string {
  parcelSeq += 1
  return `parcel-${parcelSeq}`
}

const EMPTY_PARCEL: Omit<ParcelRow, 'id'> = {
  weightKg: '',
  lengthCm: '',
  widthCm: '',
  heightCm: '',
  description: '',
}

/** Rounded for a text box: 1.2345 kg reads as 1.23. */
function asField(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value) || value <= 0) return ''
  return String(Math.round(value * 100) / 100)
}

function initialParcels(order: Order | null): ParcelRow[] {
  const estimate = order?.nzPostDelivery?.parcelEstimate
  // Named, not merely hinted at: the box carries this description onto the
  // label whether or not the packer changes it.
  if (!estimate)
    return [{ ...EMPTY_PARCEL, id: nextParcelId(), description: 'Box 1' }]
  return [
    {
      id: nextParcelId(),
      weightKg: asField(estimate.weightKg),
      lengthCm: asField(estimate.lengthCm),
      widthCm: asField(estimate.widthCm),
      heightCm: asField(estimate.heightCm),
      description: 'Box 1',
    },
  ]
}

/** A best guess from the free-text branch address; staff correct it. */
function initialAddress(order: Order | null): AddressForm {
  const address = order?.deliveryAddress
  const numbered = /^\s*(\d+[A-Za-z]?)\s+(.+)$/.exec(address?.street ?? '')
  return {
    companyName: order?.siteName ?? '',
    streetNumber: numbered?.[1] ?? '',
    street: numbered?.[2] ?? address?.street ?? '',
    suburb: address?.suite ?? '',
    city: address?.city ?? '',
    postcode: address?.postalCode ?? '',
  }
}

function positive(value: string): number | null {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n <= 1000 ? n : null
}

interface ShipmentLabelPanelProps {
  orderId: string
  /** Only operators with ORDER_MANAGE make labels; everyone else sees nothing. */
  canManage: boolean
  /** Drawn without its own card, for use inside a dialog. */
  bare?: boolean
}

export function ShipmentLabelPanel({
  orderId,
  canManage,
  bare = false,
}: ShipmentLabelPanelProps) {
  const { order } = useOrder(canManage ? orderId : '')
  const { shipments, isLoading, error, refetch } = useOrderShipments(
    orderId,
    canManage
  )
  const mutations = useShippingMutations()

  if (!canManage) return null

  const body = (
    <PanelBody
      orderId={orderId}
      order={order}
      shipments={shipments}
      isLoading={isLoading}
      loadError={error ? toApiError(error).message : null}
      onReload={() => void refetch()}
      mutations={mutations}
    />
  )

  if (bare) return body
  return <div style={{ ...s.card, padding: '20px' }}>{body}</div>
}

function PanelBody({
  orderId,
  order,
  shipments,
  isLoading,
  loadError,
  onReload,
  mutations,
}: {
  orderId: string
  order: Order | null
  shipments: ApiShipment[]
  isLoading: boolean
  loadError: string | null
  onReload: () => void
  mutations: ReturnType<typeof useShippingMutations>
}) {
  const [actionError, setActionError] = useState<string | null>(null)
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  // Newest first. The current label is the newest that is not voided or
  // failed; a failed one is shown until something replaces it.
  const newestFirst = [...shipments].reverse()
  const current =
    newestFirst.find((item) => isLiveLabel(item) || isLabelInProgress(item)) ??
    newestFirst.find((item) => item.status === 'FAILED') ??
    null
  const history = newestFirst.filter((item) => item !== current)

  const isProcessing = order?.status === 'PROCESSING'
  const blocksNewLabel =
    current !== null && (isLiveLabel(current) || isLabelInProgress(current))
  const canCreate = isProcessing && !blocksNewLabel

  /** Runs one action and reports its failure. True when it succeeded. */
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setActionError(null)
    try {
      await action()
      return true
    } catch (err) {
      const apiError = toApiError(err)
      setActionError(
        apiError.status === 503
          ? 'NZ Post shipping is switched off or not configured. Check Shipping & Pickups for what is missing.'
          : apiError.message
      )
      if (apiError.status === 409) onReload()
      return false
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div className="row-wrap" style={{ justifyContent: 'space-between' }}>
        <h3
          style={{
            ...s.title,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Tag size={16} color="#A39BB3" />
          NZ Post Label
        </h3>
        {current && <StatusChip status={current.status} />}
      </div>

      {loadError && <p style={s.error}>{loadError}</p>}

      {isLoading ? (
        <SkeletonList
          count={2}
          avatar={false}
          bordered={false}
          label="Loading labels"
        />
      ) : (
        <>
          {current && (
            <CurrentShipment
              shipment={current}
              orderStatus={order?.status}
              busy={
                mutations.isRetrying ||
                mutations.isVoiding ||
                Boolean(voidingId)
              }
              onDownload={() =>
                run(() => mutations.openLabel(orderId, current.id))
              }
              onRetry={() =>
                run(() => mutations.retryLabel(orderId, current.id))
              }
              onStartVoid={() => {
                setVoidingId(current.id)
                setVoidReason('')
              }}
            />
          )}

          {voidingId && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                padding: '12px',
                borderRadius: '10px',
                backgroundColor: '#FCF7FA',
              }}
            >
              <label style={s.label} htmlFor="void-reason">
                Why is this label being voided?
              </label>
              <input
                id="void-reason"
                value={voidReason}
                maxLength={500}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Wrong weight entered — repacking into two boxes"
                className="touch-target"
                style={s.input}
              />
              <p style={s.muted}>
                Discard any printed copy. A label NZ Post never scans is not
                charged.
              </p>
              <div className="row-wrap">
                <button
                  type="button"
                  className="touch-target"
                  disabled={voidReason.trim().length < 3 || mutations.isVoiding}
                  onClick={() =>
                    run(async () => {
                      await mutations.voidLabel(
                        orderId,
                        voidingId,
                        voidReason.trim()
                      )
                      setVoidingId(null)
                    })
                  }
                  style={{
                    ...s.primaryButton,
                    opacity:
                      voidReason.trim().length < 3 || mutations.isVoiding
                        ? 0.5
                        : 1,
                  }}
                >
                  {mutations.isVoiding ? 'Voiding…' : 'Void label'}
                </button>
                <button
                  type="button"
                  onClick={() => setVoidingId(null)}
                  className="touch-target"
                  style={s.button}
                >
                  Keep it
                </button>
              </div>
            </div>
          )}

          {actionError && <p style={s.error}>{actionError}</p>}

          {canCreate ? (
            <CreateLabelForm
              key={`${orderId}-${shipments.length}`}
              order={order}
              isCreating={mutations.isCreating}
              replacing={current?.status === 'FAILED'}
              onSubmit={(input) =>
                run(() => mutations.createLabel(orderId, input))
              }
            />
          ) : (
            !current &&
            order && (
              <p style={s.muted}>
                {order.status === 'APPROVED'
                  ? 'Move the order to Processing, pack it, then create its label here.'
                  : order.status === 'DISPATCHED' ||
                      order.status === 'DELIVERED'
                    ? 'This order left without an NZ Post label.'
                    : 'Labels are made while an order is in Processing.'}
              </p>
            )
          )}

          {history.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowHistory((open) => !open)}
                className="touch-target"
                style={{
                  ...s.button,
                  border: 'none',
                  padding: 0,
                  color: '#6E6781',
                }}
              >
                {showHistory ? 'Hide' : 'Show'} earlier labels ({history.length}
                )
              </button>
              {showHistory && (
                <ul
                  style={{
                    listStyle: 'none',
                    margin: '8px 0 0',
                    padding: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  {history.map((item) => (
                    <li
                      key={item.id}
                      className="row-wrap"
                      style={{ fontSize: '0.76rem', color: '#6E6781' }}
                    >
                      <StatusChip status={item.status} />
                      <span>{formatDateTime(item.createdAt)}</span>
                      {item.consignmentId && (
                        <span
                          style={{
                            fontFamily: 'monospace',
                            minWidth: 0,
                            overflowWrap: 'anywhere',
                          }}
                        >
                          {item.consignmentId}
                        </span>
                      )}
                      {(item.voidReason || item.lastError) && (
                        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
                          · {item.voidReason ?? item.lastError}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function CurrentShipment({
  shipment,
  orderStatus,
  busy,
  onDownload,
  onRetry,
  onStartVoid,
}: {
  shipment: ApiShipment
  orderStatus: string | undefined
  busy: boolean
  onDownload: () => void
  onRetry: () => void
  onStartVoid: () => void
}) {
  const references = trackingReferencesOf(shipment.parcels)
  const dispatched = orderStatus === 'DISPATCHED' || orderStatus === 'DELIVERED'

  if (isLabelInProgress(shipment)) {
    return (
      <p style={{ ...s.notice, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
        NZ Post is making the label for {shipment.parcels.length}{' '}
        {shipment.parcels.length === 1 ? 'box' : 'boxes'}. This usually takes a
        few seconds.
      </p>
    )
  }

  if (shipment.status === 'FAILED') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <p style={{ ...s.error, display: 'flex', gap: 8 }}>
          <XCircle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            The label could not be made
            {shipment.lastError ? `: ${shipment.lastError}` : '.'} (attempt{' '}
            {shipment.attempts})
          </span>
        </p>
        {orderStatus === 'PROCESSING' && (
          <div>
            <button
              type="button"
              onClick={onRetry}
              disabled={busy}
              className="touch-target"
              style={{ ...s.button, opacity: busy ? 0.5 : 1 }}
            >
              <RotateCcw size={14} /> Retry the same request
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div
        className="grid-auto"
        style={
          { ['--min']: '140px', fontSize: '0.8rem' } as React.CSSProperties
        }
      >
        <Fact label="Consignment" value={shipment.consignmentId ?? '—'} mono />
        <Fact label="Service" value={shipment.serviceCode} mono />
        <Fact label="Labelled" value={formatDateTime(shipment.labelledAt)} />
        <Fact label="Requested by" value={shipment.requestedByName} />
      </div>

      {/* The parcel columns are wider than the panel on a narrow screen. They
          scroll inside this box so the page itself never does. */}
      <div className="table-scroll">
        <table
          style={{
            width: '100%',
            minWidth: '380px',
            borderCollapse: 'collapse',
            fontSize: '0.78rem',
            textAlign: 'left',
          }}
        >
          <thead>
            <tr style={{ color: '#A39BB3' }}>
              <th style={{ padding: '4px 8px 4px 0', fontWeight: 500 }}>Box</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Weight</th>
              <th style={{ padding: '4px 8px', fontWeight: 500 }}>Size (cm)</th>
              <th style={{ padding: '4px 0 4px 8px', fontWeight: 500 }}>
                Tracking reference
              </th>
            </tr>
          </thead>
          <tbody>
            {shipment.parcels.map((parcel) => (
              <tr
                key={parcel.sequence}
                style={{ borderTop: '1px solid #F5EEF2' }}
              >
                <td style={{ padding: '6px 8px 6px 0', color: '#2B253E' }}>
                  {parcel.description ?? `Box ${parcel.sequence}`}
                </td>
                <td style={{ padding: '6px 8px' }}>{parcel.weightKg} kg</td>
                <td style={{ padding: '6px 8px' }}>
                  {parcel.lengthCm} × {parcel.widthCm} × {parcel.heightCm}
                </td>
                <td
                  style={{
                    padding: '6px 0 6px 8px',
                    fontFamily: 'monospace',
                    color: '#2B253E',
                  }}
                >
                  {parcel.trackingReference ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {shipment.unscannedFlaggedAt && (
        <p style={{ ...s.notice, display: 'flex', gap: 8 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 2 }} />
          NZ Post has not scanned this label since{' '}
          {formatDateTime(shipment.labelledAt)}. Check it was collected.
        </p>
      )}

      <p style={s.muted}>
        {shipment.pickupBookingId
          ? 'On a courier pickup booking.'
          : dispatched
            ? `Dispatched on this label${references.length ? ` (${references.join(', ')})` : ''}.`
            : 'Dispatch the order to send it with these tracking references. '}
        {!shipment.pickupBookingId && !dispatched && (
          <Link
            href="/admin/orders/shipping"
            style={{ color: '#F73582', fontWeight: 600 }}
          >
            Book a pickup
          </Link>
        )}
      </p>

      <div className="row-wrap">
        <button
          type="button"
          onClick={onDownload}
          disabled={!shipment.labelReady}
          title={
            shipment.labelReady ? undefined : 'The PDF is still being stored'
          }
          className="touch-target"
          style={{
            ...s.primaryButton,
            opacity: shipment.labelReady ? 1 : 0.5,
          }}
        >
          <Download size={14} /> Download label PDF
        </button>
        {!dispatched && (
          <button
            type="button"
            onClick={onStartVoid}
            disabled={busy}
            className="touch-target"
            style={{ ...s.button, opacity: busy ? 0.5 : 1 }}
          >
            <Trash2 size={14} /> Void label
          </button>
        )}
      </div>
    </div>
  )
}

function Fact({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <span style={{ display: 'block', fontSize: '0.72rem', color: '#A39BB3' }}>
        {label}
      </span>
      <span
        style={{
          color: '#2B253E',
          fontWeight: 600,
          fontFamily: mono ? 'monospace' : undefined,
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function CreateLabelForm({
  order,
  isCreating,
  replacing,
  onSubmit,
}: {
  order: Order | null
  isCreating: boolean
  replacing: boolean
  onSubmit: (input: CreateShipmentInput) => Promise<boolean>
}) {
  const delivery = order?.nzPostDelivery
  const needsAddress = !delivery?.addressValidated

  const [open, setOpen] = useState(!replacing)
  const [parcels, setParcels] = useState<ParcelRow[]>(() =>
    initialParcels(order)
  )
  const [address, setAddress] = useState<AddressForm>(() =>
    initialAddress(order)
  )
  const [serviceCode, setServiceCode] = useState('')
  const [instructions, setInstructions] = useState('')
  /**
   * Which box field, and which address field, is wrong. Every one of them is
   * decided in a single pass, so a packer who left four boxes half-measured
   * sees all of it at once instead of one complaint per press.
   */
  const [parcelErrors, setParcelErrors] = useState<
    Record<number, Partial<Record<keyof ParcelRow, string>>>
  >({})
  const [addressErrors, setAddressErrors] = useState<
    Partial<Record<keyof AddressForm, string>>
  >({})
  // One key per attempt: a lost response retried with it returns the same
  // shipment instead of a second label.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    newIdempotencyKey('label')
  )

  const setParcel = (index: number, patch: Partial<ParcelRow>) => {
    setParcels((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
    setParcelErrors((current) => {
      const row = current[index]
      if (!row) return current
      const next = { ...row }
      for (const key of Object.keys(patch)) delete next[key as keyof ParcelRow]
      return { ...current, [index]: next }
    })
    setIdempotencyKey(newIdempotencyKey('label'))
  }

  const setAddressField = (field: keyof AddressForm, value: string) => {
    setAddress((a) => ({ ...a, [field]: value }))
    setAddressErrors((current) =>
      current[field] === undefined
        ? current
        : { ...current, [field]: undefined }
    )
  }

  if (!open) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="touch-target"
          style={s.button}
        >
          <Plus size={14} /> Make a new label
        </button>
      </div>
    )
  }

  const submit = async () => {
    const foundParcels: Record<
      number,
      Partial<Record<keyof ParcelRow, string>>
    > = {}
    const foundAddress: Partial<Record<keyof AddressForm, string>> = {}

    const parsed: CreateShipmentInput['parcels'] = []
    for (const [index, row] of parcels.entries()) {
      const weightKg = positive(row.weightKg)
      const lengthCm = positive(row.lengthCm)
      const widthCm = positive(row.widthCm)
      const heightCm = positive(row.heightCm)
      const rowErrors: Partial<Record<keyof ParcelRow, string>> = {}
      if (!weightKg) {
        rowErrors.weightKg = 'Weigh this box: kilograms above 0, up to 1000.'
      }
      if (!lengthCm) {
        rowErrors.lengthCm = 'Enter the length in cm, above 0.'
      }
      if (!widthCm) rowErrors.widthCm = 'Enter the width in cm, above 0.'
      if (!heightCm) rowErrors.heightCm = 'Enter the height in cm, above 0.'
      if (Object.keys(rowErrors).length > 0) foundParcels[index] = rowErrors

      parsed.push({
        weightKg: weightKg ?? 0,
        lengthCm: lengthCm ?? 0,
        widthCm: widthCm ?? 0,
        heightCm: heightCm ?? 0,
        description: row.description,
      })
    }

    if (needsAddress) {
      if (!address.streetNumber.trim()) {
        foundAddress.streetNumber = 'Enter the street number.'
      }
      if (!address.street.trim()) {
        foundAddress.street = 'Enter the street name.'
      }
      if (!address.city.trim()) foundAddress.city = 'Enter the city.'
      if (!/^\d{4}$/.test(address.postcode.trim())) {
        foundAddress.postcode = 'A New Zealand postcode is four digits.'
      }
    }

    setParcelErrors(foundParcels)
    setAddressErrors(foundAddress)
    if (
      Object.keys(foundParcels).length > 0 ||
      Object.keys(foundAddress).length > 0
    ) {
      return
    }

    let deliveryAddress: CreateShipmentInput['deliveryAddress']
    if (needsAddress) {
      deliveryAddress = {
        streetNumber: address.streetNumber.trim(),
        street: address.street.trim(),
        suburb: address.suburb.trim() || null,
        city: address.city.trim(),
        postcode: address.postcode.trim(),
        ...(address.companyName.trim()
          ? { companyName: address.companyName.trim() }
          : {}),
        countryCode: 'NZ',
      }
    }

    const created = await onSubmit({
      parcels: parsed,
      serviceCode,
      instructions,
      idempotencyKey,
      ...(deliveryAddress ? { deliveryAddress } : {}),
    })
    // Kept after a failure, so pressing again after a lost response returns the
    // label that request made rather than making a second one.
    if (created) setIdempotencyKey(newIdempotencyKey('label'))
  }

  /**
   * One measurement cell. The column heading above it already says what the
   * number is, so the ghost text inside is never a second label — only an
   * example measurement — beside the spoken name a screen reader needs and
   * the cell's own error underneath.
   */
  const numberInput = (
    index: number,
    field: keyof ParcelRow,
    name: string,
    example: string,
    /** The column heading, repeated above the field once the columns fold. */
    heading: string
  ) => {
    const error = parcelErrors[index]?.[field]
    return (
      <div>
        <span className="show-sm" style={s.label}>
          {heading}
        </span>
        <input
          type="number"
          inputMode="decimal"
          step="0.01"
          value={parcels[index]![field]}
          placeholder={example}
          aria-label={`Box ${index + 1} ${name}`}
          aria-invalid={error ? true : undefined}
          onChange={(e) => setParcel(index, { [field]: e.target.value })}
          className="touch-target"
          style={{ ...s.input, ...fieldOutline(Boolean(error)) }}
        />
        {error && <FieldError>{error}</FieldError>}
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        paddingTop: '12px',
        borderTop: '1px solid #F5EEF2',
      }}
    >
      <div>
        <strong style={{ fontSize: '0.84rem', color: '#2B253E' }}>
          {replacing ? 'Make a new label' : 'Create the label'}
        </strong>
        <p style={s.muted}>
          Weigh and measure each packed box.
          {delivery?.parcelEstimate
            ? ' The first box starts at the estimate from the products ordered.'
            : ''}
        </p>
        {delivery?.parcelEstimate &&
          delivery.parcelEstimate.missingWeightSkus.length > 0 && (
            <p style={{ ...s.muted, color: '#B45309' }}>
              No weight on record for{' '}
              {delivery.parcelEstimate.missingWeightSkus.join(', ')} — weigh the
              box rather than trusting the estimate.
            </p>
          )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/*
          The five measurements fit one row on a laptop and fold to two columns
          on a phone. The column headings only make sense while the fields are
          still in columns, so on a phone they go and each field carries the
          same wording as its own label instead (the `show-sm` spans below).
        */}
        <div className="hide-sm" style={{ display: 'flex', gap: '6px' }}>
          <div
            className="grid-auto"
            style={
              {
                ['--min']: '110px',
                flex: 1,
                minWidth: 0,
                fontSize: '0.72rem',
                color: '#A39BB3',
              } as React.CSSProperties
            }
          >
            <span>Description</span>
            <span>Weight (kg)</span>
            <span>Length (cm)</span>
            <span>Width (cm)</span>
            <span>Height (cm)</span>
          </div>
          <span aria-hidden="true" style={{ width: '40px', flexShrink: 0 }} />
        </div>
        {parcels.map((row, index) => (
          <div
            key={row.id}
            style={{ display: 'flex', gap: '6px', alignItems: 'start' }}
          >
            <div
              className="grid-auto"
              style={
                {
                  ['--min']: '110px',
                  flex: 1,
                  minWidth: 0,
                } as React.CSSProperties
              }
            >
              <div>
                <span className="show-sm" style={s.label}>
                  Description
                </span>
                <input
                  value={row.description}
                  maxLength={100}
                  aria-label={`Box ${index + 1} description`}
                  onChange={(e) =>
                    setParcel(index, { description: e.target.value })
                  }
                  className="touch-target"
                  style={s.input}
                />
              </div>
              {numberInput(
                index,
                'weightKg',
                'weight in kilograms',
                '2.5',
                'Weight (kg)'
              )}
              {numberInput(
                index,
                'lengthCm',
                'length in centimetres',
                '40',
                'Length (cm)'
              )}
              {numberInput(
                index,
                'widthCm',
                'width in centimetres',
                '30',
                'Width (cm)'
              )}
              {numberInput(
                index,
                'heightCm',
                'height in centimetres',
                '20',
                'Height (cm)'
              )}
            </div>
            <button
              type="button"
              aria-label={`Remove box ${index + 1}`}
              disabled={parcels.length === 1}
              onClick={() => {
                setParcels((rows) => rows.filter((_, i) => i !== index))
                setIdempotencyKey(newIdempotencyKey('label'))
              }}
              className="touch-target"
              style={{
                ...s.button,
                width: '40px',
                flexShrink: 0,
                padding: '6px',
                justifyContent: 'center',
                opacity: parcels.length === 1 ? 0.4 : 1,
              }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="touch-target"
            disabled={parcels.length >= MAX_PARCELS}
            onClick={() => {
              setParcels((rows) => [
                ...rows,
                {
                  ...EMPTY_PARCEL,
                  id: nextParcelId(),
                  description: `Box ${rows.length + 1}`,
                },
              ])
              setIdempotencyKey(newIdempotencyKey('label'))
            }}
            style={{
              ...s.button,
              opacity: parcels.length >= MAX_PARCELS ? 0.5 : 1,
            }}
          >
            <Plus size={14} /> Add a box
          </button>
        </div>
      </div>

      {needsAddress && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={s.notice}>
            This order&apos;s address was not validated by NZ Post at checkout.
            Enter it in parts for the label.
          </p>
          <div className="grid-3">
            <AddressField
              label="Street number"
              value={address.streetNumber}
              error={addressErrors.streetNumber}
              example="12"
              onChange={(v) => setAddressField('streetNumber', v)}
            />
            <AddressField
              label="Street"
              value={address.street}
              error={addressErrors.street}
              example="Queen Street"
              onChange={(v) => setAddressField('street', v)}
            />
            <AddressField
              label="Suburb"
              value={address.suburb}
              example="Grafton"
              onChange={(v) => setAddressField('suburb', v)}
            />
            <AddressField
              label="City"
              value={address.city}
              error={addressErrors.city}
              example="Auckland"
              onChange={(v) => setAddressField('city', v)}
            />
            <AddressField
              label="Postcode"
              value={address.postcode}
              error={addressErrors.postcode}
              example="1010"
              onChange={(v) => setAddressField('postcode', v)}
            />
            <AddressField
              label="Company (optional)"
              value={address.companyName}
              onChange={(v) => setAddressField('companyName', v)}
            />
          </div>
        </div>
      )}

      <div className="grid-2">
        <div>
          <label style={s.label} htmlFor="label-service">
            Service code
          </label>
          <input
            id="label-service"
            value={serviceCode}
            maxLength={32}
            aria-describedby="label-service-hint"
            onChange={(e) => setServiceCode(e.target.value)}
            className="touch-target"
            style={{ ...s.input, fontFamily: 'monospace' }}
          />
          {/* What a blank box does is a fact about the field, so it is said in
              a hint that stays put — not as ghost text inside the box that
              vanishes the moment anyone types. */}
          <p id="label-service-hint" style={{ ...s.muted, marginTop: '4px' }}>
            {delivery?.serviceCode
              ? `Leave blank to use ${delivery.serviceCode}.`
              : 'Leave blank to use the account’s default service.'}
          </p>
        </div>
        <div>
          <label style={s.label} htmlFor="label-instructions">
            Instructions on the label
          </label>
          <input
            id="label-instructions"
            value={instructions}
            maxLength={500}
            aria-describedby="label-instructions-hint"
            onChange={(e) => setInstructions(e.target.value)}
            className="touch-target"
            style={s.input}
          />
          <p
            id="label-instructions-hint"
            style={{ ...s.muted, marginTop: '4px' }}
          >
            {order?.deliveryNotes
              ? `Leave blank to print the order’s own instructions: ${order.deliveryNotes}`
              : 'Leave blank to print the order’s delivery instructions.'}
          </p>
        </div>
      </div>

      <div className="row-wrap">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isCreating}
          className="touch-target"
          style={{ ...s.primaryButton, opacity: isCreating ? 0.5 : 1 }}
        >
          {isCreating ? (
            <>
              <Loader2
                size={14}
                style={{ animation: 'spin 1s linear infinite' }}
              />
              Requesting label…
            </>
          ) : (
            <>
              <Tag size={14} /> Create NZ Post label
            </>
          )}
        </button>
        {replacing && (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="touch-target"
            style={s.button}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}

function AddressField({
  label,
  value,
  error,
  example,
  onChange,
}: {
  label: string
  value: string
  error?: string
  /** An example of the value, shown as the placeholder. */
  example?: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      <input
        value={value}
        maxLength={120}
        placeholder={example}
        aria-label={label}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange(e.target.value)}
        className="touch-target"
        style={{ ...s.input, ...fieldOutline(Boolean(error)) }}
      />
      {error && <FieldError>{error}</FieldError>}
    </div>
  )
}
