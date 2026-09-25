// src/components/shipping/shipping-format.ts
import type { ApiShipmentStatus } from '@/services/data-source/api/shipping.types'

/**
 * Words and colours for NZ Post fulfilment, shared by the label panel, the
 * tracking timeline and the shipping queue so a status reads the same on all
 * three.
 */

export const SHIPMENT_STATUS: Record<
  ApiShipmentStatus,
  { label: string; color: string; background: string }
> = {
  PENDING: { label: 'Making label', color: '#B45309', background: '#FFFBEB' },
  SUBMITTED: {
    label: 'Making label',
    color: '#B45309',
    background: '#FFFBEB',
  },
  LABELLED: { label: 'Label ready', color: '#3F9C68', background: '#ECFDF5' },
  FAILED: { label: 'Label failed', color: '#DC2626', background: '#FEF2F2' },
  VOIDED: { label: 'Voided', color: '#6E6781', background: '#F5EEF2' },
}

export const PICKUP_STATUS_COLOR: Record<string, string> = {
  BOOKED: '#3F9C68',
  CONFIRMED: '#3F9C68',
  REJECTED: '#DC2626',
  FAILED: '#DC2626',
  CANCELLED: '#6E6781',
}

// Dates are formatted by `@/lib/format`; import `formatDateTime` from there.

/**
 * A key that makes a create request safe to send twice. Kept for the life of
 * one attempt — a retry after a lost response reuses it — and replaced once the
 * request has an answer.
 */
export function newIdempotencyKey(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  return `${prefix}-${random}`
}

/** Tracking references of a shipment's parcels, in box order. */
export function trackingReferencesOf(
  parcels: {
    sequence: number
    trackingReference: string | null
  }[]
): string[] {
  return [...parcels]
    .sort((a, b) => a.sequence - b.sequence)
    .map((parcel) => parcel.trackingReference)
    .filter((reference): reference is string => Boolean(reference))
}

export const panelStyles = {
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: '14px',
    boxShadow:
      '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
    border: '1px solid #F0E6EC',
  } satisfies React.CSSProperties,
  title: {
    fontSize: '0.95rem',
    fontWeight: 700,
    color: '#2B253E',
    letterSpacing: '-0.01em',
    margin: 0,
  } satisfies React.CSSProperties,
  label: {
    display: 'block',
    fontSize: '0.74rem',
    fontWeight: 600,
    color: '#5C566E',
    marginBottom: '4px',
  } satisfies React.CSSProperties,
  input: {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '10px',
    border: '1px solid #F0E6EC',
    fontSize: '0.82rem',
    color: '#2B253E',
    backgroundColor: '#FFFFFF',
  } satisfies React.CSSProperties,
  muted: {
    fontSize: '0.76rem',
    color: '#6E6781',
    margin: 0,
  } satisfies React.CSSProperties,
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    borderRadius: '10px',
    border: '1px solid #F0E6EC',
    backgroundColor: '#FFFFFF',
    color: '#2B253E',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  } satisfies React.CSSProperties,
  primaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    borderRadius: '10px',
    border: '1px solid #F73582',
    backgroundColor: '#F73582',
    color: '#FFFFFF',
    fontSize: '0.8rem',
    fontWeight: 600,
    cursor: 'pointer',
  } satisfies React.CSSProperties,
  error: {
    padding: '8px 12px',
    borderRadius: '10px',
    backgroundColor: '#FEF2F2',
    border: '1px solid #FECACA',
    color: '#DC2626',
    fontSize: '0.78rem',
    fontWeight: 500,
    margin: 0,
  } satisfies React.CSSProperties,
  notice: {
    padding: '8px 12px',
    borderRadius: '10px',
    backgroundColor: '#FFFBEB',
    border: '1px solid #FDE68A',
    color: '#B45309',
    fontSize: '0.78rem',
    fontWeight: 500,
    margin: 0,
  } satisfies React.CSSProperties,
}
