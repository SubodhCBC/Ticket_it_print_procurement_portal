// src/app/admin/settings/layout.tsx
'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Lock } from 'lucide-react'
import { AuthGuard } from '@/components/auth/AuthGuard'

/**
 * The account settings screens read and write `/api/v1/settings`, which the
 * server allows only with ACCOUNT_MANAGE — an ADMIN-only permission. Head office
 * is admitted to the admin portal, so without this guard it would open the page
 * and meet a 403 on load.
 *
 * Approval rules live under this segment but are a different API
 * (`/api/v1/approvals/rules`, USER_MANAGE), which head office does hold, so that
 * page is left to its own permission checks.
 */
const UNGUARDED_PREFIX = '/admin/settings/approval-rules'

function NotAvailable() {
  return (
    <div
      className="page-pad"
      style={{ paddingBlock: '3rem', maxWidth: '600px', margin: '0 auto' }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #F0E6EC',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          padding: '1.75rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '0.75rem',
          }}
        >
          <Lock size={18} color="#F73582" />
          <h2
            style={{
              fontSize: '1.05rem',
              fontWeight: 700,
              color: '#2B253E',
              margin: 0,
            }}
          >
            Settings are not available for your role
          </h2>
        </div>
        <p
          style={{
            color: '#6E6781',
            fontSize: '0.88rem',
            lineHeight: 1.6,
            margin: '0 0 1.25rem',
          }}
        >
          Account settings are managed by a portal administrator. Contact your
          administrator if something here needs to change.
        </p>
        <Link
          href="/admin"
          style={{
            color: '#b45309',
            fontSize: '0.82rem',
            fontWeight: 600,
            textDecoration: 'underline',
          }}
        >
          Back to the dashboard
        </Link>
      </div>
    </div>
  )
}

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  if (
    pathname === UNGUARDED_PREFIX ||
    pathname.startsWith(`${UNGUARDED_PREFIX}/`)
  ) {
    return <>{children}</>
  }

  return (
    <AuthGuard requiredPermission="ACCOUNT_MANAGE" fallback={<NotAvailable />}>
      {children}
    </AuthGuard>
  )
}
