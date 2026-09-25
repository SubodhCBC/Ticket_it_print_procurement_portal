// src/lib/format.ts
//
// The one place the portal turns money, dates and counts into words.
//
// Every screen reads the same facts from the same API, so every screen should
// spell them the same way. Before this module there were a dozen private
// helpers — `$${n.toFixed(2)}` next to `toLocaleString('en-US')` next to a bare
// `toLocaleDateString()` that rendered in whatever locale the reader's laptop
// happened to be set to — and two of them could sit on the SAME screen, so an
// order total read `$12,450.00` in the header and `$12450.00` in the summary.
//
// Conventions, decided once:
//
//   Money   en-NZ, NZD, always exactly two decimals. The portal bills in New
//           Zealand dollars with 15% GST; there is no second currency. A
//           `minimumFractionDigits` without a maximum lets a stray third
//           decimal through (it did, on the billing PDF), so both are pinned.
//   Dates   en-NZ with a three-letter month — "25 Sep 2026" — in Pacific/
//           Auckland. The time zone is fixed rather than the reader's so that
//           a server-rendered page and its hydration agree, and so that two
//           people looking at the same order in different offices are looking
//           at the same day.
//   Nothing A dash (`—`) for anything missing or unreadable, never `NaN`,
//           `$null` or `$0.00`. Exports want an empty cell instead, so the
//           fallback is a parameter.
//
// PRECISION. Money reaches the browser as a decimal STRING ("12450.00") —
// that is how the API sends it and how the database holds it, precisely.
// `Intl.NumberFormat#format` accepts such a string and formats the decimal
// digits as given, so the string is passed through untouched; it is never
// parsed into a float on the way. Do not "helpfully" wrap a call in `Number()`,
// and do not do arithmetic on these values in the UI — ask the API for the
// total instead. (Where a component genuinely has a number already, that is
// fine: the damage is done by the round trip, not by this module.)

/** What a missing or unreadable value looks like on screen. */
export const DASH = '—'

const nzd = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const nzdPlain = new Intl.NumberFormat('en-NZ', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const nzdWhole = new Intl.NumberFormat('en-NZ', {
  style: 'currency',
  currency: 'NZD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

const counts = new Intl.NumberFormat('en-NZ', { maximumFractionDigits: 2 })

const NZ_TIME_ZONE = 'Pacific/Auckland'

const dayMonthYear = new Intl.DateTimeFormat('en-NZ', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: NZ_TIME_ZONE,
})

const dayMonthYearTime = new Intl.DateTimeFormat('en-NZ', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: NZ_TIME_ZONE,
})

const monthYear = new Intl.DateTimeFormat('en-NZ', {
  month: 'short',
  year: 'numeric',
  timeZone: NZ_TIME_ZONE,
})

const monthYearLong = new Intl.DateTimeFormat('en-NZ', {
  month: 'long',
  year: 'numeric',
  timeZone: NZ_TIME_ZONE,
})

const timeOnly = new Intl.DateTimeFormat('en-NZ', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: NZ_TIME_ZONE,
})

/** A decimal as the API writes one: digits, an optional point, an optional sign. */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/

/**
 * The value in the form `Intl` should see it, or null when there is nothing to
 * show. A decimal string is handed on AS A STRING so its digits survive; only a
 * value that is already a number is passed as one.
 */
function numeric(
  value: string | number | null | undefined
): string | number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const trimmed = value.trim()
  return trimmed !== '' && DECIMAL.test(trimmed) ? trimmed : null
}

/**
 * `Intl.NumberFormat` has accepted decimal strings since ES2023 (Intl.NumberFormat
 * v3); older `lib` typings only admit `number | bigint`, hence the cast.
 */
function render(format: Intl.NumberFormat, value: string | number): string {
  return (format.format as (input: string | number) => string)(value)
}

/** "$12,450.00" — NZD, two decimals, always. A dash when there is no amount. */
export function formatMoney(
  value: string | number | null | undefined,
  fallback: string = DASH
): string {
  const amount = numeric(value)
  return amount === null ? fallback : render(nzd, amount)
}

/**
 * "12,450.00" — the same number without the dollar sign, for a column whose
 * header already says `$` and for human-readable exports. Missing values come
 * back empty rather than as a dash, which is what a spreadsheet cell wants;
 * pass a fallback for anything else.
 *
 * This is still a FORMATTED string. A CSV/XLSX column that a spreadsheet should
 * do arithmetic on wants the raw value, not this.
 */
export function formatMoneyPlain(
  value: string | number | null | undefined,
  fallback: string = ''
): string {
  const amount = numeric(value)
  return amount === null ? fallback : render(nzdPlain, amount)
}

/**
 * "$12,450" — whole dollars, for chart labels and tiles where the cents are
 * noise. Never for a figure someone might reconcile against an invoice.
 */
export function formatMoneyWhole(
  value: string | number | null | undefined,
  fallback: string = DASH
): string {
  const amount = numeric(value)
  return amount === null ? fallback : render(nzdWhole, amount)
}

/** "1,284" — a count or a ratio, grouped, at most two decimals. */
export function formatNumber(
  value: string | number | null | undefined,
  fallback: string = DASH
): string {
  const amount = numeric(value)
  return amount === null ? fallback : render(counts, amount)
}

/** The instant a value names, or null when it names none. */
function instant(
  value: string | number | Date | null | undefined
): Date | null {
  if (value === null || value === undefined || value === '') return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

/**
 * CLDR spells September "Sept" in en-NZ, and which ICU a given Node or browser
 * carries decides whether it does. The portal's months are three letters, so
 * the month part is clipped — deterministic, and identical either side of
 * hydration.
 */
function withShortMonth(format: Intl.DateTimeFormat, date: Date): string {
  return format
    .formatToParts(date)
    .map((part) =>
      part.type === 'month' && part.value.length > 3
        ? part.value.slice(0, 3)
        : part.value
    )
    .join('')
}

/** "25 Sep 2026". A dash when there is no date. */
export function formatDate(
  value: string | number | Date | null | undefined,
  fallback: string = DASH
): string {
  const date = instant(value)
  return date === null ? fallback : withShortMonth(dayMonthYear, date)
}

/** "25 Sep 2026, 14:30" — New Zealand time. A dash when there is no date. */
export function formatDateTime(
  value: string | number | Date | null | undefined,
  fallback: string = DASH
): string {
  const date = instant(value)
  return date === null ? fallback : withShortMonth(dayMonthYearTime, date)
}

/** "14:30" — New Zealand time, for a row whose date is already established. */
export function formatTime(
  value: string | number | Date | null | undefined,
  fallback: string = DASH
): string {
  const date = instant(value)
  return date === null ? fallback : timeOnly.format(date)
}

/** "Sep 2026" — a billing period's heading. */
export function formatMonthYear(
  value: string | number | Date | null | undefined,
  fallback: string = DASH
): string {
  const date = instant(value)
  return date === null ? fallback : withShortMonth(monthYear, date)
}

/** "September 2026" — a billing period named in full, for a heading or a picker. */
export function formatMonthYearLong(
  value: string | number | Date | null | undefined,
  fallback: string = DASH
): string {
  const date = instant(value)
  return date === null ? fallback : monthYearLong.format(date)
}

// --- Today, in New Zealand -----------------------------------------------------

const isoDayParts = new Intl.DateTimeFormat('en-NZ', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: NZ_TIME_ZONE,
})

/**
 * Today in New Zealand as `YYYY-MM-DD` — what a `<input type="date">` speaks.
 *
 * `new Date().toISOString().slice(0, 10)` is the UTC calendar day, and NZ runs
 * 12-13 hours ahead of it: between midnight and noon in Auckland the UTC day is
 * still yesterday, so a date picker built on it offered yesterday as its
 * earliest choice and a "not in the past" check accepted it. This module's time
 * zone is already fixed to Pacific/Auckland for exactly this reason, so the
 * calendar day comes from the same place every date on screen does.
 */
export function todayInNz(now: Date = new Date()): string {
  const parts = isoDayParts.formatToParts(now)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}
