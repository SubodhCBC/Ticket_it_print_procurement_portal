'use client'

import { SkeletonForm } from '@/components/ui/Skeleton'
import React, { useState } from 'react'
import { Drawer } from '@/components/ui/Drawer'
import { fieldOutline } from '@/components/ui/FormField'
import {
  useManagedUser,
  useSiteRecords,
  useUpdateManagedUser,
} from '@/hooks/useAccounts'
import type { PortalUser, UserRole } from '@/types'
import type {
  ManagedUser,
  ManagedUserStatus,
  UpdateUserInput,
} from '@/types/customers-admin'
import {
  CheckboxField,
  CustomerStatusBadge,
  ErrorNote,
  Field,
  SuccessNote,
  Tag,
} from './CustomerAdminUi'
import { UserPermissionGrants } from './UserPermissionGrants'
import { formatDateTime } from '@/lib/format'
import {
  MONEY_PATTERN,
  ROLE_LABELS,
  USER_TYPE_LABELS,
  buttonStyle,
  errorMessage,
  fieldStyle,
  hintStyle,
  palette,
  sameMoney,
  sectionTitleStyle,
  toMoneyInput,
  useRetained,
} from './customerAdmin.shared'

/** Sites offered in the pickers. The API caps a page at 100. */
const SITE_PICKER_LIMIT = 100

type FormErrors = {
  role?: string
  status?: string
  siteId?: string
  budgetCap?: string
}

interface UserEditDrawerProps {
  /** The user as listed; null closes the drawer. */
  user: PortalUser | null
  /** USER_MANAGE. Without it the drawer is read-only. */
  canManage: boolean
  /**
   * The viewer is an administrator. Head office holds USER_MANAGE too, but
   * granting the Admin role — or changing the role or status of someone who
   * already has it — is an administrator's alone.
   */
  isAdmin: boolean
  /** The signed-in user, who may not change their own role or disable themselves. */
  currentUserId?: string
  onClose: () => void
}

export function UserEditDrawer({
  user,
  canManage,
  isAdmin,
  currentUserId,
  onClose,
}: UserEditDrawerProps) {
  const shown = useRetained(user)
  // Asked for only while open (from `user`, not the retained copy), so
  // deactivating this user after closing the drawer does not refetch them into
  // a 404.
  const { data, error, isFetchedAfterMount } = useManagedUser(
    user?.id ?? null,
    user?.accountId
  )
  // The form starts from the user as fetched for this opening, not from cached
  // detail of an earlier one: that is shown while it refreshes, and a form
  // seeded from it kept the old role, status and sites once the fresh detail
  // arrived under the same key — so they read as edits and Save sent them back.
  const fresh = data !== null && isFetchedAfterMount ? data : null
  // Closing idles the query: keep the last fresh detail on screen while the
  // drawer animates out, provided it is this user's.
  const lastFresh = useRetained(fresh)
  const detail =
    user !== null ? fresh : lastFresh?.id === shown?.id ? lastFresh : null

  return (
    <Drawer
      isOpen={user !== null}
      onClose={onClose}
      width="540px"
      title={shown ? shown.name : 'User'}
    >
      {user !== null && !detail && !error && (
        <SkeletonForm fields={6} label="Loading user" />
      )}
      {error && !detail && (
        <ErrorNote
          message={`Could not load this user: ${errorMessage(error)}`}
        />
      )}
      {detail && (
        <UserEditForm
          key={detail.id}
          user={detail}
          canManage={canManage}
          isAdmin={isAdmin}
          isSelf={detail.id === currentUserId}
          onClose={onClose}
        />
      )}
      {detail && canManage && (
        <UserPermissionGrants
          key={`grants-${detail.id}`}
          userId={detail.id}
          accountId={detail.accountId}
          canEdit={isAdmin && detail.id !== currentUserId}
        />
      )}
    </Drawer>
  )
}

function sameIds(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false
  const set = new Set(left)
  return right.every((id) => set.has(id))
}

function UserEditForm({
  user,
  canManage,
  isAdmin,
  isSelf,
  onClose,
}: {
  user: ManagedUser
  canManage: boolean
  isAdmin: boolean
  isSelf: boolean
  onClose: () => void
}) {
  const update = useUpdateManagedUser()
  const sitesQuery = useSiteRecords({
    accountId: user.accountId,
    pageSize: SITE_PICKER_LIMIT,
  })
  const sites = sitesQuery.data?.items ?? []

  const [role, setRole] = useState<UserRole>(user.role)
  const [status, setStatus] = useState<ManagedUserStatus>(user.status)
  const [siteId, setSiteId] = useState(user.site?.id ?? '')
  const [additional, setAdditional] = useState<string[]>(user.additionalSiteIds)
  const [budgetCap, setBudgetCap] = useState(
    toMoneyInput(user.monthlyBudgetCap)
  )
  const [poPrefix, setPoPrefix] = useState(user.poPrefix ?? '')
  // Per-field, under the control it is about. The banner below is the API's.
  const [errors, setErrors] = useState<FormErrors>({})
  const [saved, setSaved] = useState(false)

  const isExternal = user.userType === 'EXTERNAL'
  // Changing an existing administrator's role or status is as privileged as
  // granting the role: shown, but not editable, to anyone else.
  const adminProtected = user.role === 'ADMIN' && !isAdmin

  const listedIds = new Set(sites.map((site) => site.id))
  // Whether the picker holds every site of the account. Only then is an id
  // missing from it known to be a removed (deactivated) branch, rather than
  // one on a page that was not loaded.
  const sitesComplete =
    sitesQuery.data !== null &&
    sitesQuery.data.totalPages <= sitesQuery.data.page
  // From the saved set, not the form's: the checkboxes cover listed sites only,
  // and after a save the saved set is what the user actually holds.
  const unlistedAdditional = sitesQuery.data
    ? user.additionalSiteIds.filter((id) => !listedIds.has(id))
    : []
  // Saving replaces the whole set, and the API refuses the request ("Site not
  // found") for the id of a deactivated branch the user still holds. With the
  // complete list loaded such ids are dropped rather than resent; with a
  // partial one an unlisted id may be a live site on a later page, so it stays.
  const nextAdditional = sitesComplete
    ? additional.filter((id) => listedIds.has(id))
    : additional

  const changes: UpdateUserInput = {}
  if (role !== user.role) changes.role = role
  if (status !== user.status && status !== 'PENDING') changes.status = status
  if ((siteId || null) !== (user.site?.id ?? null))
    changes.siteId = siteId || null
  // Sent only for a change the user made. Dropping removed branches alone is
  // not one — and once saved, the form's set still holds them while the saved
  // set does not, which must not read as a further edit.
  if (
    !sameIds(additional, user.additionalSiteIds) &&
    !sameIds(nextAdditional, user.additionalSiteIds)
  )
    changes.additionalSiteIds = nextAdditional
  if (!sameMoney(budgetCap, toMoneyInput(user.monthlyBudgetCap)))
    changes.monthlyBudgetCap = budgetCap.trim() || null
  if (poPrefix.trim() !== (user.poPrefix ?? ''))
    changes.poPrefix = poPrefix.trim() || null

  const hasChanges = Object.keys(changes).length > 0
  const locked = !canManage || update.isPending

  const primaryUnlisted =
    user.site !== null &&
    sitesQuery.data !== null &&
    !listedIds.has(user.site.id)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaved(false)

    // Every rule in one pass, each beside the control it is about. The first
    // four the controls already prevent; checked again so a stale form cannot
    // send them. The API refuses them regardless.
    const found: FormErrors = {}
    if (!isAdmin && changes.role === 'ADMIN')
      found.role = 'Only an administrator can grant the Admin role.'
    else if (adminProtected && changes.role !== undefined)
      found.role = "Only an administrator can change an administrator's role."
    else if (isSelf && changes.role !== undefined)
      found.role = 'You cannot change your own role.'

    if (adminProtected && changes.status !== undefined)
      found.status =
        "Only an administrator can change an administrator's status."
    else if (isSelf && changes.status === 'DISABLED')
      found.status = 'You cannot deactivate your own account.'

    if (isExternal && changes.siteId === null)
      found.siteId =
        'An external user must stay attached to a site. Choose one.'

    if (budgetCap.trim() && !MONEY_PATTERN.test(budgetCap.trim()))
      found.budgetCap =
        'Monthly spend limit must be a number, or leave it empty for no limit.'

    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    if (!hasChanges) return

    try {
      await update.mutateAsync({
        id: user.id,
        accountId: user.accountId,
        input: changes,
      })
      setSaved(true)
    } catch {
      // Rendered below from `update.error`.
    }
  }

  const toggleAdditional = (id: string, checked: boolean) => {
    setAdditional((current) =>
      checked ? [...current, id] : current.filter((existing) => existing !== id)
    )
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
    >
      {/* Identity: read-only here. For a Ticket-IT user these are replicated
          on every sign-in, so an edit would silently revert. */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          fontSize: '0.8rem',
          color: palette.label,
        }}
      >
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <CustomerStatusBadge status={user.status} />
          <Tag>{USER_TYPE_LABELS[user.userType]}</Tag>
          <Tag>{ROLE_LABELS[user.role]}</Tag>
        </div>
        <div>{user.email}</div>
        <div style={{ color: palette.muted }}>
          Login <span style={{ fontFamily: 'monospace' }}>{user.login}</span> ·
          Last sign-in {formatDateTime(user.lastLoginAt)}
        </div>
      </div>

      {!canManage && (
        <ErrorNote message="You can view this user but not change them: that needs the user management permission." />
      )}

      <h3 style={sectionTitleStyle}>Access</h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        <Field
          label="Role"
          htmlFor="user-edit-role"
          hint={
            isSelf
              ? 'You cannot change your own role.'
              : adminProtected
                ? "Only an administrator can change an administrator's role."
                : isExternal
                  ? 'External users stay site users; grant individual permissions instead.'
                  : undefined
          }
          error={errors.role}
        >
          <select
            id="user-edit-role"
            value={role}
            disabled={locked || isSelf || adminProtected}
            aria-invalid={errors.role ? true : undefined}
            onChange={(e) => {
              setRole(e.target.value as UserRole)
              setErrors((current) => ({ ...current, role: undefined }))
            }}
            style={{
              ...fieldStyle(locked || isSelf || adminProtected),
              ...(errors.role ? fieldOutline(true) : {}),
            }}
          >
            {(Object.keys(ROLE_LABELS) as UserRole[])
              // Admin is offered to an administrator only. It stays listed
              // when it is the current role, so the locked field can show it.
              .filter(
                (value) => value !== 'ADMIN' || isAdmin || user.role === 'ADMIN'
              )
              .map((value) => (
                <option
                  key={value}
                  value={value}
                  disabled={isExternal && value !== 'SITE_USER'}
                >
                  {ROLE_LABELS[value]}
                </option>
              ))}
          </select>
        </Field>

        <Field
          label="Status"
          htmlFor="user-edit-status"
          hint={
            isSelf
              ? 'You cannot disable yourself.'
              : adminProtected
                ? "Only an administrator can change an administrator's status."
                : 'Disabling signs the user out of every session.'
          }
          error={errors.status}
        >
          <select
            id="user-edit-status"
            value={status}
            disabled={locked || adminProtected}
            aria-invalid={errors.status ? true : undefined}
            onChange={(e) => {
              setStatus(e.target.value as ManagedUserStatus)
              setErrors((current) => ({ ...current, status: undefined }))
            }}
            style={{
              ...fieldStyle(locked || adminProtected),
              ...(errors.status ? fieldOutline(true) : {}),
            }}
          >
            {user.status === 'PENDING' && (
              <option value="PENDING" disabled>
                Pending (current)
              </option>
            )}
            <option value="ACTIVE">Active</option>
            <option value="DISABLED" disabled={isSelf}>
              Disabled
            </option>
          </select>
        </Field>
      </div>

      <Field
        label="Primary site"
        htmlFor="user-edit-site"
        hint={
          isExternal
            ? 'An external user must stay attached to a site.'
            : 'No primary site makes the user account-wide.'
        }
        error={errors.siteId}
      >
        <select
          id="user-edit-site"
          value={siteId}
          disabled={locked}
          aria-invalid={errors.siteId ? true : undefined}
          onChange={(e) => {
            setSiteId(e.target.value)
            setErrors((current) => ({ ...current, siteId: undefined }))
          }}
          style={{
            ...fieldStyle(locked),
            ...(errors.siteId ? fieldOutline(true) : {}),
          }}
        >
          <option value="" disabled={isExternal}>
            No primary site (account-wide)
          </option>
          {primaryUnlisted && user.site && (
            <option value={user.site.id}>
              {user.site.name} ({user.site.code})
            </option>
          )}
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name} ({site.code})
              {site.status === 'INACTIVE' ? ' · inactive' : ''}
            </option>
          ))}
        </select>
      </Field>

      <div>
        <div
          style={{
            fontSize: '0.78rem',
            fontWeight: 600,
            color: palette.label,
            marginBottom: '6px',
          }}
        >
          Additional sites
        </div>
        <div style={{ ...hintStyle, marginTop: 0, marginBottom: '8px' }}>
          Extra sites this user oversees, typically for head-office users.
          Saving replaces the whole set.
        </div>
        {sitesQuery.isLoading ? (
          <div style={hintStyle}>Loading sites…</div>
        ) : sitesQuery.error ? (
          <ErrorNote
            message={`Could not load this account's sites: ${errorMessage(sitesQuery.error)}`}
          />
        ) : sites.length === 0 ? (
          <div style={hintStyle}>This account has no sites.</div>
        ) : (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
              maxHeight: '220px',
              overflowY: 'auto',
              border: `1px solid ${palette.border}`,
              borderRadius: '10px',
              padding: '10px 12px',
            }}
          >
            {sites.map((site) => (
              <CheckboxField
                key={site.id}
                id={`user-edit-additional-${site.id}`}
                label={
                  <>
                    {site.name}{' '}
                    <span
                      style={{ fontFamily: 'monospace', color: palette.muted }}
                    >
                      {site.code}
                    </span>
                    {site.id === siteId && (
                      <span style={{ color: palette.muted }}> · primary</span>
                    )}
                  </>
                }
                checked={additional.includes(site.id)}
                disabled={locked}
                onChange={(checked) => toggleAdditional(site.id, checked)}
              />
            ))}
          </div>
        )}
        {unlistedAdditional.length > 0 && (
          <div style={hintStyle}>
            {sitesComplete
              ? changes.additionalSiteIds !== undefined
                ? `Access to ${unlistedAdditional.length} removed or deactivated site${unlistedAdditional.length === 1 ? '' : 's'} will be dropped on save.`
                : `Also has access to ${unlistedAdditional.length} removed or deactivated site${unlistedAdditional.length === 1 ? '' : 's'}; it is dropped when the additional sites are changed and saved.`
              : `Also has access to ${unlistedAdditional.length} site${unlistedAdditional.length === 1 ? '' : 's'} not listed here; kept as is.`}
          </div>
        )}
      </div>

      <h3 style={sectionTitleStyle}>Ordering limits</h3>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
        }}
      >
        <Field
          label="Monthly spend limit"
          htmlFor="user-edit-budget-cap"
          hint={
            budgetCap.trim() === '0' || budgetCap.trim() === '0.00'
              ? 'Zero stops this user placing orders at all.'
              : "Checked at checkout alongside the site's budget, against everything this user places in the month. Blank for no personal limit."
          }
          error={errors.budgetCap}
        >
          <input
            id="user-edit-budget-cap"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 500.00"
            value={budgetCap}
            disabled={locked}
            aria-invalid={errors.budgetCap ? true : undefined}
            onChange={(e) => {
              setBudgetCap(e.target.value)
              setErrors((current) => ({ ...current, budgetCap: undefined }))
            }}
            style={{
              ...fieldStyle(locked),
              ...(errors.budgetCap ? fieldOutline(true) : {}),
            }}
          />
        </Field>

        <Field
          label="PO prefix"
          htmlFor="user-edit-po-prefix"
          hint="For accounts that allocate PO ranges per buyer. Overrides the site's and account's prefix. Blank to use theirs."
        >
          <input
            id="user-edit-po-prefix"
            type="text"
            maxLength={32}
            placeholder="e.g. PO-AKL"
            value={poPrefix}
            disabled={locked}
            onChange={(e) => setPoPrefix(e.target.value)}
            style={{ ...fieldStyle(locked), fontFamily: 'monospace' }}
          />
        </Field>
      </div>

      <ErrorNote error={update.error} />
      {saved && !hasChanges && (
        <SuccessNote>
          Saved. A role, status or site change signs the user out of their
          existing sessions.
        </SuccessNote>
      )}

      <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onClose}
          disabled={update.isPending}
          style={buttonStyle('secondary', update.isPending)}
        >
          Close
        </button>
        {canManage && (
          <button
            type="submit"
            disabled={locked || !hasChanges}
            style={buttonStyle('primary', locked || !hasChanges)}
          >
            {update.isPending ? 'Saving…' : 'Save changes'}
          </button>
        )}
      </div>
    </form>
  )
}
