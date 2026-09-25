// src/components/reports/reportFormat.ts

/** Small formatting helpers shared by the report screens. */

export function formatMoney(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0)
  return `$${(Number.isFinite(amount) ? amount : 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      })
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
}

export function formatHours(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || !Number.isFinite(hours))
    return '—'
  return hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`
}

const DATE_INPUT = /^\d{4}-\d{2}-\d{2}$/

/**
 * A `YYYY-MM-DD` date input as an instant in the viewer's time zone: the start
 * of that day, or — for the end of a range, which the API treats as exclusive —
 * the start of the day after, so "to 3 March" includes all of 3 March.
 */
export function dateInputToIso(
  date: string,
  edge: 'start' | 'endExclusive'
): string | undefined {
  if (!DATE_INPUT.test(date)) return undefined
  const [year, month, day] = date.split('-').map(Number) as [
    number,
    number,
    number,
  ]
  const at = new Date(year, month - 1, edge === 'start' ? day : day + 1)
  return at.toISOString()
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_APPROVAL: 'Pending approval',
  CHANGES_REQUESTED: 'Changes requested',
  APPROVED: 'Approved',
  PROCESSING: 'In production',
  DISPATCHED: 'Dispatched',
  DELIVERED: 'Delivered',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
}

export const OUTCOME_LABELS: Record<string, string> = {
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CHANGES_REQUESTED: 'Changes requested',
}
