// src/components/approvals/ApprovalArtwork.tsx
'use client'

import { Package } from 'lucide-react'
import { useOrderApproval } from '@/hooks/useApprovals'
import { useApiBlobUrl } from '@/hooks/useApiBlobUrl'
import type {
  ApprovalLineView,
  LineImageSource,
} from '@/services/data-source/api/approval.types'

const SOURCE_NOTE: Record<LineImageSource, string | null> = {
  BUYER_PREVIEW: null,
  TEMPLATE: 'Template before personalisation',
  PRODUCT: 'Product photo, not a proof',
  NONE: 'No picture for this line',
}

/**
 * What an approver is approving: the order's own artwork (SOW M-09).
 *
 * From the approval's `lines[].image`. A buyer's finished design is fetched
 * from `previewPath` with the caller's token; a template thumbnail or product
 * photograph is shown from `imageUrl` and labelled as what it is, because an
 * approver shown a plausible picture that is not the ordered artwork could
 * approve the wrong job.
 *
 * Pass `lines` when the approval is already loaded (the admin drawer). Without
 * them the component reads the order's approval itself (the head-office hub,
 * which lists orders rather than approval requests).
 */
export function ApprovalArtwork({
  orderId,
  lines,
  size = 80,
}: {
  orderId: string
  lines?: readonly ApprovalLineView[]
  size?: number
}) {
  const fetched = useOrderApproval(orderId, { enabled: lines === undefined })
  const all = lines ?? fetched.approval?.lines ?? []
  const isLoading = lines === undefined && fetched.isLoading

  // The buyer's own design first; then anything with a picture; then the first.
  const shown =
    all.find((line) => line.image.source === 'BUYER_PREVIEW') ??
    all.find((line) => line.image.imageUrl) ??
    all[0]
  const others = Math.max(0, all.length - 1)

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        minWidth: 0,
      }}
    >
      {isLoading ? (
        <div aria-label="Loading artwork" style={tile(size)} />
      ) : (
        <LinePicture line={shown} size={size} />
      )}
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: '0.9rem',
            fontWeight: 600,
            color: '#2B253E',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {shown
            ? (shown.templateName ?? shown.name)
            : isLoading
              ? '…'
              : 'No lines'}
        </div>
        {shown && (
          <div
            style={{ fontSize: '0.78rem', color: '#6E6781', marginTop: '4px' }}
          >
            {shown.templateName ? `${shown.name} · ` : ''}
            <span style={{ fontFamily: 'monospace' }}>
              {shown.variantSku ?? shown.sku}
            </span>
            {` · ${shown.quantity} ${shown.uom.toLowerCase()}`}
            {others > 0 &&
              ` · and ${others} more line${others === 1 ? '' : 's'}`}
          </div>
        )}
        {shown && SOURCE_NOTE[shown.image.source] && (
          <div
            style={{ fontSize: '0.74rem', color: '#B45309', marginTop: '2px' }}
          >
            {SOURCE_NOTE[shown.image.source]}
          </div>
        )}
        {shown?.notes && (
          <div
            style={{
              fontSize: '0.74rem',
              color: '#6E6781',
              marginTop: '2px',
              overflowWrap: 'anywhere',
            }}
          >
            <strong style={{ fontWeight: 600 }}>Note:</strong> {shown.notes}
          </div>
        )}
      </div>
    </div>
  )
}

function LinePicture({
  line,
  size,
}: {
  line: ApprovalLineView | undefined
  size: number
}) {
  const previewPath =
    line?.image.source === 'BUYER_PREVIEW' ? line.image.previewPath : null
  const preview = useApiBlobUrl(previewPath)
  const src = previewPath ? preview.url : (line?.image.imageUrl ?? null)
  const isDesign = line?.image.source === 'BUYER_PREVIEW'

  if (previewPath && preview.isLoading) {
    return <div aria-label="Loading artwork" style={tile(size)} />
  }

  if (!src) {
    return (
      <div
        role="img"
        aria-label="No picture"
        style={{
          ...tile(size),
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#CFC6D6',
        }}
      >
        <Package size={Math.round(size / 2.5)} />
      </div>
    )
  }

  return (
    // A blob URL or a signed link: next/image cannot optimise either.
    <img
      src={src}
      alt={line ? `Artwork for ${line.templateName ?? line.name}` : 'Artwork'}
      style={{
        ...tile(size),
        objectFit: isDesign ? 'contain' : 'cover',
        padding: isDesign ? '3px' : 0,
        backgroundColor: isDesign ? '#FAF6F8' : '#FFFFFF',
      }}
    />
  )
}

function tile(size: number): React.CSSProperties {
  return {
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: '10px',
    border: '1px solid #F0E6EC',
    backgroundColor: '#F5EEF2',
    flexShrink: 0,
    boxSizing: 'border-box',
  }
}
