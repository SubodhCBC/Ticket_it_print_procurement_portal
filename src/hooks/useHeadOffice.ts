// src/hooks/useHeadOffice.ts
'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getHODashboardKPIs,
  getHOMonthlyBillingReport,
} from '@/services/reports.service'
import { queryKeys } from '@/lib/query/queryKeys'

/**
 * Head-office reads, scoped server-side to the account.
 *
 * The account id is part of the cache key, not just of the request: two
 * administrators looking at different customers must never share an entry. The
 * API scopes every one of these regardless — this is about the cache being
 * correct, not about the boundary.
 */
const REPORT_STALE_TIME = 60_000

export function useHODashboardKPIs(accountId: string) {
  const query = useQuery({
    queryKey: queryKeys.hoDashboardKpis(accountId),
    queryFn: () => getHODashboardKPIs(accountId),
    staleTime: REPORT_STALE_TIME,
    // Nothing to ask until the session has produced an account.
    enabled: Boolean(accountId),
  })

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useHOMonthlyBillingReport(accountId: string, period: string) {
  const query = useQuery({
    queryKey: queryKeys.hoMonthlyBilling(accountId, period),
    queryFn: () => getHOMonthlyBillingReport(accountId, period),
    staleTime: REPORT_STALE_TIME,
    enabled: Boolean(accountId && period),
  })

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}
