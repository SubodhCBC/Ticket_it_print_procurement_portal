// src/components/admin/StatusPill.tsx
'use client'

import type { OrderStatus, ProductStatus } from '@/types'

interface StatusPillProps {
  status:
    | OrderStatus
    | ProductStatus
    | 'ACTIVE'
    | 'INACTIVE'
    | 'SUSPENDED'
    | 'SETTLED'
    | 'PENDING'
    | 'DISPUTED'
    | string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * A status, said once. The colour carries it, so the pill needs no glow on its
 * dot and no pop-in animation: a table of thirty orders used to animate thirty
 * pills on every page load, which read as the data changing.
 */
export function StatusPill({ status, size = 'md' }: StatusPillProps) {
  const getStatusStyles = () => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return {
          bg: '#FFFBEB',
          text: '#B45309',
          border: 'rgba(245, 158, 11, 0.35)',
          dot: '#F59E0B',
          label: 'Pending Approval',
        }
      case 'CHANGES_REQUESTED':
        return {
          bg: '#FFF7ED',
          text: '#C2410C',
          border: 'rgba(234, 88, 12, 0.3)',
          dot: '#F97316',
          label: 'Changes Requested',
        }
      case 'APPROVED':
        return {
          bg: '#ECFDF5',
          text: '#047857',
          border: 'rgba(16, 185, 129, 0.3)',
          dot: '#10B981',
          label: 'Approved',
        }
      case 'REJECTED':
      case 'CANCELLED':
        return {
          bg: '#FEF2F2',
          text: '#B91C1C',
          border: 'rgba(239, 68, 68, 0.3)',
          dot: '#EF4444',
          label: status === 'REJECTED' ? 'Rejected' : 'Cancelled',
        }
      case 'RECEIVED':
        return {
          bg: '#FFF0F6',
          text: '#F73582',
          border: 'rgba(247, 53, 130, 0.25)',
          dot: '#F73582',
          label: 'Received',
        }
      case 'PROCESSING':
        return {
          bg: '#FEF3C7',
          text: '#D97706',
          border: 'rgba(217, 119, 6, 0.25)',
          dot: '#F59E0B',
          label: 'Processing',
        }
      case 'DISPATCHED':
        return {
          bg: '#E0F2FE',
          text: '#0284C7',
          border: 'rgba(2, 132, 199, 0.25)',
          dot: '#0EA5E9',
          label: 'Dispatched',
        }
      case 'DELIVERED':
      case 'ACTIVE':
      case 'SETTLED':
        return {
          bg: '#EAF8EF',
          text: '#228B53',
          border: 'rgba(88, 185, 125, 0.3)',
          dot: '#58B97D',
          label:
            status === 'DELIVERED'
              ? 'Delivered'
              : status === 'ACTIVE'
                ? 'Active'
                : 'Settled',
        }
      case 'DRAFT':
        return {
          bg: '#EEF2FF',
          text: '#4338CA',
          border: 'rgba(99, 102, 241, 0.25)',
          dot: '#6366F1',
          label: 'Draft',
        }
      case 'UNAVAILABLE':
      case 'PENDING':
        return {
          bg: '#FEF2F2',
          text: '#DC2626',
          border: 'rgba(220, 38, 38, 0.25)',
          dot: '#EF4444',
          label: status === 'UNAVAILABLE' ? 'Unavailable' : 'Pending',
        }
      case 'SUPERSEDED':
      case 'INACTIVE':
      case 'SUSPENDED':
        return {
          bg: '#F5EEF2',
          text: '#6E6781',
          border: 'rgba(100, 116, 139, 0.25)',
          dot: '#A39BB3',
          label:
            status === 'SUPERSEDED'
              ? 'Superseded'
              : status === 'INACTIVE'
                ? 'Inactive'
                : 'Suspended',
        }
      default:
        return {
          bg: '#F5EEF2',
          text: '#5C566E',
          border: 'rgba(148, 163, 184, 0.25)',
          dot: '#A39BB3',
          label: readableStatus(status),
        }
    }
  }

  const config = getStatusStyles()

  const sizeStyles = {
    sm: { padding: '2px 8px', fontSize: '0.7rem', dotSize: 5 },
    md: { padding: '3px 9px', fontSize: '0.74rem', dotSize: 6 },
    lg: { padding: '4px 11px', fontSize: '0.82rem', dotSize: 6 },
  }[size]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        backgroundColor: config.bg,
        color: config.text,
        border: `1px solid ${config.border}`,
        borderRadius: '9999px',
        padding: sizeStyles.padding,
        fontSize: sizeStyles.fontSize,
        fontWeight: 600,
        lineHeight: 1.2,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          width: sizeStyles.dotSize,
          height: sizeStyles.dotSize,
          borderRadius: '50%',
          backgroundColor: config.dot,
          display: 'inline-block',
          flexShrink: 0,
        }}
      />
      {config.label}
    </span>
  )
}

/** "PARTIALLY_SHIPPED" → "Partially Shipped", for a status with no entry above. */
function readableStatus(status: string): string {
  return status
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
