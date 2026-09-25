// src/components/admin/RateCardStatusModal.tsx
'use client'

import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useRateCardAdminMutations } from '@/hooks/usePricing'
import { toApiError } from '@/services'
import type { RateCard } from '@/types'
import { formatDate } from '@/lib/format'

interface RateCardStatusModalProps {
  rateCard: RateCard
  targetStatus: 'ACTIVE' | 'ARCHIVED'
  onClose: () => void
}

/**
 * Activates or archives a card, with an optional reason for the audit entry.
 *
 * The 409 on activation (another active card for this account overlaps the
 * period) is shown here, beside the button, in the server's own words.
 */
export function RateCardStatusModal({
  rateCard,
  targetStatus,
  onClose,
}: RateCardStatusModalProps) {
  const { changeStatus } = useRateCardAdminMutations()
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const isPending = changeStatus.isPending
  const isActivate = targetStatus === 'ACTIVE'

  const period = rateCard.effectiveTo
    ? `${formatDate(rateCard.effectiveFrom, '')} until ${formatDate(rateCard.effectiveTo, '')}`
    : `${formatDate(rateCard.effectiveFrom, '')} with no end date`

  const handleConfirm = async () => {
    setError(null)
    try {
      await changeStatus.mutateAsync({
        id: rateCard.id,
        status: targetStatus,
        reason: reason.trim() || undefined,
      })
      onClose()
    } catch (err) {
      const apiError = toApiError(err)
      setError(
        apiError.status === 409
          ? `Could not activate: ${apiError.message}`
          : apiError.message
      )
    }
  }

  return (
    <Modal
      isOpen
      onClose={isPending ? () => undefined : onClose}
      title={isActivate ? 'Activate rate card' : 'Archive rate card'}
      maxWidth="500px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '0.84rem', color: '#2B253E', lineHeight: 1.5 }}>
          {isActivate ? (
            <>
              <strong>{rateCard.name}</strong> will start pricing orders for{' '}
              <strong>{rateCard.accountName}</strong> from {period}. This is
              refused if another active card for the account covers any part of
              that period.
            </>
          ) : (
            <>
              Archiving <strong>{rateCard.name}</strong> is final. An archived
              card cannot be edited or reactivated.
              {rateCard.status === 'ACTIVE' && (
                <>
                  {' '}
                  <strong>{rateCard.accountName}</strong> falls back to
                  catalogue pricing unless another card is active.
                </>
              )}
            </>
          )}
        </div>

        <div>
          <label
            htmlFor="rc-status-reason"
            style={{
              display: 'block',
              fontSize: '0.78rem',
              fontWeight: 600,
              color: '#5C566E',
              marginBottom: '6px',
            }}
          >
            Reason (optional, recorded in the audit log)
          </label>
          <input
            id="rc-status-reason"
            type="text"
            maxLength={500}
            placeholder={
              isActivate ? 'e.g. Signed 12 Jan' : 'e.g. Renegotiated for 2027'
            }
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              borderRadius: '10px',
              border: '1px solid #F0E6EC',
              fontSize: '0.84rem',
              backgroundColor: '#FFFFFF',
              color: '#2B253E',
            }}
          />
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

        <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            className="touch-target"
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
            className="touch-target"
            onClick={handleConfirm}
            disabled={isPending}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: isActivate ? '#3F9C68' : '#DC2626',
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            {isPending
              ? isActivate
                ? 'Activating...'
                : 'Archiving...'
              : isActivate
                ? 'Activate'
                : 'Archive'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
