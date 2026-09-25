// src/components/shop/cart/LineChips.tsx
'use client'

import { optionEntries } from './line-format'

const chip: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: '9999px',
  backgroundColor: '#F5EEF2',
  color: '#5C566E',
  fontSize: '0.72rem',
  fontWeight: 600,
  lineHeight: 1.5,
  whiteSpace: 'nowrap',
}

/**
 * The chosen options — "Finish: Gloss Laminate" — and, for a personalised line,
 * which back it prints with.
 *
 * `showBack` is for lines made from a design. A design line with no back name
 * prints its back blank, so it says so rather than leaving the buyer to guess.
 * Renders nothing when there is nothing to say.
 */
export function LineChips({
  options,
  backName,
  showBack = false,
  style,
}: {
  options?: Record<string, string> | null
  backName?: string | null
  showBack?: boolean
  style?: React.CSSProperties
}) {
  const entries = optionEntries(options)
  if (entries.length === 0 && !showBack) return null

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: '4px',
        ...style,
      }}
    >
      {entries.map(([name, value]) => (
        <span key={name} style={chip}>
          {name}: {value}
        </span>
      ))}
      {showBack && <span style={chip}>Back: {backName ?? 'Blank'}</span>}
    </div>
  )
}
