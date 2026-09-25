// src/components/reports/ReportDownloadButtons.tsx
'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
import { ActionButton, Notice } from '@/components/admin/ProductAdminUi'
import { errorMessage } from '@/components/admin/ProductAdminUtils'
import { saveBlob } from '@/services/data-source/api/api-reports.adapter'
import { exportReportFile } from '@/services/reports.service'
import type {
  ReportFileFormat,
  ReportFileKey,
} from '@/services/data-source/api/governance.types'

const FORMAT_LABELS: Record<ReportFileFormat, string> = {
  csv: 'CSV',
  xlsx: 'XLSX',
}

/**
 * CSV and XLSX for a tabular report (SOW §15: "CSV and XLSX on every tabular
 * report").
 *
 * The file comes from the server, from the same query as the table on screen —
 * never assembled from the rows the browser happens to hold — so it carries
 * every row, not the page showing, and the XLSX keeps numbers as numbers.
 */
export function ReportDownloadButtons({
  report,
  params,
  label,
  formats = ['csv', 'xlsx'],
  disabled = false,
}: {
  report: ReportFileKey
  /** The same filters the table on screen was fetched with. */
  params?: object
  /** Prefixed to the format, e.g. "By approver" → "By approver CSV". */
  label?: string
  formats?: ReportFileFormat[]
  disabled?: boolean
}) {
  const [pending, setPending] = useState<ReportFileFormat | null>(null)
  const [error, setError] = useState<string | null>(null)

  const download = async (format: ReportFileFormat) => {
    setError(null)
    setPending(format)
    try {
      const { blob, filename } = await exportReportFile(report, format, params)
      saveBlob(blob, filename)
    } catch (err) {
      setError(errorMessage(err, 'The report file could not be downloaded.'))
    } finally {
      setPending(null)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {formats.map((format) => (
          <ActionButton
            key={format}
            size="sm"
            icon={<Download size={13} />}
            pending={pending === format}
            pendingLabel="Preparing…"
            disabled={disabled || (pending !== null && pending !== format)}
            onClick={() => void download(format)}
          >
            {label
              ? `${label} ${FORMAT_LABELS[format]}`
              : FORMAT_LABELS[format]}
          </ActionButton>
        ))}
      </div>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
