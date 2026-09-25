// src/components/admin/AuditLogTable.tsx
'use client'

import React, { useState } from 'react'
import { ChevronDown, ChevronUp, Filter } from 'lucide-react'
import type { AuditLogEntry } from '@/types'
import {
  AUDIT_ENTITY_TYPE_LABELS,
  auditActionLabel,
  auditActorRoleLabel,
} from './AuditLogVocabulary'

const COLUMN_COUNT = 6

function formatTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function formatDetails(details: unknown): string | null {
  if (details === undefined || details === null) return null
  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return String(details)
  }
}

/**
 * The audit trail as a table, one expandable row per entry.
 *
 * The collapsed row answers who, what, which record and when; the expanded
 * row carries what is needed to investigate further — the recorded details,
 * the user agent, and the request id that ties the entry to the server logs.
 */
export function AuditLogTable({
  entries,
  dimmed = false,
  onFilterActor,
  onFilterEntity,
  onFilterField,
}: {
  entries: readonly AuditLogEntry[]
  /** True while a previous page is shown as the next one loads. */
  dimmed?: boolean
  onFilterActor?: (entry: AuditLogEntry) => void
  onFilterEntity?: (entry: AuditLogEntry) => void
  /** Narrows the log to entries that changed this field. */
  onFilterField?: (field: string) => void
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggle = (id: string) =>
    setExpandedId((current) => (current === id ? null : id))

  return (
    <div
      style={{
        overflowX: 'auto',
        opacity: dimmed ? 0.6 : 1,
        transition: 'opacity 150ms ease',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          textAlign: 'left',
          fontSize: '0.84rem',
        }}
      >
        <thead>
          <tr>
            <th
              style={{ ...thStyle, width: '44px', padding: '10px 0 10px 20px' }}
            >
              <span style={visuallyHidden}>Details</span>
            </th>
            <th style={thStyle}>Timestamp</th>
            <th style={thStyle}>Actor</th>
            <th style={thStyle}>Action</th>
            <th style={thStyle}>Entity</th>
            <th style={{ ...thStyle, paddingRight: '20px' }}>IP address</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const isOpen = expandedId === entry.id
            const rowBackground = isOpen ? '#FCF7FA' : undefined

            return (
              <React.Fragment key={entry.id}>
                <tr
                  onClick={() => toggle(entry.id)}
                  style={{
                    borderTop: '1px solid #F5EEF2',
                    cursor: 'pointer',
                    backgroundColor: rowBackground,
                  }}
                >
                  <td
                    style={{
                      padding: '12px 0 12px 20px',
                      verticalAlign: 'top',
                    }}
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      aria-label={
                        isOpen ? 'Hide entry details' : 'Show entry details'
                      }
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(entry.id)
                      }}
                      style={{
                        width: '26px',
                        height: '26px',
                        borderRadius: '8px',
                        border: '1px solid #F0E6EC',
                        backgroundColor: '#FFFFFF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        color: '#6E6781',
                      }}
                    >
                      {isOpen ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      whiteSpace: 'nowrap',
                      color: '#2B253E',
                    }}
                  >
                    <time dateTime={entry.timestamp} title={entry.timestamp}>
                      {formatTimestamp(entry.timestamp)}
                    </time>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: '#2B253E' }}>
                      {entry.actorName}
                    </div>
                    {/* An actor with no display name is recorded under their
                        email, which then printed twice. */}
                    {entry.actorEmail &&
                      entry.actorEmail !== entry.actorName && (
                        <div
                          style={{
                            fontSize: '0.76rem',
                            color: '#6E6781',
                            marginTop: '2px',
                          }}
                        >
                          {entry.actorEmail}
                        </div>
                      )}
                    <span
                      style={{
                        ...pillStyle,
                        marginTop: '4px',
                        backgroundColor: '#F5F2F8',
                        color: '#6E6781',
                      }}
                    >
                      {auditActorRoleLabel(entry.actorRole)}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: '#2B253E' }}>
                      {auditActionLabel(entry.action)}
                    </div>
                    <div style={monoMutedStyle}>{entry.action}</div>
                    {entry.changes.length > 0 && (
                      <div
                        style={{
                          fontSize: '0.72rem',
                          color: '#6E6781',
                          marginTop: '2px',
                        }}
                        title={entry.changes.map((c) => c.field).join(', ')}
                      >
                        {entry.changes.length} field
                        {entry.changes.length === 1 ? '' : 's'} changed
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>
                    <span style={pillStyle}>
                      {AUDIT_ENTITY_TYPE_LABELS[entry.entityType] ??
                        entry.entityType}
                    </span>
                    <div style={{ marginTop: '4px', color: '#2B253E' }}>
                      {entry.entityName ?? (
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: '0.78rem',
                          }}
                        >
                          {entry.entityId}
                        </span>
                      )}
                    </div>
                    {entry.entityName && (
                      <div style={monoMutedStyle}>{entry.entityId}</div>
                    )}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      paddingRight: '20px',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {entry.ipAddress ? (
                      <span
                        style={{
                          fontFamily: 'monospace',
                          fontSize: '0.78rem',
                          color: '#6E6781',
                        }}
                      >
                        {entry.ipAddress}
                      </span>
                    ) : (
                      <span style={{ color: '#A39BB3' }}>—</span>
                    )}
                  </td>
                </tr>

                {isOpen && (
                  <tr style={{ backgroundColor: rowBackground }}>
                    <td
                      colSpan={COLUMN_COUNT}
                      style={{ padding: '0 20px 18px 64px' }}
                    >
                      <AuditEntryDetails
                        entry={entry}
                        onFilterActor={onFilterActor}
                        onFilterEntity={onFilterEntity}
                        onFilterField={onFilterField}
                      />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AuditEntryDetails({
  entry,
  onFilterActor,
  onFilterEntity,
  onFilterField,
}: {
  entry: AuditLogEntry
  onFilterActor?: (entry: AuditLogEntry) => void
  onFilterEntity?: (entry: AuditLogEntry) => void
  onFilterField?: (field: string) => void
}) {
  const details = formatDetails(entry.details)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px 20px',
          margin: 0,
        }}
      >
        <DetailItem
          label="Request ID"
          mono
          value={entry.requestId}
          hint="Matches this entry to the server logs for the same request."
        />
        <DetailItem label="Recorded (UTC)" mono value={entry.timestamp} />
        <DetailItem
          label="Actor ID"
          mono
          value={entry.actorId ?? undefined}
          fallback="System (no user)"
        />
        <DetailItem label="Entity ID" mono value={entry.entityId} />
        <DetailItem label="IP address" mono value={entry.ipAddress} />
        <DetailItem label="User agent" value={entry.userAgent} wide />
      </dl>

      <AuditChanges entry={entry} onFilterField={onFilterField} />

      <div>
        <div style={detailLabelStyle}>
          {entry.changesCaptured ? 'Other recorded details' : 'Details'}
        </div>
        {details === null ? (
          <div style={{ fontSize: '0.8rem', color: '#A39BB3' }}>
            No details were recorded for this entry.
          </div>
        ) : (
          <pre
            style={{
              margin: 0,
              padding: '12px 14px',
              maxHeight: '320px',
              overflow: 'auto',
              backgroundColor: '#FFFFFF',
              border: '1px solid #F0E6EC',
              borderRadius: '10px',
              fontSize: '0.76rem',
              lineHeight: 1.5,
              color: '#2B253E',
              whiteSpace: 'pre',
            }}
          >
            {details}
          </pre>
        )}
      </div>

      {(onFilterActor || onFilterEntity) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {onFilterActor && (
            <button
              type="button"
              disabled={!entry.actorId}
              onClick={() => onFilterActor(entry)}
              style={{
                ...secondaryButtonStyle,
                opacity: entry.actorId ? 1 : 0.5,
              }}
            >
              <Filter size={13} />
              <span>Only entries by {entry.actorName}</span>
            </button>
          )}
          {onFilterEntity && (
            <button
              type="button"
              onClick={() => onFilterEntity(entry)}
              style={secondaryButtonStyle}
            >
              <Filter size={13} />
              <span>
                Only entries for this{' '}
                {(
                  AUDIT_ENTITY_TYPE_LABELS[entry.entityType] ?? 'entity'
                ).toLowerCase()}
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

/** A recorded value as text: objects as JSON, absence as an em dash. */
function formatChangeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value === '' ? '""' : value
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * The difference view (§12, M-08): each changed field with its value before
 * and after, side by side.
 *
 * Three states, kept apart on purpose: values not recorded at all (an event, or
 * an entry from before values were captured), recorded with nothing moved, and
 * the changes themselves.
 */
function AuditChanges({
  entry,
  onFilterField,
}: {
  entry: AuditLogEntry
  onFilterField?: (field: string) => void
}) {
  return (
    <div>
      <div style={detailLabelStyle}>Changes</div>
      {!entry.changesCaptured ? (
        <div style={{ fontSize: '0.8rem', color: '#A39BB3' }}>
          Before and after values were not recorded for this entry.
        </div>
      ) : entry.changes.length === 0 ? (
        <div style={{ fontSize: '0.8rem', color: '#A39BB3' }}>
          Recorded — no field actually changed.
        </div>
      ) : (
        <div
          style={{
            overflowX: 'auto',
            border: '1px solid #F0E6EC',
            borderRadius: '10px',
            backgroundColor: '#FFFFFF',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '0.78rem',
            }}
          >
            <thead>
              <tr>
                <th style={{ ...thStyle, width: '22%' }}>Field</th>
                <th style={{ ...thStyle, width: '39%' }}>Before</th>
                <th style={{ ...thStyle, width: '39%' }}>After</th>
              </tr>
            </thead>
            <tbody>
              {entry.changes.map((change) => {
                const before = formatChangeValue(change.before)
                const after = formatChangeValue(change.after)
                return (
                  <tr
                    key={change.field}
                    style={{ borderTop: '1px solid #F5EEF2' }}
                  >
                    <td style={{ ...tdStyle, fontFamily: 'monospace' }}>
                      {onFilterField ? (
                        <button
                          type="button"
                          title={`Only entries that changed ${change.field}`}
                          onClick={() => onFilterField(change.field)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            padding: 0,
                            fontFamily: 'monospace',
                            fontSize: '0.78rem',
                            color: '#2B253E',
                            fontWeight: 600,
                            cursor: 'pointer',
                            textDecoration: 'underline dotted',
                          }}
                        >
                          {change.field}
                        </button>
                      ) : (
                        <strong>{change.field}</strong>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <ChangeValue value={before} tone="before" />
                    </td>
                    <td style={tdStyle}>
                      <ChangeValue value={after} tone="after" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ChangeValue({
  value,
  tone,
}: {
  value: string | null
  tone: 'before' | 'after'
}) {
  if (value === null) return <span style={{ color: '#A39BB3' }}>—</span>
  return (
    <span
      style={{
        display: 'inline-block',
        maxWidth: '100%',
        padding: '2px 6px',
        borderRadius: '6px',
        backgroundColor: tone === 'before' ? '#FEF2F2' : '#ECFDF5',
        color: tone === 'before' ? '#991B1B' : '#065F46',
        fontFamily: 'monospace',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        textDecoration: tone === 'before' ? 'line-through' : undefined,
        textDecorationColor: 'rgba(153, 27, 27, 0.35)',
      }}
    >
      {value}
    </span>
  )
}

function DetailItem({
  label,
  value,
  mono = false,
  wide = false,
  hint,
  fallback = 'Not recorded',
}: {
  label: string
  value?: string
  mono?: boolean
  wide?: boolean
  hint?: string
  fallback?: string
}) {
  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <dt style={detailLabelStyle}>{label}</dt>
      <dd
        style={{
          margin: 0,
          fontSize: mono ? '0.78rem' : '0.8rem',
          fontFamily: mono ? 'monospace' : undefined,
          color: value ? '#2B253E' : '#A39BB3',
          wordBreak: 'break-all',
        }}
      >
        {value || fallback}
      </dd>
      {hint && value && (
        <div style={{ fontSize: '0.7rem', color: '#A39BB3', marginTop: '2px' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '12px 14px',
  verticalAlign: 'top',
}

const pillStyle: React.CSSProperties = {
  display: 'inline-block',
  padding: '2px 8px',
  borderRadius: '9999px',
  backgroundColor: '#FDE8F1',
  color: '#F73582',
  fontSize: '0.7rem',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const monoMutedStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.74rem',
  color: '#A39BB3',
  marginTop: '2px',
  wordBreak: 'break-all',
}

const detailLabelStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  fontWeight: 600,
  color: '#6E6781',
  marginBottom: '4px',
}

const secondaryButtonStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  backgroundColor: '#FFFFFF',
  color: '#2B253E',
  fontSize: '0.78rem',
  fontWeight: 600,
  cursor: 'pointer',
}

const visuallyHidden: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
}
