// src/hooks/useAuditLogs.ts
'use client'

import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { getAuditLogs } from '@/services/auditLog.service'
import { queryKeys } from '@/lib/query/queryKeys'
import type { AuditLogQuery } from '@/types'

/**
 * One page of the audit trail.
 *
 * The previous page stays on screen while the next one loads
 * (`keepPreviousData`), so paging or narrowing a filter does not flash the
 * table empty. `isPlaceholderData` says when what is shown is that stale page.
 */
export function useAuditLogs(
  params: AuditLogQuery,
  options: { enabled?: boolean } = {}
) {
  const query = useQuery({
    queryKey: queryKeys.auditLogs(params),
    queryFn: () => getAuditLogs(params),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  })

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    error: query.error,
    refetch: query.refetch,
  }
}
