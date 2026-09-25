// src/components/admin/ApprovalTimeline.tsx
'use client'

import type { ReactNode } from 'react'
import type {
  ApprovalRequestView,
  ApprovalStepView,
} from '@/services/data-source/api/approval.types'
import { ApprovalStatusBadge } from './ApprovalStatusBadge'
import { formatDateTime } from '@/lib/format'
import {
  APPROVAL_COLORS,
  approverLabel,
  DECISION_LABELS,
} from './ApprovalShared'

const C = APPROVAL_COLORS

interface TierState {
  label: string
  color: string
  fill: string
}

/** How one tier stands, from its own steps and where the request is. */
function tierState(
  request: ApprovalRequestView,
  tier: number,
  steps: readonly ApprovalStepView[]
): TierState {
  if (steps.some((step) => step.status === 'REJECTED')) {
    return { label: 'Rejected', color: C.danger, fill: C.dangerSoft }
  }
  if (steps.some((step) => step.status === 'CHANGES_REQUESTED')) {
    return { label: 'Changes requested', color: C.accent, fill: C.accentSoft }
  }
  if (steps.every((step) => step.status === 'SKIPPED')) {
    return { label: 'Skipped', color: C.muted, fill: C.hairline }
  }
  if (
    steps.every(
      (step) => step.status === 'APPROVED' || step.status === 'SKIPPED'
    )
  ) {
    return { label: 'Cleared', color: C.success, fill: C.successSoft }
  }
  if (request.status === 'PENDING' && tier === request.currentTier) {
    return { label: 'In review', color: C.warning, fill: C.warningSoft }
  }
  if (request.status === 'PENDING' && tier > request.currentTier) {
    return {
      label: 'Opens when earlier tiers clear',
      color: C.muted,
      fill: C.hairline,
    }
  }
  return { label: 'Not reached', color: C.muted, fill: C.hairline }
}

function decidedVerb(step: ApprovalStepView): string {
  switch (step.status) {
    case 'APPROVED':
    case 'REJECTED':
    case 'CHANGES_REQUESTED':
      return DECISION_LABELS[step.status]
    default:
      return 'Decided'
  }
}

/**
 * The tiers of an approval, lowest first, and every step in each.
 *
 * `renderOpenStep` is where a screen puts the decision form; it is only called
 * for the steps the API marks as open.
 */
export function ApprovalTimeline({
  request,
  currentUserId,
  userNames,
  renderOpenStep,
}: {
  request: ApprovalRequestView
  currentUserId?: string
  userNames?: ReadonlyMap<string, string>
  renderOpenStep?: (step: ApprovalStepView) => ReactNode
}) {
  if (request.steps.length === 0) {
    return (
      <div style={{ fontSize: '0.82rem', color: C.muted }}>
        No approval steps were raised for this request.
      </div>
    )
  }

  const byTier = new Map<number, ApprovalStepView[]>()
  for (const step of request.steps) {
    const list = byTier.get(step.tier) ?? []
    list.push(step)
    byTier.set(step.tier, list)
  }
  const tiers = [...byTier.entries()].sort(([a], [b]) => a - b)

  return (
    <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {tiers.map(([tier, steps], index) => {
        const state = tierState(request, tier, steps)
        const isLast = index === tiers.length - 1

        return (
          <li
            key={tier}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px minmax(0, 1fr)',
              columnGap: '12px',
            }}
          >
            {/* The marker and the rule down to the next tier. */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
              }}
            >
              <div
                aria-hidden
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: state.fill,
                  color: state.color,
                  border: `1px solid ${state.color}33`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.78rem',
                  flexShrink: 0,
                }}
              >
                {tier}
              </div>
              {!isLast && (
                <div
                  style={{
                    width: '2px',
                    flex: 1,
                    minHeight: '16px',
                    backgroundColor: C.border,
                    margin: '4px 0',
                  }}
                />
              )}
            </div>

            <div style={{ paddingBottom: isLast ? 0 : '18px', minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: '8px',
                  minHeight: '28px',
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontWeight: 700,
                    fontSize: '0.86rem',
                    color: C.text,
                    lineHeight: '28px',
                  }}
                >
                  Tier {tier}
                </span>
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: state.color,
                  }}
                >
                  {state.label}
                </span>
              </div>

              {steps.map((step) => (
                <div
                  key={step.id}
                  style={{
                    marginTop: '8px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: `1px solid ${step.isOpen ? '#F9C3DA' : C.border}`,
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          color: C.text,
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {approverLabel(step, { currentUserId, userNames })}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: C.muted }}>
                        {step.approverUserId
                          ? 'Addressed to a named person'
                          : 'Any holder of the role may decide'}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {step.isOpen && (
                        <span
                          style={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: C.accent,
                            backgroundColor: C.accentSoft,
                            borderRadius: '9999px',
                            padding: '2px 8px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Open for decision
                        </span>
                      )}
                      <ApprovalStatusBadge status={step.status} size="sm" />
                    </div>
                  </div>

                  {step.decidedAt && (
                    <div
                      style={{
                        fontSize: '0.76rem',
                        color: C.secondary,
                        marginTop: '6px',
                      }}
                    >
                      {decidedVerb(step)} by{' '}
                      <strong style={{ fontWeight: 600, color: C.text }}>
                        {step.decidedByName ??
                          (step.decidedById === currentUserId
                            ? 'you'
                            : 'unknown')}
                      </strong>{' '}
                      · {formatDateTime(step.decidedAt)}
                    </div>
                  )}

                  {step.comment && (
                    <blockquote
                      style={{
                        margin: '8px 0 0',
                        padding: '8px 10px',
                        backgroundColor: C.fill,
                        borderLeft: `3px solid ${C.border}`,
                        borderRadius: '6px',
                        color: C.text,
                        fontSize: '0.8rem',
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {step.comment}
                    </blockquote>
                  )}

                  {step.isOpen && renderOpenStep?.(step)}
                </div>
              ))}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
