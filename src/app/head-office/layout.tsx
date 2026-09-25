// src/app/head-office/layout.tsx
'use client'

import React from 'react'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { SaaSLayout } from '@/components/layout/SaaSLayout'

export default function HeadOfficeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard allowedRoles={['head_office', 'admin']}>
      <SaaSLayout>{children}</SaaSLayout>
    </AuthGuard>
  )
}
