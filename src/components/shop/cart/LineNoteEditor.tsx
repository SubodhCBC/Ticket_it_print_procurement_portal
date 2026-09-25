// src/components/shop/cart/LineNoteEditor.tsx
'use client'

import { useState } from 'react'
import { MessageSquarePlus } from 'lucide-react'

/** The API's limit for a line note. */
const MAX_LENGTH = 1000

/**
 * A note for one basket line (SOW F-19) — "trim to A5", "leave the logo off
 * the back". It travels onto the order line at placement and on to fulfilment.
 *
 * Closed, it is a small link, or the note itself with an Edit link; the basket
 * stays a list of items rather than a list of text boxes.
 */
export function LineNoteEditor({
  note,
  onSave,
}: {
  note: string | null
  onSave: (
    note: string | null
  ) => Promise<{ success: true } | { success: false; error: string }>
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState(note ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = () => {
    setDraft(note ?? '')
    setError(null)
    setIsEditing(true)
  }

  const save = async () => {
    const next = draft.trim() || null
    if (next === (note ?? null)) {
      setIsEditing(false)
      return
    }
    setIsSaving(true)
    setError(null)
    const result = await onSave(next)
    setIsSaving(false)
    if (result.success) setIsEditing(false)
    else setError(result.error)
  }

  if (!isEditing) {
    return note ? (
      <div style={{ fontSize: '0.76rem', color: '#6E6781', lineHeight: 1.45 }}>
        <span style={{ fontWeight: 600, color: '#5C566E' }}>Note: </span>
        <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
          {note}
        </span>{' '}
        <button type="button" onClick={open} style={linkButton}>
          Edit
        </button>
      </div>
    ) : (
      <button
        type="button"
        onClick={open}
        className="touch-target"
        style={{ ...linkButton, alignSelf: 'flex-start' }}
      >
        <MessageSquarePlus size={12} /> Add a note for this item
      </button>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <textarea
        aria-label="Note for this item"
        value={draft}
        maxLength={MAX_LENGTH}
        rows={2}
        autoFocus
        placeholder="Instructions for this item only, e.g. fold to DL"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setIsEditing(false)
        }}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: '8px',
          border: '1px solid #F0E6EC',
          fontSize: '0.8rem',
          color: '#2B253E',
          fontFamily: 'inherit',
          resize: 'vertical',
        }}
      />
      <div className="row-wrap" style={{ gap: '8px' }}>
        <button
          type="button"
          onClick={() => void save()}
          disabled={isSaving}
          className="touch-target"
          style={{
            padding: '5px 12px',
            borderRadius: '8px',
            border: '1px solid #F73582',
            backgroundColor: '#F73582',
            color: '#FFFFFF',
            fontSize: '0.76rem',
            fontWeight: 600,
            cursor: isSaving ? 'wait' : 'pointer',
          }}
        >
          {isSaving ? 'Saving…' : 'Save note'}
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="touch-target"
          style={linkButton}
        >
          Cancel
        </button>
        <span style={{ fontSize: '0.7rem', color: '#A39BB3' }}>
          {draft.length}/{MAX_LENGTH}
        </span>
      </div>
      {error && (
        <span role="alert" style={{ fontSize: '0.74rem', color: '#DC2626' }}>
          {error}
        </span>
      )}
    </div>
  )
}

const linkButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: 0,
  border: 'none',
  background: 'transparent',
  color: '#F73582',
  fontSize: '0.76rem',
  fontWeight: 600,
  cursor: 'pointer',
}
