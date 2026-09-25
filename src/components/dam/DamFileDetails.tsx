// src/components/dam/DamFileDetails.tsx
'use client'

import { SkeletonText } from '@/components/ui/Skeleton'
import React, { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, RefreshCw, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useDamFileNotes } from '@/hooks/useDam'
import { toApiError } from '@/services'
import type { DamFile } from '@/services/dam.service'
import { damTypeLabel, formatDamBytes, formatDamUpdated } from './dam-format'
import { DamPreview } from './DamTiles'

const linkButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '0.35rem 0.75rem',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  fontSize: '0.78rem',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
}

/**
 * The selected file: a bigger preview, what the library knows about it, and
 * the notes left against it. Mounted per file (keyed by the parent), so the
 * copy confirmation and preview fallback never carry over to the next file.
 */
export function DamFileDetails({
  file,
  folderPath,
  folderLabel,
  pickProblem,
  onPick,
  onDelete,
  onClose,
}: {
  file: DamFile
  /** The folder the notes are looked up in. */
  folderPath: string | null
  folderLabel: string
  /** Select mode only: why it cannot be used, or null when it can. */
  pickProblem?: string | null
  onPick?: () => void
  /** Offered only to a user who may delete; the parent asks before it happens. */
  onDelete?: () => void
  onClose: () => void
}) {
  const notes = useDamFileNotes({ fileName: file.name, folderPath })
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')

  useEffect(() => {
    if (copy === 'idle') return
    const timer = window.setTimeout(() => setCopy('idle'), 2500)
    return () => window.clearTimeout(timer)
  }, [copy])

  async function copyLink() {
    if (!file.url) return
    try {
      // The link may be signed; it goes to the clipboard and nowhere else.
      await navigator.clipboard.writeText(file.url)
      setCopy('copied')
    } catch {
      setCopy('failed')
    }
  }

  const rows: [string, string][] = [
    ['Folder', folderLabel],
    ['Type', file.contentType ?? damTypeLabel(file)],
    ['Size', formatDamBytes(file.sizeBytes)],
    ['Updated', formatDamUpdated(file.updatedAt)],
  ]

  return (
    <aside
      aria-label={`Details for ${file.name}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '14px',
        borderRadius: '14px',
        border: '1px solid #F0E6EC',
        backgroundColor: '#FFFFFF',
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: '0.9rem',
            fontWeight: 700,
            color: '#2B253E',
            overflowWrap: 'anywhere',
          }}
        >
          {file.name}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close file details"
          style={{
            flexShrink: 0,
            width: '28px',
            height: '28px',
            borderRadius: '9999px',
            border: 'none',
            backgroundColor: '#FAF6F8',
            color: '#6E6781',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={15} />
        </button>
      </div>

      {/* A details panel with a pick button is the picker's: load as the
          canvas will (see DamPreview). */}
      <DamPreview file={file} large crossOrigin={Boolean(onPick)} />

      {onPick && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <Button
            type="button"
            fullWidth
            onClick={onPick}
            disabled={Boolean(pickProblem)}
            aria-label={`Use ${file.name}`}
          >
            Use this image
          </Button>
          {pickProblem && (
            <span style={{ fontSize: '0.74rem', color: '#DC2626' }}>
              {pickProblem}
            </span>
          )}
        </div>
      )}

      <dl
        style={{
          margin: 0,
          display: 'grid',
          gridTemplateColumns: 'auto minmax(0, 1fr)',
          columnGap: '12px',
          rowGap: '6px',
          fontSize: '0.78rem',
        }}
      >
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt style={{ color: '#A39BB3', fontWeight: 600 }}>{label}</dt>
            <dd
              style={{ margin: 0, color: '#2B253E', overflowWrap: 'anywhere' }}
            >
              {value}
            </dd>
          </React.Fragment>
        ))}
      </dl>

      {file.url ? (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open the original of ${file.name} in a new tab`}
            style={linkButton}
          >
            <ExternalLink size={14} />
            Open original
          </a>
          <button
            type="button"
            onClick={() => void copyLink()}
            aria-label={`Copy the link to ${file.name}`}
            style={linkButton}
          >
            {copy === 'copied' ? <Check size={14} /> : <Copy size={14} />}
            {copy === 'copied' ? 'Copied' : 'Copy link'}
          </button>
          {copy === 'failed' && (
            <span
              role="alert"
              style={{ fontSize: '0.74rem', color: '#DC2626', width: '100%' }}
            >
              Could not copy the link. Use Open original instead.
            </span>
          )}
        </div>
      ) : (
        <p style={{ margin: 0, fontSize: '0.76rem', color: '#6E6781' }}>
          The library gave no link for this file, so it cannot be opened from
          here.
        </p>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${file.name} from the library`}
          style={{
            ...linkButton,
            alignSelf: 'flex-start',
            borderColor: '#FECACA',
            backgroundColor: '#FEF2F2',
            color: '#DC2626',
          }}
        >
          <Trash2 size={14} />
          Delete from library
        </button>
      )}

      <section
        aria-label="Notes"
        style={{
          borderTop: '1px solid #F0E6EC',
          paddingTop: '10px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#2B253E' }}>
          Notes
        </div>
        {notes.isLoading ? (
          <SkeletonText lines={2} lineHeight={9} />
        ) : notes.error ? (
          <div
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              flexWrap: 'wrap',
              fontSize: '0.76rem',
              color: '#DC2626',
            }}
          >
            <span>{toApiError(notes.error).message}</span>
            <button
              type="button"
              onClick={() => void notes.refetch()}
              aria-label="Retry loading notes"
              style={{ ...linkButton, padding: '0.2rem 0.55rem' }}
            >
              <RefreshCw size={12} />
              Retry
            </button>
          </div>
        ) : !notes.data || notes.data.items.length === 0 ? (
          <span style={{ fontSize: '0.76rem', color: '#A39BB3' }}>
            No notes on this file.
          </span>
        ) : (
          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            {notes.data.items.map((note, i) => {
              const when = note.updatedAt ?? note.createdAt
              return (
                <li
                  key={note.id ?? `note-${i}`}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '10px',
                    backgroundColor: '#FAF6F8',
                    fontSize: '0.76rem',
                    color: '#2B253E',
                  }}
                >
                  <div
                    style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                  >
                    {note.notes}
                  </div>
                  {(note.authorName || when) && (
                    <div
                      style={{
                        marginTop: '4px',
                        fontSize: '0.68rem',
                        color: '#A39BB3',
                      }}
                    >
                      {[note.authorName, when ? formatDamUpdated(when) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </aside>
  )
}
