// src/app/admin/reports/approval-activity/page.tsx
'use client'

import { ApprovalActivityReport } from '@/components/reports/ApprovalActivityReport'
import { AdminReportScope } from '@/components/reports/ReportScopes'

export default function AdminApprovalActivityPage() {
  return (
    <AdminReportScope
      title="Approval Activity"
      subtitle="Every approval decision by approver, outcome and date range, with the approval cycle time"
      permission="REPORT_VIEW"
    >
      {(accountId) => (
        <ApprovalActivityReport
          accountId={accountId}
          orderHref={(id) => `/admin/orders/${id}`}
        />
      )}
    </AdminReportScope>
  )
}
