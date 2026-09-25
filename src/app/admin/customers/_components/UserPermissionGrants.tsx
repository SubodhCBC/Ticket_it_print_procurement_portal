'use client'

import { SkeletonList } from '@/components/ui/Skeleton'
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Plus } from 'lucide-react'
import {
  getPermissionCatalog,
  grantPermission,
  listUserGrants,
  revokeGrant,
  type PermissionGrant,
} from '@/services/data-source/api/api-authorization.adapter'
import type { Permission } from '@/types/auth'
import { ErrorNote, Field, SuccessNote, Tag } from './CustomerAdminUi'
import {
  buttonStyle,
  errorMessage,
  fieldStyle,
  hintStyle,
  palette,
  sectionTitleStyle,
} from './customerAdmin.shared'
import { formatDate } from '@/lib/format'

const grantsKey = (userId: string, accountId: string) =>
  ['users', 'grants', userId, accountId] as const

/**
 * A user's departures from their role's permissions: grants (ALLOW) and
 * removals (DENY), optionally for one resource and until a date.
 *
 * Editable by an administrator only, and never on their own account. The API
 * lets anyone holding USER_MANAGE — head office included — grant any
 * permission, so until it limits what head office may grant, the screen does.
 * Everyone else with access sees the list.
 */
export function UserPermissionGrants({
  userId,
  accountId,
  canEdit,
}: {
  userId: string
  accountId: string
  canEdit: boolean
}) {
  const client = useQueryClient()
  const grants = useQuery({
    queryKey: grantsKey(userId, accountId),
    queryFn: () => listUserGrants(userId, accountId),
  })
  const catalog = useQuery({
    queryKey: ['authorization', 'catalog'],
    queryFn: getPermissionCatalog,
    enabled: canEdit,
    staleTime: 10 * 60_000,
  })

  const [adding, setAdding] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = () =>
    client.invalidateQueries({ queryKey: grantsKey(userId, accountId) })

  const revoke = useMutation({
    mutationFn: (grant: PermissionGrant) =>
      revokeGrant(
        userId,
        grant.permission as Permission,
        grant.resourceId,
        accountId
      ),
    onSuccess: async (_, grant) => {
      setNotice(`${grant.permission} removed.`)
      await refresh()
    },
  })

  const describe = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of catalog.data?.permissions ?? []) {
      map.set(entry.key, entry.description)
    }
    return map
  }, [catalog.data])

  const list = grants.data ?? []

  return (
    <section
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        borderTop: `1px solid ${palette.divider}`,
        paddingTop: '16px',
        marginTop: '16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
        }}
      >
        <h3 style={sectionTitleStyle}>
          Individual permissions{' '}
          <span style={{ color: palette.muted, fontWeight: 500 }}>
            ({list.length})
          </span>
        </h3>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => {
              setNotice(null)
              setAdding(true)
            }}
            style={{
              ...buttonStyle('secondary'),
              padding: '5px 10px',
              fontSize: '0.76rem',
            }}
          >
            <Plus size={14} />
            Add permission
          </button>
        )}
      </div>

      <div style={{ ...hintStyle, marginTop: 0 }}>
        On top of what the role allows. A removal (deny) always wins over a
        grant.
        {!canEdit &&
          ' Only a platform administrator can change these, and not on their own account.'}
      </div>

      {notice && <SuccessNote>{notice}</SuccessNote>}
      {revoke.error && <ErrorNote error={revoke.error} />}

      {grants.isPending ? (
        <SkeletonList count={2} avatar={false} label="Loading permissions" />
      ) : grants.error ? (
        <ErrorNote
          message={`Could not load permissions: ${errorMessage(grants.error)}`}
        />
      ) : list.length === 0 ? (
        <div style={{ ...hintStyle, marginTop: 0 }}>
          None. This user has exactly their role&apos;s permissions.
        </div>
      ) : (
        list.map((grant) => (
          <div
            key={grant.id}
            style={{
              border: `1px solid ${palette.border}`,
              borderRadius: '10px',
              padding: '10px 12px',
              fontSize: '0.8rem',
              color: palette.label,
              display: 'flex',
              justifyContent: 'space-between',
              gap: '10px',
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  flexWrap: 'wrap',
                }}
              >
                <KeyRound size={13} color={palette.muted} />
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: palette.text,
                  }}
                >
                  {grant.permission}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    color: grant.effect === 'DENY' ? '#B91C1C' : '#166534',
                    backgroundColor:
                      grant.effect === 'DENY' ? '#FEF2F2' : '#ECFDF5',
                  }}
                >
                  {grant.effect === 'DENY' ? 'Removed' : 'Granted'}
                </span>
                {grant.resourceId && <Tag>Only {grant.resourceId}</Tag>}
              </div>
              {describe.get(grant.permission) && (
                <div style={{ color: palette.muted, marginTop: '2px' }}>
                  {describe.get(grant.permission)}
                </div>
              )}
              <div style={{ color: palette.muted, marginTop: '2px' }}>
                {grant.reason ? `“${grant.reason}” · ` : ''}
                {grant.expiresAt
                  ? `until ${formatDate(grant.expiresAt)}`
                  : 'no expiry'}
              </div>
            </div>
            {canEdit && (
              <button
                type="button"
                disabled={revoke.isPending}
                onClick={() => {
                  setNotice(null)
                  revoke.mutate(grant)
                }}
                style={{
                  ...buttonStyle('secondary', revoke.isPending),
                  padding: '4px 10px',
                  fontSize: '0.74rem',
                  alignSelf: 'flex-start',
                }}
              >
                Remove
              </button>
            )}
          </div>
        ))
      )}

      {adding && canEdit && (
        <GrantForm
          userId={userId}
          accountId={accountId}
          options={catalog.data?.permissions ?? []}
          loadingOptions={catalog.isPending}
          optionsError={catalog.error}
          onCancel={() => setAdding(false)}
          onGranted={async (grant) => {
            setAdding(false)
            setNotice(
              `${grant.permission} ${grant.effect === 'DENY' ? 'removed' : 'granted'}.`
            )
            await refresh()
          }}
        />
      )}
    </section>
  )
}

function GrantForm({
  userId,
  accountId,
  options,
  loadingOptions,
  optionsError,
  onCancel,
  onGranted,
}: {
  userId: string
  accountId: string
  options: { key: Permission; group: string; description: string }[]
  loadingOptions: boolean
  optionsError: unknown
  onCancel: () => void
  onGranted: (grant: PermissionGrant) => void
}) {
  const [permission, setPermission] = useState('')
  const [effect, setEffect] = useState<'ALLOW' | 'DENY'>('ALLOW')
  const [resourceId, setResourceId] = useState('')
  const [reason, setReason] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  const grant = useMutation({
    mutationFn: () =>
      grantPermission(
        userId,
        {
          permission: permission as Permission,
          effect,
          resourceId: resourceId.trim() || null,
          reason: reason.trim() || undefined,
          // End of the chosen day, local time.
          expiresAt: expiresOn
            ? new Date(`${expiresOn}T23:59:59`).toISOString()
            : null,
        },
        accountId
      ),
    onSuccess: onGranted,
  })

  const groups = useMemo(() => {
    const byGroup = new Map<string, typeof options>()
    for (const option of options) {
      const list = byGroup.get(option.group) ?? []
      list.push(option)
      byGroup.set(option.group, list)
    }
    return [...byGroup.entries()]
  }, [options])

  const submit = () => {
    setLocalError(null)
    if (!permission) {
      setLocalError('Choose a permission.')
      return
    }
    if (
      expiresOn &&
      new Date(`${expiresOn}T23:59:59`).getTime() <= Date.now()
    ) {
      setLocalError('The expiry date has to be in the future.')
      return
    }
    grant.mutate()
  }

  const busy = grant.isPending
  return (
    <div
      style={{
        border: `1px solid ${palette.border}`,
        borderRadius: '10px',
        padding: '12px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      <Field label="Permission" htmlFor="grant-permission">
        <select
          id="grant-permission"
          value={permission}
          disabled={busy || loadingOptions}
          onChange={(e) => setPermission(e.target.value)}
          style={fieldStyle(busy)}
        >
          <option value="">
            {loadingOptions ? 'Loading permissions…' : 'Choose a permission'}
          </option>
          {groups.map(([group, list]) => (
            <optgroup key={group} label={group}>
              {list.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.key} — {option.description}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </Field>
      {optionsError != null && <ErrorNote error={optionsError} />}

      <Field label="Effect" htmlFor="grant-effect">
        <select
          id="grant-effect"
          value={effect}
          disabled={busy}
          onChange={(e) => setEffect(e.target.value as 'ALLOW' | 'DENY')}
          style={fieldStyle(busy)}
        >
          <option value="ALLOW">Grant — add it to what the role allows</option>
          <option value="DENY">
            Remove — take it away even if the role allows it
          </option>
        </select>
      </Field>

      <Field
        label="Only for one resource (optional)"
        htmlFor="grant-resource"
        hint="A document or site id. Leave blank for the whole account."
      >
        <input
          id="grant-resource"
          value={resourceId}
          maxLength={128}
          disabled={busy}
          onChange={(e) => setResourceId(e.target.value)}
          style={fieldStyle(busy)}
        />
      </Field>

      <Field label="Reason (optional)" htmlFor="grant-reason">
        <input
          id="grant-reason"
          value={reason}
          maxLength={500}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          style={fieldStyle(busy)}
        />
      </Field>

      <Field
        label="Expires (optional)"
        htmlFor="grant-expires"
        hint="Leave blank for no expiry."
      >
        <input
          id="grant-expires"
          type="date"
          value={expiresOn}
          disabled={busy}
          onChange={(e) => setExpiresOn(e.target.value)}
          style={fieldStyle(busy)}
        />
      </Field>

      {(localError || grant.error) && (
        <ErrorNote
          message={localError}
          error={localError ? undefined : grant.error}
        />
      )}

      <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={buttonStyle('secondary', busy)}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          style={buttonStyle(effect === 'DENY' ? 'danger' : 'primary', busy)}
        >
          {busy
            ? 'Saving…'
            : effect === 'DENY'
              ? 'Remove permission'
              : 'Grant permission'}
        </button>
      </div>
    </div>
  )
}
