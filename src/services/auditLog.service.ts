// src/services/auditLog.service.ts
import { getDataSource } from '@/services/data-source'
import type { AuditLogEntry, AuditLogQuery, PaginatedResult } from '@/types'

/**
 * One page of the audit trail, newest first.
 *
 * One account per query: without `accountId` the API answers for the caller's
 * own account, and only an admin may name another (anyone else gets a 403).
 */
export async function getAuditLogs(
  params?: AuditLogQuery
): Promise<PaginatedResult<AuditLogEntry>> {
  const ds = getDataSource()
  return ds.audit.list(params)
}
