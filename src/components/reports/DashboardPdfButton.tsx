// src/components/reports/DashboardPdfButton.tsx
'use client'

import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { ActionButton, Notice } from '@/components/admin/ProductAdminUi'
import { errorMessage } from '@/components/admin/ProductAdminUtils'
import { toApiError } from '@/services/api.service'
import { saveBlob } from '@/services/data-source/api/api-reports.adapter'
import { exportDashboardPdf } from '@/services/reports.service'

type DashboardPdfParams = Parameters<typeof exportDashboardPdf>[0]

/**
 * The executive dashboard as a PDF (SOW §15: "PDF for the consolidated billing
 * summary and executive dashboards").
 *
 * Takes the filters the dashboard on screen was fetched with, so the file
 * carries the same figures. A platform-wide PDF is administrator-only; when the
 * API refuses it, the account's own dashboard is what the screen fell back to,
 * so that is what is downloaded.
 */
export function DashboardPdfButton({ params }: { params: DashboardPdfParams }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const download = async () => {
    setError(null)
    setPending(true)
    try {
      let file
      try {
        file = await exportDashboardPdf(params)
      } catch (err) {
        if (params?.scope !== 'platform' || toApiError(err).status !== 403)
          throw err
        file = await exportDashboardPdf({ ...params, scope: 'account' })
      }
      saveBlob(file.blob, file.filename)
    } catch (err) {
      setError(errorMessage(err, 'The dashboard PDF could not be downloaded.'))
    } finally {
      setPending(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {/* The button sat under a finger's 40px on touch. */}
      <ActionButton
        className="touch-target"
        icon={<FileDown size={15} />}
        pending={pending}
        pendingLabel="Preparing PDF…"
        onClick={() => void download()}
      >
        Download PDF
      </ActionButton>
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  )
}
