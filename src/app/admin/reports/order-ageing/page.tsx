// src/app/admin/reports/order-ageing/page.tsx
'use client'

import { OrderAgeingReport } from '@/components/reports/OrderAgeingReport'
import { AdminReportScope } from '@/components/reports/ReportScopes'

export default function AdminOrderAgeingPage() {
  return (
    <AdminReportScope
      title="Order ageing"
      subtitle="Every open order and how long it has sat in its current status, longest first"
      permission="REPORT_VIEW"
    >
      {(accountId) => (
        <OrderAgeingReport
          accountId={accountId}
          orderHref={(id) => `/admin/orders/${id}`}
        />
      )}
    </AdminReportScope>
  )
}
