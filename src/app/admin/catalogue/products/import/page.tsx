// src/app/admin/catalogue/products/import/page.tsx
'use client'

import { SkeletonTable, SkeletonText } from '@/components/ui/Skeleton'
import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Download, FileSpreadsheet, Upload } from 'lucide-react'
import { IMPORT_TEMPLATE_CSV } from '@/components/admin/productImportTemplate'
import { downloadProductImportTemplate } from '@/services/products.service'
import { saveBlob } from '@/services/data-source/api/api-reports.adapter'
import { AdminHeader } from '@/components/admin/AdminHeader'
import {
  ActionButton,
  AdminCard,
  AdminTable,
  Notice,
  ReadOnlyNotice,
  SectionHeading,
  StateBlock,
  Td,
  TextArea,
  Th,
} from '@/components/admin/ProductAdminUi'
import {
  ImportJobResults,
  ImportJobStatusBadge,
} from '@/components/admin/ImportJobResults'
import { formatDateTime, formatNumber } from '@/lib/format'
import {
  errorMessage,
  MONEY_PATTERN,
  normaliseHeader,
  parseCsv,
} from '@/components/admin/ProductAdminUtils'
import { useAuth } from '@/hooks/useAuth'
import {
  useCatalogImport,
  useImportJob,
  useImportJobs,
} from '@/hooks/useProducts'
import type { ImportRowInput } from '@/types/catalog-admin'

const MAX_ROWS = 10_000
const PREVIEW_ROWS = 50
const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/
const MILLIMETRES = /^\d{1,3}(\.\d{1,2})?$/
const UOMS = ['EACH', 'PACK', 'BOX', 'ROLL', 'SET', 'SQUARE_METRE']
const UOM_CODES: Record<string, string> = {
  EA: 'EACH',
  PK: 'PACK',
  BX: 'BOX',
  RL: 'ROLL',
  ST: 'SET',
  M2: 'SQUARE_METRE',
}

type Column = keyof ImportRowInput

/** Header spellings accepted for each field, after `normaliseHeader`. */
const COLUMN_ALIASES: Record<string, Column> = {
  sku: 'sku',
  name: 'name',
  productname: 'name',
  categorycode: 'categoryCode',
  category: 'categoryCode',
  description: 'description',
  baseprice: 'basePrice',
  price: 'basePrice',
  moq: 'moq',
  minimumorderquantity: 'moq',
  ordermultiple: 'orderMultiple',
  packsize: 'packSize',
  uom: 'uom',
  unit: 'uom',
  widthmm: 'widthMm',
  heightmm: 'heightMm',
  bleedmm: 'bleedMm',
  safemarginmm: 'safeMarginMm',
  lowstockthreshold: 'lowStockThreshold',
  leadtimedays: 'leadTimeDays',
  tags: 'tags',
  taxtreatment: 'taxTreatment',
  tax: 'taxTreatment',
  gst: 'taxTreatment',
  gsttreatment: 'taxTreatment',
}

/** What `taxTreatment` accepts, as the server spells it. */
const TAX_TREATMENTS = ['STANDARD', 'ZERO_RATED', 'EXEMPT']

/**
 * Whole-number columns with the bounds `ImportRowSchema` puts on them. Kept in
 * step by hand: a preview that passes a row the server fails is the kind of
 * "OK" nobody trusts twice.
 */
const INTEGER_COLUMNS: { column: Column; min: number; max?: number }[] = [
  { column: 'moq', min: 1 },
  { column: 'orderMultiple', min: 1 },
  { column: 'packSize', min: 1 },
  { column: 'widthMm', min: 1 },
  { column: 'heightMm', min: 1 },
  { column: 'lowStockThreshold', min: 0 },
  { column: 'leadTimeDays', min: 0, max: 365 },
]

/** `ImportRowSchema`'s string limits. */
const MAX_NAME = 200
const MAX_CATEGORY_CODE = 48
const MAX_DESCRIPTION = 4000
const MAX_TAG = 48
const MAX_TAGS = 30

/** The same rows the downloadable template carries, so the two cannot differ. */
const EXAMPLE_CSV = IMPORT_TEMPLATE_CSV

interface ParsedRow {
  row: ImportRowInput
  issues: string[]
}

interface ParseResult {
  rows: ParsedRow[]
  ignoredColumns: string[]
  missingColumns: string[]
  error: string | null
}

/**
 * CSV text → rows in `ImportRowSchema` shape.
 *
 * Empty cells are left out so the server's defaults apply. A cell that looks
 * wrong is flagged here but still sent as typed: the server validates every
 * row and reports it against the same row number, which keeps the report in
 * step with the spreadsheet.
 */
function parseImport(text: string): ParseResult {
  const empty = { rows: [], ignoredColumns: [], missingColumns: [] }
  if (!text.trim()) return { ...empty, error: null }

  const table = parseCsv(text)
  if (table.length < 2) {
    return {
      ...empty,
      error: 'Add a header row and at least one product row.',
    }
  }

  const header = table[0]
  const columns = header.map((cell) => COLUMN_ALIASES[normaliseHeader(cell)])
  const ignoredColumns = header.filter((_, index) => !columns[index])
  const missingColumns = (
    ['sku', 'name', 'categoryCode', 'basePrice'] as Column[]
  ).filter((required) => !columns.includes(required))

  if (missingColumns.length > 0) {
    return {
      rows: [],
      ignoredColumns,
      missingColumns,
      error: `The header is missing required column(s): ${missingColumns.join(', ')}.`,
    }
  }

  const rows = table.slice(1).map((cells): ParsedRow => {
    const values: Partial<Record<Column, string>> = {}
    columns.forEach((column, index) => {
      const cell = cells[index]?.trim() ?? ''
      if (column && cell !== '') values[column] = cell
    })

    const issues: string[] = []
    const sku = (values.sku ?? '').toUpperCase()
    if (!sku) issues.push('sku is required')
    else if (sku.length < 2 || sku.length > 64 || !SKU_PATTERN.test(sku))
      issues.push('sku has invalid characters or length')
    if (!values.name) issues.push('name is required')
    else if (values.name.length > MAX_NAME)
      issues.push(`name is longer than ${MAX_NAME} characters`)
    if (!values.categoryCode) issues.push('categoryCode is required')
    else if (values.categoryCode.length > MAX_CATEGORY_CODE)
      issues.push(`categoryCode is longer than ${MAX_CATEGORY_CODE} characters`)
    if (values.description && values.description.length > MAX_DESCRIPTION)
      issues.push(`description is longer than ${MAX_DESCRIPTION} characters`)

    const basePrice = (values.basePrice ?? '').replace(/^\$/, '')
    if (!basePrice) issues.push('basePrice is required')
    else if (!MONEY_PATTERN.test(basePrice))
      issues.push('basePrice must look like 12.50')

    const row: ImportRowInput = {
      sku,
      name: values.name ?? '',
      categoryCode: (values.categoryCode ?? '').toUpperCase(),
      basePrice,
    }
    if (values.description) row.description = values.description

    const record = row as unknown as Record<string, unknown>
    for (const { column, min, max } of INTEGER_COLUMNS) {
      const raw = values[column]
      if (raw === undefined) continue
      // The schema coerces with `Number()` and then requires an integer, so
      // "1.0" is 1 and accepted, while "1.5" and "1,000" are refused.
      const value = Number(raw)
      if (!Number.isInteger(value)) {
        record[column] = raw
        issues.push(`${column} must be a whole number`)
        continue
      }
      record[column] = value
      if (value < min) issues.push(`${column} must be at least ${min}`)
      else if (max !== undefined && value > max)
        issues.push(`${column} must be at most ${max}`)
    }

    for (const column of ['bleedMm', 'safeMarginMm'] as const) {
      const raw = values[column]
      if (raw === undefined) continue
      row[column] = raw
      if (!MILLIMETRES.test(raw))
        issues.push(`${column} must look like 3 or 1.5`)
    }

    if (values.uom) {
      const upper = values.uom.toUpperCase()
      row.uom = UOM_CODES[upper] ?? upper
      if (!UOMS.includes(row.uom)) issues.push(`uom "${values.uom}" is unknown`)
    }

    if (values.taxTreatment) {
      // "Zero rated" and "zero-rated" are how people type it.
      const treatment = values.taxTreatment
        .trim()
        .toUpperCase()
        .replace(/[\s-]+/g, '_')
      row.taxTreatment = treatment
      if (!TAX_TREATMENTS.includes(treatment))
        issues.push(
          `taxTreatment "${values.taxTreatment}" must be STANDARD, ZERO_RATED or EXEMPT`
        )
    }

    if (values.tags) {
      row.tags = values.tags
        .split('|')
        .map((tag) => tag.trim())
        .filter(Boolean)
      if (row.tags.length > MAX_TAGS)
        issues.push(`at most ${MAX_TAGS} tags (found ${row.tags.length})`)
      const longTag = row.tags.find((tag) => tag.length > MAX_TAG)
      if (longTag)
        issues.push(`tag "${longTag}" is longer than ${MAX_TAG} characters`)
    }

    return { row, issues }
  })

  // The server takes rows one at a time, so a repeated SKU is not refused: the
  // later row is skipped, or overwrites the earlier one when updating — and a
  // dry run reports both as "created". Neither is what the file meant.
  const firstRowBySku = new Map<string, number>()
  rows.forEach((entry, index) => {
    const sku = entry.row.sku
    if (!sku) return
    const first = firstRowBySku.get(sku)
    if (first === undefined) firstRowBySku.set(sku, index + 1)
    else
      entry.issues.push(
        `sku repeats row ${first}; this row would be skipped or overwrite it`
      )
  })

  return {
    rows,
    ignoredColumns,
    missingColumns,
    error:
      rows.length > MAX_ROWS
        ? `This file has ${formatNumber(rows.length)} rows. Import at most ${formatNumber(MAX_ROWS)} at a time; split the file.`
        : null,
  }
}

export default function ProductImportPage() {
  const { hasPermission, status } = useAuth()

  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

  /** The template as a file, to fill in a spreadsheet rather than here. */
  const downloadTemplate = async () => {
    setTemplateError(null)
    setIsDownloadingTemplate(true)
    try {
      const { blob, filename } = await downloadProductImportTemplate()
      saveBlob(blob, filename)
    } catch (err) {
      setTemplateError(
        errorMessage(err, 'The import template could not be downloaded.')
      )
    } finally {
      setIsDownloadingTemplate(false)
    }
  }
  const canManage = hasPermission('CATALOG_MANAGE')

  const fileRef = useRef<HTMLInputElement>(null)
  const [csvText, setCsvText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [updateExisting, setUpdateExisting] = useState(false)
  const [dryRun, setDryRun] = useState(true)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  /**
   * The job started from this page. Only it holds the Start button; a job
   * opened from the history is just being looked at.
   */
  const [sessionJobId, setSessionJobId] = useState<string | null>(null)
  /** The text a job was started from, to offer "run it for real" on the same file. */
  const [submittedText, setSubmittedText] = useState<string | null>(null)
  const [historyPage, setHistoryPage] = useState(1)

  const parsed = useMemo(() => parseImport(csvText), [csvText])
  const rowsWithIssues = parsed.rows.filter((r) => r.issues.length > 0)

  const startImport = useCatalogImport()
  const {
    job,
    isPolling,
    queuedTooLong,
    error: jobError,
    refetch: refetchJob,
  } = useImportJob(activeJobId)
  const history = useImportJobs(historyPage, canManage)

  const loadFile = async (file: File | undefined) => {
    setFileError(null)
    if (!file) return
    if (file.size > 20 * 1024 * 1024) {
      setFileError('That file is larger than 20 MB; split it first.')
      return
    }
    try {
      setCsvText(await file.text())
      setFileName(file.name)
      setSubmitError(null)
    } catch {
      setFileError('The file could not be read.')
    }
  }

  const submit = async (asDryRun: boolean, update = updateExisting) => {
    setSubmitError(null)
    if (parsed.error || parsed.rows.length === 0) {
      setSubmitError(parsed.error ?? 'Nothing to import.')
      return
    }
    try {
      const created = await startImport.mutateAsync({
        rows: parsed.rows.map((r) => r.row),
        updateExisting: update,
        dryRun: asDryRun,
      })
      setActiveJobId(created.id)
      setSessionJobId(created.id)
      setSubmittedText(csvText)
    } catch (err) {
      setSubmitError(errorMessage(err, 'The import could not be started.'))
    }
  }

  const canRunForReal =
    job?.dryRun === true &&
    job.status === 'COMPLETED' &&
    submittedText === csvText &&
    csvText.trim() !== ''
  // "For real" must mean what was previewed, so it reuses the dry run's
  // setting rather than the checkbox, which may have been changed since.
  const realRunUpdates = job?.updateExisting === true

  // A job that is still going blocks another start, but only one started from
  // this page — and not once the queue has evidently stopped picking jobs up,
  // or the page would stay locked for as long as the worker is down.
  const startBlocked =
    activeJobId !== null &&
    activeJobId === sessionJobId &&
    isPolling &&
    !queuedTooLong

  const header = (
    <AdminHeader
      title="Bulk product import"
      subtitle="Upload a CSV of products; it is processed as a background job with a per-row report"
      actionButton={
        <Link
          href="/admin/catalogue/products"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '10px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #F0E6EC',
            color: '#2B253E',
            fontSize: '0.82rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <ArrowLeft size={16} />
          <span>Back to products</span>
        </Link>
      }
    />
  )

  if (!canManage) {
    return (
      <>
        {header}
        <main className="page-pad" style={{ paddingBlock: '24px' }}>
          <AdminCard>
            {status === 'ready' ? (
              <ReadOnlyNotice>
                Bulk import needs the Catalogue Manage permission. Ask a
                platform administrator to run it.
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
        className="page-pad"
        style={{
          paddingBlock: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <AdminCard>
          <SectionHeading
            title="1. Load the file"
            description={
              <>
                Required columns: <code>sku</code>, <code>name</code>,{' '}
                <code>categoryCode</code>, <code>basePrice</code>. Optional:{' '}
                <code>description</code>, <code>moq</code>,{' '}
                <code>orderMultiple</code>, <code>packSize</code>,{' '}
                <code>uom</code> (EACH, PACK, BOX, ROLL, SET, SQUARE_METRE),{' '}
                <code>widthMm</code>, <code>heightMm</code>,{' '}
                <code>bleedMm</code>, <code>safeMarginMm</code>,{' '}
                <code>lowStockThreshold</code>, <code>leadTimeDays</code>,{' '}
                <code>tags</code> (separated by |). Products are created as
                drafts; imports never publish or change stock.
              </>
            }
            action={
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <ActionButton
                  icon={<Download size={15} />}
                  pending={isDownloadingTemplate}
                  pendingLabel="Preparing…"
                  onClick={() => void downloadTemplate()}
                >
                  Download template
                </ActionButton>
                <ActionButton
                  icon={<FileSpreadsheet size={15} />}
                  onClick={() => {
                    setCsvText(EXAMPLE_CSV)
                    setFileName(null)
                  }}
                >
                  Insert example
                </ActionButton>
              </div>
            }
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={(e) => void loadFile(e.target.files?.[0])}
            />
            <ActionButton
              icon={<Upload size={15} />}
              onClick={() => fileRef.current?.click()}
            >
              Choose CSV file
            </ActionButton>
            <span style={{ fontSize: '0.8rem', color: '#6E6781' }}>
              {fileName ?? 'or paste the CSV below'}
            </span>
          </div>

          {fileError && <Notice tone="error">{fileError}</Notice>}
          {templateError && <Notice tone="error">{templateError}</Notice>}

          <TextArea
            rows={8}
            value={csvText}
            placeholder="sku,name,categoryCode,basePrice,…"
            spellCheck={false}
            onChange={(e) => {
              setCsvText(e.target.value)
              setFileName(null)
            }}
            style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}
          />

          {parsed.error && <Notice tone="error">{parsed.error}</Notice>}
          {parsed.ignoredColumns.length > 0 && (
            <Notice tone="warning">
              Ignored column(s) the importer does not read:{' '}
              {parsed.ignoredColumns.join(', ')}.
            </Notice>
          )}
        </AdminCard>

        {parsed.rows.length > 0 && !parsed.missingColumns.length && (
          <AdminCard>
            <SectionHeading
              title="2. Check and submit"
              description={`${formatNumber(parsed.rows.length)} row(s) read${
                rowsWithIssues.length > 0
                  ? `, ${rowsWithIssues.length} with problems to fix`
                  : ''
              }. Row numbers count product rows, not the header.`}
            />

            {rowsWithIssues.length > 0 && (
              <Notice tone="warning">
                Rows with problems are still sent: the job reports invalid rows
                as failed while importing the rest, and a repeated SKU is
                skipped or overwrites its earlier row. Fix them in the file and
                re-import to bring them in.
              </Notice>
            )}

            <AdminTable
              minWidth={760}
              head={
                <>
                  <Th first>Row</Th>
                  <Th>SKU</Th>
                  <Th>Name</Th>
                  <Th>Category</Th>
                  <Th align="right">Base price</Th>
                  <Th>Problems</Th>
                </>
              }
            >
              {parsed.rows.slice(0, PREVIEW_ROWS).map((entry, index) => (
                <tr key={index} style={{ borderTop: '1px solid #F5EEF2' }}>
                  <Td first>{index + 1}</Td>
                  <Td mono>{entry.row.sku || '—'}</Td>
                  <Td>{entry.row.name || '—'}</Td>
                  <Td mono>{entry.row.categoryCode || '—'}</Td>
                  <Td align="right">{entry.row.basePrice || '—'}</Td>
                  <Td
                    style={{
                      color: entry.issues.length ? '#DC2626' : '#3F9C68',
                      fontSize: '0.78rem',
                    }}
                  >
                    {entry.issues.length ? entry.issues.join('; ') : 'OK'}
                  </Td>
                </tr>
              ))}
            </AdminTable>
            {parsed.rows.length > PREVIEW_ROWS && (
              <div style={{ fontSize: '0.78rem', color: '#A39BB3' }}>
                Showing the first {PREVIEW_ROWS} of{' '}
                {formatNumber(parsed.rows.length)} rows.
              </div>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.84rem',
                color: '#2B253E',
              }}
            >
              <label
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                <input
                  type="checkbox"
                  checked={dryRun}
                  disabled={startImport.isPending}
                  onChange={(e) => setDryRun(e.target.checked)}
                />
                Dry run — validate and report without writing anything
              </label>
              <label
                style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
              >
                <input
                  type="checkbox"
                  checked={updateExisting}
                  disabled={startImport.isPending}
                  onChange={(e) => setUpdateExisting(e.target.checked)}
                />
                Update products whose SKU already exists (otherwise they are
                skipped)
              </label>
            </div>

            {submitError && <Notice tone="error">{submitError}</Notice>}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <ActionButton
                variant="primary"
                pending={startImport.isPending}
                pendingLabel="Submitting…"
                disabled={Boolean(parsed.error) || startBlocked}
                onClick={() => void submit(dryRun)}
              >
                {dryRun ? 'Start dry run' : 'Start import'}
              </ActionButton>
            </div>
          </AdminCard>
        )}

        {activeJobId && (
          <AdminCard>
            <SectionHeading
              title="Import job"
              description={<code>{activeJobId}</code>}
              action={
                canRunForReal ? (
                  <ActionButton
                    variant="primary"
                    pending={startImport.isPending}
                    pendingLabel="Submitting…"
                    onClick={() => {
                      setDryRun(false)
                      setUpdateExisting(realRunUpdates)
                      void submit(false, realRunUpdates)
                    }}
                  >
                    Run this file for real (existing SKUs{' '}
                    {realRunUpdates ? 'updated' : 'skipped'}, as previewed)
                  </ActionButton>
                ) : undefined
              }
            />
            {job && (
              <ImportJobResults
                key={job.id}
                job={job}
                isPolling={isPolling}
                queuedTooLong={queuedTooLong}
              />
            )}
            {jobError ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: '1 1 260px' }}>
                  <Notice tone="error">
                    {job
                      ? 'This job stopped refreshing because its status could not be loaded: '
                      : ''}
                    {errorMessage(jobError, 'The job could not be loaded.')}
                  </Notice>
                </div>
                <ActionButton size="sm" onClick={() => void refetchJob()}>
                  Retry
                </ActionButton>
              </div>
            ) : (
              !job && <SkeletonText lines={4} />
            )}
          </AdminCard>
        )}

        <AdminCard>
          <SectionHeading
            title="Recent imports"
            description="Newest first. Open a job to see its row results."
          />
          {history.isLoading ? (
            <SkeletonTable
              rows={4}
              columns={9}
              label="Loading import history"
            />
          ) : history.error ? (
            <Notice tone="error">
              {errorMessage(
                history.error,
                'Import history could not be loaded.'
              )}
            </Notice>
          ) : !history.data?.items.length ? (
            <StateBlock
              title="No imports yet"
              description="Jobs you start appear here."
            />
          ) : (
            <>
              <AdminTable
                minWidth={900}
                head={
                  <>
                    <Th first>Started</Th>
                    <Th>Status</Th>
                    <Th>Mode</Th>
                    <Th align="right">Rows</Th>
                    <Th align="right">Created</Th>
                    <Th align="right">Updated</Th>
                    <Th align="right">Skipped</Th>
                    <Th align="right">Failed</Th>
                    <Th align="right"> </Th>
                  </>
                }
              >
                {history.data.items.map((row) => (
                  <tr
                    key={row.id}
                    style={{
                      borderTop: '1px solid #F5EEF2',
                      backgroundColor:
                        row.id === activeJobId ? '#FCF7FA' : undefined,
                    }}
                  >
                    <Td first style={{ whiteSpace: 'nowrap' }}>
                      {formatDateTime(row.createdAt)}
                    </Td>
                    <Td>
                      <ImportJobStatusBadge status={row.status} />
                    </Td>
                    <Td style={{ color: '#6E6781', fontSize: '0.8rem' }}>
                      {row.dryRun ? 'Dry run' : 'Live'}
                      {row.updateExisting ? ' · update' : ''}
                    </Td>
                    <Td align="right">{row.totalRows}</Td>
                    <Td align="right">{row.created}</Td>
                    <Td align="right">{row.updated}</Td>
                    <Td align="right">{row.skipped}</Td>
                    <Td
                      align="right"
                      style={{ color: row.failed > 0 ? '#DC2626' : undefined }}
                    >
                      {row.failed}
                    </Td>
                    <Td align="right">
                      <ActionButton
                        size="sm"
                        disabled={row.id === activeJobId}
                        onClick={() => {
                          setActiveJobId(row.id)
                          setSubmittedText(null)
                        }}
                      >
                        View
                      </ActionButton>
                    </Td>
                  </tr>
                ))}
              </AdminTable>
              {history.data.totalPages > 1 && (
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.8rem',
                    color: '#6E6781',
                  }}
                >
                  <ActionButton
                    size="sm"
                    disabled={historyPage <= 1}
                    onClick={() => setHistoryPage((page) => page - 1)}
                  >
                    Previous
                  </ActionButton>
                  <span>
                    Page {history.data.page} of {history.data.totalPages}
                  </span>
                  <ActionButton
                    size="sm"
                    disabled={historyPage >= history.data.totalPages}
                    onClick={() => setHistoryPage((page) => page + 1)}
                  >
                    Next
                  </ActionButton>
                </div>
              )}
            </>
          )}
        </AdminCard>
      </main>
    </>
  )
}
