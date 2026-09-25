// src/components/admin/OrderActionModal.tsx
'use client'

import React, { useId, useState } from 'react'
import { useDialogBehaviour } from '@/components/ui/useDialogBehaviour'
import { motion, AnimatePresence } from 'framer-motion'
import { X, CheckCircle, Printer } from 'lucide-react'
import type { Order, OrderStatus } from '@/types'
import { toApiError } from '@/services'
import { isLiveLabel, useOrderShipments } from '@/hooks/useShipping'
import { ShipmentLabelPanel } from '@/components/shipping/ShipmentLabelPanel'
import { trackingReferencesOf } from '@/components/shipping/shipping-format'
import { StatusPill } from './StatusPill'
import { formatMoney, formatDateTime } from '@/lib/format'

/**
 * The dialog is itself the card, so nothing inside it is framed again: the
 * fact tiles are separated by a fill, the form and the line items by spacing
 * and hairline rules. Labels are grey sentence case instead of uppercase.
 */
const metaTile: React.CSSProperties = {
  padding: '12px 14px',
  backgroundColor: '#FCF7FA',
  borderRadius: '10px',
}

const metaLabel: React.CSSProperties = {
  fontSize: '0.74rem',
  fontWeight: 500,
  color: '#A39BB3',
}

const metaValue: React.CSSProperties = {
  fontSize: '0.88rem',
  fontWeight: 600,
  color: '#2B253E',
  marginTop: '4px',
}

const metaSub: React.CSSProperties = { fontSize: '0.75rem', color: '#A39BB3' }

const sectionTitle: React.CSSProperties = {
  fontSize: '0.84rem',
  fontWeight: 600,
  color: '#2B253E',
  marginBottom: '8px',
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
  marginBottom: '6px',
}

const fieldInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  fontSize: '0.84rem',
  color: '#2B253E',
  backgroundColor: '#FFFFFF',
}

const th: React.CSSProperties = {
  padding: '10px 14px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}

const secondaryButton: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '8px 14px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  fontSize: '0.82rem',
  fontWeight: 600,
}

interface OrderActionModalProps {
  order: Order | null
  isOpen: boolean
  onClose: () => void
  onStatusUpdate: (
    id: string,
    status: OrderStatus,
    metadata?: {
      carrier?: string
      trackingNumber?: string
      deliveryNotes?: string
    }
  ) => Promise<any>
  /**
   * Operators who make NZ Post labels. Shows the label panel and dispatches on
   * the label; without it the dialog is the plain status form.
   */
  canManageShipping?: boolean
}

export function OrderActionModal({
  order,
  isOpen,
  onClose,
  onStatusUpdate,
  canManageShipping = false,
}: OrderActionModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<OrderStatus>(
    order?.status || 'APPROVED'
  )
  // No default carrier. A made-up name here replaced the NZ Post label's on
  // every dispatch, and read as a real courier on the buyer's order page.
  const [carrier, setCarrier] = useState(order?.carrier || '')
  const [trackingNumber, setTrackingNumber] = useState(
    order?.trackingNumber || ''
  )
  const [deliveryNotes, setDeliveryNotes] = useState(order?.deliveryNotes || '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const titleId = useId()
  const fieldId = useId()
  // This opens on every row click of the two busiest order screens, so the
  // keyboard has to be able to leave it the same way the mouse can.
  const closeRef = useDialogBehaviour<HTMLButtonElement>(isOpen, onClose)

  const { shipments } = useOrderShipments(
    order?.id ?? '',
    isOpen && Boolean(order) && canManageShipping
  )
  const liveLabel = shipments.filter(isLiveLabel).at(-1) ?? null
  const labelReferences = liveLabel
    ? trackingReferencesOf(liveLabel.parcels)
    : []

  // Reseed the form when a different order is opened. Adjusted during render
  // rather than in an effect, so the previous order's values never paint.
  const [formOrder, setFormOrder] = useState(order)
  if (order !== formOrder) {
    setFormOrder(order)
    if (order) {
      setSelectedStatus(order.status)
      setCarrier(order.carrier || '')
      setTrackingNumber(order.trackingNumber || '')
      setDeliveryNotes(order.deliveryNotes || '')
      setFeedback(null)
    }
  }

  if (!isOpen || !order) return null

  const isDispatching =
    selectedStatus === 'DISPATCHED' && order.status !== 'DISPATCHED'
  const typedCarrier = carrier.trim()
  const typedTracking = trackingNumber.trim()

  const handleSave = async () => {
    setFeedback(null)

    // Carrier and tracking travel together or not at all. Both typed is a
    // parcel going some other way; neither is a dispatch on the NZ Post label,
    // which the server reads the references from. One alone would either be
    // refused or overwrite the label's carrier.
    if (isDispatching && Boolean(typedCarrier) !== Boolean(typedTracking)) {
      setFeedback(
        liveLabel
          ? 'Error: Clear both carrier fields to dispatch on the NZ Post label, or fill in both for another courier.'
          : 'Error: Give both the carrier and the tracking number, or create the NZ Post label first.'
      )
      return
    }

    setIsSubmitting(true)
    try {
      await onStatusUpdate(order.id, selectedStatus, {
        ...(isDispatching && typedCarrier && typedTracking
          ? { carrier: typedCarrier, trackingNumber: typedTracking }
          : {}),
        // Only when edited: resending an unchanged value is harmless, but an
        // untouched empty field must not wipe instructions set elsewhere.
        ...(deliveryNotes.trim() !== (order.deliveryNotes ?? '').trim()
          ? { deliveryNotes: deliveryNotes.trim() }
          : {}),
      })
      setFeedback('Order updated successfully!')
      setTimeout(() => {
        onClose()
      }, 700)
    } catch (err: unknown) {
      setFeedback(
        `Error: ${toApiError(err).message || 'Failed to update order'}`
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const statuses: { id: OrderStatus; label: string; desc: string }[] = [
    {
      id: 'APPROVED',
      label: 'Approved',
      desc: 'Cleared for production, not started yet',
    },
    {
      id: 'PROCESSING',
      label: 'Processing',
      desc: 'Items picked and packed in the warehouse',
    },
    {
      id: 'DISPATCHED',
      label: 'Dispatched',
      desc: 'Picked up by carrier, transit active',
    },
    {
      id: 'DELIVERED',
      label: 'Delivered',
      desc: 'Signed for and verified at destination site',
    },
  ]

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 100,
          padding: '16px',
        }}
      >
        <motion.div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.2 }}
          className="dialog-cap"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            border: '1px solid #F0E6EC',
            width: '100%',
            maxWidth: '850px',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
            overflow: 'hidden',
          }}
        >
          {/* Modal Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #F5EEF2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            {/* No pink icon tile: the order number and its status already say
                what this dialog is about. */}
            <div style={{ minWidth: 0 }}>
              {/* The status pill is nowrap: beside a long order number it used
                  to push the header wider than the dialog. */}
              <div className="row-wrap" style={{ gap: '10px' }}>
                <h2
                  id={titleId}
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    letterSpacing: '-0.01em',
                    margin: 0,
                  }}
                >
                  {order.orderNumber}
                </h2>
                <StatusPill status={order.status} size="md" />
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: '#6E6781',
                  marginTop: '2px',
                }}
              >
                Created on {formatDateTime(order.createdAt)} • PO:{' '}
                {order.poReference || 'None'}
              </div>
            </div>

            <button
              ref={closeRef}
              className="touch-target"
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                backgroundColor: 'transparent',
                color: '#A39BB3',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Modal Body (Scrollable) */}
          <div
            style={{
              padding: '20px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            {/* Quick Metadata Grid. Three hard columns squeezed each tile to a
                couple of words on a phone. */}
            <div
              className="grid-auto"
              style={{ ['--min']: '180px', gap: '10px' } as React.CSSProperties}
            >
              <div style={{ ...metaTile, minWidth: 0 }}>
                <div style={metaLabel}>Account & site</div>
                <div className="truncate" style={metaValue}>
                  {order.siteName}
                </div>
                <div className="truncate" style={metaSub}>
                  {order.accountName} ({order.siteCode})
                </div>
              </div>

              <div style={{ ...metaTile, minWidth: 0 }}>
                <div style={metaLabel}>Requester / ordering user</div>
                <div className="truncate" style={metaValue}>
                  {order.userName}
                </div>
                {/* An email has nothing to wrap at and used to run past the
                    tile; the full address is on the order page. */}
                <div
                  className="truncate"
                  style={metaSub}
                  title={order.userEmail}
                >
                  {order.userEmail}
                </div>
              </div>

              <div style={{ ...metaTile, minWidth: 0 }}>
                <div style={metaLabel}>Order total</div>
                <div style={{ ...metaValue, fontWeight: 700 }}>
                  {formatMoney(order.totalAmount)}
                </div>
                <div style={metaSub}>{order.itemCount} total units</div>
              </div>
            </div>

            {/* Operational Status Selector Stepper */}
            <div>
              <div style={sectionTitle}>Move this order to:</div>
              {/* Four hard columns made each status card too narrow to read its
                  description on a phone. */}
              <div
                className="grid-auto"
                style={
                  { ['--min']: '160px', gap: '8px' } as React.CSSProperties
                }
              >
                {statuses.map((s) => {
                  const isCurrent = selectedStatus === s.id
                  // The chosen status is marked by a pink hairline, a pink
                  // label and the check; a doubled border and a pink fill on
                  // top of that were the loudest thing in the dialog.
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSelectedStatus(s.id)}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: isCurrent
                          ? '1px solid #F73582'
                          : '1px solid #F0E6EC',
                        backgroundColor: '#FFFFFF',
                        textAlign: 'left',
                        cursor: 'pointer',
                        transition: 'border-color 150ms ease',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.82rem',
                          fontWeight: 600,
                          color: isCurrent ? '#F73582' : '#2B253E',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span>{s.label}</span>
                        {isCurrent && <CheckCircle size={14} color="#F73582" />}
                      </div>
                      <div
                        style={{
                          fontSize: '0.7rem',
                          color: '#6E6781',
                          marginTop: '4px',
                          lineHeight: 1.3,
                        }}
                      >
                        {s.desc}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* The NZ Post label: made while the order is packed, and what a
                dispatch takes its tracking references from. */}
            {canManageShipping && (
              <div
                style={{
                  padding: '14px',
                  borderRadius: '10px',
                  border: '1px solid #F0E6EC',
                }}
              >
                <ShipmentLabelPanel orderId={order.id} canManage bare />
              </div>
            )}

            {/* Carrier & Tracking Inputs. With a live NZ Post label these stay
                empty: dispatch reads the references from the label. They are for
                a parcel that goes some other way. */}
            <div className="grid-2" style={{ gap: '14px' }}>
              {isDispatching && (
                <p
                  style={{
                    gridColumn: '1 / -1',
                    margin: 0,
                    fontSize: '0.78rem',
                    color: '#6E6781',
                  }}
                >
                  {liveLabel
                    ? `Leave both fields empty to dispatch on the NZ Post label${labelReferences.length ? ` (${labelReferences.join(', ')})` : ''}. Fill both only if the parcel goes by another courier.`
                    : canManageShipping
                      ? 'No NZ Post label yet. Create one above, or fill in both fields for a parcel going by another courier.'
                      : 'Fill in both fields for the courier this parcel goes with.'}
                </p>
              )}
              <div>
                <label htmlFor={`${fieldId}-carrier`} style={fieldLabel}>
                  Assigned Logistics Carrier
                </label>
                <input
                  id={`${fieldId}-carrier`}
                  type="text"
                  value={carrier}
                  onChange={(e) => setCarrier(e.target.value)}
                  placeholder={
                    liveLabel
                      ? 'From the NZ Post label'
                      : 'e.g. NZ Couriers, hand delivery'
                  }
                  style={fieldInput}
                />
              </div>

              <div>
                <label htmlFor={`${fieldId}-tracking`} style={fieldLabel}>
                  Waybill / Tracking Number
                </label>
                <input
                  id={`${fieldId}-tracking`}
                  type="text"
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder={
                    liveLabel ? 'From the NZ Post label' : 'e.g. NZC123456789'
                  }
                  style={fieldInput}
                />
              </div>

              <div style={{ gridColumn: '1 / -1' }}>
                <label htmlFor={`${fieldId}-notes`} style={fieldLabel}>
                  Delivery Instructions / Dispatch Notes
                </label>
                <textarea
                  id={`${fieldId}-notes`}
                  rows={2}
                  maxLength={500}
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="Notes for courier or recipient..."
                  style={{ ...fieldInput, resize: 'vertical' }}
                />
              </div>
            </div>

            {/* Line Items Table */}
            <div>
              <div style={sectionTitle}>
                Ordered Line Items ({order.lineItems.length}):
              </div>
              {/* Unframed: a bordered table inside the dialog was a card inside
                  a card. The outer columns sit flush with the section title. */}
              <div className="table-scroll">
                <table
                  style={{
                    width: '100%',
                    minWidth: '520px',
                    borderCollapse: 'collapse',
                    textAlign: 'left',
                    fontSize: '0.84rem',
                  }}
                >
                  <thead>
                    <tr>
                      <th style={{ ...th, paddingLeft: 0 }}>
                        Item Description
                      </th>
                      <th style={th}>SKU</th>
                      <th style={{ ...th, textAlign: 'center' }}>Qty</th>
                      <th style={{ ...th, textAlign: 'right' }}>Unit Price</th>
                      <th
                        style={{ ...th, textAlign: 'right', paddingRight: 0 }}
                      >
                        Line Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {order.lineItems.map((item, i) => (
                      <tr
                        key={item.id || i}
                        style={{ borderTop: '1px solid #F5EEF2' }}
                      >
                        <td
                          style={{
                            padding: '12px 14px 12px 0',
                            fontWeight: 600,
                            color: '#2B253E',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            {item.thumbnailUrl && (
                              <img
                                src={item.thumbnailUrl}
                                alt={item.productName}
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '6px',
                                  objectFit: 'cover',
                                }}
                              />
                            )}
                            <div>
                              <div>{item.productName}</div>
                              {item.packSize && (
                                <div
                                  style={{
                                    fontSize: '0.72rem',
                                    color: '#A39BB3',
                                  }}
                                >
                                  {item.packSize}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            color: '#6E6781',
                            fontFamily: 'monospace',
                            fontSize: '0.78rem',
                          }}
                        >
                          {item.sku}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            textAlign: 'center',
                            color: '#2B253E',
                          }}
                        >
                          {item.qty}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            textAlign: 'right',
                            color: '#6E6781',
                          }}
                        >
                          {formatMoney(item.unitPrice)}
                        </td>
                        <td
                          style={{
                            padding: '12px 0 12px 14px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: '#2B253E',
                          }}
                        >
                          {formatMoney(item.lineTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {feedback && (
              <div
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: feedback.includes('Error')
                    ? '#FEF2F2'
                    : '#ECFDF5',
                  color: feedback.includes('Error') ? '#DC2626' : '#3F9C68',
                  fontSize: '0.84rem',
                  fontWeight: 500,
                }}
              >
                {feedback}
              </div>
            )}
          </div>

          {/* Modal Footer. Print Slip stays on the left, apart from the pair
              that closes the dialog; Cancel and Apply sit right, 8px apart. */}
          {/* Three buttons in one unwrapping row pushed Apply off the edge of a
              phone; the row wraps instead. */}
          <div
            className="row-wrap"
            style={{
              padding: '14px 20px',
              borderTop: '1px solid #F5EEF2',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <button
              className="touch-target"
              type="button"
              onClick={() => window.print()}
              style={secondaryButton}
            >
              <Printer size={15} />
              <span>Print Slip</span>
            </button>

            <div className="row-wrap" style={{ gap: '8px' }}>
              <button
                className="touch-target"
                type="button"
                onClick={onClose}
                style={secondaryButton}
              >
                Cancel
              </button>
              {/* A pink border rather than none keeps it the same height as
                  Cancel beside it. */}
              <button
                className="touch-target"
                type="button"
                disabled={isSubmitting}
                onClick={handleSave}
                style={{
                  ...secondaryButton,
                  backgroundColor: '#F73582',
                  border: '1px solid #F73582',
                  color: '#FFFFFF',
                  opacity: isSubmitting ? 0.5 : 1,
                }}
              >
                {isSubmitting ? 'Saving...' : 'Apply Status Update'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
