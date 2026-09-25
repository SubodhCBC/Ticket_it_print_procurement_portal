// src/components/admin/ApprovalDecisionForm.tsx
'use client'

import { useState } from 'react'
import { Check, MessageSquare, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useApprovalDecision } from '@/hooks/useApprovals'
import type {
  ApprovalDecision,
  ApprovalRequestView,
  ApprovalStepView,
} from '@/services/data-source/api/approval.types'
import { ApprovalConfirmDialog } from './ApprovalConfirmDialog'
import {
  APPROVAL_COLORS,
  destructiveButton,
  disabledLook,
  errorBanner,
  errorMessage,
  fieldControl,
  fieldError,
  fieldHint,
  fieldLabel,
  predictDecisionRefusal,
  primaryButton,
  secondaryButton,
  warningBanner,
} from './ApprovalShared'

const C = APPROVAL_COLORS
const COMMENT_MAX = 2000

type Refusal = Exclude<ApprovalDecision, 'APPROVED'>

/**
 * Approve, send back or reject one open step.
 *
 * Approving goes straight through. The other two need a comment — the API and
 * the database both refuse a silent refusal — and a confirmation, because the
 * requester is told the moment it lands.
 */
export function ApprovalDecisionForm({
  request,
  step,
  onDecided,
}: {
  request: ApprovalRequestView
  step: ApprovalStepView
  onDecided?: (updated: ApprovalRequestView, decision: ApprovalDecision) => void
}) {
  const { user } = useAuth()
  const { decide, isPending } = useApprovalDecision()

  const [comment, setComment] = useState('')
  const [confirming, setConfirming] = useState<Refusal | null>(null)
  const [pendingDecision, setPendingDecision] =
    useState<ApprovalDecision | null>(null)
  const [validation, setValidation] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const trimmed = comment.trim()
  const warning = predictDecisionRefusal(request, step, user ?? null)
  const commentId = `approval-comment-${step.id}`

  const submit = async (decision: ApprovalDecision) => {
    setServerError(null)
    setPendingDecision(decision)
    try {
      const updated = await decide({
        stepId: step.id,
        decision,
        ...(trimmed ? { comment: trimmed } : {}),
      })
      setComment('')
      setConfirming(null)
      onDecided?.(updated, decision)
    } catch (error) {
      // Closed rather than left open: the refusal belongs next to the comment
      // box, where the approver can act on it.
      setConfirming(null)
      setServerError(errorMessage(error, 'The decision could not be recorded.'))
    } finally {
      setPendingDecision(null)
    }
  }

  const askToRefuse = (decision: Refusal) => {
    setServerError(null)
    if (!trimmed) {
      setValidation(
        decision === 'REJECTED'
          ? 'Say why — a rejection needs a comment.'
          : 'Say what needs to change — a change request needs a comment.'
      )
      return
    }
    setValidation(null)
    setConfirming(decision)
  }

  return (
    <div
      style={{
        marginTop: '10px',
        padding: '12px',
        borderRadius: '10px',
        backgroundColor: C.fill,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {warning && (
        <div style={{ ...warningBanner, fontSize: '0.78rem' }}>
          <span>{warning} The server has the final say.</span>
        </div>
      )}

      <div>
        <label htmlFor={commentId} style={fieldLabel}>
          Comment{' '}
          <span style={{ fontWeight: 400, color: C.muted }}>
            (required to reject or request changes)
          </span>
        </label>
        <textarea
          id={commentId}
          rows={3}
          maxLength={COMMENT_MAX}
          value={comment}
          disabled={isPending}
          aria-invalid={validation ? true : undefined}
          placeholder="A note for the requester…"
          onChange={(event) => {
            setComment(event.target.value)
            if (validation) setValidation(null)
          }}
          style={{
            ...fieldControl,
            resize: 'vertical',
            fontFamily: 'inherit',
            borderColor: validation ? '#FECACA' : C.border,
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: '8px',
          }}
        >
          {validation ? (
            <span role="alert" style={fieldError}>
              {validation}
            </span>
          ) : (
            <span />
          )}
          <span style={fieldHint}>
            {comment.length}/{COMMENT_MAX}
          </span>
        </div>
      </div>

      {serverError && (
        <div role="alert" style={errorBanner}>
          <span>{serverError}</span>
          <button
            className="touch-target"
            type="button"
            aria-label="Dismiss"
            onClick={() => setServerError(null)}
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

      {/* Reject, Request changes and Approve are each finger targets and must
          stay reachable when they wrap on a phone. */}
      <div
        className="row-wrap"
        style={{ justifyContent: 'flex-end', gap: '8px' }}
      >
        <button
          className="touch-target"
          type="button"
          disabled={isPending}
          onClick={() => askToRefuse('REJECTED')}
          style={{ ...destructiveButton, ...disabledLook(isPending) }}
        >
          <X size={14} />
          Reject
        </button>
        <button
          className="touch-target"
          type="button"
          disabled={isPending}
          onClick={() => askToRefuse('CHANGES_REQUESTED')}
          style={{ ...secondaryButton, ...disabledLook(isPending) }}
        >
          <MessageSquare size={14} />
          Request changes
        </button>
        <button
          className="touch-target"
          type="button"
          disabled={isPending}
          onClick={() => void submit('APPROVED')}
          style={{ ...primaryButton, ...disabledLook(isPending) }}
        >
          <Check size={14} />
          {pendingDecision === 'APPROVED' ? 'Approving…' : 'Approve'}
        </button>
      </div>

      <ApprovalConfirmDialog
        isOpen={confirming !== null}
        title={
          confirming === 'CHANGES_REQUESTED'
            ? `Send ${request.orderNumber} back for changes?`
            : `Reject ${request.orderNumber}?`
        }
        message={
          <>
            <p style={{ margin: 0 }}>
              {confirming === 'CHANGES_REQUESTED'
                ? `The order goes back to ${request.requestedByName} to amend. Its stock stays reserved while they do.`
                : `A rejection ends this approval: later tiers are skipped, the order is marked rejected, its reserved stock is released and ${request.requestedByName} is told.`}
            </p>
            <p
              style={{
                margin: '10px 0 0',
                padding: '8px 10px',
                borderRadius: '8px',
                backgroundColor: C.fill,
                color: C.text,
                whiteSpace: 'pre-wrap',
              }}
            >
              {trimmed}
            </p>
          </>
        }
        confirmLabel={
          confirming === 'CHANGES_REQUESTED'
            ? 'Request changes'
            : 'Reject order'
        }
        tone={confirming === 'CHANGES_REQUESTED' ? 'primary' : 'danger'}
        isPending={isPending}
        onConfirm={() => {
          if (confirming) void submit(confirming)
        }}
        onCancel={() => setConfirming(null)}
      />
    </div>
  )
}
