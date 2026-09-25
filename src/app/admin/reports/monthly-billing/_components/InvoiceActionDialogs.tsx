// src/app/admin/reports/monthly-billing/_components/InvoiceActionDialogs.tsx
'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { InlineAlert } from './invoice-ui'
import {
  controlStyle,
  dangerButton,
  disabledWhen,
  formatMoney,
  labelStyle,
  primaryButton,
  secondaryButton,
  type InvoiceDetail,
} from './invoice-shared'

export type InvoiceAction = 'issue' | 'paid' | 'void' | 'regenerate'

interface ActionShellProps {
  title: string
  message: React.ReactNode
  confirmLabel: string
  pendingLabel: string
  tone: 'primary' | 'danger'
  isPending: boolean
  confirmDisabled?: boolean
  error: string | null
  onConfirm: () => void
  onClose: () => void
  children?: React.ReactNode
}

/**
 * The confirmation every lifecycle step goes through.
 *
 * Not dismissable while the request runs, so the outcome — or the API's
 * refusal — is shown where the user clicked.
 */
function ActionShell({
  title,
  message,
  confirmLabel,
  pendingLabel,
  tone,
  isPending,
  confirmDisabled = false,
  error,
  onConfirm,
  onClose,
  children,
}: ActionShellProps) {
  const blocked = isPending || confirmDisabled

  return (
    <Modal
      isOpen
      onClose={isPending ? () => undefined : onClose}
      title={title}
      maxWidth="480px"
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!blocked) onConfirm()
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
      >
        <div style={{ fontSize: '0.84rem', color: '#2B253E', lineHeight: 1.5 }}>
          {message}
        </div>

        {children}

        {error && <InlineAlert>{error}</InlineAlert>}

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={disabledWhen(secondaryButton, isPending)}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={blocked}
            style={disabledWhen(
              tone === 'danger'
                ? {
                    ...dangerButton,
                    backgroundColor: '#DC2626',
                    border: '1px solid #DC2626',
                    color: '#FFFFFF',
                  }
                : primaryButton,
              blocked
            )}
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}

interface DialogProps {
  invoice: InvoiceDetail
  isPending: boolean
  error: string | null
  onClose: () => void
}

export function IssueInvoiceDialog({
  invoice,
  isPending,
  error,
  onClose,
  onConfirm,
}: DialogProps & { onConfirm: (paymentTermDays: number) => void }) {
  const [days, setDays] = useState('30')
  const parsed = Number(days)
  const valid =
    days.trim() !== '' &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= 365

  return (
    <ActionShell
      title="Issue invoice"
      tone="primary"
      confirmLabel="Issue invoice"
      pendingLabel="Issuing..."
      isPending={isPending}
      confirmDisabled={!valid}
      error={error}
      onClose={onClose}
      onConfirm={() => onConfirm(parsed)}
      message={
        <>
          Issuing allocates an invoice number and freezes this draft for{' '}
          <strong>{invoice.accountName}</strong> at{' '}
          <strong>{formatMoney(invoice.total)}</strong> ({invoice.orderCount}{' '}
          orders). After this the billed figures cannot change — a mistake needs
          a void and a reissue.
        </>
      }
    >
      <div>
        <label htmlFor="invoice-payment-terms" style={labelStyle}>
          Payment terms (days until due)
        </label>
        <input
          id="invoice-payment-terms"
          type="number"
          min={0}
          max={365}
          step={1}
          value={days}
          onChange={(event) => setDays(event.target.value)}
          disabled={isPending}
          style={controlStyle}
        />
        {!valid && (
          <div style={{ fontSize: '0.72rem', color: '#DC2626', marginTop: 4 }}>
            Enter a whole number of days between 0 and 365.
          </div>
        )}
      </div>
    </ActionShell>
  )
}

function todayInputValue(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function MarkPaidDialog({
  invoice,
  isPending,
  error,
  onClose,
  onConfirm,
}: DialogProps & {
  onConfirm: (input: { paymentReference?: string; paidAt?: string }) => void
}) {
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState(todayInputValue)
  const referenceTooLong = reference.trim().length > 120

  return (
    <ActionShell
      title="Mark invoice paid"
      tone="primary"
      confirmLabel="Mark paid"
      pendingLabel="Saving..."
      isPending={isPending}
      confirmDisabled={referenceTooLong}
      error={error}
      onClose={onClose}
      onConfirm={() =>
        onConfirm({
          paymentReference: reference.trim() || undefined,
          // Midday local time, so the date survives the trip to UTC intact.
          paidAt: paidOn
            ? new Date(`${paidOn}T12:00:00`).toISOString()
            : undefined,
        })
      }
      message={
        <>
          Record payment of <strong>{formatMoney(invoice.total)}</strong> for
          invoice <strong>{invoice.invoiceNumber}</strong>.
        </>
      }
    >
      <div>
        <label htmlFor="invoice-paid-at" style={labelStyle}>
          Date payment received
        </label>
        <input
          id="invoice-paid-at"
          type="date"
          value={paidOn}
          max={todayInputValue()}
          onChange={(event) => setPaidOn(event.target.value)}
          disabled={isPending}
          style={controlStyle}
        />
        <div style={{ fontSize: '0.72rem', color: '#A39BB3', marginTop: 4 }}>
          Leave empty to record it as received now.
        </div>
      </div>
      <div>
        <label htmlFor="invoice-payment-reference" style={labelStyle}>
          Payment reference (optional)
        </label>
        <input
          id="invoice-payment-reference"
          type="text"
          value={reference}
          maxLength={120}
          placeholder="e.g. bank transfer reference"
          onChange={(event) => setReference(event.target.value)}
          disabled={isPending}
          style={controlStyle}
        />
      </div>
    </ActionShell>
  )
}

export function VoidInvoiceDialog({
  invoice,
  isPending,
  error,
  onClose,
  onConfirm,
}: DialogProps & { onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()

  return (
    <ActionShell
      title="Void invoice"
      tone="danger"
      confirmLabel="Void invoice"
      pendingLabel="Voiding..."
      isPending={isPending}
      confirmDisabled={trimmed.length === 0 || trimmed.length > 500}
      error={error}
      onClose={onClose}
      onConfirm={() => onConfirm(trimmed)}
      message={
        <>
          Voiding <strong>{invoice.invoiceNumber}</strong> keeps its number but
          cancels it
          {invoice.status === 'PAID' ? ', even though it is marked paid' : ''}.
          Its orders become billable again, so a corrected invoice can be
          generated and issued for {invoice.billingPeriod}. This cannot be
          undone.
        </>
      }
    >
      <div>
        <label htmlFor="invoice-void-reason" style={labelStyle}>
          Reason (required)
        </label>
        <textarea
          id="invoice-void-reason"
          value={reason}
          maxLength={500}
          rows={3}
          placeholder="Why is this invoice being voided?"
          onChange={(event) => setReason(event.target.value)}
          disabled={isPending}
          style={{ ...controlStyle, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ fontSize: '0.72rem', color: '#A39BB3', marginTop: 4 }}>
          {trimmed.length}/500
        </div>
      </div>
    </ActionShell>
  )
}

export function RegenerateDraftDialog({
  invoice,
  isPending,
  error,
  onClose,
  onConfirm,
}: DialogProps & { onConfirm: () => void }) {
  return (
    <ActionShell
      title="Rebuild draft"
      tone="primary"
      confirmLabel="Rebuild draft"
      pendingLabel="Rebuilding..."
      isPending={isPending}
      error={error}
      onClose={onClose}
      onConfirm={onConfirm}
      message={
        <>
          Rebuild this draft from the current billable orders for{' '}
          <strong>{invoice.accountName}</strong> in {invoice.billingPeriod}. Its
          lines are replaced wholesale: orders cancelled since the last run drop
          off, and new billable orders are added.
        </>
      }
    />
  )
}
