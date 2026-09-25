// src/lib/export/xlsx.ts
import { downloadCSV, exportBillingReportCSV, exportOrdersCSV } from './csv'
import type { MonthlyBillingReport, Order } from '@/types'

/**
 * Clean client-safe spreadsheet export fallback
 */
export function exportBillingReportXLSX(report: MonthlyBillingReport) {
  const csv = exportBillingReportCSV(report)
  downloadCSV(
    csv,
    `billing-report-${report.period.replace(/\s+/g, '-').toLowerCase()}.csv`
  )
}

export function exportOrdersXLSX(orders: Order[]) {
  const csv = exportOrdersCSV(orders)
  downloadCSV(
    csv,
    `orders-export-${new Date().toISOString().split('T')[0]}.csv`
  )
}
