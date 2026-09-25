// src/components/dam/DamTiles.tsx
'use client'

import React, { useState } from 'react'
import { FileText, Folder, ImageOff } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'
import type { DamFile } from '@/services/dam.service'
import { damTypeLabel, formatDamBytes, isDamPdf } from './dam-format'

/**
 * A file's picture, or an icon when there is none to show.
 *
 * A plain <img>, not next/image: the library's hosts are Ticket-IT's storage,
 * not configured image domains, and its URLs may be signed — an optimiser
 * would fetch and cache someone's signed link on the portal's server.
 */
export function DamPreview({
  file,
  large = false,
  crossOrigin = false,
}: {
  file: DamFile
  large?: boolean
  /**
   * Load with CORS, as the design canvas will. Set in the picker: a copy the
   * browser cached from a plain <img> can be handed to the canvas's CORS
   * request and fail it, so a picture that previewed fine would then be
   * refused. The library pages leave it off, so a host without CORS headers
   * still shows its previews there.
   */
  crossOrigin?: boolean
}) {
  // Large previews prefer the original; tiles prefer the lighter thumbnail.
  const src = large
    ? (file.url ?? file.thumbnailUrl)
    : (file.thumbnailUrl ?? file.url)
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const iconSize = large ? 40 : 28

  const frame: React.CSSProperties = {
    width: '100%',
    aspectRatio: large ? '4 / 3' : '1 / 1',
    maxWidth: '100%',
    borderRadius: '10px',
    backgroundColor: '#FAF6F8',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    color: '#A39BB3',
  }

  if (isDamPdf(file)) {
    return (
      <div style={frame} aria-hidden="true">
        <FileText size={iconSize} color="#DC2626" />
      </div>
    )
  }

  // Keyed on the address, so a new file in the same tile gets a fresh try.
  if (!src || failedSrc === src) {
    return (
      <div
        style={{ ...frame, flexDirection: 'column', gap: '4px' }}
        aria-hidden="true"
      >
        <ImageOff size={iconSize} />
        <span style={{ fontSize: '0.66rem' }}>
          {src ? 'Preview unavailable' : 'No preview'}
        </span>
      </div>
    )
  }

  return (
    <div style={frame}>
      <img
        src={src}
        crossOrigin={crossOrigin ? 'anonymous' : undefined}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailedSrc(src)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          display: 'block',
        }}
      />
    </div>
  )
}

export function DamFolderTile({
  name,
  onOpen,
}: {
  name: string
  onOpen: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Open folder ${name}`}
      title={name}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        width: '100%',
        minWidth: 0,
        padding: '10px 12px',
        borderRadius: '12px',
        border: '1px solid #F0E6EC',
        backgroundColor: '#FFFFFF',
        color: '#2B253E',
        fontSize: '0.82rem',
        fontWeight: 600,
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      <Folder size={18} color="#F73582" style={{ flexShrink: 0 }} />
      {/* Folder names are data-supplied: truncated, never widening the tile. */}
      <span className="truncate">{name}</span>
    </button>
  )
}

export function DamFileTile({
  file,
  selected,
  highlighted,
  disabledReason,
  onSelect,
  onActivate,
  corsPreview = false,
}: {
  file: DamFile
  selected: boolean
  highlighted: boolean
  /** Load the preview with CORS — the picker's tiles. See `DamPreview`. */
  corsPreview?: boolean
  /** Shown instead of the size, and the tile cannot be chosen. */
  disabledReason: string | null
  onSelect: () => void
  /** Double-click: the picker uses it to pick straight away. */
  onActivate?: () => void
}) {
  const disabled = disabledReason !== null
  const borderColor = selected ? '#F73582' : highlighted ? '#3F9C68' : '#F0E6EC'

  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onActivate}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={
        disabled
          ? `${file.name} — ${disabledReason}`
          : `${selected ? 'Selected: ' : 'Select '}${file.name}`
      }
      title={disabled ? disabledReason : file.name}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        width: '100%',
        minWidth: 0,
        padding: '8px',
        borderRadius: '12px',
        border: `1.5px solid ${borderColor}`,
        boxShadow: selected ? '0 0 0 3px rgba(247, 53, 130, 0.15)' : 'none',
        backgroundColor: '#FFFFFF',
        textAlign: 'left',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        color: '#2B253E',
      }}
    >
      {highlighted && (
        <Badge
          variant="green"
          size="sm"
          style={{ position: 'absolute', top: '12px', left: '12px', zIndex: 1 }}
        >
          New
        </Badge>
      )}
      <DamPreview file={file} crossOrigin={corsPreview} />
      {/* A file name can be very long; it truncates rather than widening the
          tile and, with it, the grid. */}
      <span
        className="truncate"
        style={{ fontSize: '0.78rem', fontWeight: 600 }}
      >
        {file.name}
      </span>
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          minWidth: 0,
          fontSize: '0.7rem',
          color: '#6E6781',
        }}
      >
        <Badge variant="outline" size="sm">
          {damTypeLabel(file)}
        </Badge>
        <span className="truncate">
          {disabledReason ?? formatDamBytes(file.sizeBytes)}
        </span>
      </span>
    </button>
  )
}
