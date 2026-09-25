// src/app/admin/reports/monthly-billing/_components/invoice-shared.ts
import type React from 'react'
import { ApiError } from '@/services/api.service'
import type {
  ApiInvoice,
  ApiInvoiceLine,
  ApiInvoiceSite,
  ApiInvoiceStatus,
} from '@/services/data-source/api/report.types'
import { formatMonthYearLong } from '@/lib/format'

/**
 * The single-invoice read, as the API actually sends it.
 *
 * `ApiInvoice` predates tax and itemised lines; the server's `InvoiceView`
 * carries both. Widened here rather than in the shared types so this screen can
 * show them without changing what every other caller compiles against.
 */
export interface InvoiceItemDetail {
  id: string
  sequence: number
  kind: string
  sku: string
  name: string
  variantSku: string | null
  uom: string | null
  packSize: number | null
  quantity: number
  unitPrice: string
  lineValue: string
  taxTreatment: string
  taxAmount: string
  notes: string | null
}

export type InvoiceLineDetail = ApiInvoiceLine & {
  tax?: string
  placedByName?: string | null
  orderStatus?: string | null
  items?: InvoiceItemDetail[]
}

export type InvoiceSiteDetail = ApiInvoiceSite & { tax?: string }

export type InvoiceDetail = Omit<ApiInvoice, 'lines' | 'sites'> & {
  taxRatePercent?: string | null
  pricesIncludeTax?: boolean
  lines?: InvoiceLineDetail[]
  sites?: InvoiceSiteDetail[]
}

// --- Styles -------------------------------------------------------------------

/** The shared card: hairline border and a soft shadow, as on the admin dashboard. */
export const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: '1px solid #F0E6EC',
}

export const cardTitle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#2B253E',
  letterSpacing: '-0.01em',
  margin: 0,
}

export const cardSubtitle: React.CSSProperties = {
  fontSize: '0.76rem',
  color: '#A39BB3',
  margin: '3px 0 0',
}

export const th: React.CSSProperties = {
  padding: '10px 14px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}

export const thEdge: React.CSSProperties = { ...th, padding: '10px 20px' }

export const secondaryButton: React.CSSProperties = {
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
  cursor: 'pointer',
}

export const primaryButton: React.CSSProperties = {
  ...secondaryButton,
  backgroundColor: '#F73582',
  border: '1px solid #F73582',
  color: '#FFFFFF',
}

export const dangerButton: React.CSSProperties = {
  ...secondaryButton,
  backgroundColor: '#FFFFFF',
  border: '1px solid #FECACA',
  color: '#DC2626',
}

export const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  color: '#5C566E',
  fontWeight: 600,
  marginBottom: '6px',
}

export const controlStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid #F0E6EC',
  fontSize: '0.84rem',
  color: '#2B253E',
  backgroundColor: '#FFFFFF',
  boxSizing: 'border-box',
}

export function disabledWhen(
  style: React.CSSProperties,
  disabled: boolean
): React.CSSProperties {
  return disabled ? { ...style, opacity: 0.5, cursor: 'not-allowed' } : style
}

// --- Formatting ---------------------------------------------------------------

// Money and dates are formatted by `@/lib/format`; import them from there.

export function periodLabel(billingPeriod: string): string {
  const [year, month] = billingPeriod.split('-').map(Number)
  if (!year || !month) return billingPeriod
  return formatMonthYearLong(new Date(Date.UTC(year, month - 1, 1)))
}

/**
 * The API's message, with the request id support will ask for.
 *
 * Only the API's own message reaches the screen: it is written for this reader.
 * Anything else — a dropped connection, a parse failure, a bug in the browser —
 * says "Failed to fetch" or worse, which tells an accounts administrator
 * nothing they can act on, so it goes to the console and the caller's own
 * sentence is shown instead.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return error.requestId
      ? `${error.message} (request ${error.requestId})`
      : error.message
  }
  if (error) console.error('Billing request failed:', error)
  return fallback
}

// --- Status -------------------------------------------------------------------

export const INVOICE_STATUS_STYLES: Record<
  ApiInvoiceStatus,
  { bg: string; text: string; border: string; dot: string; label: string }
> = {
  DRAFT: {
    bg: '#F5F3F7',
    text: '#5C566E',
    border: 'rgba(92, 86, 110, 0.2)',
    dot: '#A39BB3',
    label: 'Draft',
  },
  ISSUED: {
    bg: '#E0F2FE',
    text: '#0284C7',
    border: 'rgba(2, 132, 199, 0.25)',
    dot: '#0EA5E9',
    label: 'Issued',
  },
  PAID: {
    bg: '#ECFDF5',
    text: '#047857',
    border: 'rgba(16, 185, 129, 0.3)',
    dot: '#10B981',
    label: 'Paid',
  },
  VOID: {
    bg: '#FEF2F2',
    text: '#B91C1C',
    border: 'rgba(239, 68, 68, 0.3)',
    dot: '#EF4444',
    label: 'Void',
  },
}
