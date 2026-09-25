// src/components/shop/customise/SidePreview.tsx
'use client'

import type { SidePreviewWithBounds } from '@/lib/design/proof-export'
import type { ReviewSide } from '@/lib/design/review-checks'
import type { PreviewHighlight } from './types'
import { T } from './theme'

interface SidePreviewProps {
  front: SidePreviewWithBounds
  /** Null when the back prints blank. */
  back: SidePreviewWithBounds | null
  backName: string | null
  side: ReviewSide
  onSideChange: (side: ReviewSide) => void
  highlight: PreviewHighlight | null
  /** Stacked layout: a shorter picture so the panel beside it stays in reach. */
  compact: boolean
  templateName: string
}

const pct = (value: number, total: number) =>
  `${((value / Math.max(1, total)) * 100).toFixed(3)}%`

/**
 * One printed side, large, with a Front / Back switch.
 *
 * A highlighted object gets an outline over its box and the rest of the
 * artwork dimmed around it, so "Branch name" in the list on the right is
 * something the buyer can see rather than something they have to find.
 */
export function SidePreview({
  front,
  back,
  backName,
  side,
  onSideChange,
  highlight,
  compact,
  templateName,
}: SidePreviewProps) {
  const shown = side === 'back' ? back : front
  // A blank back is the same card with nothing on it, so it takes the front's
  // proportions.
  const frame = shown ?? front
  const ratio = frame.width / Math.max(1, frame.height)
  const maxHeight = compact ? '46vh' : 'calc(100vh - 290px)'
  const box =
    highlight && highlight.side === side && shown
      ? shown.bounds[highlight.objectId]
      : undefined

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '16px',
        width: '100%',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: `min(100%, calc(${maxHeight} * ${ratio.toFixed(4)}))`,
          aspectRatio: `${frame.width} / ${frame.height}`,
          backgroundColor: '#FFFFFF',
          borderRadius: '6px',
          overflow: 'hidden',
          border: `1px solid ${T.border}`,
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.06), 0 18px 44px rgba(43, 37, 62, 0.14)',
        }}
      >
        {shown?.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shown.dataUrl}
            alt={`${side === 'back' ? 'Back' : 'Front'} of ${templateName}`}
            style={{
              display: 'block',
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '16px',
              fontSize: '0.84rem',
              color: T.muted,
              fontWeight: 500,
            }}
          >
            {side === 'back' && !back
              ? 'Blank back — nothing will be printed here'
              : 'This side could not be drawn. It will still print as designed.'}
          </div>
        )}

        {box && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              left: `calc(${pct(box.x, frame.width)} - 5px)`,
              top: `calc(${pct(box.y, frame.height)} - 5px)`,
              width: `calc(${pct(box.w, frame.width)} + 10px)`,
              height: `calc(${pct(box.h, frame.height)} + 10px)`,
              border: `2px solid ${T.accent}`,
              borderRadius: '6px',
              boxShadow:
                '0 0 0 3px rgba(247, 53, 130, 0.25), 0 0 0 9999px rgba(43, 37, 62, 0.28)',
              pointerEvents: 'none',
            }}
          />
        )}
      </div>

      <div
        role="group"
        aria-label="Side to preview"
        style={{
          display: 'inline-flex',
          padding: '3px',
          gap: '2px',
          borderRadius: '10px',
          backgroundColor: T.card,
          border: `1px solid ${T.border}`,
        }}
      >
        {(['front', 'back'] as const).map((face) => {
          const on = side === face
          return (
            <button
              key={face}
              type="button"
              aria-pressed={on}
              onClick={() => onSideChange(face)}
              style={{
                padding: '6px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: on ? T.accentSoft : 'transparent',
                color: on ? T.accent : T.secondary,
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {face === 'front' ? 'Front' : 'Back'}
            </button>
          )
        })}
      </div>
      {/* Only the back needs saying which it is: the switch already says
          "Front". */}
      {side === 'back' && (
        <div style={{ fontSize: '0.78rem', color: T.muted, marginTop: '-6px' }}>
          {backName ? `Back: ${backName}` : 'Back: blank (nothing printed)'}
        </div>
      )}
    </div>
  )
}
