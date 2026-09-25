// src/app/head-office/reports/approval-activity/page.tsx
'use client'

import { ApprovalActivityReport } from '@/components/reports/ApprovalActivityReport'
import { HeadOfficeReportScope } from '@/components/reports/ReportScopes'

export default function HeadOfficeApprovalActivityPage() {
  return (
    <HeadOfficeReportScope
      title="Approval activity"
      subtitle="Every approval decision across your sites, by approver and outcome, with the approval cycle time"
      permission="REPORT_VIEW"
    >
      <ApprovalActivityReport orderHref={(id) => `/head-office/orders/${id}`} />
    </HeadOfficeReportScope>
  )
}
