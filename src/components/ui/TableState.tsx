// src/components/ui/TableState.tsx
'use client'

import { useEffect } from 'react'
import { AlertTriangle, type LucideIcon } from 'lucide-react'

/**
 * The two things a table has to say when it has no rows to draw.
 *
 * Before these, most tables branched on `isLoading` and then went straight to
 * `rows.map(...)`. That gave a seeded-but-quiet screen a bare column header
 * over white space, and — worse — it gave a *failed* request exactly the same
 * appearance, so a backend hiccup during a demo read as an empty database.
 *
 * Both blocks sit INSIDE the card or table they belong to, at roughly the
 * height of a few rows, so the surrounding layout does not jump between the
 * skeleton, the message and the real data.
 */

/* 16px of side padding so the message still reads at 360px, and long words
   (an account name, a filter value) break rather than widen the table. */
const box: React.CSSProperties = {
  padding: '32px 16px',
  textAlign: 'center',
  fontSize: '0.84rem',
  overflowWrap: 'anywhere',
}

/**
 * Nothing to show, and nothing is wrong. One line for what would appear here
 * and, where it helps, one for what to do next.
 */
export function EmptyState({
  icon: Icon,
  title,
  detail,
  action,
}: {
  icon?: LucideIcon
  title: string
  detail?: string
  action?: React.ReactNode
}) {
  return (
    <div style={{ ...box, color: '#A39BB3' }}>
      {Icon && (
        <Icon size={24} color="#DCD3E0" style={{ margin: '0 auto 8px auto' }} />
      )}
      <div style={{ fontWeight: 600, color: '#6E6781' }}>{title}</div>
      {detail && (
        <div style={{ marginTop: '4px', color: '#A39BB3' }}>{detail}</div>
      )}
      {action && <div style={{ marginTop: '12px' }}>{action}</div>}
    </div>
  )
}

/**
 * The request failed. The reader is told that the data could not be *loaded* —
 * not that there is none — and is given the retry.
 *
 * The error object is never printed: a raw `AxiosError` on screen is noise to
 * the reader and a stack trace in front of a customer. It goes to the console,
 * where whoever is debugging will look for it.
 */
export function ErrorState({
  title = 'This could not be loaded',
  detail = 'The data could not be loaded. Nothing has been lost — try again.',
  error,
  onRetry,
}: {
  title?: string
  detail?: string
  error?: unknown
  onRetry?: () => void
}) {
  // In an effect rather than in render: a failing query re-renders more than
  // once, and the console should carry the failure once per failure.
  useEffect(() => {
    if (error !== undefined && error !== null) {
      console.error(`[${title}]`, error)
    }
  }, [error, title])

  return (
    <div role="alert" style={{ ...box, color: '#6E6781' }}>
      <AlertTriangle
        size={24}
        color="#DC2626"
        style={{ margin: '0 auto 8px auto' }}
      />
      <div style={{ fontWeight: 600, color: '#B91C1C' }}>{title}</div>
      <div style={{ marginTop: '4px' }}>{detail}</div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="touch-target"
          style={{
            marginTop: '12px',
            padding: '6px 14px',
            borderRadius: '10px',
            border: '1px solid #F0E6EC',
            backgroundColor: '#FFFFFF',
            color: '#2B253E',
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      )}
    </div>
  )
}
