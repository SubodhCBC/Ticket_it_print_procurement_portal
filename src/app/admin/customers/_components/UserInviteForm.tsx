'use client'

import React, { useState } from 'react'
import { MailPlus, Users } from 'lucide-react'
import { useCreateInvitation, useSiteRecords } from '@/hooks/useAccounts'
import type { Account, UserRole } from '@/types'
import type { Invitation, InvitationUserType } from '@/types/customers-admin'
import {
  CustomerStatusBadge,
  ErrorNote,
  Field,
  SuccessNote,
} from './CustomerAdminUi'
import {
  ROLE_LABELS,
  buttonStyle,
  cardStyle,
  fieldStyle,
  formatDateTime,
  palette,
} from './customerAdmin.shared'

interface UserInviteFormProps {
  /** An administrator may invite into any account; everyone else into their own. */
  isAdmin: boolean
  accounts: Account[]
  ownAccountName?: string
  /** Pre-selected account (the screen's account filter). */
  defaultAccountId?: string
  onCancel: () => void
  onViewInvitations: () => void
}

/**
 * POST /invitations.
 *
 * There is no "create user": the invitee sets their own password on
 * acceptance, and the user row exists only from then. So what this form
 * produces — and reports — is a pending invitation.
 */
export function UserInviteForm({
  isAdmin,
  accounts,
  ownAccountName,
  defaultAccountId,
  onCancel,
  onViewInvitations,
}: UserInviteFormProps) {
  const create = useCreateInvitation()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('SITE_USER')
  const [userType, setUserType] = useState<InvitationUserType>('NEW')
  const [accountId, setAccountId] = useState(
    isAdmin ? (defaultAccountId ?? '') : ''
  )
  const [siteId, setSiteId] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)
  const [created, setCreated] = useState<Invitation | null>(null)

  const sitesQuery = useSiteRecords({
    accountId: accountId || undefined,
    status: 'ACTIVE',
    pageSize: 100,
  })
  const sites = sitesQuery.data?.items ?? []

  const siteRequired = role === 'SITE_USER' || userType === 'EXTERNAL'
  const locked = create.isPending

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError(null)

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setLocalError('First name, last name and email are required.')
      return
    }
    // The option is not offered; checked again so a stale form cannot send it.
    if (role === 'ADMIN' && !isAdmin) {
      setLocalError('Only an administrator can invite an administrator.')
      return
    }
    if (userType === 'EXTERNAL' && role === 'ADMIN') {
      setLocalError('An external user cannot be an administrator.')
      return
    }
    if (siteRequired && !siteId) {
      setLocalError(
        userType === 'EXTERNAL'
          ? 'An external user must be attached to a site.'
          : 'A site user must be attached to a site.'
      )
      return
    }

    try {
      const invitation = await create.mutateAsync({
        ...(isAdmin && accountId ? { accountId } : {}),
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        userType,
        ...(siteId ? { siteId } : {}),
      })
      setCreated(invitation)
      setFirstName('')
      setLastName('')
      setEmail('')
      setSiteId('')
    } catch {
      // Rendered below from `create.error`.
    }
  }

  const header = (
    <div
      style={{
        fontWeight: 700,
        fontSize: '0.95rem',
        color: palette.text,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      <Users size={16} color={palette.muted} />
      <span>Invite a portal user</span>
    </div>
  )

  if (created) {
    const site = sites.find((s) => s.id === created.siteId)
    return (
      <div
        style={{
          ...cardStyle,
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}
      >
        {header}
        <SuccessNote>
          Invitation sent to <strong>{created.email}</strong>.
        </SuccessNote>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '10px',
            fontSize: '0.8rem',
            color: palette.label,
          }}
        >
          <div>
            <div style={{ color: palette.muted }}>Invitee</div>
            <div style={{ fontWeight: 600, color: palette.text }}>
              {created.name}
            </div>
          </div>
          <div>
            <div style={{ color: palette.muted }}>Status</div>
            <CustomerStatusBadge status={created.status} />
          </div>
          <div>
            <div style={{ color: palette.muted }}>Role</div>
            <div>{ROLE_LABELS[created.role]}</div>
          </div>
          <div>
            <div style={{ color: palette.muted }}>Site</div>
            <div>
              {site
                ? `${site.name} (${site.code})`
                : created.siteId
                  ? created.siteId
                  : 'Account-wide'}
            </div>
          </div>
          <div>
            <div style={{ color: palette.muted }}>Expires</div>
            <div>{formatDateTime(created.expiresAt)}</div>
          </div>
        </div>
        <div style={{ fontSize: '0.78rem', color: palette.secondary }}>
          The invitee chooses their own password when they accept. They appear
          in the users list from then; until then the invitation can be revoked
          from the Invitations tab.
        </div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={onCancel}
            style={buttonStyle('secondary')}
          >
            Close
          </button>
          <button
            type="button"
            onClick={onViewInvitations}
            style={buttonStyle('secondary')}
          >
            View invitations
          </button>
          <button
            type="button"
            onClick={() => {
              create.reset()
              setCreated(null)
            }}
            style={buttonStyle('primary')}
          >
            <MailPlus size={15} />
            Invite another
          </button>
        </div>
      </div>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        ...cardStyle,
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {header}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
        }}
      >
        <Field label="First name *" htmlFor="invite-first-name">
          <input
            id="invite-first-name"
            type="text"
            required
            maxLength={100}
            value={firstName}
            disabled={locked}
            onChange={(e) => setFirstName(e.target.value)}
            style={fieldStyle(locked)}
          />
        </Field>
        <Field label="Last name *" htmlFor="invite-last-name">
          <input
            id="invite-last-name"
            type="text"
            required
            maxLength={100}
            value={lastName}
            disabled={locked}
            onChange={(e) => setLastName(e.target.value)}
            style={fieldStyle(locked)}
          />
        </Field>
        <Field label="Work email *" htmlFor="invite-email">
          <input
            id="invite-email"
            type="email"
            required
            maxLength={254}
            placeholder="name@organisation.com"
            value={email}
            disabled={locked}
            onChange={(e) => setEmail(e.target.value)}
            style={fieldStyle(locked)}
          />
        </Field>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '14px',
        }}
      >
        {isAdmin && (
          <Field label="Account" htmlFor="invite-account">
            <select
              id="invite-account"
              value={accountId}
              disabled={locked}
              onChange={(e) => {
                setAccountId(e.target.value)
                setSiteId('')
              }}
              style={fieldStyle(locked)}
            >
              <option value="">
                Your account{ownAccountName ? ` (${ownAccountName})` : ''}
              </option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name} ({account.accountCode})
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Role *" htmlFor="invite-role">
          <select
            id="invite-role"
            value={role}
            disabled={locked}
            onChange={(e) => setRole(e.target.value as UserRole)}
            style={fieldStyle(locked)}
          >
            <option value="SITE_USER">Site user</option>
            <option value="HEAD_OFFICE">Head office</option>
            {/* Granting ADMIN is an administrator's alone. Head office holds
                USER_INVITE too, but may not invite someone above itself. */}
            {isAdmin && (
              <option value="ADMIN" disabled={userType === 'EXTERNAL'}>
                Admin
              </option>
            )}
          </select>
        </Field>
        <Field
          label="User type"
          htmlFor="invite-user-type"
          hint={
            userType === 'EXTERNAL'
              ? 'External collaborators are limited to one site.'
              : undefined
          }
        >
          <select
            id="invite-user-type"
            value={userType}
            disabled={locked}
            onChange={(e) => {
              const next = e.target.value as InvitationUserType
              setUserType(next)
              if (next === 'EXTERNAL' && role === 'ADMIN') setRole('SITE_USER')
            }}
            style={fieldStyle(locked)}
          >
            <option value="NEW">Portal user</option>
            <option value="EXTERNAL">External collaborator</option>
          </select>
        </Field>
        <Field
          label={siteRequired ? 'Site *' : 'Site'}
          htmlFor="invite-site"
          hint={
            sitesQuery.error
              ? 'Could not load sites for this account.'
              : siteRequired
                ? undefined
                : 'Leave empty for an account-wide user.'
          }
        >
          <select
            id="invite-site"
            value={siteId}
            required={siteRequired}
            disabled={locked || sitesQuery.isLoading}
            onChange={(e) => setSiteId(e.target.value)}
            style={fieldStyle(locked || sitesQuery.isLoading)}
          >
            <option value="">
              {sitesQuery.isLoading
                ? 'Loading sites…'
                : siteRequired
                  ? 'Select a site…'
                  : 'None (account-wide)'}
            </option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name} ({site.code})
              </option>
            ))}
          </select>
        </Field>
      </div>

      <ErrorNote message={localError} />
      <ErrorNote error={create.error} />

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={locked}
          style={buttonStyle('secondary', locked)}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={locked}
          style={buttonStyle('primary', locked)}
        >
          <MailPlus size={15} />
          {create.isPending ? 'Sending…' : 'Send invitation'}
        </button>
      </div>
    </form>
  )
}
