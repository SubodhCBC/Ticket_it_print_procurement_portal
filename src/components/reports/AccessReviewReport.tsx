// src/components/reports/AccessReviewReport.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useMemo, useState } from 'react'
import {
  AdminCard,
  AdminTable,
  SectionHeading,
  StatTile,
  StateBlock,
  Td,
  TextInput,
  Th,
} from '@/components/admin/ProductAdminUi'
import { errorMessage } from '@/components/admin/ProductAdminUtils'
import { useAccessReview } from '@/hooks/useReports'
import type { AccessReviewParams } from '@/services/data-source/api/governance.types'
import { ReportDownloadButtons } from './ReportDownloadButtons'
import { formatDate, formatDateTime, formatNumber } from '@/lib/format'

/** Sign-ins older than this are called out for the reviewer. */
const DORMANT_DAYS = 90

/**
 * User access review extract (SOW §12, §15): everyone who can sign in to one
 * account — role, branches, per-user permission overrides and last sign-in —
 * for a quarterly client attestation.
 *
 * Shared by the admin and head-office portals. Needs USER_MANAGE.
 */
export function AccessReviewReport({ accountId }: { accountId?: string }) {
  const [includeInactive, setIncludeInactive] = useState(false)
  const [search, setSearch] = useState('')

  const params: AccessReviewParams = useMemo(
    () => ({
      ...(accountId ? { accountId } : {}),
      ...(includeInactive ? { includeInactive: true } : {}),
    }),
    [accountId, includeInactive]
  )

  const { data, isLoading, isFetching, error } = useAccessReview(params)

  const users = useMemo(() => {
    const needle = search.trim().toLowerCase()
    const all = data?.users ?? []
    if (!needle) return all
    return all.filter((user) =>
      [user.name, user.email, user.login, user.role, user.primarySite ?? '']
        .join(' ')
        .toLowerCase()
        .includes(needle)
    )
  }, [data, search])

  const counts = useMemo(() => {
    const all = data?.users ?? []
    return {
      total: all.length,
      neverSignedIn: all.filter((u) => u.lastLoginAt === null).length,
      dormant: all.filter(
        (u) =>
          u.daysSinceLastLogin !== null && u.daysSinceLastLogin > DORMANT_DAYS
      ).length,
      withOverrides: all.filter((u) => u.permissionOverrides.trim() !== '')
        .length,
    }
  }, [data])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <AdminCard>
        <SectionHeading
          title="Users with access"
          description={
            data
              ? `As of ${formatDateTime(data.asOf)}. The download carries every user in the extract, whatever is typed in the search.`
              : undefined
          }
          action={
            <ReportDownloadButtons
              report="users/access-review"
              params={params}
              disabled={!data || data.users.length === 0}
            />
          }
        />
        <div className="row-wrap" style={{ gap: '16px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.82rem',
              color: '#2B253E',
            }}
          >
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
            Include inactive and deactivated users
          </label>
          <TextInput
            type="search"
            placeholder="Filter by name, email, role or site…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: '320px' }}
          />
        </div>

        {data && (
          <div
            className="grid-auto"
            style={{ ['--min']: '160px', gap: '12px' } as React.CSSProperties}
          >
            <StatTile label="Users" value={counts.total} />
            <StatTile
              label="Never signed in"
              value={counts.neverSignedIn}
              tone={counts.neverSignedIn > 0 ? 'danger' : 'default'}
            />
            <StatTile
              label={`No sign-in for ${DORMANT_DAYS}+ days`}
              value={counts.dormant}
              tone={counts.dormant > 0 ? 'danger' : 'default'}
            />
            <StatTile
              label="With permission overrides"
              value={counts.withOverrides}
            />
          </div>
        )}
      </AdminCard>

      <AdminCard style={{ opacity: isFetching ? 0.6 : 1 }}>
        {error ? (
          <StateBlock
            tone="error"
            title="The access review could not be loaded"
            description={errorMessage(error, 'Try again in a moment.')}
          />
        ) : isLoading || !data ? (
          <SkeletonTable rows={8} columns={8} label="Loading users" />
        ) : users.length === 0 ? (
          <StateBlock title="No users match" />
        ) : (
          <AdminTable
            head={
              <>
                <Th first>User</Th>
                <Th>Role</Th>
                <Th>Status</Th>
                <Th>Primary site</Th>
                <Th>Additional sites</Th>
                <Th>Permission overrides</Th>
                <Th>Last sign-in</Th>
                <Th>Created</Th>
              </>
            }
          >
            {users.map((user) => {
              const stale =
                user.lastLoginAt === null ||
                (user.daysSinceLastLogin ?? 0) > DORMANT_DAYS
              return (
                <tr
                  key={user.userId}
                  style={{ borderTop: '1px solid #F5EEF2' }}
                >
                  <Td first>
                    <div style={{ fontWeight: 600 }}>{user.name}</div>
                    <div style={{ fontSize: '0.74rem', color: '#6E6781' }}>
                      {user.email}
                    </div>
                    <div
                      style={{
                        fontSize: '0.72rem',
                        color: '#A39BB3',
                        fontFamily: 'monospace',
                      }}
                    >
                      {user.login}
                    </div>
                  </Td>
                  <Td>
                    {user.role}
                    <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                      {user.userType}
                    </div>
                  </Td>
                  <Td>
                    {user.status}
                    {user.deactivatedAt && (
                      <div style={{ fontSize: '0.72rem', color: '#B91C1C' }}>
                        Deactivated {formatDate(user.deactivatedAt)}
                      </div>
                    )}
                  </Td>
                  <Td>{user.primarySite ?? '—'}</Td>
                  <Td style={{ maxWidth: '180px', overflowWrap: 'anywhere' }}>
                    {user.additionalSites || '—'}
                  </Td>
                  <Td
                    style={{
                      maxWidth: '240px',
                      overflowWrap: 'anywhere',
                      fontFamily: user.permissionOverrides
                        ? 'monospace'
                        : undefined,
                      fontSize: '0.76rem',
                    }}
                  >
                    {user.permissionOverrides || '—'}
                  </Td>
                  <Td
                    style={{
                      whiteSpace: 'nowrap',
                      color: stale ? '#B91C1C' : undefined,
                      fontWeight: stale ? 600 : undefined,
                    }}
                  >
                    {user.lastLoginAt ? (
                      <>
                        {formatDate(user.lastLoginAt)}
                        <div style={{ fontSize: '0.72rem', fontWeight: 400 }}>
                          {user.daysSinceLastLogin === 0
                            ? 'today'
                            : user.daysSinceLastLogin === 1
                              ? 'yesterday'
                              : `${formatNumber(user.daysSinceLastLogin)} days ago`}
                        </div>
                      </>
                    ) : (
                      'Never'
                    )}
                  </Td>
                  <Td style={{ whiteSpace: 'nowrap' }}>
                    {formatDate(user.createdAt)}
                  </Td>
                </tr>
              )
            })}
          </AdminTable>
        )}
      </AdminCard>
    </div>
  )
}
