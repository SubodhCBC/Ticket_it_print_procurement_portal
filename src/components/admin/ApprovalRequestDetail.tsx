// src/components/admin/ApprovalRequestDetail.tsx
'use client'

import { useState, type ReactNode } from 'react'
import { ApprovalArtwork } from '@/components/approvals/ApprovalArtwork'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import type {
  ApprovalDecision,
  ApprovalRequestView,
} from '@/services/data-source/api/approval.types'
import { StatusPill } from './StatusPill'
import { ApprovalDecisionForm } from './ApprovalDecisionForm'
import { ApprovalStatusBadge } from './ApprovalStatusBadge'
import { ApprovalTimeline } from './ApprovalTimeline'
import {
  APPROVAL_COLORS,
  formatDateTime,
  formatMoney,
  maxTier,
  successBanner,
  warningBanner,
} from './ApprovalShared'

const C = APPROVAL_COLORS

/** What to tell the approver once their decision has landed. */
function outcomeNotice(
  before: ApprovalRequestView,
  after: ApprovalRequestView,
  decision: ApprovalDecision
): string {
  switch (after.status) {
    case 'APPROVED':
      return `${after.orderNumber} is approved. ${after.requestedByName} has been told.`
    case 'REJECTED':
      return `${after.orderNumber} is rejected. ${after.requestedByName} has been told.`
    case 'CHANGES_REQUESTED':
      return `${after.orderNumber} has gone back to ${after.requestedByName} for changes.`
    case 'PENDING':
      return after.currentTier !== before.currentTier
        ? `Recorded. ${after.orderNumber} has moved on to tier ${after.currentTier}.`
        : `Recorded. Tier ${after.currentTier} is still waiting on other approvers.`
    default:
      return `Decision recorded (${decision.toLowerCase().replace('_', ' ')}).`
  }
}

/**
 * One approval: the order it is for, its tiers, and — for someone who may act
 * — the decision form on each open step.
 *
 * Shared by the queue's drawer and the order page's panel, so both say the same
 * thing and refuse the same way.
 */
export function ApprovalRequestDetail({
  request,
  canAct,
  showSummary = true,
  onDecided,
}: {
  request: ApprovalRequestView
  canAct: boolean
  showSummary?: boolean
  onDecided?: (updated: ApprovalRequestView, decision: ApprovalDecision) => void
}) {
  const { user } = useAuth()
  const [notice, setNotice] = useState<string | null>(null)

  const hasOpenStep = request.steps.some((step) => step.isOpen)

  const handleDecided = (
    updated: ApprovalRequestView,
    decision: ApprovalDecision
  ) => {
    setNotice(outcomeNotice(request, updated, decision))
    onDecided?.(updated, decision)
  }

  const summary: { label: string; value: ReactNode }[] = [
    {
      label: 'Order',
      value: (
        <Link
          href={`/admin/orders/${request.orderId}`}
          style={{
            color: C.accent,
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
          }}
        >
          {request.orderNumber}
          <ExternalLink size={12} />
        </Link>
      ),
    },
    {
      label: 'Order status',
      value: <StatusPill status={request.orderStatus} size="sm" />,
    },
    {
      label: 'Branch',
      value: `${request.siteName} (${request.siteCode})`,
    },
    { label: 'Requested by', value: request.requestedByName },
    { label: 'PO number', value: request.poNumber ?? '—' },
    { label: 'Order total', value: formatMoney(request.orderTotal) },
    ...(request.totalAtRequest !== request.orderTotal
      ? [
          {
            label: 'Total when raised',
            value: formatMoney(request.totalAtRequest),
          },
        ]
      : []),
    {
      label: 'Tier',
      value:
        request.status === 'PENDING'
          ? `${request.currentTier} of ${maxTier(request)}`
          : `${maxTier(request)} in total`,
    },
    { label: 'Raised', value: formatDateTime(request.createdAt) },
    ...(request.completedAt
      ? [{ label: 'Closed', value: formatDateTime(request.completedAt) }]
      : []),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {showSummary && (
        <div
          style={{
            padding: '14px',
            borderRadius: '10px',
            backgroundColor: C.fill,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              marginBottom: '10px',
            }}
          >
            <span
              style={{ fontSize: '0.8rem', fontWeight: 600, color: C.text }}
            >
              Approval request
            </span>
            <ApprovalStatusBadge status={request.status} />
          </div>
          {/* What is being approved: the ordered artwork itself. */}
          <div style={{ marginBottom: '12px' }}>
            <ApprovalArtwork
              orderId={request.orderId}
              lines={request.lines}
              size={72}
            />
          </div>
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'max-content minmax(0, 1fr)',
              columnGap: '16px',
              rowGap: '6px',
              margin: 0,
              fontSize: '0.8rem',
            }}
          >
            {summary.map((row) => (
              <div key={row.label} style={{ display: 'contents' }}>
                <dt style={{ color: C.muted }}>{row.label}</dt>
                <dd
                  style={{
                    margin: 0,
                    color: C.text,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {notice && (
        <div role="status" style={successBanner}>
          <span>{notice}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => setNotice(null)}
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
        </div>
      )}

      {hasOpenStep && !canAct && (
        <div style={warningBanner}>
          <span>
            You can see this approval but not decide it — that needs the
            approval permission.
          </span>
        </div>
      )}

      <div>
        <div
          style={{
            fontSize: '0.84rem',
            fontWeight: 700,
            color: C.text,
            marginBottom: '10px',
          }}
        >
          Approval steps
        </div>
        <ApprovalTimeline
          request={request}
          currentUserId={user?.id}
          renderOpenStep={
            canAct
              ? (step) => (
                  <ApprovalDecisionForm
                    request={request}
                    step={step}
                    onDecided={handleDecided}
                  />
                )
              : undefined
          }
        />
      </div>
    </div>
  )
}
