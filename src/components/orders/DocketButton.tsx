// src/components/orders/DocketButton.tsx
'use client'

import { useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { toApiError } from '@/services/api.service'
import { fetchOrderDocket } from '@/services/data-source/api/api-files.adapter'

/**
 * Opens the order's fulfilment docket — lines, options, personalised wording
 * and line notes, for the print room and the packing bench — as a PDF in a new
 * tab (SOW F-19).
 *
 * The tab is opened before the request, in the click itself: a window opened
 * after an `await` is no longer a user gesture, and pop-up blockers stop it.
 */
export function DocketButton({
  orderId,
  orderNumber,
}: {
  orderId: string
  orderNumber: string
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const open = async () => {
    if (pending) return
    setError(null)
    setPending(true)
    const tab = window.open('', '_blank')
    try {
      const blob = await fetchOrderDocket(orderId)
      const url = URL.createObjectURL(
        blob.type === 'application/pdf'
          ? blob
          : new Blob([blob], { type: 'application/pdf' })
      )
      if (tab) {
        tab.location.href = url
        tab.document.title = `Docket ${orderNumber}`
      } else {
        // Blocked anyway: fall back to a download.
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `docket-${orderNumber}.pdf`
        anchor.click()
      }
      // Long enough for the tab to load it.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      tab?.close()
      setError(toApiError(err).message || 'The docket could not be opened.')
    } finally {
      setPending(false)
    }
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button
        type="button"
        onClick={() => void open()}
        disabled={pending}
        title="Open the fulfilment docket as a PDF"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          borderRadius: '10px',
          border: '1px solid #F0E6EC',
          backgroundColor: '#FFFFFF',
          color: '#2B253E',
          fontSize: '0.82rem',
          fontWeight: 600,
          cursor: pending ? 'wait' : 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <ClipboardList size={15} />
        {pending ? 'Opening…' : 'Docket'}
      </button>
      {error && (
        <span role="alert" style={{ fontSize: '0.72rem', color: '#DC2626' }}>
          {error}
        </span>
      )}
    </span>
  )
}
