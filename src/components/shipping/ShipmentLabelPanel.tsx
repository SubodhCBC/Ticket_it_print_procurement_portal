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
import {
  formatDateTime,
  newIdempotencyKey,
  panelStyles as s,
  trackingReferencesOf,
} from './shipping-format'
import { StatusChip } from './StatusChip'

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

const EMPTY_PARCEL: ParcelRow = {
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
  if (!estimate) return [{ ...EMPTY_PARCEL }]
  return [
    {
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
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
                style={s.input}
              />
              <p style={s.muted}>
                Discard any printed copy. A label NZ Post never scans is not
                charged.
              </p>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
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
                {order.status === 'APPROVED' || order.status === 'RECEIVED'
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
                      style={{
                        fontSize: '0.76rem',
                        color: '#6E6781',
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                      }}
                    >
                      <StatusChip status={item.status} />
                      <span>{formatDateTime(item.createdAt)}</span>
                      {item.consignmentId && (
                        <span style={{ fontFamily: 'monospace' }}>
                          {item.consignmentId}
                        </span>
                      )}
                      {(item.voidReason || item.lastError) && (
                        <span>· {item.voidReason ?? item.lastError}</span>
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
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '10px',
          fontSize: '0.8rem',
        }}
      >
        <Fact label="Consignment" value={shipment.consignmentId ?? '—'} mono />
        <Fact label="Service" value={shipment.serviceCode} mono />
        <Fact label="Labelled" value={formatDateTime(shipment.labelledAt)} />
        <Fact label="Requested by" value={shipment.requestedByName} />
      </div>

      <table
        style={{
          width: '100%',
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

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onDownload}
          disabled={!shipment.labelReady}
          title={
            shipment.labelReady ? undefined : 'The PDF is still being stored'
          }
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
  const [formError, setFormError] = useState<string | null>(null)
  // One key per attempt: a lost response retried with it returns the same
  // shipment instead of a second label.
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    newIdempotencyKey('label')
  )

  const setParcel = (index: number, patch: Partial<ParcelRow>) => {
    setParcels((rows) =>
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row))
    )
    setIdempotencyKey(newIdempotencyKey('label'))
  }

  if (!open) {
    return (
      <div>
        <button type="button" onClick={() => setOpen(true)} style={s.button}>
          <Plus size={14} /> Make a new label
        </button>
      </div>
    )
  }

  const submit = async () => {
    setFormError(null)

    const parsed: CreateShipmentInput['parcels'] = []
    for (const [index, row] of parcels.entries()) {
      const weightKg = positive(row.weightKg)
      const lengthCm = positive(row.lengthCm)
      const widthCm = positive(row.widthCm)
      const heightCm = positive(row.heightCm)
      if (!weightKg || !lengthCm || !widthCm || !heightCm) {
        setFormError(
          `Box ${index + 1}: enter its weight and all three sizes as numbers above zero.`
        )
        return
      }
      parsed.push({
        weightKg,
        lengthCm,
        widthCm,
        heightCm,
        description: row.description,
      })
    }

    let deliveryAddress: CreateShipmentInput['deliveryAddress']
    if (needsAddress) {
      if (!address.streetNumber.trim() || !address.street.trim()) {
        setFormError(
          'Enter the street number and street of the delivery address.'
        )
        return
      }
      if (!address.city.trim()) {
        setFormError('Enter the city of the delivery address.')
        return
      }
      if (!/^\d{4}$/.test(address.postcode.trim())) {
        setFormError('A New Zealand postcode is four digits.')
        return
      }
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

  const numberInput = (
    index: number,
    field: keyof ParcelRow,
    placeholder: string
  ) => (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step="0.01"
      value={parcels[index]![field]}
      placeholder={placeholder}
      aria-label={`Box ${index + 1} ${placeholder}`}
      onChange={(e) => setParcel(index, { [field]: e.target.value })}
      style={s.input}
    />
  )

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
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.8fr 0.8fr 0.8fr 0.8fr 32px',
            gap: '6px',
            fontSize: '0.72rem',
            color: '#A39BB3',
          }}
        >
          <span>Description</span>
          <span>Weight (kg)</span>
          <span>Length (cm)</span>
          <span>Width (cm)</span>
          <span>Height (cm)</span>
          <span />
        </div>
        {parcels.map((row, index) => (
          <div
            key={index}
            style={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 0.8fr 0.8fr 0.8fr 0.8fr 32px',
              gap: '6px',
              alignItems: 'center',
            }}
          >
            <input
              value={row.description}
              maxLength={100}
              placeholder={`Box ${index + 1}`}
              aria-label={`Box ${index + 1} description`}
              onChange={(e) =>
                setParcel(index, { description: e.target.value })
              }
              style={s.input}
            />
            {numberInput(index, 'weightKg', 'kg')}
            {numberInput(index, 'lengthCm', 'L')}
            {numberInput(index, 'widthCm', 'W')}
            {numberInput(index, 'heightCm', 'H')}
            <button
              type="button"
              aria-label={`Remove box ${index + 1}`}
              disabled={parcels.length === 1}
              onClick={() => {
                setParcels((rows) => rows.filter((_, i) => i !== index))
                setIdempotencyKey(newIdempotencyKey('label'))
              }}
              style={{
                ...s.button,
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
            disabled={parcels.length >= MAX_PARCELS}
            onClick={() => {
              setParcels((rows) => [
                ...rows,
                { ...EMPTY_PARCEL, description: `Box ${rows.length + 1}` },
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
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '0.6fr 1.4fr 1fr',
              gap: '8px',
            }}
          >
            <AddressField
              label="Street number"
              value={address.streetNumber}
              onChange={(streetNumber) =>
                setAddress((a) => ({ ...a, streetNumber }))
              }
            />
            <AddressField
              label="Street"
              value={address.street}
              onChange={(street) => setAddress((a) => ({ ...a, street }))}
            />
            <AddressField
              label="Suburb"
              value={address.suburb}
              onChange={(suburb) => setAddress((a) => ({ ...a, suburb }))}
            />
            <AddressField
              label="City"
              value={address.city}
              onChange={(city) => setAddress((a) => ({ ...a, city }))}
            />
            <AddressField
              label="Postcode"
              value={address.postcode}
              onChange={(postcode) => setAddress((a) => ({ ...a, postcode }))}
            />
            <AddressField
              label="Company (optional)"
              value={address.companyName}
              onChange={(companyName) =>
                setAddress((a) => ({ ...a, companyName }))
              }
            />
          </div>
        </div>
      )}

      <div
        style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}
      >
        <div>
          <label style={s.label} htmlFor="label-service">
            Service code
          </label>
          <input
            id="label-service"
            value={serviceCode}
            maxLength={32}
            placeholder={delivery?.serviceCode ?? 'Default service'}
            onChange={(e) => setServiceCode(e.target.value)}
            style={{ ...s.input, fontFamily: 'monospace' }}
          />
        </div>
        <div>
          <label style={s.label} htmlFor="label-instructions">
            Instructions on the label
          </label>
          <input
            id="label-instructions"
            value={instructions}
            maxLength={500}
            placeholder={
              order?.deliveryNotes
                ? `Defaults to: ${order.deliveryNotes}`
                : 'Defaults to the order’s delivery instructions'
            }
            onChange={(e) => setInstructions(e.target.value)}
            style={s.input}
          />
        </div>
      </div>

      {formError && <p style={s.error}>{formError}</p>}

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={isCreating}
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
          <button type="button" onClick={() => setOpen(false)} style={s.button}>
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
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label style={s.label}>{label}</label>
      <input
        value={value}
        maxLength={120}
        onChange={(e) => onChange(e.target.value)}
        style={s.input}
      />
    </div>
  )
}
