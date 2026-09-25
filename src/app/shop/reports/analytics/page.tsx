// src/app/shop/reports/analytics/page.tsx
'use client'

import { AnalyticsReports } from '@/components/reports/AnalyticsReports'
import { SiteReportScope } from '@/components/reports/ReportScopes'

export default function SiteAnalyticsPage() {
  return (
    <SiteReportScope
      title="Reports & Exports"
      subtitle="Spend, orders and most-ordered products for your site, each downloadable as CSV and XLSX"
      permission="REPORT_VIEW"
    >
      <AnalyticsReports />
    </SiteReportScope>
  )
}
