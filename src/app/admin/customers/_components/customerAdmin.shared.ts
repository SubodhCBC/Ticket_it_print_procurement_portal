import { useState, type CSSProperties } from 'react'
import { ApiError } from '@/services/api.service'
import type { UserRole } from '@/types'
import type { ManagedUserType } from '@/types/customers-admin'

/**
 * Styles and helpers shared by the customer-administration screens.
 *
 * Kept apart from the components so that file exports components only.
 */

export const palette = {
  text: '#2B253E',
  secondary: '#6E6781',
  muted: '#A39BB3',
  label: '#5C566E',
  border: '#F0E6EC',
  divider: '#F5EEF2',
  page: '#FAF6F8',
  accent: '#F73582',
  accentSoft: '#FDE8F1',
  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  success: '#3F9C68',
  successSoft: '#EAF6EF',
} as const

export const cardStyle: CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: `1px solid ${palette.border}`,
}

export const labelStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: palette.label,
  marginBottom: '6px',
}

export const hintStyle: CSSProperties = {
  fontSize: '0.72rem',
  color: palette.muted,
  marginTop: '4px',
  lineHeight: 1.4,
}

export const sectionTitleStyle: CSSProperties = {
  fontWeight: 700,
  fontSize: '0.9rem',
  color: palette.text,
  margin: 0,
}

export function fieldStyle(disabled = false): CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 12px',
    borderRadius: '10px',
    border: `1px solid ${palette.border}`,
    fontSize: '0.84rem',
    backgroundColor: disabled ? palette.page : '#FFFFFF',
    color: disabled ? palette.secondary : palette.text,
    cursor: disabled ? 'not-allowed' : undefined,
  }
}

export type ButtonTone = 'primary' | 'secondary' | 'danger'

export function buttonStyle(tone: ButtonTone, disabled = false): CSSProperties {
  const tones: Record<ButtonTone, CSSProperties> = {
    primary: {
      backgroundColor: palette.accent,
      color: '#FFFFFF',
      border: `1px solid ${palette.accent}`,
    },
    secondary: {
      backgroundColor: '#FFFFFF',
      color: palette.text,
      border: `1px solid ${palette.border}`,
    },
    danger: {
      backgroundColor: palette.danger,
      color: '#FFFFFF',
      border: `1px solid ${palette.danger}`,
    },
  }

  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    padding: '8px 14px',
    borderRadius: '10px',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    whiteSpace: 'nowrap',
    ...tones[tone],
  }
}

/**
 * The message to show for a failed request.
 *
 * The API's own message, plus the per-field issues when validation failed —
 * "Request validation failed" alone does not tell anyone what to fix.
 */
export function errorMessage(error: unknown): string {
  if (!error) return ''

  if (error instanceof ApiError) {
    const issues = error.details?.issues
    if (Array.isArray(issues) && issues.length > 0) {
      const lines = issues
        .map((issue: unknown) => {
          if (typeof issue !== 'object' || issue === null) return null
          const { path, message } = issue as {
            path?: unknown
            message?: unknown
          }
          if (typeof message !== 'string') return null
          return typeof path === 'string' && path.length > 0
            ? `${path}: ${message}`
            : message
        })
        .filter((line): line is string => line !== null)

      if (lines.length > 0) return `${error.message} — ${lines.join('; ')}`
    }
    return error.message
  }

  // Not an ApiError: a transport or programming fault. Its text is written for
  // a developer, so it goes to the console and the reader gets a sentence they
  // can act on.
  console.error('Customer admin request failed:', error)
  return 'That did not go through. Check your connection and try again — if it keeps happening, contact support.'
}

/** The API's money format: up to ten digits and two decimals, as a string. */
export const MONEY_PATTERN = /^\d{1,10}(\.\d{1,2})?$/

export function toMoneyInput(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return ''
  // A form field's value, not a label: two decimals and nothing else, so what
  // the admin sees is exactly what is POSTed back. Not `formatMoney` — an input
  // cannot hold "$1,500.00".
  return typeof value === 'number' ? value.toFixed(2) : value
}

/** "1500" and "1500.00" are the same amount; a blank is not an amount. */
export function sameMoney(a: string, b: string): boolean {
  const left = a.trim()
  const right = b.trim()
  if (left === right) return true
  if (!left || !right) return false
  return (
    MONEY_PATTERN.test(left) &&
    MONEY_PATTERN.test(right) &&
    Number(left) === Number(right)
  )
}

// Money and dates are formatted by `@/lib/format`; import them from there.

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Admin',
  HEAD_OFFICE: 'Head office',
  SITE_USER: 'Site user',
}

export const USER_TYPE_LABELS: Record<ManagedUserType, string> = {
  EXISTING: 'Ticket-IT user',
  NEW: 'Portal user',
  EXTERNAL: 'External',
}

/**
 * The last non-null value, so a drawer or dialog keeps its content on screen
 * while it animates closed after its subject has been cleared.
 *
 * Derived state set during render — React's documented pattern for "remember
 * something from a previous render" — rather than an effect or a ref.
 */
export function useRetained<T>(value: T | null): T | null {
  const [retained, setRetained] = useState<T | null>(value)
  if (value !== null && value !== retained) setRetained(value)
  return value ?? retained
}
