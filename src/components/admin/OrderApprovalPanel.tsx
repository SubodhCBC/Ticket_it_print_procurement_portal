// src/components/admin/OrderApprovalPanel.tsx
'use client'

import { useAuth } from '@/hooks/useAuth'
import { useOrderApproval } from '@/hooks/useApprovals'
import { ApprovalRequestDetail } from './ApprovalRequestDetail'
import { ApprovalStatusBadge } from './ApprovalStatusBadge'
import { formatMoney, formatDateTime } from '@/lib/format'
import {
  APPROVAL_COLORS,
  approvalCard,
  approvalCardTitle,
  errorBanner,
  errorMessage,
  isApiStatus,
  maxTier,
  secondaryButton,
} from './ApprovalShared'

const C = APPROVAL_COLORS

/**
 * The approval an order is waiting on, on the order's own page.
 *
 * Renders nothing for an order that never needed approving (the API answers
 * 404) and nothing while it loads, so the common case costs the page no space
 * and no flash.
 */
export function OrderApprovalPanel({ orderId }: { orderId: string }) {
  const { hasPermission } = useAuth()
  const { approval, isLoading, error, refetch } = useOrderApproval(orderId)

  if (isLoading) return null

  if (error) {
    // Not ours to see: say nothing rather than show a fault.
    if (isApiStatus(error, 403) || isApiStatus(error, 404)) return null

    return (
      <section style={{ ...approvalCard, padding: '20px' }}>
        <div style={{ ...approvalCardTitle, marginBottom: '12px' }}>
          Approval
        </div>
        <div role="alert" style={{ ...errorBanner, alignItems: 'center' }}>
          <span>
            Could not load this order&apos;s approval: {errorMessage(error)}
          </span>
          <button
            className="touch-target"
            type="button"
            onClick={() => void refetch()}
            style={secondaryButton}
          >
            Retry
          </button>
        </div>
      </section>
    )
  }

  if (!approval) return null

  const subtitle = [
    approval.status === 'PENDING'
      ? `Waiting on tier ${approval.currentTier} of ${maxTier(approval)}`
      : approval.completedAt
        ? `Closed ${formatDateTime(approval.completedAt)}`
        : null,
    `raised ${formatDateTime(approval.createdAt)}`,
    approval.totalAtRequest !== approval.orderTotal
      ? `total when raised ${formatMoney(approval.totalAtRequest)}`
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <section
      aria-label="Order approval"
      style={{ ...approvalCard, padding: '20px' }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '12px',
          flexWrap: 'wrap',
          marginBottom: '16px',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={approvalCardTitle}>Approval</div>
          <div
            style={{
              fontSize: '0.76rem',
              color: C.secondary,
              marginTop: '2px',
            }}
          >
            {subtitle}
          </div>
        </div>
        <ApprovalStatusBadge status={approval.status} />
      </div>

      <ApprovalRequestDetail
        request={approval}
        canAct={hasPermission('APPROVAL_ACT')}
        showSummary={false}
      />
    </section>
  )
}
