// src/components/ui/Pager.tsx
'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatNumber } from '@/lib/format'

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
        gap: '10px 12px',
        flexWrap: 'wrap',
        paddingBlock: '12px',
        fontSize: '0.8rem',
        color: '#6E6781',
        ...style,
      }}
      // .page-pad matches the gutter of the card the pager sits in; the count
      // line and the buttons wrap onto separate rows on a phone rather than
      // pushing "Next" off the edge.
      className="page-pad"
    >
      <span style={{ minWidth: 0, flex: '1 1 auto' }}>
        Page {page} of {totalPages}
        {total !== undefined ? ` · ${formatNumber(total)} in total` : ''}
        {isFetching ? ' · updating…' : ''}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        <button
          type="button"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          className="touch-target"
          style={buttonStyle(page <= 1)}
        >
          <ChevronLeft size={14} /> Previous
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          className="touch-target"
          style={buttonStyle(page >= totalPages)}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  )
}

/**
 * On the first page, "Previous" was still drawn as a live button — full
 * contrast and a pointer cursor — so it invited a click that did nothing.
 */
function buttonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    justifyContent: 'center',
    padding: '6px 10px',
    borderRadius: '8px',
    border: '1px solid #F0E6EC',
    backgroundColor: '#FFFFFF',
    color: disabled ? '#A39BB3' : '#2B253E',
    fontSize: '0.78rem',
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  }
}
