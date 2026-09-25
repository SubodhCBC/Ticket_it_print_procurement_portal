// src/app/head-office/reports/order-ageing/page.tsx
'use client'

import { OrderAgeingReport } from '@/components/reports/OrderAgeingReport'
import { HeadOfficeReportScope } from '@/components/reports/ReportScopes'

export default function HeadOfficeOrderAgeingPage() {
  return (
    <HeadOfficeReportScope
      title="Order ageing"
      subtitle="Every open order across your sites and how long it has sat in its current status"
      permission="REPORT_VIEW"
    >
      <OrderAgeingReport orderHref={(id) => `/head-office/orders/${id}`} />
    </HeadOfficeReportScope>
  )
}
