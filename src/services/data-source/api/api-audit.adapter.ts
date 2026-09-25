import { apiClient } from '@/services/api.service'
import type { AuditLogEntry, AuditLogQuery, PaginatedResult } from '@/types'
import type { ApiOffsetPage } from './catalog.types'

/**
 * The audit trail, served by `GET /audit-logs`.
 *
 * Read-only, and that is the whole point. The API writes an entry for every
 * mutation against the authenticated actor; nothing here can add one, and the
 * client-side `log()` the fixtures offered is gone. An audit trail a browser
 * can write to is not an audit trail.
 *
 * Every filter is applied by the API. The trail is paginated, so filtering in
 * the browser would only ever narrow the page that happened to be loaded and
 * report a total that no longer described it.
 */

const AUDIT_LOGS = '/audit-logs'
const DEFAULT_PAGE_SIZE = 25
/** The API refuses anything larger. */
const MAX_PAGE_SIZE = 100

interface ApiAuditEntry {
  id: string
  actorId: string | null
  actorName: string
  actorEmail: string
  actorRole: string
  action: string
  entityType: AuditLogEntry['entityType']
  entityId: string
  entityName: string | null
  /** Absent from an API build before the before/after columns. */
  changes?: { field: string; before: unknown; after: unknown }[]
  changesCaptured?: boolean
  details: unknown
  ipAddress: string | null
  userAgent: string | null
  requestId: string | null
  timestamp: string
}

function toEntry(api: ApiAuditEntry): AuditLogEntry {
  return {
    id: api.id,
    actorId: api.actorId,
    actorName: api.actorName,
    actorEmail: api.actorEmail,
    // Reported as written. The trail records whatever role the actor held at
    // the time, including ones this build may not know — rewriting history is
    // exactly what this table exists to prevent.
    actorRole: api.actorRole,
    action: api.action,
    entityType: api.entityType,
    entityId: api.entityId,
    ...(api.entityName ? { entityName: api.entityName } : {}),
    ...(api.ipAddress ? { ipAddress: api.ipAddress } : {}),
    ...(api.userAgent ? { userAgent: api.userAgent } : {}),
    ...(api.requestId ? { requestId: api.requestId } : {}),
    changes: api.changes ?? [],
    changesCaptured: api.changesCaptured ?? false,
    ...(api.details !== null && api.details !== undefined
      ? { details: api.details }
      : {}),
    timestamp: api.timestamp,
  }
}

function toPositiveInt(
  value: number | undefined,
  fallback: number,
  max: number = Number.MAX_SAFE_INTEGER
): number {
  if (value === undefined || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(1, Math.trunc(value)))
}

function toQuery(params?: AuditLogQuery): Record<string, string | number> {
  const query: Record<string, string | number> = {
    page: toPositiveInt(params?.page, 1),
    pageSize: toPositiveInt(params?.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
  }

  const text = {
    accountId: params?.accountId,
    actorId: params?.actorId,
    entityId: params?.entityId,
    action: params?.action,
    from: params?.from,
    to: params?.to,
    search: params?.search,
    field: params?.field,
  }
  for (const [key, value] of Object.entries(text)) {
    const trimmed = value?.trim()
    if (trimmed) query[key] = trimmed
  }

  if (params?.entityType) query.entityType = params.entityType
  return query
}

export async function list(
  params?: AuditLogQuery
): Promise<PaginatedResult<AuditLogEntry>> {
  const page: ApiOffsetPage<ApiAuditEntry> = await apiClient.get(AUDIT_LOGS, {
    params: toQuery(params),
  })

  return {
    items: page.items.map(toEntry),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
  }
}
