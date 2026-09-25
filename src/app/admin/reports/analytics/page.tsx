// src/app/admin/reports/analytics/page.tsx
'use client'

import { AnalyticsReports } from '@/components/reports/AnalyticsReports'
import { AdminReportScope } from '@/components/reports/ReportScopes'

export default function AdminAnalyticsPage() {
  return (
    <AdminReportScope
      title="Analytics & Exports"
      subtitle="Spend, orders, products and inventory reports, each downloadable as CSV and XLSX"
      permission="REPORT_VIEW"
    >
      {(accountId) => <AnalyticsReports accountId={accountId} />}
    </AdminReportScope>
  )
}
