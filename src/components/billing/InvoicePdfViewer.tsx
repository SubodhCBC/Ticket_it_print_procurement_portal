// src/components/billing/InvoicePdfViewer.tsx
'use client'

import { useApiBlobUrl } from '@/hooks/useApiBlobUrl'
import { toApiError } from '@/services/api.service'
import { fetchInvoicePdf } from '@/services/data-source/api/api-files.adapter'

/**
 * The invoice as the customer receives it, shown in the page (SOW M-11:
 * "embedded invoice viewer").
 *
 * The PDF route needs the caller's token and answers as an attachment, so it is
 * fetched as bytes and shown from an object URL rather than pointed at directly.
 */
export function InvoicePdfViewer({
  invoiceId,
  version,
  height = '72vh',
}: {
  invoiceId: string
  /** Changes when the invoice does (its `updatedAt`), so an issued or voided invoice is fetched again. */
  version?: string
  height?: string
}) {
  const pdf = useApiBlobUrl(
    `/billing/invoices/${invoiceId}/pdf?v=${version ?? ''}`,
    {
      fetcher: () => fetchInvoicePdf(invoiceId),
    }
  )

  if (pdf.isLoading) {
    return <p style={message}>Rendering the invoice…</p>
  }
  if (pdf.error) {
    return (
      <p role="alert" style={{ ...message, color: '#DC2626' }}>
        {toApiError(pdf.error).message || 'The invoice could not be shown.'}
      </p>
    )
  }
  if (!pdf.url) return null

  return (
    // An iframe is an inline replaced box with a default 300px intrinsic
    // width: without the cap and the block display it could sit wider than
    // its card on a phone and take the page sideways with it.
    <iframe
      title="Invoice PDF"
      src={pdf.url}
      style={{
        display: 'block',
        width: '100%',
        maxWidth: '100%',
        height,
        border: '1px solid #F0E6EC',
        borderRadius: '10px',
        backgroundColor: '#FFFFFF',
      }}
    />
  )
}

const message: React.CSSProperties = {
  margin: 0,
  padding: '32px',
  textAlign: 'center',
  color: '#A39BB3',
  fontSize: '0.84rem',
}
