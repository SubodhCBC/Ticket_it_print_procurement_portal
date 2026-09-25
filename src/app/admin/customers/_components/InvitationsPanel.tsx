'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import React, { useMemo, useState } from 'react'
import { Ban } from 'lucide-react'
import {
  useInvitations,
  useRevokeInvitation,
  useSiteRecords,
} from '@/hooks/useAccounts'
import type { Invitation, InvitationStatus } from '@/types/customers-admin'
import {
  ConfirmActionModal,
  CustomerStatusBadge,
  ErrorNote,
  Pager,
  RowActionButton,
  StateMessage,
  Tag,
} from './CustomerAdminUi'
import {
  ROLE_LABELS,
  cardStyle,
  errorMessage,
  fieldStyle,
  formatDateTime,
  palette,
  useRetained,
} from './customerAdmin.shared'

const PAGE_SIZE = 20

const STATUS_FILTERS: Array<{ value: '' | InvitationStatus; label: string }> = [
  { value: '', label: 'All statuses' },
  { value: 'PENDING', label: 'Pending' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'REVOKED', label: 'Revoked' },
  { value: 'EXPIRED', label: 'Expired' },
]

const headerCell: React.CSSProperties = {
  padding: '10px 14px',
  color: palette.muted,
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}

const bodyCell: React.CSSProperties = {
  padding: '12px 14px',
  color: palette.label,
  verticalAlign: 'top',
}

interface InvitationsPanelProps {
  /** Omitted means the caller's own account. */
  accountId?: string
  /** USER_INVITE, which both listing and revoking need. */
  canInvite: boolean
}

/** GET /invitations with a status filter, and POST /invitations/:id/revoke. */
export function InvitationsPanel({
  accountId,
  canInvite,
}: InvitationsPanelProps) {
  const [status, setStatus] = useState<'' | InvitationStatus>('')
  const [page, setPage] = useState(1)
  const [revoking, setRevoking] = useState<Invitation | null>(null)

  const { data, isLoading, isFetching, error } = useInvitations({
    accountId,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  })
  // Revoking the last pending invitation on a later page (under the Pending
  // filter) leaves that page empty: step back one rather than show the empty
  // state with earlier pages still full. One page back, not a reset, because
  // the adapter walks the cursor from the start for every page. Adjusted
  // during render, and only for the page the data is for, so it runs once.
  if (data && data.page === page && page > 1 && data.items.length === 0)
    setPage(page - 1)

  // Only to name the site beside each invitation.
  const { data: sites } = useSiteRecords({ accountId, pageSize: 100 })
  const siteNames = useMemo(
    () =>
      new Map(
        (sites?.items ?? []).map((site) => [
          site.id,
          `${site.name} (${site.code})`,
        ])
      ),
    [sites]
  )

  if (!canInvite) {
    return (
      <div style={cardStyle}>
        <StateMessage>
          Invitations are visible to users who can invite others. Your role does
          not include that permission.
        </StateMessage>
      </div>
    )
  }

  const items = data?.items ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label
          htmlFor="invitation-status-filter"
          style={{
            fontSize: '0.78rem',
            color: palette.secondary,
            fontWeight: 500,
          }}
        >
          Status:
        </label>
        <select
          id="invitation-status-filter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as '' | InvitationStatus)
            setPage(1)
          }}
          style={{ ...fieldStyle(), width: 'auto' }}
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ ...cardStyle, overflowX: 'auto' }}>
        {isLoading ? (
          <SkeletonTable rows={4} columns={5} label="Loading invitations" />
        ) : error ? (
          <div style={{ padding: '16px' }}>
            <ErrorNote
              message={`Could not load invitations: ${errorMessage(error)}`}
            />
          </div>
        ) : items.length === 0 ? (
          <StateMessage>
            {status
              ? 'No invitations with this status.'
              : 'No invitations have been sent for this account.'}
          </StateMessage>
        ) : (
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.84rem',
            }}
          >
            <thead>
              <tr>
                <th style={{ ...headerCell, paddingLeft: '20px' }}>Invitee</th>
                <th style={headerCell}>Role</th>
                <th style={headerCell}>Site</th>
                <th style={headerCell}>Status</th>
                <th style={headerCell}>Expires</th>
                <th style={headerCell}>Sent</th>
                <th
                  style={{
                    ...headerCell,
                    paddingRight: '20px',
                    textAlign: 'right',
                  }}
                >
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((invitation) => {
                const lapsed = invitation.hasLapsed

                return (
                  <tr
                    key={invitation.id}
                    style={{ borderTop: `1px solid ${palette.divider}` }}
                  >
                    <td style={{ ...bodyCell, paddingLeft: '20px' }}>
                      <div style={{ fontWeight: 600, color: palette.text }}>
                        {invitation.name}
                      </div>
                      <div
                        style={{ fontSize: '0.72rem', color: palette.muted }}
                      >
                        {invitation.email}
                      </div>
                    </td>
                    <td style={bodyCell}>
                      <div
                        style={{
                          display: 'flex',
                          gap: '4px',
                          flexWrap: 'wrap',
                        }}
                      >
                        <Tag>{ROLE_LABELS[invitation.role]}</Tag>
                        {invitation.userType === 'EXTERNAL' && (
                          <Tag>External</Tag>
                        )}
                      </div>
                    </td>
                    <td style={bodyCell}>
                      {invitation.siteId
                        ? (siteNames.get(invitation.siteId) ??
                          invitation.siteId)
                        : 'Account-wide'}
                    </td>
                    <td style={bodyCell}>
                      <CustomerStatusBadge status={invitation.status} />
                    </td>
                    <td style={{ ...bodyCell, whiteSpace: 'nowrap' }}>
                      {invitation.status === 'ACCEPTED' ? (
                        <span style={{ color: palette.muted }}>
                          Accepted {formatDateTime(invitation.acceptedAt)}
                        </span>
                      ) : (
                        formatDateTime(invitation.expiresAt)
                      )}
                      {lapsed && (
                        <div
                          style={{ fontSize: '0.72rem', color: palette.danger }}
                        >
                          Link has lapsed
                        </div>
                      )}
                    </td>
                    <td style={{ ...bodyCell, whiteSpace: 'nowrap' }}>
                      {formatDateTime(invitation.createdAt)}
                    </td>
                    <td
                      style={{
                        ...bodyCell,
                        paddingRight: '20px',
                        textAlign: 'right',
                      }}
                    >
                      {invitation.status === 'PENDING' ? (
                        <RowActionButton
                          tone="danger"
                          icon={<Ban size={13} />}
                          label="Revoke"
                          onClick={() => setRevoking(invitation)}
                        />
                      ) : (
                        <span style={{ color: palette.muted }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {data && (
          <Pager
            page={data.page}
            totalPages={data.totalPages}
            isFetching={isFetching}
            onPageChange={setPage}
          />
        )}
      </div>

      <RevokeInvitationModal
        invitation={revoking}
        onClose={() => setRevoking(null)}
      />
    </div>
  )
}

function RevokeInvitationModal({
  invitation,
  onClose,
}: {
  invitation: Invitation | null
  onClose: () => void
}) {
  const shown = useRetained(invitation)
  const revoke = useRevokeInvitation()

  const close = () => {
    revoke.reset()
    onClose()
  }

  const confirm = async () => {
    if (!shown) return
    try {
      await revoke.mutateAsync({ id: shown.id, accountId: shown.accountId })
      close()
    } catch {
      // Rendered in the dialog from `revoke.error`.
    }
  }

  return (
    <ConfirmActionModal
      isOpen={invitation !== null}
      title="Revoke invitation"
      confirmLabel="Revoke invitation"
      pendingLabel="Revoking…"
      isPending={revoke.isPending}
      error={revoke.error}
      onConfirm={() => void confirm()}
      onClose={close}
    >
      {shown && (
        <>
          <p style={{ margin: 0 }}>
            Revoke the invitation for <strong>{shown.name}</strong>{' '}
            <span style={{ color: palette.secondary }}>({shown.email})</span>?
          </p>
          <p
            style={{ margin: 0, color: palette.secondary, fontSize: '0.8rem' }}
          >
            The link in their email stops working immediately. You can send a
            new invitation later.
          </p>
        </>
      )}
    </ConfirmActionModal>
  )
}
