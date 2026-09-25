// src/components/admin/RateCardConfirmModal.tsx
'use client'

import React from 'react'
import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'

interface RateCardConfirmModalProps {
  isOpen: boolean
  title: string
  message: React.ReactNode
  confirmLabel: string
  pendingLabel?: string
  isPending: boolean
  /** The server's message, shown beside the button that caused it. */
  error: string | null
  onConfirm: () => void
  onClose: () => void
}

/**
 * A destructive confirmation for the rate card screens.
 *
 * In place of `window.confirm`, so a refusal from the API (an archived card
 * cannot lose a line, say) can be shown where the user just clicked, and the
 * button can stay disabled while the request runs.
 */
export function RateCardConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel,
  pendingLabel = 'Working...',
  isPending,
  error,
  onConfirm,
  onClose,
}: RateCardConfirmModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      // Not dismissable mid-request: closing would hide the outcome.
      onClose={isPending ? () => undefined : onClose}
      title={title}
      maxWidth="460px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <AlertTriangle
            size={18}
            color="#DC2626"
            style={{ flexShrink: 0, marginTop: '2px' }}
          />
          <div
            style={{ fontSize: '0.84rem', color: '#2B253E', lineHeight: 1.5 }}
          >
            {message}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: '#FEF2F2',
              color: '#DC2626',
              fontSize: '0.8rem',
              fontWeight: 500,
            }}
          >
            {error}
          </div>
        )}

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #F0E6EC',
              backgroundColor: '#FFFFFF',
              color: '#2B253E',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#DC2626',
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}
