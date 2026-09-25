// src/components/admin/RateCardEditModal.tsx
'use client'

import React, { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useRateCardAdminMutations } from '@/hooks/usePricing'
import { toApiError } from '@/services'
import type { RateCardDetailsPatch } from '@/services/pricing.service'
import type { RateCard } from '@/types'

interface RateCardEditModalProps {
  rateCard: RateCard
  onClose: () => void
}

/** Matches the API's NUMERIC(5,2) rule: up to three digits, two decimals. */
const PERCENT_PATTERN = /^\d{1,3}(\.\d{1,2})?$/

/** An ISO instant as the local calendar date a date input shows. */
function toDateInput(iso?: string): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** A date input's value as local midnight, in ISO. */
function fromDateInput(value: string): string {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day).toISOString()
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
  marginBottom: '6px',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  fontSize: '0.84rem',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
}

const hintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#A39BB3',
  marginTop: '4px',
}

/**
 * Edits a card's own terms: name, notes, validity dates and default discount.
 *
 * Only changed fields are sent. A date the user did not touch is left out, so
 * saving a name does not also move a start time that was set to the minute.
 * The account is not editable: the API refuses to move a contract to another
 * customer. Mount it with `key={rateCard.id}` so the form starts from the card.
 */
export function RateCardEditModal({
  rateCard,
  onClose,
}: RateCardEditModalProps) {
  const { updateDetails } = useRateCardAdminMutations()

  const initialFrom = toDateInput(rateCard.effectiveFrom)
  const initialTo = toDateInput(rateCard.effectiveTo)
  const initialDiscount = String(rateCard.defaultDiscountPct)

  const [name, setName] = useState(rateCard.name)
  const [notes, setNotes] = useState(rateCard.notes ?? '')
  const [effectiveFrom, setEffectiveFrom] = useState(initialFrom)
  const [effectiveTo, setEffectiveTo] = useState(initialTo)
  const [discount, setDiscount] = useState(initialDiscount)
  const [formError, setFormError] = useState<string | null>(null)

  const isPending = updateDetails.isPending

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setFormError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError('A rate card name is required.')
      return
    }
    if (!effectiveFrom) {
      setFormError('A start date is required.')
      return
    }
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      setFormError('The card must end after it starts.')
      return
    }
    const trimmedDiscount = discount.trim()
    if (
      !PERCENT_PATTERN.test(trimmedDiscount) ||
      Number(trimmedDiscount) > 100
    ) {
      setFormError(
        'Default discount must be between 0 and 100, with at most two decimals.'
      )
      return
    }

    const patch: RateCardDetailsPatch = {}
    if (trimmedName !== rateCard.name) patch.name = trimmedName
    const trimmedNotes = notes.trim()
    if (trimmedNotes !== (rateCard.notes ?? '')) {
      patch.notes = trimmedNotes === '' ? null : trimmedNotes
    }
    if (effectiveFrom !== initialFrom) {
      patch.effectiveFrom = fromDateInput(effectiveFrom)
    }
    if (effectiveTo !== initialTo) {
      patch.effectiveTo = effectiveTo ? fromDateInput(effectiveTo) : null
    }
    if (Number(trimmedDiscount) !== rateCard.defaultDiscountPct) {
      patch.defaultDiscountPct = Number(trimmedDiscount)
    }

    if (Object.keys(patch).length === 0) {
      onClose()
      return
    }

    try {
      await updateDetails.mutateAsync({ id: rateCard.id, patch })
      onClose()
    } catch (err) {
      // Includes the 409 when moving an active card's dates onto another
      // active card for the same account.
      setFormError(toApiError(err).message)
    }
  }

  return (
    <Modal
      isOpen
      onClose={isPending ? () => undefined : onClose}
      title="Edit rate card"
      maxWidth="560px"
    >
      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <div style={{ fontSize: '0.78rem', color: '#6E6781' }}>
          Account: <strong>{rateCard.accountName}</strong>. A contract cannot be
          moved to another account. Archive it and create a new card instead.
        </div>

        <div>
          <label htmlFor="rc-edit-name" style={labelStyle}>
            Name *
          </label>
          <input
            id="rc-edit-name"
            type="text"
            required
            maxLength={200}
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '14px',
          }}
        >
          <div>
            <label htmlFor="rc-edit-from" style={labelStyle}>
              Effective from *
            </label>
            <input
              id="rc-edit-from"
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label htmlFor="rc-edit-to" style={labelStyle}>
              Effective to
            </label>
            <input
              id="rc-edit-to"
              type="date"
              value={effectiveTo}
              min={effectiveFrom || undefined}
              onChange={(e) => setEffectiveTo(e.target.value)}
              style={inputStyle}
            />
            <div style={hintStyle}>
              {effectiveTo ? (
                <>
                  Ends at the start of this day.{' '}
                  <button
                    type="button"
                    onClick={() => setEffectiveTo('')}
                    style={{
                      border: 'none',
                      background: 'none',
                      padding: 0,
                      color: '#F73582',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Make open-ended
                  </button>
                </>
              ) : (
                'Blank means open-ended.'
              )}
            </div>
          </div>
          <div>
            <label htmlFor="rc-edit-discount" style={labelStyle}>
              Default discount (%)
            </label>
            <input
              id="rc-edit-discount"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              style={inputStyle}
            />
            <div style={hintStyle}>Applies to products with no line.</div>
          </div>
        </div>

        <div>
          <label htmlFor="rc-edit-notes" style={labelStyle}>
            Notes
          </label>
          <textarea
            id="rc-edit-notes"
            rows={3}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </div>

        {rateCard.status === 'ACTIVE' && (
          <div style={{ fontSize: '0.76rem', color: '#6E6781' }}>
            This card is active. Changes apply to new quotes at once, and dates
            that overlap another active card for this account are refused.
          </div>
        )}

        {formError && (
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
            {formError}
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
            type="submit"
            disabled={isPending}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: '#F73582',
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            {isPending ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
