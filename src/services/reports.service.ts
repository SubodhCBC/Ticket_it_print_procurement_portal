// src/lib/services/reports.service.ts
import { getDataSource } from '@/services/data-source'
import type {
  MonthlyBillingReport,
  DashboardKPIs,
  HODashboardKPIs,
  HOMonthlyBillingReport,
} from '@/types'

export async function getMonthlyBillingReport(
  period = 'August 2026'
): Promise<MonthlyBillingReport> {
  const ds = getDataSource()
  return ds.reports.getMonthlyBillingReport(period)
}

export async function getDashboardKPIs(): Promise<DashboardKPIs> {
  const ds = getDataSource()
  return ds.reports.getDashboardKPIs()
}

/**
 * Head Office: Returns KPI summary for a specific account.
 * accountId scoping is enforced here in the service layer — never only in the UI.
 */
export async function getHODashboardKPIs(
  accountId: string
): Promise<HODashboardKPIs> {
  const ds = getDataSource()
  return ds.reports.getHODashboardKPIs(accountId)
}

/**
 * Head Office: Returns consolidated billing report for a specific account + period.
 * accountId scoping is enforced here in the service layer.
 */
export async function getHOMonthlyBillingReport(
  accountId: string,
  period: string
): Promise<HOMonthlyBillingReport> {
  const ds = getDataSource()
  return ds.reports.getHOMonthlyBillingReport(accountId, period)
}

// --- Governance reports and report files (SOW §15) ------------------------------

export async function getApprovalActivityReport(
  params?: import('@/services/data-source/api/governance.types').ApprovalActivityParams
) {
  return getDataSource().reports.getApprovalActivity(params)
}

export async function getAccessReviewReport(
  params?: import('@/services/data-source/api/governance.types').AccessReviewParams
) {
  return getDataSource().reports.getAccessReview(params)
}

export async function getOrderAgeingReport(
  params?: import('@/services/data-source/api/governance.types').OrderAgeingParams
) {
  return getDataSource().reports.getOrderAgeing(params)
}

/** Today as YYYY-MM-DD, for file names. */
function today(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * A report file, named for the report and the day it was taken:
 * `orders-ageing-2026-09-17.xlsx`.
 */
export async function exportReportFile(
  report: import('@/services/data-source/api/governance.types').ReportFileKey,
  format: import('@/services/data-source/api/governance.types').ReportFileFormat,
  params?: object
): Promise<{ blob: Blob; filename: string }> {
  const blob = await getDataSource().reports.downloadReportFile(
    report,
    format,
    params
  )
  return {
    blob,
    filename: `${report.replace(/\//g, '-')}-${today()}.${format}`,
  }
}

/** The executive dashboard as a PDF, from the filters the dashboard uses. */
export async function exportDashboardPdf(params?: {
  scope?: 'account' | 'platform'
  accountId?: string
  granularity?: 'day' | 'week' | 'month'
  topSites?: number
}): Promise<{ blob: Blob; filename: string }> {
  const blob = await getDataSource().reports.downloadDashboardPdf(params)
  return { blob, filename: `dashboard-${today()}.pdf` }
}

/** A tabular report's rows and figures, as its JSON route returns them. */
export async function getReportData(
  report: import('@/services/data-source/api/governance.types').ReportFileKey,
  params?: object
): Promise<unknown> {
  return getDataSource().reports.getReportData(report, params)
}
