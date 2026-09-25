// src/app/shop/reports/order-ageing/page.tsx
'use client'

import { OrderAgeingReport } from '@/components/reports/OrderAgeingReport'
import { SiteReportScope } from '@/components/reports/ReportScopes'

export default function SiteOrderAgeingPage() {
  return (
    <SiteReportScope
      title="Open Orders"
      subtitle="Everything still in flight for your branch, and how long it has sat where it is"
      permission="REPORT_VIEW"
    >
      <OrderAgeingReport orderHref={(orderId) => `/shop/orders/${orderId}`} />
    </SiteReportScope>
  )
}
