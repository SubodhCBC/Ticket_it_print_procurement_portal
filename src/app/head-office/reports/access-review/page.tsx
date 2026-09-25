// src/app/head-office/reports/access-review/page.tsx
'use client'

import { AccessReviewReport } from '@/components/reports/AccessReviewReport'
import { HeadOfficeReportScope } from '@/components/reports/ReportScopes'

export default function HeadOfficeAccessReviewPage() {
  return (
    <HeadOfficeReportScope
      title="User access review"
      subtitle="Everyone who can sign in to your account — role, sites, permission overrides and last sign-in — for your quarterly attestation"
      permission="USER_MANAGE"
    >
      <AccessReviewReport />
    </HeadOfficeReportScope>
  )
}
