// src/app/head-office/approvals/page.tsx
'use client'

import { SkeletonList } from '@/components/ui/Skeleton'
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CheckCircle2,
  Building2,
  Search,
  DollarSign,
  CreditCard,
} from 'lucide-react'

// Shared button styles. One primary per card: whichever step comes next.
const button: React.CSSProperties = {
  borderRadius: '10px',
  padding: '8px 14px',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const primaryButton: React.CSSProperties = {
  ...button,
  backgroundColor: '#F73582',
  color: '#FFFFFF',
  border: '1px solid transparent',
}

const secondaryButton: React.CSSProperties = {
  ...button,
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  border: '1px solid #F0E6EC',
}

const destructiveButton: React.CSSProperties = {
  ...button,
  backgroundColor: '#FFFFFF',
  color: '#DC2626',
  border: '1px solid #FECACA',
}

const fieldLabel: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
  display: 'block',
  marginBottom: '6px',
}

const field: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  fontSize: '0.84rem',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
}
import { useAuth } from '@/hooks/useAuth'
import { usePendingApprovals, useOrderMutations } from '@/hooks/useOrders'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { StatusPill } from '@/components/admin/StatusPill'
import { ApprovalArtwork } from '@/components/approvals/ApprovalArtwork'
import { TextField } from '@/components/ui/FormField'
import type { Order, CorporatePaymentMethod } from '@/types'

export default function HeadOfficeApprovalsPage() {
  const { user } = useAuth()
  const accountId = user?.accountId ?? ''
  // The one thing no toolkit class can say: the financial column's rule sits
  // to its left beside the artwork, and above it once the card has stacked.
  const isPhone = useMediaQuery('(max-width: 767px)')

  const { orders, isLoading, refetch } = usePendingApprovals(accountId)
  const { approveOrder, rejectOrder, requestChanges, payOrder, isPending } =
    useOrderMutations()

  const [searchQuery, setSearchQuery] = useState('')
  const [siteFilter] = useState('ALL')
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null)
  const [actionType, setActionType] = useState<
    'APPROVE' | 'REJECT' | 'CHANGES' | 'PAY' | null
  >(null)
  const [actionNotes, setActionNotes] = useState('')
  const [selectedPaymentMethod, setSelectedPaymentMethod] =
    useState<CorporatePaymentMethod>('CORPORATE_INVOICE')
  /**
   * The reference the payment actually carries on the corporate statement.
   * It starts empty and stays empty until the approver types it: this box used
   * to open pre-filled with a `CORP-STMT-…` number invented by `Math.random()`,
   * which showed an approver a bank reference nobody had issued and recorded it
   * against the order when they confirmed.
   */
  const [paymentRefNumber, setPaymentRefNumber] = useState('')
  const [paymentRefError, setPaymentRefError] = useState<string | null>(null)
  const [feedbackMessage, setFeedbackMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const filteredOrders = orders.filter((o) => {
    const matchesSite = siteFilter === 'ALL' || o.siteId === siteFilter
    const matchesSearch =
      searchQuery.trim() === '' ||
      o.orderNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (o.poReference &&
        o.poReference.toLowerCase().includes(searchQuery.toLowerCase())) ||
      o.siteName.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesSite && matchesSearch
  })

  const totalPendingValue = orders.reduce((sum, o) => sum + o.totalAmount, 0)

  const handleOpenAction = (
    order: Order,
    type: 'APPROVE' | 'REJECT' | 'CHANGES' | 'PAY'
  ) => {
    setSelectedOrder(order)
    setActionType(type)
    if (type === 'APPROVE') {
      setActionNotes(
        'Approved by Head Office Financial Controller for procurement.'
      )
    } else if (type === 'PAY') {
      setPaymentRefNumber('')
      setPaymentRefError(null)
    } else {
      setActionNotes('')
    }
  }

  const handleConfirmAction = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedOrder || !actionType) return

    // A settled payment is only auditable if the reference on it is the real
    // one, so an empty box refuses here rather than being filled in for them.
    const trimmedRef = paymentRefNumber.trim()
    if (actionType === 'PAY' && !trimmedRef) {
      setPaymentRefError(
        'Enter the payment reference from the corporate statement or card authorisation.'
      )
      return
    }

    try {
      const approverName = user?.name || 'Elena Rostova (Head Office)'

      if (actionType === 'APPROVE') {
        await approveOrder(selectedOrder.id, approverName, actionNotes)
        setFeedbackMessage({
          type: 'success',
          text: `PO ${selectedOrder.poReference || selectedOrder.orderNumber} approved. Ready for corporate payment.`,
        })
      } else if (actionType === 'CHANGES') {
        await requestChanges(
          selectedOrder.id,
          approverName,
          actionNotes || 'Please adjust the site address and quantities.'
        )
        setFeedbackMessage({
          type: 'error',
          text: `Changes requested for PO ${selectedOrder.poReference || selectedOrder.orderNumber}. Feedback sent to site user.`,
        })
      } else if (actionType === 'PAY') {
        // The payer is the bearer token's answer, not the browser's.
        await payOrder(selectedOrder.id, selectedPaymentMethod, trimmedRef)
        setFeedbackMessage({
          type: 'success',
          text: `Corporate payment settled for PO ${selectedOrder.poReference || selectedOrder.orderNumber}. Order sent to print production!`,
        })
      } else if (actionType === 'REJECT') {
        await rejectOrder(
          selectedOrder.id,
          approverName,
          actionNotes || 'Budget threshold exceeded'
        )
        setFeedbackMessage({
          type: 'error',
          text: `PO ${selectedOrder.poReference || selectedOrder.orderNumber} rejected. Notification logged.`,
        })
      }

      setSelectedOrder(null)
      setActionType(null)
      setActionNotes('')
      refetch()
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      {/* 1. Header */}
      <div
        className="stack-sm"
        style={{
          justifyContent: 'space-between',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.76rem',
              fontWeight: 500,
              color: '#A39BB3',
              marginBottom: '6px',
            }}
          >
            <Building2 size={14} />
            <span>{user?.organization || 'Your account'} • Head Office</span>
          </div>

          <h1
            style={{
              fontSize: '1.25rem',
              fontWeight: 700,
              color: '#2B253E',
              letterSpacing: '-0.01em',
              margin: 0,
            }}
          >
            Purchase order approvals
          </h1>

          <p
            style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}
          >
            Review customised artwork proofs, approve purchase orders and
            authorise payment so production can start.
          </p>
        </div>

        {/* Queue total — a quiet figure, not a blue tile. */}
        <div
          style={{
            padding: '10px 16px',
            borderRadius: '14px',
            boxShadow:
              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
            backgroundColor: '#FFFFFF',
            border: '1px solid #F0E6EC',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <DollarSign size={16} color="#A39BB3" />
          <div>
            <span
              style={{
                fontSize: '0.74rem',
                color: '#A39BB3',
                display: 'block',
                fontWeight: 500,
              }}
            >
              Queue Total ({filteredOrders.length} POs)
            </span>
            <span
              style={{
                fontSize: '1.1rem',
                fontWeight: 700,
                color: '#2B253E',
                letterSpacing: '-0.01em',
              }}
            >
              ${totalPendingValue.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {feedbackMessage && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          style={{
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor:
              feedbackMessage.type === 'success' ? '#ECFDF5' : '#FEF2F2',
            color: feedbackMessage.type === 'success' ? '#3F9C68' : '#DC2626',
            fontSize: '0.84rem',
            fontWeight: 500,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <span>{feedbackMessage.text}</span>
          <button
            onClick={() => setFeedbackMessage(null)}
            className="touch-target"
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            ✕
          </button>
        </motion.div>
      )}

      {/* 2. Search & Filter Bar */}
      <div
        className="row-wrap"
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          border: '1px solid #F0E6EC',
          padding: '14px 16px',
          justifyContent: 'space-between',
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: 1,
            minWidth: '180px',
            maxWidth: '440px',
          }}
        >
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: '#A39BB3',
            }}
          />
          <input
            type="text"
            className="touch-target"
            placeholder="Search by PO #, Order ID, or Site Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              ...field,
              padding: '8px 12px 8px 36px',
              outline: 'none',
            }}
          />
        </div>

        <span style={{ fontSize: '0.8rem', color: '#6E6781', fontWeight: 500 }}>
          Showing <strong>{filteredOrders.length}</strong> purchase orders
          awaiting financial review
        </span>
      </div>

      {/* 3. PO Queue List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {isLoading ? (
          <SkeletonList count={4} label="Loading the approvals queue" />
        ) : filteredOrders.length === 0 ? (
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              boxShadow:
                '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
              border: '1px solid #F0E6EC',
              padding: '32px',
              textAlign: 'center',
            }}
          >
            {/* The check is the status signal here, so it keeps its colour. */}
            <CheckCircle2
              size={24}
              color="#3F9C68"
              style={{ display: 'block', margin: '0 auto 10px' }}
            />
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#2B253E',
                margin: 0,
              }}
            >
              All Purchase Orders Clear
            </h3>
            <p
              style={{
                fontSize: '0.84rem',
                color: '#A39BB3',
                margin: '4px 0 0',
              }}
            >
              There are currently no purchase orders awaiting approval or
              payment for your corporate account.
            </p>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isApproved = order.status === 'APPROVED'

            return (
              <div
                key={order.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  // Approved POs (awaiting payment) keep a slightly darker
                  // hairline; the status pill carries the meaning.
                  border: isApproved
                    ? '1px solid #DCD3E0'
                    : '1px solid #F0E6EC',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Top Row: PO Meta & Status */}
                <div
                  className="row-wrap"
                  style={{ justifyContent: 'space-between' }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      flexWrap: 'wrap',
                      gap: '4px 12px',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: '#2B253E',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      {order.poReference || order.orderNumber}
                    </span>
                    <span
                      style={{
                        fontSize: '0.84rem',
                        fontWeight: 500,
                        color: '#2B253E',
                      }}
                    >
                      {order.siteName} ({order.siteCode})
                    </span>
                    <span style={{ fontSize: '0.78rem', color: '#A39BB3' }}>
                      Requested by{' '}
                      <strong style={{ fontWeight: 600, color: '#6E6781' }}>
                        {order.userName}
                      </strong>{' '}
                      • {new Date(order.createdAt).toLocaleDateString()}
                    </span>
                  </div>

                  <StatusPill status={order.status} />
                </div>

                {/* Middle Row: Artwork Thumbnail, Specifications & Financials.
                    A subtle fill rather than a second bordered card. */}
                <div
                  className="row-wrap"
                  style={{
                    backgroundColor: '#FCF7FA',
                    borderRadius: '10px',
                    padding: '14px',
                  }}
                >
                  {/* The order's own artwork and first line. */}
                  <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                    <ApprovalArtwork orderId={order.id} />
                    {order.deliveryNotes && (
                      <div
                        style={{
                          fontSize: '0.76rem',
                          color: '#A39BB3',
                          marginTop: '2px',
                        }}
                      >
                        Delivery Instructions: &quot;{order.deliveryNotes}&quot;
                      </div>
                    )}
                  </div>

                  {/* Financials & Payer Note */}
                  <div
                    style={{
                      flex: '1 1 180px',
                      minWidth: 0,
                      textAlign: isPhone ? 'left' : 'right',
                      ...(isPhone
                        ? {
                            width: '100%',
                            borderTop: '1px solid #F0E6EC',
                            paddingTop: '10px',
                          }
                        : {
                            borderLeft: '1px solid #F0E6EC',
                            paddingLeft: '16px',
                          }),
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: '#A39BB3',
                        display: 'block',
                        fontWeight: 500,
                      }}
                    >
                      Total Amount (Corporate Statement)
                    </span>
                    <span
                      style={{
                        fontSize: '1.1rem',
                        fontWeight: 700,
                        color: '#2B253E',
                        letterSpacing: '-0.01em',
                      }}
                    >
                      ${order.totalAmount.toFixed(2)}
                    </span>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        color: '#3F9C68',
                        display: 'block',
                        fontWeight: 600,
                        marginTop: '2px',
                      }}
                    >
                      {order.paymentStatus === 'PAID'
                        ? '✓ Paid'
                        : 'HO Payment Required'}
                    </span>
                  </div>
                </div>

                {/* Bottom Row: Actions */}
                <div
                  className="row-wrap"
                  style={{ justifyContent: 'flex-end' }}
                >
                  <button
                    onClick={() => handleOpenAction(order, 'REJECT')}
                    className="touch-target"
                    style={destructiveButton}
                  >
                    Reject PO
                  </button>

                  <button
                    onClick={() => handleOpenAction(order, 'CHANGES')}
                    className="touch-target"
                    style={secondaryButton}
                  >
                    Request Changes
                  </button>

                  {!isApproved && (
                    <button
                      onClick={() => handleOpenAction(order, 'APPROVE')}
                      className="touch-target"
                      style={primaryButton}
                    >
                      Approve PO
                    </button>
                  )}

                  {/* MAKE PAYMENT (Head Office Pays). Primary only once the PO
                      is approved — until then approval is the next step. */}
                  <button
                    onClick={() => handleOpenAction(order, 'PAY')}
                    className="touch-target"
                    style={{
                      ...(isApproved ? primaryButton : secondaryButton),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    <CreditCard size={16} />
                    Make Payment (${order.totalAmount.toFixed(2)})
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* 4. Action Confirmation / Corporate Payment Modal */}
      <AnimatePresence>
        {selectedOrder && actionType && (
          <div
            className="page-pad"
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
              paddingBlock: '16px',
            }}
          >
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="dialog-cap"
              style={{
                backgroundColor: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #F0E6EC',
                padding: '20px',
                maxWidth: '560px',
                width: '100%',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
              }}
            >
              <form
                onSubmit={handleConfirmAction}
                // The reference field owns its own error, under the field.
                // Without this the browser's bubble gets there first.
                noValidate
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '16px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    gap: '12px',
                    minWidth: 0,
                  }}
                >
                  <h3
                    style={{
                      fontSize: '1rem',
                      fontWeight: 700,
                      color: '#2B253E',
                      margin: 0,
                    }}
                  >
                    {actionType === 'PAY' &&
                      'Step 11: Head Office Corporate Payment'}
                    {actionType === 'APPROVE' &&
                      'Step 10: Approve Purchase Order'}
                    {actionType === 'CHANGES' &&
                      'Request Changes from Site User'}
                    {actionType === 'REJECT' && 'Decline Purchase Order'}
                  </h3>
                  <button
                    type="button"
                    aria-label="Close"
                    className="touch-target"
                    onClick={() => {
                      setSelectedOrder(null)
                      setActionType(null)
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '16px',
                      color: '#A39BB3',
                      cursor: 'pointer',
                      flexShrink: 0,
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#FCF7FA',
                    fontSize: '0.84rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: '#2B253E' }}>
                    PO #{selectedOrder.poReference || selectedOrder.orderNumber}
                  </div>
                  <div style={{ color: '#6E6781', marginTop: '2px' }}>
                    Branch: {selectedOrder.siteName} • Total:{' '}
                    <strong>${selectedOrder.totalAmount.toFixed(2)}</strong>
                  </div>
                </div>

                {actionType === 'PAY' ? (
                  /* Corporate Payment Form */
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '14px',
                    }}
                  >
                    <div>
                      <label style={fieldLabel}>
                        Select Corporate Payment Method
                      </label>
                      <select
                        value={selectedPaymentMethod}
                        className="touch-target"
                        onChange={(e) =>
                          setSelectedPaymentMethod(
                            e.target.value as CorporatePaymentMethod
                          )
                        }
                        style={field}
                      >
                        <option value="CORPORATE_INVOICE">
                          Corporate Net-30 Account Invoice
                        </option>
                        <option value="PURCHASING_CARD">
                          Corporate Purchasing Card (P-Card •••• 9021)
                        </option>
                        <option value="CORPORATE_ACH">
                          Direct Corporate ACH / BACS Transfer
                        </option>
                        <option value="PREAPPROVED_CREDIT">
                          Pre-Approved Commercial Credit Facility
                        </option>
                      </select>
                    </div>

                    <TextField
                      id="payment-reference"
                      name="paymentReference"
                      label="Payment reference / authorisation code"
                      type="text"
                      isRequired
                      autoComplete="off"
                      value={paymentRefNumber}
                      onChange={(e) => {
                        setPaymentRefNumber(e.target.value)
                        if (paymentRefError) setPaymentRefError(null)
                      }}
                      error={paymentRefError}
                      placeholder="e.g. CORP-STMT-483927"
                      hint="The reference as it appears on the corporate statement or card authorisation — not a number generated here."
                    />

                    <div
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        backgroundColor: '#ECFDF5',
                        fontSize: '0.78rem',
                        color: '#3F9C68',
                      }}
                    >
                      Authorising this payment will immediately settle PO #
                      {selectedOrder.poReference} and transition the order to{' '}
                      <strong>&quot;Paid → In Production&quot;</strong>.
                    </div>
                  </div>
                ) : (
                  <div>
                    <label style={fieldLabel}>Approval / Feedback Notes</label>
                    <textarea
                      rows={3}
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      placeholder="Add comments or instructions..."
                      style={{ ...field, outline: 'none' }}
                    />
                  </div>
                )}

                <div
                  className="row-wrap"
                  style={{ justifyContent: 'flex-end', marginTop: '4px' }}
                >
                  <button
                    type="button"
                    className="touch-target"
                    onClick={() => {
                      setSelectedOrder(null)
                      setActionType(null)
                    }}
                    style={secondaryButton}
                  >
                    Cancel
                  </button>

                  {/* Solid red only for confirming a rejection; every other
                      confirmation is the page's one primary action. */}
                  <button
                    type="submit"
                    disabled={isPending}
                    className="touch-target"
                    style={{
                      ...primaryButton,
                      backgroundColor:
                        actionType === 'REJECT' ? '#DC2626' : '#F73582',
                      opacity: isPending ? 0.5 : 1,
                    }}
                  >
                    {isPending
                      ? 'Processing...'
                      : actionType === 'PAY'
                        ? 'Confirm & Settle Payment'
                        : actionType === 'APPROVE'
                          ? 'Confirm Approval'
                          : actionType === 'CHANGES'
                            ? 'Send Feedback'
                            : 'Confirm Rejection'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}
