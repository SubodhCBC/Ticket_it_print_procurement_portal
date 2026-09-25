// src/app/shop/layout.tsx
'use client'

import React from 'react'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { SaaSLayout } from '@/components/layout/SaaSLayout'

import { CartDrawer } from '@/components/shop/CartDrawer'

export default function ShopLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthGuard allowedRoles={['site_user', 'admin']}>
      <SaaSLayout>
        {children}
        <CartDrawer />
      </SaaSLayout>
    </AuthGuard>
  )
}
