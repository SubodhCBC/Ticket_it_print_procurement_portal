// src/components/admin/ApprovalStatusBadge.tsx
'use client'

import type {
  ApprovalRequestStatus,
  ApprovalStepStatus,
} from '@/services/data-source/api/approval.types'

/**
 * An approval or step status, said once.
 *
 * Separate from `StatusPill`, which knows the order lifecycle: it has no
 * "Changes requested" or "Skipped", and its PENDING is styled as a fault.
 */
const STYLES: Record<
  ApprovalRequestStatus | ApprovalStepStatus,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  PENDING: {
    bg: '#FFFBEB',
    text: '#B45309',
    border: 'rgba(245, 158, 11, 0.35)',
    dot: '#F59E0B',
    label: 'Pending',
  },
  APPROVED: {
    bg: '#ECFDF5',
    text: '#3F9C68',
    border: 'rgba(63, 156, 104, 0.3)',
    dot: '#3F9C68',
    label: 'Approved',
  },
  REJECTED: {
    bg: '#FEF2F2',
    text: '#DC2626',
    border: 'rgba(220, 38, 38, 0.25)',
    dot: '#DC2626',
    label: 'Rejected',
  },
  CHANGES_REQUESTED: {
    bg: '#FDE8F1',
    text: '#C0226A',
    border: 'rgba(247, 53, 130, 0.25)',
    dot: '#F73582',
    label: 'Changes requested',
  },
  CANCELLED: {
    bg: '#F5EEF2',
    text: '#6E6781',
    border: 'rgba(110, 103, 129, 0.25)',
    dot: '#A39BB3',
    label: 'Cancelled',
  },
  SKIPPED: {
    bg: '#F5EEF2',
    text: '#A39BB3',
    border: 'rgba(163, 155, 179, 0.3)',
    dot: '#DCD3E0',
    label: 'Skipped',
  },
}

export function ApprovalStatusBadge({
  status,
  size = 'md',
}: {
  status: ApprovalRequestStatus | ApprovalStepStatus
  size?: 'sm' | 'md'
}) {
  const style = STYLES[status] ?? {
    bg: '#F5EEF2',
    text: '#6E6781',
    border: 'rgba(110, 103, 129, 0.25)',
    dot: '#A39BB3',
    label: status,
  }
  const small = size === 'sm'

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: style.bg,
        color: style.text,
        border: `1px solid ${style.border}`,
        borderRadius: '9999px',
        padding: small ? '2px 8px' : '3px 9px',
        fontSize: small ? '0.7rem' : '0.74rem',
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: small ? 5 : 6,
          height: small ? 5 : 6,
          borderRadius: '50%',
          backgroundColor: style.dot,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {style.label}
    </span>
  )
}
