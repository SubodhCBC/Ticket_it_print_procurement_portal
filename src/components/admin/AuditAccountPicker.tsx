// src/components/admin/AuditAccountPicker.tsx
'use client'

import React from 'react'
import { useAccounts } from '@/hooks/useAccounts'

/** The accounts endpoint refuses a larger page. */
const ACCOUNT_PAGE_SIZE = 100

/**
 * Which account's trail to read. Admins only.
 *
 * Its own component so the account directory is only requested when an admin
 * is looking: a head-office user cannot list accounts, and mounting the query
 * for them would earn a 403 for a picker they are never shown.
 *
 * `value` is `''` for the caller's own account, which is what the API answers
 * for when no `accountId` is sent.
 */
export function AuditAccountPicker({
  value,
  ownAccountId,
  ownAccountName,
  onChange,
  style,
}: {
  value: string
  ownAccountId?: string
  ownAccountName?: string
  onChange: (accountId: string) => void
  style?: React.CSSProperties
}) {
  const { data, isLoading, error } = useAccounts({
    pageSize: ACCOUNT_PAGE_SIZE,
  })

  const others = (data?.items ?? []).filter(
    (account) => account.id !== ownAccountId
  )
  // A shared link may name an account beyond the first page of the directory;
  // keep it selectable rather than silently showing "your account".
  const isListed =
    value === '' ||
    value === ownAccountId ||
    others.some((account) => account.id === value)

  const selected = value === ownAccountId ? '' : value

  return (
    <>
      <select
        id="audit-account"
        value={selected}
        onChange={(e) =>
          onChange(e.target.value === ownAccountId ? '' : e.target.value)
        }
        style={style}
      >
        <option value="">
          {ownAccountName ? `${ownAccountName} (your account)` : 'Your account'}
        </option>
        {!isListed && <option value={value}>Account {value}</option>}
        {others.map((account) => (
          <option key={account.id} value={account.id}>
            {account.name}
          </option>
        ))}
      </select>
      {isLoading && <div style={hintStyle}>Loading accounts...</div>}
      {error && (
        <div style={{ ...hintStyle, color: '#DC2626' }}>
          Could not load the account list.
        </div>
      )}
      {data && data.total > data.items.length && (
        <div style={hintStyle}>
          Showing the first {data.items.length} of {data.total} accounts.
        </div>
      )}
    </>
  )
}

const hintStyle: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#A39BB3',
  marginTop: '4px',
}
