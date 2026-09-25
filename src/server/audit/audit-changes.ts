import { Prisma } from '@prisma/client'
import { fromJsonOr } from '../db/json-column'

/**
 * Before and after values for an audit entry (SOW O-7, §12).
 *
 * The one place a change is turned into what the log stores. Every service used
 * to describe its own changes — `{ from, to }`, `{ changes: dto }`, a local
 * `diff` — and the result was four shapes, most with no before value, that no
 * difference view could read. Callers now say *which* fields matter and hand
 * over the rows; this decides what changed and how each value is written.
 *
 * Both sides hold only the fields that moved. On a creation `before` is empty,
 * on a removal `after` is, so the explorer renders all three the same way: one
 * row per field, old value beside new.
 *
 * Secrets are not handled here. `recordAudit` redacts both sides after the
 * comparison, so a changed password hash is still listed as changed — the fact
 * that matters — without either value reaching the log.
 */
export interface AuditChanges {
  readonly before: Readonly<Record<string, unknown>>
  readonly after: Readonly<Record<string, unknown>>
}

export interface AuditFieldOptions<K extends string> {
  /**
   * Fields held as JSON text in their column — `tags`, `options`, a snapshot.
   * Parsed before they are compared and stored, so the difference view shows a
   * list of tags rather than a string containing one, and so two texts that
   * encode the same value do not read as a change.
   */
  readonly json?: readonly K[]
}

/** An update: the listed fields whose values differ between the two rows. */
export function changesBetween<T extends object, K extends keyof T & string>(
  before: T,
  after: T,
  fields: readonly K[],
  options: AuditFieldOptions<K> = {}
): AuditChanges {
  const was: Record<string, unknown> = {}
  const now: Record<string, unknown> = {}

  for (const field of fields) {
    const from = normalise(before[field], options.json?.includes(field))
    const to = normalise(after[field], options.json?.includes(field))
    if (canonical(from) !== canonical(to)) {
      was[field] = from
      now[field] = to
    }
  }

  return { before: was, after: now }
}

/**
 * A creation: nothing before, the listed fields after.
 *
 * Empty values are left out. A new product with no description did not *set*
 * its description to nothing, and listing every null column of a fresh row
 * would bury the values somebody actually chose.
 */
export function created<T extends object, K extends keyof T & string>(
  after: T,
  fields: readonly K[],
  options: AuditFieldOptions<K> = {}
): AuditChanges {
  return { before: {}, after: present(after, fields, options) }
}

/** A removal: the listed fields before, nothing after. */
export function removed<T extends object, K extends keyof T & string>(
  before: T,
  fields: readonly K[],
  options: AuditFieldOptions<K> = {}
): AuditChanges {
  return { before: present(before, fields, options), after: {} }
}

/**
 * One field, when there is no row to hand.
 *
 * For a transition whose old and new values are known without a read — a
 * status moving from what was checked to what was requested. Still compared,
 * so a no-op transition records nothing as having moved.
 */
export function fieldChange(
  field: string,
  from: unknown,
  to: unknown
): AuditChanges {
  return changesBetween({ [field]: from }, { [field]: to }, [field])
}

/** Several `AuditChanges` as one, for an action that touched more than one thing. */
export function mergeChanges(...parts: readonly AuditChanges[]): AuditChanges {
  return {
    before: Object.assign({}, ...parts.map((part) => part.before)),
    after: Object.assign({}, ...parts.map((part) => part.after)),
  }
}

/** `|basePrice|status|` — sorted, so the same change always writes the same text. */
export function changedFieldsToken(changes: AuditChanges): string | null {
  const keys = [
    ...new Set([...Object.keys(changes.before), ...Object.keys(changes.after)]),
  ].sort()
  return keys.length > 0 ? `|${keys.join('|')}|` : null
}

function present<T extends object, K extends keyof T & string>(
  row: T,
  fields: readonly K[],
  options: AuditFieldOptions<K>
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    const value = normalise(row[field], options.json?.includes(field))
    if (value === null) continue
    if (Array.isArray(value) && value.length === 0) continue
    result[field] = value
  }
  return result
}

/**
 * A value as the log should hold it: plain JSON that compares by content.
 *
 * - Decimal becomes a string to at least two places. Two Decimals holding 12.50
 *   are never `===`; a JSON number would lose the scale; and `toString()` drops
 *   trailing zeros, so a price of 65.00 would read "65" beside an after value of
 *   "66.25". Every Decimal column here is scale 2, which is how the API writes
 *   them too — and a value with more places keeps them.
 * - Date becomes ISO 8601, so it compares by instant and reads unambiguously.
 * - `undefined` becomes `null`: JSON has no undefined, and a field that is absent
 *   on one side and null on the other has not changed.
 */
function normalise(value: unknown, isJsonText = false): unknown {
  if (isJsonText && typeof value === 'string') {
    return normalise(fromJsonOr<unknown>(value, value))
  }
  if (value === undefined || value === null) return null
  if (Prisma.Decimal.isDecimal(value)) {
    return value.toFixed(Math.max(2, value.decimalPlaces()))
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map((item) => normalise(item))
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      result[key] = normalise(entry)
    }
    return result
  }
  return value
}

/**
 * JSON with object keys sorted, for comparison only.
 *
 * Plain `JSON.stringify` depends on insertion order, so the same options map
 * read back in a different order would log as changed.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, entry: unknown) =>
    entry && typeof entry === 'object' && !Array.isArray(entry)
      ? Object.fromEntries(
          Object.entries(entry as Record<string, unknown>).sort(([a], [b]) =>
            a < b ? -1 : a > b ? 1 : 0
          )
        )
      : entry
  )
}
