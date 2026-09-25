// src/components/admin/ApprovalShared.tsx
//
// Styles and pure helpers shared by the approval screens. No components live
// here, so the file stays a plain module for Fast Refresh.

import type { CSSProperties } from 'react'
import { ApiError } from '@/services/api.service'
import type {
  ApprovalPortalRole,
  ApprovalRequestView,
  ApprovalStepView,
} from '@/services/data-source/api/approval.types'
import type { User } from '@/types/auth'

export const APPROVAL_COLORS = {
  text: '#2B253E',
  secondary: '#6E6781',
  muted: '#A39BB3',
  border: '#F0E6EC',
  hairline: '#F5EEF2',
  page: '#FAF6F8',
  fill: '#FCF7FA',
  accent: '#F73582',
  accentSoft: '#FDE8F1',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  warning: '#B45309',
  warningSoft: '#FFFBEB',
  success: '#3F9C68',
  successSoft: '#ECFDF5',
} as const

const C = APPROVAL_COLORS

/** The shared card: hairline border and a soft shadow, as on the admin pages. */
export const approvalCard: CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: `1px solid ${C.border}`,
}

export const approvalCardTitle: CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: C.text,
  letterSpacing: '-0.01em',
  margin: 0,
}

/** A column label: grey, regular weight, no filled band behind it. */
export const approvalTh: CSSProperties = {
  padding: '10px 14px',
  color: C.muted,
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}

export const approvalThEdge: CSSProperties = {
  ...approvalTh,
  padding: '10px 20px',
}

const buttonBase: CSSProperties = {
  borderRadius: '10px',
  padding: '8px 14px',
  fontSize: '0.82rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
}

export const primaryButton: CSSProperties = {
  ...buttonBase,
  backgroundColor: C.accent,
  color: '#FFFFFF',
  border: '1px solid transparent',
}

export const secondaryButton: CSSProperties = {
  ...buttonBase,
  backgroundColor: '#FFFFFF',
  color: C.text,
  border: `1px solid ${C.border}`,
}

export const destructiveButton: CSSProperties = {
  ...buttonBase,
  backgroundColor: '#FFFFFF',
  color: C.danger,
  border: '1px solid #FECACA',
}

export const dangerSolidButton: CSSProperties = {
  ...buttonBase,
  backgroundColor: C.danger,
  color: '#FFFFFF',
  border: '1px solid transparent',
}

/** Dims a button and blocks the pointer while something is in flight. */
export function disabledLook(disabled: boolean): CSSProperties {
  return disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}
}

export const fieldLabel: CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
  display: 'block',
  marginBottom: '6px',
}

export const fieldControl: CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: `1px solid ${C.border}`,
  fontSize: '0.84rem',
  backgroundColor: '#FFFFFF',
  color: C.text,
  outline: 'none',
  boxSizing: 'border-box',
}

export const fieldHint: CSSProperties = {
  fontSize: '0.72rem',
  color: C.muted,
  marginTop: '4px',
}

export const fieldError: CSSProperties = {
  fontSize: '0.74rem',
  color: C.danger,
  fontWeight: 500,
  marginTop: '4px',
}

export const bannerBase: CSSProperties = {
  padding: '10px 14px',
  borderRadius: '10px',
  fontSize: '0.82rem',
  fontWeight: 500,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: '12px',
}

export const errorBanner: CSSProperties = {
  ...bannerBase,
  backgroundColor: C.dangerSoft,
  color: C.danger,
}

export const successBanner: CSSProperties = {
  ...bannerBase,
  backgroundColor: C.successSoft,
  color: C.success,
}

export const warningBanner: CSSProperties = {
  ...bannerBase,
  backgroundColor: C.warningSoft,
  color: C.warning,
}

export const emptyState: CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  color: C.muted,
  fontSize: '0.84rem',
}

// --- Labels -----------------------------------------------------------------

export const ROLE_LABELS: Record<ApprovalPortalRole, string> = {
  ADMIN: 'Administrator',
  HEAD_OFFICE: 'Head office',
  SITE_USER: 'Site user',
}

export const DECISION_LABELS = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CHANGES_REQUESTED: 'Changes requested',
} as const

// --- Formatting -------------------------------------------------------------
//
// Money and dates are formatted by `@/lib/format`; import them from there.

/** "3d", "5h", "12m" — how long something has been waiting. */
export function formatAge(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'

  const minutes = Math.max(0, Math.floor((now - then) / 60_000))
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.floor(hours / 24)}d`
}

/**
 * The message to show for a failed request.
 *
 * The API's refusals are written for the person reading them — "An order
 * cannot be approved by the person who raised it." — so they are shown as they
 * come rather than replaced with something generic.
 */
export function errorMessage(
  error: unknown,
  fallback = 'Something went wrong.'
): string {
  if (error instanceof ApiError) return error.message || fallback
  if (error instanceof Error) return error.message || fallback
  return fallback
}

export function isApiStatus(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.status === status
}

/** Who a step is addressed to, in words. */
export function approverLabel(
  step: Pick<ApprovalStepView, 'approverRole' | 'approverUserId'>,
  options?: { currentUserId?: string; userNames?: ReadonlyMap<string, string> }
): string {
  if (step.approverUserId) {
    if (step.approverUserId === options?.currentUserId) return 'You'
    const name = options?.userNames?.get(step.approverUserId)
    return name ?? `Named approver (${step.approverUserId})`
  }
  if (step.approverRole)
    return `Any ${ROLE_LABELS[step.approverRole].toLowerCase()}`
  return 'No approver'
}

/**
 * Whether the server is likely to accept this user's decision on a step.
 *
 * Mirrors `canDecideStep` in the approval engine, and is advisory only: the
 * actions stay available and the server's refusal is what gets shown. This is
 * just so the reason is visible before the click.
 */
export function predictDecisionRefusal(
  request: Pick<ApprovalRequestView, 'requestedById'>,
  step: Pick<ApprovalStepView, 'approverRole' | 'approverUserId'>,
  user: Pick<User, 'id' | 'role'> | null
): string | null {
  if (!user) return null
  if (user.id === request.requestedById) {
    return 'You raised this order, so someone else has to decide it.'
  }
  if (step.approverUserId) {
    return step.approverUserId === user.id
      ? null
      : 'This step is addressed to a named approver.'
  }
  if (step.approverRole) {
    return step.approverRole === user.role || user.role === 'ADMIN'
      ? null
      : `This step is addressed to the ${ROLE_LABELS[step.approverRole].toLowerCase()} role.`
  }
  return 'This step has no approver.'
}

/** The highest tier on a request — "tier 1 of 2". */
export function maxTier(
  request: Pick<ApprovalRequestView, 'steps' | 'currentTier'>
): number {
  return request.steps.reduce(
    (highest, step) => Math.max(highest, step.tier),
    request.currentTier
  )
}
