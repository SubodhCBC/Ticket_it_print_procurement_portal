// src/lib/data-source/mock/mock-audit.adapter.ts
import initialAuditLogs from './fixtures/audit-logs.json'
import type { AuditLogEntry, PaginatedResult } from '@/types'
import { simulateLatency, paginate } from './utils'

let auditStore: AuditLogEntry[] = JSON.parse(JSON.stringify(initialAuditLogs))

export async function list(params?: {
  entityType?: AuditLogEntry['entityType']
  actorRole?: AuditLogEntry['actorRole']
  search?: string
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<AuditLogEntry>> {
  await simulateLatency()
  let results = [...auditStore]

  if (params?.entityType) {
    results = results.filter((log) => log.entityType === params.entityType)
  }

  if (params?.actorRole) {
    results = results.filter((log) => log.actorRole === params.actorRole)
  }

  if (params?.search) {
    const q = params.search.toLowerCase()
    results = results.filter(
      (log) =>
        log.action.toLowerCase().includes(q) ||
        log.actorName.toLowerCase().includes(q) ||
        log.actorEmail.toLowerCase().includes(q) ||
        (log.entityName && log.entityName.toLowerCase().includes(q)) ||
        log.entityId.toLowerCase().includes(q)
    )
  }

  // Newest first
  results.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )

  return paginate(results, params?.page ?? 1, params?.pageSize ?? 20)
}

export async function log(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>
): Promise<AuditLogEntry> {
  // Silent logging without latency overhead
  const newEntry: AuditLogEntry = {
    ...entry,
    id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
  }

  auditStore.unshift(newEntry)
  return { ...newEntry }
}
