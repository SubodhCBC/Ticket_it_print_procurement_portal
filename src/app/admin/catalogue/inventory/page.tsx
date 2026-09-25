// src/app/admin/catalogue/inventory/page.tsx
'use client'

import { useState, type CSSProperties } from 'react'
import Link from 'next/link'
import { ClipboardList, Plus, X } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import {
  ActionButton,
  AdminCard,
  AdminTable,
  ConfirmModal,
  Field,
  Notice,
  ReadOnlyNotice,
  SectionHeading,
  StatTile,
  StateBlock,
  Td,
  TextArea,
  TextInput,
  Th,
} from '@/components/admin/ProductAdminUi'
import {
  errorMessage,
  normaliseHeader,
  parseCsv,
} from '@/components/admin/ProductAdminUtils'
import { FieldError } from '@/components/ui/FormField'
import { useAuth } from '@/hooks/useAuth'
import { useStockReconcile } from '@/hooks/useProducts'
import type {
  StockCountInput,
  StockReconciliation,
  StockReconciliationOutcome,
} from '@/types/catalog-admin'

const MAX_LINES = 1_000
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

/**
 * Each box in the count table names itself, rather than leaving a placeholder
 * to stand in for a label — a placeholder is gone the moment anything is typed,
 * and the row it belonged to is then anonymous.
 */
const lineLabelStyle: CSSProperties = {
  display: 'block',
  marginBottom: '4px',
  fontSize: '0.7rem',
  fontWeight: 500,
  color: '#A39BB3',
  whiteSpace: 'nowrap',
}

interface CountDraft {
  key: number
  sku: string
  counted: string
  note: string
}

const OUTCOME_STYLES: Record<
  StockReconciliationOutcome,
  { bg: string; color: string; label: string }
> = {
  MATCHED: { bg: '#EAF8EF', color: '#228B53', label: 'Matched' },
  ADJUSTED: { bg: '#E0F2FE', color: '#0284C7', label: 'Adjusted' },
  WOULD_ADJUST: { bg: '#FEF3C7', color: '#B45309', label: 'Would adjust' },
  BELOW_RESERVED: { bg: '#FEF2F2', color: '#DC2626', label: 'Below reserved' },
  NOT_TRACKED: { bg: '#F5EEF2', color: '#6E6781', label: 'Not tracked' },
  UNKNOWN_SKU: { bg: '#FEF2F2', color: '#DC2626', label: 'Unknown SKU' },
}

const COUNT_ALIASES = new Set([
  'countedquantity',
  'counted',
  'count',
  'quantity',
  'qty',
])

/**
 * Pasted CSV → count lines. A header row is optional; without one the columns
 * are read as sku, counted quantity, note.
 */
function parsePastedCounts(text: string): {
  lines: Omit<CountDraft, 'key'>[]
  error: string | null
} {
  const table = parseCsv(text)
  if (table.length === 0) return { lines: [], error: 'Nothing to add.' }

  let skuIndex = 0
  let countIndex = 1
  let noteIndex = 2
  let body = table

  const first = table[0].map(normaliseHeader)
  if (first.includes('sku')) {
    skuIndex = first.indexOf('sku')
    countIndex = first.findIndex((cell) => COUNT_ALIASES.has(cell))
    noteIndex = first.findIndex((cell) => cell === 'note' || cell === 'notes')
    body = table.slice(1)
    if (countIndex === -1) {
      return {
        lines: [],
        error:
          'The header has a sku column but no countedQuantity (or count, qty) column.',
      }
    }
  }

  return {
    lines: body.map((cells) => ({
      sku: (cells[skuIndex] ?? '').toUpperCase(),
      counted: cells[countIndex] ?? '',
      note: noteIndex >= 0 ? (cells[noteIndex] ?? '') : '',
    })),
    error: null,
  }
}

/** What is wrong with one count line, box by box. */
interface LineErrors {
  sku?: string
  counted?: string
  note?: string
}

/**
 * The lines as they would be sent, with a message against every box that cannot
 * go — all of them, so a table of typos is corrected in one pass rather than
 * one refusal at a time. `formError` is only for what no single box owns.
 */
function prepareCounts(drafts: CountDraft[]): {
  counts: StockCountInput[]
  formError: string | null
  lineErrors: Record<number, LineErrors>
} {
  const lineErrors: Record<number, LineErrors> = {}
  const filled = drafts.filter(
    (d) => d.sku.trim() || d.counted.trim() || d.note.trim()
  )
  if (filled.length === 0)
    return {
      counts: [],
      formError: 'Enter at least one counted SKU.',
      lineErrors,
    }
  if (filled.length > MAX_LINES)
    return {
      counts: [],
      formError: `Reconcile at most ${MAX_LINES} lines at a time.`,
      lineErrors,
    }

  const seen = new Set<string>()
  const counts: StockCountInput[] = []
  for (const draft of filled) {
    const errors: LineErrors = {}
    const sku = draft.sku.trim().toUpperCase()

    if (!sku) errors.sku = 'Enter the SKU counted on this line.'
    else if (sku.length < 2 || sku.length > 64 || !SKU_PATTERN.test(sku))
      errors.sku =
        'A SKU is 2 to 64 characters of letters, digits, dots, dashes and slashes, like FLY-A5-100.'
    else if (seen.has(sku))
      errors.sku = 'Already counted on another line — add the counts together.'
    else seen.add(sku)

    if (!/^\d+$/.test(draft.counted.trim()))
      errors.counted = 'Enter the number on the shelf, 0 or more.'
    else if (Number(draft.counted) > 1e7)
      errors.counted = 'The most that can be counted in one line is 10,000,000.'

    if (draft.note.length > 500)
      errors.note = 'Keep the note to 500 characters.'

    if (Object.keys(errors).length > 0) lineErrors[draft.key] = errors
    else
      counts.push({
        sku,
        countedQuantity: Number(draft.counted),
        ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      })
  }

  // Nothing is sent while any line is wrong: a partial stocktake would look
  // like a matched one.
  const bad = Object.keys(lineErrors).length > 0
  return { counts: bad ? [] : counts, formError: null, lineErrors }
}

function signature(counts: StockCountInput[], reason: string): string {
  return JSON.stringify([counts, reason.trim()])
}

export default function InventoryReconcilePage() {
  const { hasPermission, status } = useAuth()
  const canReconcile = hasPermission('INVENTORY_MANAGE')

  const reconcile = useStockReconcile()
  const [drafts, setDrafts] = useState<CountDraft[]>([
    { key: 0, sku: '', counted: '', note: '' },
  ])
  const [nextKey, setNextKey] = useState(1)
  const [reason, setReason] = useState('')
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState<string | null>(null)
  /** Whole-form and server messages only; a box's own message sits under it. */
  const [formError, setFormError] = useState<string | null>(null)
  const [lineErrors, setLineErrors] = useState<Record<number, LineErrors>>({})
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [report, setReport] = useState<StockReconciliation | null>(null)
  const [previewSignature, setPreviewSignature] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)

  const prepared = prepareCounts(drafts)

  const currentSignature = signature(prepared.counts, reason)
  const previewIsCurrent =
    report?.dryRun === true && previewSignature === currentSignature

  const change = (key: number, patch: Partial<CountDraft>) => {
    setFormError(null)
    // Each box stops being wrong as soon as it is edited.
    setLineErrors((prev) => {
      const line = prev[key]
      if (!line) return prev
      const next = { ...line }
      for (const field of Object.keys(patch) as (keyof CountDraft)[]) {
        if (field === 'sku' || field === 'counted' || field === 'note') {
          delete next[field]
        }
      }
      return { ...prev, [key]: next }
    })
    setDrafts((prev) =>
      prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft))
    )
  }

  /**
   * `dropBlanks` is for pasted lines only, which replace the empty starter
   * row. "Add line" appends a blank row on purpose; dropping blanks there
   * swapped the row being typed into for a new one and lost its focus.
   */
  const addLines = (
    lines: Omit<CountDraft, 'key'>[],
    { dropBlanks = false }: { dropBlanks?: boolean } = {}
  ) => {
    setDrafts((prev) => {
      const kept = dropBlanks
        ? prev.filter((d) => d.sku.trim() || d.counted.trim() || d.note.trim())
        : prev
      return [
        ...kept,
        ...lines.map((line, i) => ({ ...line, key: nextKey + i })),
      ]
    })
    setNextKey((key) => key + lines.length)
  }

  const applyPaste = () => {
    const result = parsePastedCounts(pasteText)
    if (result.error) {
      setPasteError(result.error)
      return
    }
    setPasteError(null)
    addLines(result.lines, { dropBlanks: true })
    setPasteText('')
  }

  const validateForm = (): boolean => {
    // One pass over everything: every wrong box is marked at once.
    setLineErrors(prepared.lineErrors)
    setFormError(prepared.formError)

    const reasonProblem = !reason.trim()
      ? 'Say what this stocktake was, e.g. "Quarterly count, Bay 3".'
      : reason.trim().length > 500
        ? 'Keep the reason to 500 characters.'
        : null
    setReasonError(reasonProblem)

    return (
      !prepared.formError &&
      Object.keys(prepared.lineErrors).length === 0 &&
      !reasonProblem
    )
  }

  const runDryRun = async () => {
    if (!validateForm()) return
    try {
      const result = await reconcile.mutateAsync({
        counts: prepared.counts,
        reason: reason.trim(),
        dryRun: true,
      })
      setReport(result)
      setPreviewSignature(currentSignature)
    } catch (err) {
      setFormError(errorMessage(err, 'The dry run failed.'))
    }
  }

  const apply = async () => {
    setApplyError(null)
    try {
      const result = await reconcile.mutateAsync({
        counts: prepared.counts,
        reason: reason.trim(),
        dryRun: false,
      })
      setReport(result)
      setPreviewSignature(null)
      setConfirming(false)
    } catch (err) {
      setApplyError(errorMessage(err, 'The stocktake was not applied.'))
    }
  }

  const header = (
    <AdminHeader
      title="Stocktake & Reconciliation"
      subtitle="Enter physical shelf counts, preview the variances, then write them"
    />
  )

  if (!canReconcile) {
    return (
      <>
        {header}
        <main style={{ padding: '24px' }}>
          <AdminCard>
            {status === 'ready' ? (
              <ReadOnlyNotice>
                Stock reconciliation needs the Inventory Manage permission.
              </ReadOnlyNotice>
            ) : (
              <StateBlock title="Checking your permissions…" />
            )}
          </AdminCard>
        </main>
      </>
    )
  }

  return (
    <>
      {header}
      <main
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <AdminCard>
          <SectionHeading
            title="1. Counts"
            description={
              <>
                Absolute quantities on the shelf, by product SKU — not the
                difference. Variant stock is adjusted from the product page. For
                a single known movement (e.g. a delivery) use{' '}
                <Link
                  href="/admin/catalogue/products"
                  style={{ color: '#F73582', fontWeight: 600 }}
                >
                  Adjust stock
                </Link>{' '}
                on the product instead.
              </>
            }
          />

          <AdminTable
            head={
              <>
                <Th first>SKU</Th>
                <Th>Counted quantity</Th>
                <Th>Note</Th>
                <Th align="right"> </Th>
              </>
            }
          >
            {drafts.map((draft, index) => {
              const line = lineErrors[draft.key] ?? {}
              const lineNumber = index + 1
              return (
                <tr key={draft.key} style={{ borderTop: '1px solid #F5EEF2' }}>
                  <Td first>
                    <label
                      htmlFor={`count-sku-${draft.key}`}
                      style={lineLabelStyle}
                    >
                      SKU, line {lineNumber}
                    </label>
                    <TextInput
                      id={`count-sku-${draft.key}`}
                      value={draft.sku}
                      maxLength={64}
                      disabled={reconcile.isPending}
                      invalid={Boolean(line.sku)}
                      aria-describedby={
                        line.sku ? `count-sku-${draft.key}-error` : undefined
                      }
                      style={{ fontFamily: 'monospace', minWidth: '160px' }}
                      onChange={(e) =>
                        change(draft.key, { sku: e.target.value.toUpperCase() })
                      }
                    />
                    {line.sku && (
                      <FieldError id={`count-sku-${draft.key}-error`}>
                        {line.sku}
                      </FieldError>
                    )}
                  </Td>
                  <Td>
                    <label
                      htmlFor={`count-qty-${draft.key}`}
                      style={lineLabelStyle}
                    >
                      Counted quantity, line {lineNumber}
                    </label>
                    <TextInput
                      id={`count-qty-${draft.key}`}
                      type="number"
                      step={1}
                      value={draft.counted}
                      disabled={reconcile.isPending}
                      invalid={Boolean(line.counted)}
                      aria-describedby={
                        line.counted
                          ? `count-qty-${draft.key}-error`
                          : undefined
                      }
                      style={{ maxWidth: '140px' }}
                      onChange={(e) =>
                        change(draft.key, { counted: e.target.value })
                      }
                    />
                    {line.counted && (
                      <FieldError id={`count-qty-${draft.key}-error`}>
                        {line.counted}
                      </FieldError>
                    )}
                  </Td>
                  <Td>
                    <label
                      htmlFor={`count-note-${draft.key}`}
                      style={lineLabelStyle}
                    >
                      Note, line {lineNumber} (optional)
                    </label>
                    <TextInput
                      id={`count-note-${draft.key}`}
                      value={draft.note}
                      maxLength={500}
                      disabled={reconcile.isPending}
                      invalid={Boolean(line.note)}
                      aria-describedby={
                        line.note ? `count-note-${draft.key}-error` : undefined
                      }
                      style={{ minWidth: '180px' }}
                      onChange={(e) =>
                        change(draft.key, { note: e.target.value })
                      }
                    />
                    {line.note && (
                      <FieldError id={`count-note-${draft.key}-error`}>
                        {line.note}
                      </FieldError>
                    )}
                  </Td>
                  <Td align="right">
                    <ActionButton
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove line ${lineNumber}`}
                      icon={<X size={14} />}
                      disabled={reconcile.isPending || drafts.length === 1}
                      onClick={() =>
                        setDrafts((prev) =>
                          prev.filter((d) => d.key !== draft.key)
                        )
                      }
                    >
                      Remove
                    </ActionButton>
                  </Td>
                </tr>
              )
            })}
          </AdminTable>

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <ActionButton
              icon={<Plus size={15} />}
              disabled={reconcile.isPending || drafts.length >= MAX_LINES}
              onClick={() => addLines([{ sku: '', counted: '', note: '' }])}
            >
              Add line
            </ActionButton>
            <ActionButton
              variant="ghost"
              disabled={reconcile.isPending}
              onClick={() => {
                setDrafts([{ key: nextKey, sku: '', counted: '', note: '' }])
                setNextKey((key) => key + 1)
              }}
            >
              Clear all
            </ActionButton>
          </div>

          <Field
            label="Paste from a spreadsheet (CSV)"
            hint="Columns: sku, countedQuantity, note. A header row is optional. Pasted lines are added to the table above."
          >
            <TextArea
              rows={4}
              value={pasteText}
              spellCheck={false}
              placeholder={'sku,countedQuantity,note\nFLY-A5-100,42,Bay 3'}
              style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
              onChange={(e) => {
                setPasteText(e.target.value)
                setPasteError(null)
              }}
            />
          </Field>
          {pasteError && <Notice tone="error">{pasteError}</Notice>}
          <div>
            <ActionButton
              icon={<ClipboardList size={15} />}
              disabled={!pasteText.trim() || reconcile.isPending}
              onClick={applyPaste}
            >
              Add pasted lines
            </ActionButton>
          </div>
        </AdminCard>

        <AdminCard>
          <SectionHeading
            title="2. Preview, then apply"
            description="A dry run reports every variance without writing. Apply is available once the preview matches the counts above."
          />
          <Field
            label="Reason *"
            htmlFor="stocktake-reason"
            hint="Recorded against every adjusted line."
            error={reasonError}
          >
            <TextInput
              id="stocktake-reason"
              value={reason}
              maxLength={500}
              placeholder="e.g. Quarterly stocktake — warehouse A"
              disabled={reconcile.isPending}
              invalid={Boolean(reasonError)}
              aria-describedby={
                reasonError ? 'stocktake-reason-error' : undefined
              }
              onChange={(e) => {
                setReason(e.target.value)
                setFormError(null)
                setReasonError(null)
              }}
            />
          </Field>

          {formError && <Notice tone="error">{formError}</Notice>}
          {report?.dryRun && !previewIsCurrent && (
            <Notice tone="warning">
              The counts or reason changed since the last dry run. Run it again
              before applying.
            </Notice>
          )}

          <div
            style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
          >
            <ActionButton
              pending={reconcile.isPending && !confirming}
              pendingLabel="Checking…"
              disabled={reconcile.isPending}
              onClick={() => void runDryRun()}
            >
              Run dry run
            </ActionButton>
            <ActionButton
              variant="primary"
              disabled={
                !previewIsCurrent ||
                reconcile.isPending ||
                (report?.summary.adjusted ?? 0) === 0
              }
              title={
                !previewIsCurrent
                  ? 'Run a dry run on these counts first'
                  : (report?.summary.adjusted ?? 0) === 0
                    ? 'Nothing would change'
                    : undefined
              }
              onClick={() => {
                setApplyError(null)
                setConfirming(true)
              }}
            >
              Apply stocktake
            </ActionButton>
          </div>
        </AdminCard>

        {report && (
          <AdminCard>
            <SectionHeading
              title={report.dryRun ? 'Dry run report' : 'Stocktake applied'}
              description={`Reason: ${report.reason}`}
            />
            {!report.dryRun && (
              <Notice tone="success">
                {report.summary.adjusted} line(s) written.{' '}
                {report.summary.refused > 0
                  ? `${report.summary.refused} refused — see below.`
                  : ''}
              </Notice>
            )}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                gap: '12px 20px',
              }}
            >
              <StatTile label="Counted" value={report.summary.counted} />
              <StatTile label="Matched" value={report.summary.matched} />
              <StatTile
                label={report.dryRun ? 'Would adjust' : 'Adjusted'}
                value={report.summary.adjusted}
              />
              <StatTile
                label="Refused"
                value={report.summary.refused}
                tone={report.summary.refused > 0 ? 'danger' : 'default'}
              />
              <StatTile
                label="Net variance"
                value={`${report.summary.netVariance > 0 ? '+' : ''}${report.summary.netVariance}`}
                tone={report.summary.netVariance < 0 ? 'danger' : 'default'}
              />
            </div>

            <AdminTable
              head={
                <>
                  <Th first>SKU</Th>
                  <Th>Product</Th>
                  <Th align="right">System</Th>
                  <Th align="right">Counted</Th>
                  <Th align="right">Variance</Th>
                  <Th align="right">Reserved</Th>
                  <Th>Outcome</Th>
                  <Th>Message</Th>
                </>
              }
            >
              {report.lines.map((line, index) => {
                const style = OUTCOME_STYLES[line.outcome]
                return (
                  <tr
                    key={`${line.sku}-${index}`}
                    style={{ borderTop: '1px solid #F5EEF2' }}
                  >
                    <Td first mono>
                      {line.sku}
                    </Td>
                    <Td>{line.name ?? '—'}</Td>
                    <Td align="right">{line.systemQuantity ?? '—'}</Td>
                    <Td align="right">{line.countedQuantity ?? '—'}</Td>
                    <Td
                      align="right"
                      style={{
                        fontWeight: 600,
                        color:
                          line.variance === undefined || line.variance === 0
                            ? '#2B253E'
                            : line.variance < 0
                              ? '#DC2626'
                              : '#3F9C68',
                      }}
                    >
                      {line.variance === undefined
                        ? '—'
                        : `${line.variance > 0 ? '+' : ''}${line.variance}`}
                    </Td>
                    <Td align="right">{line.reserved ?? '—'}</Td>
                    <Td>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          whiteSpace: 'nowrap',
                          backgroundColor: style.bg,
                          color: style.color,
                        }}
                      >
                        {style.label}
                      </span>
                    </Td>
                    <Td style={{ color: '#6E6781', fontSize: '0.78rem' }}>
                      {line.message ?? ''}
                    </Td>
                  </tr>
                )
              })}
            </AdminTable>
          </AdminCard>
        )}
      </main>

      <ConfirmModal
        isOpen={confirming}
        title="Apply stocktake"
        tone="primary"
        message={
          <>
            Overwrite the shelf count of{' '}
            <strong>{report?.summary.adjusted ?? 0}</strong> product(s) with the
            counted quantities (net variance{' '}
            <strong>
              {(report?.summary.netVariance ?? 0) > 0 ? '+' : ''}
              {report?.summary.netVariance ?? 0}
            </strong>
            )? Lines that were refused in the preview are not written.
          </>
        }
        confirmLabel="Apply counts"
        pendingLabel="Applying…"
        pending={reconcile.isPending}
        error={applyError}
        onConfirm={() => void apply()}
        onCancel={() => setConfirming(false)}
      />
    </>
  )
}
