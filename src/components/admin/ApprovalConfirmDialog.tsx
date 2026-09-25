// src/components/admin/ApprovalConfirmDialog.tsx
'use client'

import type { ReactNode } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  APPROVAL_COLORS,
  dangerSolidButton,
  disabledLook,
  errorBanner,
  primaryButton,
  secondaryButton,
} from './ApprovalShared'

/**
 * A yes/no for the decisions that are hard to take back: refusing an order,
 * sending it back, retiring a rule.
 *
 * Cannot be dismissed while the request is in flight — closing it then would
 * leave the result with nowhere to be shown.
 */
export function ApprovalConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  tone = 'primary',
  isPending = false,
  error,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean
  title: string
  message: ReactNode
  confirmLabel: string
  tone?: 'primary' | 'danger'
  isPending?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const close = () => {
    if (!isPending) onCancel()
  }

  return (
    <Modal isOpen={isOpen} onClose={close} title={title} maxWidth="480px">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div
          style={{
            fontSize: '0.86rem',
            color: APPROVAL_COLORS.secondary,
            lineHeight: 1.5,
          }}
        >
          {message}
        </div>

        {error && (
          <div role="alert" style={errorBanner}>
            <span>{error}</span>
          </div>
        )}

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <button
            type="button"
            onClick={close}
            disabled={isPending}
            style={{ ...secondaryButton, ...disabledLook(isPending) }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            style={{
              ...(tone === 'danger' ? dangerSolidButton : primaryButton),
              ...disabledLook(isPending),
            }}
          >
            {isPending ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
