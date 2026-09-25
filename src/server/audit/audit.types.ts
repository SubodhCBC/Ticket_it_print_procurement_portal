import type { AuditEntry } from './audit.service'
import { fromJsonOr } from '../db/json-column'

/**
 * An audit entry as the API exposes it.
 *
 * Matches the admin explorer's `AuditLogEntry` shape, with two deliberate
 * additions: `userAgent` and `requestId`. The request id is what ties an entry
 * to the structured logs for the same request, which is the difference between
 * "someone changed this" and being able to reconstruct what else happened in
 * that call.
 */
export interface AuditLogEntryView {
  readonly id: string
  readonly actorId: string | null
  readonly actorName: string
  readonly actorEmail: string
  readonly actorRole: string
  readonly action: string
  readonly entityType: AuditEntry['entityType']
  readonly entityId: string
  readonly entityName: string | null
  /**
   * The difference view (§12): one row per field, old value beside new, sorted
   * by field. Empty on a creation's `before` side and a removal's `after` side,
   * where the value is `null`.
   */
  readonly changes: readonly AuditFieldChangeView[]
  /**
   * Whether this entry recorded its before and after values at all.
   *
   * False for an event, which has none, and for every entry written before the
   * values were captured — shown as "not recorded" rather than as an empty
   * change, which would claim nothing moved. True with no `changes` means the
   * change was captured and nothing had actually moved.
   */
  readonly changesCaptured: boolean
  readonly details: unknown
  readonly ipAddress: string | null
  readonly userAgent: string | null
  readonly requestId: string | null
  /**
   * Named `timestamp`, not `createdAt`: an audit entry records when the thing
   * happened, and it is never updated, so there is no pair to distinguish.
   */
  readonly timestamp: string
}

export interface AuditFieldChangeView {
  readonly field: string
  readonly before: unknown
  readonly after: unknown
}

/**
 * Pairs the two sides by field.
 *
 * Read from the stored JSON rather than recomputed, and tolerant of a side
 * that is missing a key: a creation has no `before` for any field, and that is
 * a `null` beside the new value, not a row to drop.
 */
function toFieldChanges(entry: AuditEntry): AuditFieldChangeView[] {
  const before = fromJsonOr<Record<string, unknown>>(entry.beforeValues, {})
  const after = fromJsonOr<Record<string, unknown>>(entry.afterValues, {})

  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .sort()
    .map((field) => ({
      field,
      before: field in before ? before[field] : null,
      after: field in after ? after[field] : null,
    }))
}

export function toAuditLogEntryView(entry: AuditEntry): AuditLogEntryView {
  return {
    id: entry.id,
    actorId: entry.actorId,
    actorName: entry.actorName,
    actorEmail: entry.actorEmail,
    actorRole: entry.actorRole,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityName: entry.entityName,
    changes: toFieldChanges(entry),
    changesCaptured: entry.beforeValues !== null || entry.afterValues !== null,
    details: fromJsonOr<unknown>(entry.details, null),
    ipAddress: entry.ipAddress,
    userAgent: entry.userAgent,
    requestId: entry.requestId,
    timestamp: entry.createdAt.toISOString(),
  }
}
