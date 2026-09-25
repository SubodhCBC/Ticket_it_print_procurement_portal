// src/app/admin/reports/access-review/page.tsx
'use client'

import { AccessReviewReport } from '@/components/reports/AccessReviewReport'
import { AdminReportScope } from '@/components/reports/ReportScopes'

export default function AdminAccessReviewPage() {
  return (
    <AdminReportScope
      title="User Access Review"
      subtitle="Everyone who can sign in to an account — role, branches, permission overrides and last sign-in — for client attestation"
      permission="USER_MANAGE"
    >
      {(accountId) => <AccessReviewReport accountId={accountId} />}
    </AdminReportScope>
  )
}
