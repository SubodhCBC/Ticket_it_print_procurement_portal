'use client'

import { useQuery } from '@tanstack/react-query'
import {
  getMonthlyBillingReport,
  getDashboardKPIs,
  getApprovalActivityReport,
  getAccessReviewReport,
  getOrderAgeingReport,
  getReportData,
} from '@/services/reports.service'
import { queryKeys } from '@/lib/query/queryKeys'

/**
 * Reporting reads, cached.
 *
 * The shape returned is unchanged — `{ data, isLoading, error, refetch }` — so
 * the screens above are untouched. What changed is underneath: two components
 * asking the same question share one request, and coming back to a page inside
 * the stale window costs nothing.
 *
 * Reports get a longer `staleTime` than the default. They aggregate a month of
 * orders and are cached server-side for sixty seconds anyway, so refetching
 * them every half minute would be asking a question whose answer is already
 * known not to have changed.
 */
const REPORT_STALE_TIME = 60_000

export function useMonthlyBillingReport(period: string) {
  const query = useQuery({
    queryKey: queryKeys.monthlyBilling(period),
    queryFn: () => getMonthlyBillingReport(period),
    staleTime: REPORT_STALE_TIME,
    enabled: Boolean(period),
  })

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useDashboardKPIs() {
  const query = useQuery({
    queryKey: queryKeys.dashboardKpis(),
    queryFn: getDashboardKPIs,
    staleTime: REPORT_STALE_TIME,
  })

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

// --- Governance reports (SOW §15) --------------------------------------------------
//
// Not given REPORT_STALE_TIME: the server does not cache these either. Who can
// sign in and which order has stalled are the wrong answers when they are old.

export function useApprovalActivity(
  params: import('@/services/data-source/api/governance.types').ApprovalActivityParams,
  enabled = true
) {
  const query = useQuery({
    queryKey: queryKeys.approvalActivity(params),
    queryFn: () => getApprovalActivityReport(params),
    enabled,
  })
  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useAccessReview(
  params: import('@/services/data-source/api/governance.types').AccessReviewParams,
  enabled = true
) {
  const query = useQuery({
    queryKey: queryKeys.accessReview(params),
    queryFn: () => getAccessReviewReport(params),
    enabled,
  })
  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useOrderAgeing(
  params: import('@/services/data-source/api/governance.types').OrderAgeingParams,
  enabled = true
) {
  const query = useQuery({
    queryKey: queryKeys.orderAgeing(params),
    queryFn: () => getOrderAgeingReport(params),
    enabled,
  })
  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Any tabular report by key; the analytics screens read this. */
export function useReportData(
  report: import('@/services/data-source/api/governance.types').ReportFileKey,
  params: object,
  enabled = true
) {
  const query = useQuery({
    queryKey: queryKeys.reportData(report, params),
    queryFn: () => getReportData(report, params),
    staleTime: REPORT_STALE_TIME,
    placeholderData: (previous) => previous,
    enabled,
  })
  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    error: query.error,
  }
}
