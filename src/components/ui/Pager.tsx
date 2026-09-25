// src/components/ui/Pager.tsx
'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Previous / next for a server-paged list. Renders nothing for a single page,
 * so a short list does not grow a control it cannot use.
 */
export function Pager({
  page,
  totalPages,
  total,
  isFetching = false,
  onChange,
  style,
}: {
  page: number
  totalPages: number
  /** Rows across every page, when the list knows it. */
  total?: number
  isFetching?: boolean
  onChange: (page: number) => void
  style?: React.CSSProperties
}) {
  if (totalPages <= 1) return null

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        flexWrap: 'wrap',
        padding: '12px 20px',
        fontSize: '0.8rem',
        color: '#6E6781',
        ...style,
      }}
    >
      <span>
        Page {page} of {totalPages}
        {total !== undefined ? ` · ${total.toLocaleString()} in total` : ''}
        {isFetching ? ' · updating…' : ''}
      </span>
      <div style={{ display: 'flex', gap: '6px' }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          style={button}
        >
          <ChevronLeft size={14} /> Previous
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          style={button}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

const button: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '6px 10px',
  borderRadius: '8px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
}
