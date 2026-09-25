// src/components/reports/ReportScopes.tsx
'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { AuditAccountPicker } from '@/components/admin/AuditAccountPicker'
import { ReadOnlyNotice } from '@/components/admin/ProductAdminUi'
import { useAuth } from '@/hooks/useAuth'
import type { Permission } from '@/types/auth'

/**
 * The admin portal's frame for a governance report: the header, the account
 * the report is about — an administrator reports on any customer, so it is
 * chosen here — and the permission the report's API route requires.
 */
export function AdminReportScope({
  title,
  subtitle,
  permission,
  children,
}: {
  title: string
  subtitle: string
  permission: Permission
  /** Given the chosen account; undefined means the administrator's own. */
  children: (accountId: string | undefined) => ReactNode
}) {
  const { user, hasPermission, status } = useAuth()
  const [accountId, setAccountId] = useState('')
  const allowed = hasPermission(permission)

  return (
    <>
      <AdminHeader
        title={title}
        subtitle={subtitle}
        actionButton={
          allowed ? (
            <div style={{ minWidth: '240px' }}>
              <AuditAccountPicker
                value={accountId}
                ownAccountId={user?.accountId}
                ownAccountName={user?.accountName}
                onChange={setAccountId}
                style={{
                  width: '100%',
                  padding: '8px 12px',
                  borderRadius: '10px',
                  border: '1px solid #F0E6EC',
                  fontSize: '0.84rem',
                  backgroundColor: '#FFFFFF',
                }}
              />
            </div>
          ) : undefined
        }
      />
      {/* The 24px gutter was flat at every size; a phone needs that space for
          the report itself. */}
      <main className="page-pad" style={{ paddingBlock: '24px' }}>
        {allowed ? (
          children(accountId || undefined)
        ) : status === 'ready' ? (
          <ReadOnlyNotice>
            This report needs the {permission} permission.
          </ReadOnlyNotice>
        ) : null}
      </main>
    </>
  )
}

/**
 * The shop portal's frame for a report.
 *
 * A site user reports on the branches they belong to. The scope is the API's
 * to decide — it reads their order permissions — so this frame, like the head
 * office one, offers nothing to pick.
 */
export function SiteReportScope({
  title,
  subtitle,
  permission,
  children,
}: {
  title: string
  subtitle: string
  permission: Permission
  children: ReactNode
}) {
  const { hasPermission, status } = useAuth()
  const allowed = hasPermission(permission)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginBottom: '6px',
            fontSize: '0.76rem',
            color: '#A39BB3',
          }}
        >
          <Link
            href="/shop/orders"
            style={{
              color: '#A39BB3',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Orders
          </Link>
          <ChevronRight size={12} />
          <span style={{ color: '#6E6781', fontWeight: 500 }}>{title}</span>
        </div>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#2B253E',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          {title}
        </h1>
        <p style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}>
          {subtitle}
        </p>
      </div>
      {allowed ? (
        children
      ) : status === 'ready' ? (
        <ReadOnlyNotice>
          This report needs the {permission} permission.
        </ReadOnlyNotice>
      ) : null}
    </div>
  )
}

/**
 * The head-office portal's frame for a governance report. A head office
 * reports on its own account only — the API refuses any other — so there is
 * no account to choose.
 */
export function HeadOfficeReportScope({
  title,
  subtitle,
  permission,
  children,
}: {
  title: string
  subtitle: string
  permission: Permission
  children: ReactNode
}) {
  const { hasPermission, status } = useAuth()
  const allowed = hasPermission(permission)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginBottom: '6px',
            fontSize: '0.76rem',
            color: '#A39BB3',
          }}
        >
          <Link
            href="/head-office/dashboard"
            style={{
              color: '#A39BB3',
              textDecoration: 'none',
              fontWeight: 500,
            }}
          >
            Dashboard
          </Link>
          <ChevronRight size={12} />
          <span style={{ color: '#6E6781', fontWeight: 500 }}>{title}</span>
        </div>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#2B253E',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          {title}
        </h1>
        <p style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}>
          {subtitle}
        </p>
      </div>
      {allowed ? (
        children
      ) : status === 'ready' ? (
        <ReadOnlyNotice>
          This report needs the {permission} permission.
        </ReadOnlyNotice>
      ) : null}
    </div>
  )
}
