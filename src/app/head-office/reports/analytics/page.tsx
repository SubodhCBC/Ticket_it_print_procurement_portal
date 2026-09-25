// src/app/head-office/reports/analytics/page.tsx
'use client'

import { AnalyticsReports } from '@/components/reports/AnalyticsReports'
import { HeadOfficeReportScope } from '@/components/reports/ReportScopes'

export default function HeadOfficeAnalyticsPage() {
  return (
    <HeadOfficeReportScope
      title="Analytics & Exports"
      subtitle="Spend, order and product reports across your branches, each downloadable as CSV and XLSX"
      permission="REPORT_VIEW"
    >
      <AnalyticsReports />
    </HeadOfficeReportScope>
  )
}
