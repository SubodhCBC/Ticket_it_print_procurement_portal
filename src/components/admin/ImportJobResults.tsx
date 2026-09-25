// src/components/admin/ImportJobResults.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ImportJob, ImportOutcome } from '@/types/catalog-admin'
import {
  ActionButton,
  AdminTable,
  Notice,
  SelectInput,
  StatTile,
  StateBlock,
  Td,
  Th,
} from './ProductAdminUi'
import { formatDateTime } from './ProductAdminUtils'

const PAGE = 200

const JOB_STATUS_STYLES: Record<
  string,
  { bg: string; color: string; label: string }
> = {
  QUEUED: { bg: '#F5EEF2', color: '#6E6781', label: 'Queued' },
  RUNNING: { bg: '#FEF3C7', color: '#B45309', label: 'Running' },
  COMPLETED: { bg: '#EAF8EF', color: '#228B53', label: 'Completed' },
  FAILED: { bg: '#FEF2F2', color: '#DC2626', label: 'Failed' },
}

const OUTCOME_STYLES: Record<ImportOutcome, { bg: string; color: string }> = {
  created: { bg: '#EAF8EF', color: '#228B53' },
  updated: { bg: '#E0F2FE', color: '#0284C7' },
  skipped: { bg: '#F5EEF2', color: '#6E6781' },
  failed: { bg: '#FEF2F2', color: '#DC2626' },
}

export function ImportJobStatusBadge({ status }: { status: string }) {
  const style = JOB_STATUS_STYLES[status] ?? {
    bg: '#F5EEF2',
    color: '#5C566E',
    label: status,
  }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 9px',
        borderRadius: '9999px',
        fontSize: '0.72rem',
        fontWeight: 600,
        backgroundColor: style.bg,
        color: style.color,
        whiteSpace: 'nowrap',
      }}
    >
      {style.label}
    </span>
  )
}

/**
 * The outcome of one import job: counts, a run-level failure if there was
 * one, and the per-row results filtered by outcome.
 */
export function ImportJobResults({
  job,
  isPolling,
  queuedTooLong = false,
}: {
  job: ImportJob
  isPolling: boolean
  /** Still QUEUED well after it was created; see `useImportJob`. */
  queuedTooLong?: boolean
}) {
  const [filter, setFilter] = useState<ImportOutcome | 'all'>('all')
  const [limit, setLimit] = useState(PAGE)

  const stored = job.results ?? []
  // Above 1,000 rows the server keeps only the failures, plus a `row: 0` note
  // saying so (`storableResults`). The note is not a row: it stays out of the
  // counts and the filters, and the job's own counts stand in for the rows
  // that were not kept.
  const note = stored.find((result) => result.row === 0) ?? null
  const results = stored.filter((result) => result.row !== 0)
  const truncated = note !== null
  const countFor = (outcome: ImportOutcome) =>
    truncated
      ? job[outcome]
      : results.filter((result) => result.outcome === outcome).length

  const filtered =
    filter === 'all'
      ? results
      : results.filter((result) => result.outcome === filter)
  const finished = job.status === 'COMPLETED' || job.status === 'FAILED'

  const emptyDescription =
    results.length === 0 && !truncated
      ? 'This job has no stored row results.'
      : truncated && filter !== 'failed'
        ? filter === 'all'
          ? 'No rows failed. Row details are not kept for imports over 1,000 rows; the counts above are exact.'
          : `Row details are not kept for imports over 1,000 rows, so the ${countFor(filter).toLocaleString()} ${filter} row(s) are counted above but not listed.`
        : 'No rows have this outcome.'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          flexWrap: 'wrap',
          fontSize: '0.8rem',
          color: '#6E6781',
        }}
      >
        <ImportJobStatusBadge status={job.status} />
        <span>
          {job.dryRun ? 'Dry run — nothing was written' : 'Live import'}
          {job.updateExisting
            ? ' · existing SKUs updated'
            : ' · existing SKUs skipped'}
        </span>
        <span>· queued {formatDateTime(job.createdAt)}</span>
        {job.finishedAt && (
          <span>· finished {formatDateTime(job.finishedAt)}</span>
        )}
      </div>

      {isPolling && !finished && (
        <Notice
          tone={job.status === 'QUEUED' && queuedTooLong ? 'warning' : 'info'}
        >
          {job.status === 'QUEUED'
            ? queuedTooLong
              ? `This job has been waiting in the queue since ${formatDateTime(job.createdAt)}. The import worker may not be running; ask an administrator to check it. You can start another import meanwhile.`
              : 'Waiting for the import queue to pick this job up…'
            : `Processing ${job.totalRows} row(s)…`}{' '}
          This page refreshes automatically.
        </Notice>
      )}

      {job.error && (
        <Notice tone="error">
          {job.status === 'FAILED'
            ? `The import stopped: ${job.error}`
            : job.status === 'QUEUED'
              ? `${job.error}. Nothing will process this job; start the import again.`
              : job.error}
        </Notice>
      )}

      {finished && job.status === 'COMPLETED' && (
        <Notice tone={job.failed > 0 ? 'warning' : 'success'}>
          {job.dryRun
            ? `Dry run finished: ${job.created} would be created, ${job.updated} updated, ${job.skipped} skipped, ${job.failed} failed.`
            : `Import finished: ${job.created} created, ${job.updated} updated, ${job.skipped} skipped, ${job.failed} failed. New products are created as drafts.`}
        </Notice>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '12px 20px',
        }}
      >
        <StatTile label="Rows" value={job.totalRows} />
        <StatTile
          label={job.dryRun ? 'Would create' : 'Created'}
          value={job.created}
          tone={job.created > 0 ? 'success' : 'default'}
        />
        <StatTile
          label={job.dryRun ? 'Would update' : 'Updated'}
          value={job.updated}
        />
        <StatTile label="Skipped" value={job.skipped} />
        <StatTile
          label="Failed"
          value={job.failed}
          tone={job.failed > 0 ? 'danger' : 'default'}
        />
      </div>

      {finished && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '10px',
              flexWrap: 'wrap',
            }}
          >
            <div
              style={{ fontSize: '0.84rem', fontWeight: 600, color: '#2B253E' }}
            >
              Row results
            </div>
            <SelectInput
              value={filter}
              style={{ width: 'auto' }}
              onChange={(e) => {
                setFilter(e.target.value as ImportOutcome | 'all')
                setLimit(PAGE)
              }}
            >
              <option value="all">
                {truncated ? 'All listed' : 'All outcomes'} ({results.length})
              </option>
              {(['failed', 'skipped', 'created', 'updated'] as const).map(
                (outcome) => (
                  <option key={outcome} value={outcome}>
                    {outcome[0].toUpperCase() + outcome.slice(1)} (
                    {countFor(outcome).toLocaleString()}
                    {truncated && outcome !== 'failed' ? ', not listed' : ''})
                  </option>
                )
              )}
            </SelectInput>
          </div>

          {note?.message && <Notice tone="info">{note.message}</Notice>}

          {filtered.length === 0 ? (
            <StateBlock
              title="No rows to show"
              description={emptyDescription}
            />
          ) : (
            <>
              <AdminTable
                head={
                  <>
                    <Th first>Row</Th>
                    <Th>SKU</Th>
                    <Th>Outcome</Th>
                    <Th>Message</Th>
                  </>
                }
              >
                {filtered.slice(0, limit).map((result, index) => (
                  <tr
                    key={`${result.row}-${index}`}
                    style={{ borderTop: '1px solid #F5EEF2' }}
                  >
                    <Td first>{result.row > 0 ? result.row : '—'}</Td>
                    <Td mono>
                      {result.productId && !job.dryRun ? (
                        <Link
                          href={`/admin/catalogue/products/${result.productId}`}
                          style={{ color: '#F73582' }}
                        >
                          {result.sku ?? '—'}
                        </Link>
                      ) : (
                        (result.sku ?? '—')
                      )}
                    </Td>
                    <Td>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '9999px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          backgroundColor: OUTCOME_STYLES[result.outcome].bg,
                          color: OUTCOME_STYLES[result.outcome].color,
                        }}
                      >
                        {result.outcome}
                      </span>
                    </Td>
                    <Td style={{ color: '#6E6781', fontSize: '0.8rem' }}>
                      {result.message ?? ''}
                    </Td>
                  </tr>
                ))}
              </AdminTable>
              {filtered.length > limit && (
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <ActionButton onClick={() => setLimit((l) => l + PAGE)}>
                    Show more ({filtered.length - limit} remaining)
                  </ActionButton>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
