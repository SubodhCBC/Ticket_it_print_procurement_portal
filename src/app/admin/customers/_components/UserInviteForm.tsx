'use client'

import React, { useState } from 'react'
import { MailPlus, Users } from 'lucide-react'
import { fieldOutline } from '@/components/ui/FormField'
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

/** Enough to catch a typo — the address is proved by the invitation itself. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

type FormErrors = {
  firstName?: string
  lastName?: string
  email?: string
  role?: string
  siteId?: string
}

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
  // Per-field, under the field it belongs to. The banner below is the API's.
  const [errors, setErrors] = useState<FormErrors>({})
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

    // Every field in one pass, so an empty form is not discovered one refusal
    // at a time — which is what the browser's own validation did.
    const found: FormErrors = {}
    if (!firstName.trim()) found.firstName = 'Enter a first name.'
    if (!lastName.trim()) found.lastName = 'Enter a last name.'
    if (!email.trim()) found.email = 'Enter the work email to invite.'
    else if (!EMAIL_PATTERN.test(email.trim()))
      found.email = 'Use a valid email address, like name@company.co.nz.'

    // Neither option is offered; checked again so a stale form cannot send it.
    if (role === 'ADMIN' && !isAdmin)
      found.role = 'Only an administrator can invite an administrator.'
    else if (userType === 'EXTERNAL' && role === 'ADMIN')
      found.role =
        'An external collaborator cannot be an administrator. Choose site user or head office.'

    if (siteRequired && !siteId)
      found.siteId =
        userType === 'EXTERNAL'
          ? 'An external user must be attached to a site. Choose one.'
          : 'A site user must be attached to a site. Choose one.'

    setErrors(found)
    if (Object.values(found).some(Boolean)) return

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
      noValidate
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
        <Field
          label="First name *"
          htmlFor="invite-first-name"
          error={errors.firstName}
        >
          <input
            id="invite-first-name"
            type="text"
            maxLength={100}
            value={firstName}
            disabled={locked}
            aria-invalid={errors.firstName ? true : undefined}
            onChange={(e) => {
              setFirstName(e.target.value)
              setErrors((current) => ({ ...current, firstName: undefined }))
            }}
            style={{
              ...fieldStyle(locked),
              ...(errors.firstName ? fieldOutline(true) : {}),
            }}
          />
        </Field>
        <Field
          label="Last name *"
          htmlFor="invite-last-name"
          error={errors.lastName}
        >
          <input
            id="invite-last-name"
            type="text"
            maxLength={100}
            value={lastName}
            disabled={locked}
            aria-invalid={errors.lastName ? true : undefined}
            onChange={(e) => {
              setLastName(e.target.value)
              setErrors((current) => ({ ...current, lastName: undefined }))
            }}
            style={{
              ...fieldStyle(locked),
              ...(errors.lastName ? fieldOutline(true) : {}),
            }}
          />
        </Field>
        <Field
          label="Work email *"
          htmlFor="invite-email"
          hint="Where the invitation is sent."
          error={errors.email}
        >
          <input
            id="invite-email"
            type="text"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            placeholder="e.g. jane.smith@company.co.nz"
            value={email}
            disabled={locked}
            aria-invalid={errors.email ? true : undefined}
            onChange={(e) => {
              setEmail(e.target.value)
              setErrors((current) => ({ ...current, email: undefined }))
            }}
            style={{
              ...fieldStyle(locked),
              ...(errors.email ? fieldOutline(true) : {}),
            }}
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
                setErrors((current) => ({ ...current, siteId: undefined }))
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
        <Field label="Role *" htmlFor="invite-role" error={errors.role}>
          <select
            id="invite-role"
            value={role}
            disabled={locked}
            aria-invalid={errors.role ? true : undefined}
            onChange={(e) => {
              setRole(e.target.value as UserRole)
              // Whether a site is needed follows the role, so its message goes
              // too rather than standing over a rule that no longer applies.
              setErrors((current) => ({
                ...current,
                role: undefined,
                siteId: undefined,
              }))
            }}
            style={{
              ...fieldStyle(locked),
              ...(errors.role ? fieldOutline(true) : {}),
            }}
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
              // Both rules this box takes part in are about other fields.
              setErrors((current) => ({
                ...current,
                role: undefined,
                siteId: undefined,
              }))
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
          error={errors.siteId}
        >
          <select
            id="invite-site"
            value={siteId}
            disabled={locked || sitesQuery.isLoading}
            aria-invalid={errors.siteId ? true : undefined}
            onChange={(e) => {
              setSiteId(e.target.value)
              setErrors((current) => ({ ...current, siteId: undefined }))
            }}
            style={{
              ...fieldStyle(locked || sitesQuery.isLoading),
              ...(errors.siteId ? fieldOutline(true) : {}),
            }}
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
