'use client'

import React from 'react'
import { Check, ChevronLeft, ChevronRight, TriangleAlert } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { FieldError } from '@/components/ui/FormField'
import {
  buttonStyle,
  errorMessage,
  hintStyle,
  labelStyle,
  palette,
} from './customerAdmin.shared'

// --- Status -------------------------------------------------------------------

const STATUS_TONES: Record<
  string,
  { bg: string; text: string; dot: string; label: string }
> = {
  ACTIVE: {
    bg: palette.successSoft,
    text: palette.success,
    dot: palette.success,
    label: 'Active',
  },
  ACCEPTED: {
    bg: palette.successSoft,
    text: palette.success,
    dot: palette.success,
    label: 'Accepted',
  },
  PENDING: {
    bg: palette.accentSoft,
    text: palette.accent,
    dot: palette.accent,
    label: 'Pending',
  },
  INVITED: {
    bg: palette.accentSoft,
    text: palette.accent,
    dot: palette.accent,
    label: 'Invited',
  },
  INACTIVE: {
    bg: palette.divider,
    text: palette.secondary,
    dot: palette.muted,
    label: 'Inactive',
  },
  EXPIRED: {
    bg: palette.divider,
    text: palette.secondary,
    dot: palette.muted,
    label: 'Expired',
  },
  SUSPENDED: {
    bg: palette.dangerSoft,
    text: palette.danger,
    dot: palette.danger,
    label: 'Suspended',
  },
  DISABLED: {
    bg: palette.dangerSoft,
    text: palette.danger,
    dot: palette.danger,
    label: 'Disabled',
  },
  REVOKED: {
    bg: palette.dangerSoft,
    text: palette.danger,
    dot: palette.danger,
    label: 'Revoked',
  },
}

/** Account, site, user and invitation statuses, one vocabulary of colour. */
export function CustomerStatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONES[status] ?? {
    bg: palette.divider,
    text: palette.label,
    dot: palette.muted,
    label: status,
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: tone.bg,
        color: tone.text,
        borderRadius: '9999px',
        padding: '3px 9px',
        fontSize: '0.72rem',
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: tone.dot,
          flexShrink: 0,
        }}
      />
      {tone.label}
    </span>
  )
}

/** A neutral tag: role, user type, address kind. */
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: '0.7rem',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '9999px',
        backgroundColor: palette.divider,
        color: palette.label,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  )
}

// --- Feedback -------------------------------------------------------------------

export function ErrorNote({
  error,
  message,
}: {
  error?: unknown
  message?: string | null
}) {
  const text = message || (error ? errorMessage(error) : '')
  if (!text) return null

  return (
    <div
      role="alert"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: '10px',
        backgroundColor: palette.dangerSoft,
        border: '1px solid rgba(220, 38, 38, 0.25)',
        color: palette.danger,
        fontSize: '0.8rem',
        lineHeight: 1.4,
      }}
    >
      <TriangleAlert size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span>{text}</span>
    </div>
  )
}

export function SuccessNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        padding: '10px 12px',
        borderRadius: '10px',
        backgroundColor: palette.successSoft,
        border: '1px solid rgba(63, 156, 104, 0.25)',
        color: palette.success,
        fontSize: '0.8rem',
        lineHeight: 1.4,
      }}
    >
      <Check size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
      <span>{children}</span>
    </div>
  )
}

/** Loading, empty and restricted states inside a card. */
export function StateMessage({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '32px',
        textAlign: 'center',
        color: palette.muted,
        fontSize: '0.84rem',
      }}
    >
      {children}
    </div>
  )
}

// --- Forms ------------------------------------------------------------------------

/**
 * One labelled control.
 *
 * `error` puts the message under this field instead of in the drawer's banner
 * at the top, where a reader had to work out which of six boxes it meant. The
 * hint stands down while an error is showing, so the two never stack.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: React.ReactNode
  error?: string | null
  children: React.ReactNode
}) {
  return (
    <div>
      <label htmlFor={htmlFor} style={labelStyle}>
        {label}
      </label>
      {children}
      {error ? (
        <FieldError id={htmlFor ? `${htmlFor}-error` : undefined}>
          {error}
        </FieldError>
      ) : hint ? (
        <div style={hintStyle}>{hint}</div>
      ) : null}
    </div>
  )
}

export function CheckboxField({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string
  label: React.ReactNode
  checked: boolean
  disabled?: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: '0.82rem',
        color: disabled ? palette.secondary : palette.text,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: palette.accent }}
      />
      <span>{label}</span>
    </label>
  )
}

// --- Actions ----------------------------------------------------------------------

export function RowActionButton({
  icon,
  label,
  onClick,
  disabled,
  title,
  tone = 'default',
}: {
  icon?: React.ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
  title?: string
  tone?: 'default' | 'danger'
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className="touch-target"
      onClick={(e) => {
        // Rows open a drawer on click; the action must not also do that.
        e.stopPropagation()
        onClick()
      }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '5px 9px',
        borderRadius: '8px',
        border: `1px solid ${
          tone === 'danger' ? 'rgba(220, 38, 38, 0.25)' : palette.border
        }`,
        backgroundColor: '#FFFFFF',
        color: tone === 'danger' ? palette.danger : palette.text,
        fontSize: '0.76rem',
        fontWeight: 600,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

/**
 * A destructive action, confirmed.
 *
 * Cannot be dismissed while the request is in flight, so the outcome is not
 * lost behind a closed dialog; the API's error stays beside the button.
 */
export function ConfirmActionModal({
  isOpen,
  title,
  confirmLabel,
  pendingLabel = 'Working…',
  isPending,
  error,
  confirmDisabled,
  onConfirm,
  onClose,
  children,
}: {
  isOpen: boolean
  title: string
  confirmLabel: string
  pendingLabel?: string
  isPending: boolean
  error?: unknown
  confirmDisabled?: boolean
  onConfirm: () => void
  onClose: () => void
  children: React.ReactNode
}) {
  const close = () => {
    if (!isPending) onClose()
  }
  const blocked = isPending || Boolean(confirmDisabled)

  return (
    <Modal isOpen={isOpen} onClose={close} title={title} maxWidth="480px">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
          fontSize: '0.84rem',
          color: palette.text,
          lineHeight: 1.5,
        }}
      >
        {children}
        <ErrorNote error={error} />
        <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={close}
            disabled={isPending}
            style={buttonStyle('secondary', isPending)}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={blocked}
            style={buttonStyle('danger', blocked)}
          >
            {isPending ? pendingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Previous / next over a list.
 *
 * Sites, users and invitations are cursor-paginated, so there is no total to
 * show — only whether there is a next page.
 */
export function Pager({
  page,
  totalPages,
  isFetching,
  onPageChange,
}: {
  page: number
  totalPages: number
  isFetching?: boolean
  onPageChange: (page: number) => void
}) {
  if (page <= 1 && totalPages <= 1) return null

  const canBack = page > 1 && !isFetching
  const canForward = page < totalPages && !isFetching
  const pagerButton = (enabled: boolean): React.CSSProperties => ({
    ...buttonStyle('secondary', !enabled),
    padding: '5px 10px',
    fontSize: '0.76rem',
  })

  return (
    <div
      className="row-wrap"
      style={{
        justifyContent: 'flex-end',
        padding: '10px 16px',
        borderTop: `1px solid ${palette.divider}`,
        fontSize: '0.78rem',
        color: palette.secondary,
      }}
    >
      <span>
        Page {page}
        {isFetching ? ' · loading…' : ''}
      </span>
      <button
        type="button"
        disabled={!canBack}
        className="touch-target"
        onClick={() => onPageChange(page - 1)}
        style={pagerButton(canBack)}
      >
        <ChevronLeft size={14} />
        Previous
      </button>
      <button
        type="button"
        disabled={!canForward}
        className="touch-target"
        onClick={() => onPageChange(page + 1)}
        style={pagerButton(canForward)}
      >
        Next
        <ChevronRight size={14} />
      </button>
    </div>
  )
}
