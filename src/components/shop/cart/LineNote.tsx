// src/components/shop/cart/LineNote.tsx

/**
 * A line's note as the buyer wrote it (SOW F-19), read-only — on the order
 * pages, where fulfilment reads what to do with this one item.
 */
export function LineNote({
  note,
  style,
}: {
  note?: string | null
  style?: React.CSSProperties
}) {
  if (!note) return null
  return (
    <div
      style={{
        fontSize: '0.74rem',
        fontWeight: 400,
        color: '#6E6781',
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        maxWidth: '360px',
        ...style,
      }}
    >
      <span style={{ fontWeight: 600, color: '#5C566E' }}>Note: </span>
      {note}
    </div>
  )
}
