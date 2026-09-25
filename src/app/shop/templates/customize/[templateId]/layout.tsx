'use client'

import React from 'react'
import { AuthGuard } from '@/components/auth/AuthGuard'

export default function TemplateCustomizeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <AuthGuard allowedRoles={['site_user', 'admin']}>{children}</AuthGuard>
}
