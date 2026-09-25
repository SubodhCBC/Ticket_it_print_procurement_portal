// src/app/admin/customers/accounts/page.tsx
'use client'

import { SkeletonTable, SkeletonList } from '@/components/ui/Skeleton'
import React, { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import {
  Building2,
  MapPin,
  Users,
  Mail,
  Plus,
  Search,
  ArrowRight,
  Pencil,
  Power,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import {
  useAccounts,
  useSiteRecords,
  useUsers,
  useAccountMutations,
} from '@/hooks/useAccounts'
import { useAuth } from '@/hooks/useAuth'
import type { Account, Address, PaginatedResult, PortalUser } from '@/types'
import type { SiteAddressRecord, SiteRecord } from '@/types/customers-admin'
import { AccountEditDrawer } from '../_components/AccountEditDrawer'
import {
  CheckboxField,
  CustomerStatusBadge,
  ErrorNote,
  Field,
  Pager,
  RowActionButton,
  StateMessage,
  Tag,
} from '../_components/CustomerAdminUi'
import {
  AccountDeactivateModal,
  SiteDeactivateModal,
  UserDeactivateModal,
} from '../_components/DeactivateModals'
import { InvitationsPanel } from '../_components/InvitationsPanel'
import { SiteEditDrawer } from '../_components/SiteEditDrawer'
import { UserEditDrawer } from '../_components/UserEditDrawer'
import { UserInviteForm } from '../_components/UserInviteForm'
import {
  ROLE_LABELS,
  MONEY_PATTERN,
  buttonStyle,
  cardStyle,
  errorMessage,
  fieldStyle,
  formatMoney,
  palette,
} from '../_components/customerAdmin.shared'

type AccountsTab = 'accounts' | 'sites' | 'users' | 'invitations'

const TABS: Array<{
  id: AccountsTab
  label: string
  icon: typeof Building2
}> = [
  { id: 'accounts', label: 'Customer Accounts', icon: Building2 },
  { id: 'sites', label: 'Site Branches & Hubs', icon: MapPin },
  { id: 'users', label: 'Account Users & Roles', icon: Users },
  { id: 'invitations', label: 'Invitations', icon: Mail },
]

function parseTab(value: string | null): AccountsTab {
  return TABS.some((tab) => tab.id === value)
    ? (value as AccountsTab)
    : 'accounts'
}

const PAGE_SIZE = 20

const NO_PERMISSION = 'Your role does not include this permission.'

const headerCell: React.CSSProperties = {
  padding: '10px 14px',
  color: palette.muted,
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}

/** The default address of a kind, else the first of that kind. */
function pickAddress(
  site: SiteRecord,
  kind: SiteAddressRecord['kind']
): SiteAddressRecord | undefined {
  const ofKind = site.addresses.filter((address) => address.kind === kind)
  return ofKind.find((address) => address.isDefault) ?? ofKind[0]
}

/**
 * The tab badge for a cursor-paginated list (sites, users).
 *
 * There is no total, only this page and whether another follows, so it counts
 * the rows up to here and adds "+" when there is more — rather than passing a
 * page's length, capped at the page size, off as the whole.
 */
function cursorCount(data: PaginatedResult<unknown> | null): string | null {
  if (!data) return null
  const seen = (data.page - 1) * data.pageSize + data.items.length
  return data.totalPages > data.page ? `${seen}+` : String(seen)
}

function CustomerAccountsContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  // Read from the URL rather than copied into state, so the /sites and /users
  // redirects — and the sidebar — land on the right tab even when this screen
  // is already open.
  const activeTab = parseTab(searchParams.get('tab'))

  const { user, role, hasPermission } = useAuth()
  const isAdmin = role === 'admin'
  const canManageAccounts = hasPermission('ACCOUNT_MANAGE')
  const canManageSites = hasPermission('SITE_MANAGE')
  const canManageUsers = hasPermission('USER_MANAGE')
  const canInvite = hasPermission('USER_INVITE')

  // Search, filters and pages. What is typed, and the search actually sent
  // once typing pauses — one request per pause rather than one per keystroke.
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAccountFilter, setSelectedAccountFilter] = useState('')
  const [accountsPage, setAccountsPage] = useState(1)
  const [sitesPage, setSitesPage] = useState(1)
  const [usersPage, setUsersPage] = useState(1)
  useEffect(() => {
    const next = searchInput.trim()
    // Unchanged (on mount, or only whitespace typed): keep the pages as they are.
    if (next === searchQuery) return
    const timer = setTimeout(() => {
      setSearchQuery(next)
      setAccountsPage(1)
      setSitesPage(1)
      setUsersPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput, searchQuery])

  // Sites, users and invitations are tenant-scoped: without an accountId the
  // API answers for the caller's own account. Only an administrator may name
  // another, so the filter is sent for them alone.
  const accountScope =
    isAdmin && selectedAccountFilter ? selectedAccountFilter : undefined

  // Data. Each list is fetched only while its tab is showing — they are never
  // on screen together. The account directory also needs ACCOUNT_MANAGE and
  // the user directory USER_MANAGE; without them the API answers 403, so they
  // are not asked for and the tab explains the restriction instead.
  const accountsQuery = useAccounts(
    { search: searchQuery, page: accountsPage },
    { enabled: activeTab === 'accounts' && canManageAccounts }
  )
  // The account pickers are shown to an administrator alone.
  const { data: accountOptions } = useAccounts(
    { pageSize: 100 },
    { enabled: isAdmin }
  )
  const sitesQuery = useSiteRecords(
    {
      search: searchQuery,
      accountId: accountScope,
      page: sitesPage,
      pageSize: PAGE_SIZE,
    },
    { enabled: activeTab === 'sites' }
  )
  const usersQuery = useUsers(
    {
      search: searchQuery,
      accountId: accountScope,
      page: usersPage,
      pageSize: PAGE_SIZE,
    },
    { enabled: activeTab === 'users' && canManageUsers }
  )
  const { createAccount, createSite } = useAccountMutations()

  const accountsData = accountsQuery.data
  const sitesData = sitesQuery.data
  const usersData = usersQuery.data
  const accountChoices = accountOptions?.items ?? []

  // A page past the first that comes back empty — its last row deactivated —
  // steps back rather than showing the empty state with earlier pages still
  // full. One page back is right for the cursor lists too: the adapter walks
  // the cursor from the start for every page, so the previous page is
  // recomputed, not replayed from a stale cursor. Adjusted during render
  // (React's pattern for state that follows new data), and only for the page
  // the data is for, so it runs once per empty page.
  const stepBackIfEmpty = (
    data: PaginatedResult<unknown> | null,
    page: number,
    setPage: (page: number) => void
  ) => {
    if (data && data.page === page && page > 1 && data.items.length === 0)
      setPage(Math.max(1, Math.min(page - 1, data.totalPages)))
  }
  stepBackIfEmpty(accountsData, accountsPage, setAccountsPage)
  stepBackIfEmpty(sitesData, sitesPage, setSitesPage)
  stepBackIfEmpty(usersData, usersPage, setUsersPage)

  // Row actions
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const [deactivatingAccount, setDeactivatingAccount] =
    useState<Account | null>(null)
  const [editSite, setEditSite] = useState<SiteRecord | null>(null)
  const [deactivatingSite, setDeactivatingSite] = useState<SiteRecord | null>(
    null
  )
  const [editUser, setEditUser] = useState<PortalUser | null>(null)
  const [deactivatingUser, setDeactivatingUser] = useState<PortalUser | null>(
    null
  )

  // Add item states
  const [isAdding, setIsAdding] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createError, setCreateError] = useState<unknown>(null)

  // New account form state
  const [accName, setAccName] = useState('')
  const [accCode, setAccCode] = useState('')
  const [accContactEmail, setAccContactEmail] = useState('')
  const [accContactPhone, setAccContactPhone] = useState('')
  const [accApprovalThreshold, setAccApprovalThreshold] = useState('')
  const [accRequirePoNumber, setAccRequirePoNumber] = useState(false)
  const [accPoPrefix, setAccPoPrefix] = useState('')

  // New site form state
  const [siteName, setSiteName] = useState('')
  const [siteCode, setSiteCode] = useState('')
  const [siteAccountId, setSiteAccountId] = useState('')
  const [siteStreet, setSiteStreet] = useState('')
  const [siteCity, setSiteCity] = useState('')
  const [sitePostalCode, setSitePostalCode] = useState('')
  const [siteMonthlyBudget, setSiteMonthlyBudget] = useState('')
  const [sitePoRequired, setSitePoRequired] = useState(false)
  const [sitePoPrefix, setSitePoPrefix] = useState('')
  const [siteCostCentre, setSiteCostCentre] = useState('')

  const setTab = (tab: AccountsTab) => {
    setIsAdding(false)
    setCreateError(null)
    router.replace(`/admin/customers/accounts?tab=${tab}`)
  }

  const changeAccountFilter = (accountId: string) => {
    setSelectedAccountFilter(accountId)
    setSitesPage(1)
    setUsersPage(1)
  }

  // Handlers
  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!accName || !accCode || !accContactEmail) return
    const threshold = accApprovalThreshold.trim()
    if (threshold && !MONEY_PATTERN.test(threshold)) {
      setCreateError(
        new Error('Approval threshold must be an amount such as 1500.00.')
      )
      return
    }
    setIsSubmitting(true)
    setCreateError(null)
    try {
      await createAccount({
        name: accName,
        accountCode: accCode,
        status: 'ACTIVE',
        contactEmail: accContactEmail,
        contactPhone: accContactPhone,
        ...(threshold ? { approvalThreshold: Number(threshold) } : {}),
        requirePoNumber: accRequirePoNumber,
        ...(accPoPrefix.trim() ? { poPrefix: accPoPrefix.trim() } : {}),
      })
      setAccName('')
      setAccCode('')
      setAccContactEmail('')
      setAccContactPhone('')
      setAccApprovalThreshold('')
      setAccRequirePoNumber(false)
      setAccPoPrefix('')
      setIsAdding(false)
    } catch (err) {
      setCreateError(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!siteName || !siteCode || (isAdmin && !siteAccountId)) return
    const budget = siteMonthlyBudget.trim()
    if (budget && !MONEY_PATTERN.test(budget)) {
      setCreateError(
        new Error('Monthly budget must be an amount such as 1500.00.')
      )
      return
    }
    const acc = accountChoices.find((a) => a.id === siteAccountId)
    // Only a complete address is sent (the adapter drops a partial one); more,
    // and billing addresses, can be added from the branch drawer afterwards.
    // The country is an ISO alpha-2 code, which the API insists on.
    const address: Address = {
      street: siteStreet.trim(),
      city: siteCity.trim(),
      state: '',
      postalCode: sitePostalCode.trim(),
      country: 'NZ',
    }
    setIsSubmitting(true)
    setCreateError(null)
    try {
      await createSite({
        accountId: siteAccountId,
        accountName: acc?.name,
        name: siteName,
        code: siteCode,
        billToAddress: address,
        shipToAddress: address,
        ...(budget ? { monthlyBudget: Number(budget) } : {}),
        poRequired: sitePoRequired,
        ...(sitePoPrefix.trim() ? { poPrefix: sitePoPrefix.trim() } : {}),
        ...(siteCostCentre.trim() ? { costCentre: siteCostCentre.trim() } : {}),
      })
      setSiteName('')
      setSiteCode('')
      setSiteStreet('')
      setSiteCity('')
      setSitePostalCode('')
      setSiteMonthlyBudget('')
      setSitePoRequired(false)
      setSitePoPrefix('')
      setSiteCostCentre('')
      setIsAdding(false)
    } catch (err) {
      setCreateError(err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const actionAllowed =
    activeTab === 'accounts'
      ? canManageAccounts
      : activeTab === 'sites'
        ? canManageSites
        : canInvite

  const getActionBtnLabel = () => {
    if (isAdding) return 'Cancel'
    if (activeTab === 'accounts') return 'New Account'
    if (activeTab === 'sites') return 'New Branch Site'
    return 'Invite New User'
  }

  // Null (no badge) while a list has not been fetched — it is fetched only on
  // its own tab.
  const tabCount = (tab: AccountsTab): number | string | null => {
    if (tab === 'accounts') return accountsData ? accountsData.total : null
    if (tab === 'sites') return cursorCount(sitesData)
    if (tab === 'users') return cursorCount(usersData)
    return null
  }

  const ownAccountLabel = `Your account${
    user?.accountName ? ` (${user.accountName})` : ''
  }`

  const addButtonDisabled = !isAdding && !actionAllowed

  return (
    <>
      <AdminHeader
        title="Customer Accounts & Organization Hub"
        subtitle="Consolidated management of healthcare networks, branch physical sites, and authorized portal users"
        actionButton={
          <button
            type="button"
            onClick={() => {
              setCreateError(null)
              setIsAdding(!isAdding)
            }}
            disabled={addButtonDisabled}
            title={addButtonDisabled ? NO_PERMISSION : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              // Open, this button reads "Cancel", so it steps down to the
              // secondary style rather than turning slate. The border stays
              // 1px in both states so the header does not shift.
              backgroundColor: isAdding ? '#FFFFFF' : '#F73582',
              color: isAdding ? '#2B253E' : '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: addButtonDisabled ? 'not-allowed' : 'pointer',
              opacity: addButtonDisabled ? 0.5 : 1,
              border: isAdding ? '1px solid #F0E6EC' : '1px solid #F73582',
              transition: 'background-color 150ms ease',
            }}
          >
            <Plus size={16} />
            <span>{getActionBtnLabel()}</span>
          </button>
        }
      />

      <main
        style={{
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        {/* Navigation Tabs Bar */}
        <div
          role="tablist"
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            boxShadow:
              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '4px',
            border: '1px solid #F0E6EC',
            width: 'fit-content',
            maxWidth: '100%',
          }}
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            const count = tabCount(id)
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '7px 12px',
                  borderRadius: '10px',
                  backgroundColor: active ? '#F5EEF2' : 'transparent',
                  color: active ? '#2B253E' : '#6E6781',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 150ms ease',
                }}
              >
                <Icon size={16} color={active ? '#F73582' : '#A39BB3'} />
                <span>{label}</span>
                {count !== null && (
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      padding: '1px 7px',
                      borderRadius: '9999px',
                      backgroundColor: active ? '#FFFFFF' : '#F5EEF2',
                      color: '#5C566E',
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Dynamic Add Form based on Active Tab */}
        {isAdding && activeTab === 'accounts' && (
          <form
            onSubmit={handleCreateAccount}
            style={{
              ...cardStyle,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: '0.95rem',
                color: '#2B253E',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Building2 size={16} color="#A39BB3" />
              <span>Create New Enterprise Healthcare Account</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
              }}
            >
              <Field
                label="Account / Organization Name *"
                htmlFor="new-acc-name"
              >
                <input
                  id="new-acc-name"
                  type="text"
                  required
                  placeholder="e.g. St. Jude Healthcare Network"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  style={fieldStyle()}
                />
              </Field>
              <Field label="Account Code *" htmlFor="new-acc-code">
                <input
                  id="new-acc-code"
                  type="text"
                  required
                  placeholder="e.g. STJUDE-005"
                  value={accCode}
                  onChange={(e) => setAccCode(e.target.value.toUpperCase())}
                  style={{ ...fieldStyle(), fontFamily: 'monospace' }}
                />
              </Field>
              <Field
                label="Procurement Contact Email *"
                htmlFor="new-acc-email"
              >
                <input
                  id="new-acc-email"
                  type="email"
                  required
                  placeholder="procurement@organization.org"
                  value={accContactEmail}
                  onChange={(e) => setAccContactEmail(e.target.value)}
                  style={fieldStyle()}
                />
              </Field>
              <Field label="Contact Phone" htmlFor="new-acc-phone">
                <input
                  id="new-acc-phone"
                  type="tel"
                  placeholder="+64 9 000 0000"
                  value={accContactPhone}
                  onChange={(e) => setAccContactPhone(e.target.value)}
                  style={fieldStyle()}
                />
              </Field>
              <Field
                label="Approval Threshold"
                htmlFor="new-acc-approval-threshold"
                hint="Orders above this total need approval. Leave blank to approve automatically."
              >
                <input
                  id="new-acc-approval-threshold"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 1500.00"
                  value={accApprovalThreshold}
                  onChange={(e) => setAccApprovalThreshold(e.target.value)}
                  style={fieldStyle()}
                />
              </Field>
              <Field label="PO Prefix" htmlFor="new-acc-po-prefix">
                <input
                  id="new-acc-po-prefix"
                  type="text"
                  maxLength={32}
                  placeholder="e.g. PO-STJ"
                  value={accPoPrefix}
                  onChange={(e) => setAccPoPrefix(e.target.value)}
                  style={{ ...fieldStyle(), fontFamily: 'monospace' }}
                />
              </Field>
            </div>
            <CheckboxField
              id="new-acc-require-po"
              label="Require a purchase order number at checkout"
              checked={accRequirePoNumber}
              onChange={setAccRequirePoNumber}
            />
            <ErrorNote error={createError} />
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                marginTop: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                style={buttonStyle('secondary')}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={buttonStyle('primary', isSubmitting)}
              >
                {isSubmitting ? 'Registering...' : 'Register Account'}
              </button>
            </div>
          </form>
        )}

        {isAdding && activeTab === 'sites' && (
          <form
            onSubmit={handleCreateSite}
            style={{
              ...cardStyle,
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: '0.95rem',
                color: '#2B253E',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <MapPin size={16} color="#A39BB3" />
              <span>Add New Physical Site / Dispensary Branch</span>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
              }}
            >
              {isAdmin && (
                <Field
                  label="Parent Account Organization *"
                  htmlFor="new-site-account"
                >
                  <select
                    id="new-site-account"
                    required
                    value={siteAccountId}
                    onChange={(e) => setSiteAccountId(e.target.value)}
                    style={fieldStyle()}
                  >
                    <option value="">Select Account...</option>
                    {accountChoices.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.accountCode})
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Branch Site Name *" htmlFor="new-site-name">
                <input
                  id="new-site-name"
                  type="text"
                  required
                  placeholder="e.g. Apex Queens Infusion Center"
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  style={fieldStyle()}
                />
              </Field>
              <Field label="Site Code *" htmlFor="new-site-code">
                <input
                  id="new-site-code"
                  type="text"
                  required
                  placeholder="e.g. APX-QN-106"
                  value={siteCode}
                  onChange={(e) => setSiteCode(e.target.value.toUpperCase())}
                  style={{ ...fieldStyle(), fontFamily: 'monospace' }}
                />
              </Field>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
              }}
            >
              <Field label="Street Address" htmlFor="new-site-street">
                <input
                  id="new-site-street"
                  type="text"
                  placeholder="e.g. 100 Queen Street"
                  value={siteStreet}
                  onChange={(e) => setSiteStreet(e.target.value)}
                  style={fieldStyle()}
                />
              </Field>
              <Field label="City" htmlFor="new-site-city">
                <input
                  id="new-site-city"
                  type="text"
                  placeholder="e.g. Auckland"
                  value={siteCity}
                  onChange={(e) => setSiteCity(e.target.value)}
                  style={fieldStyle()}
                />
              </Field>
              <Field
                label="Postal Code"
                htmlFor="new-site-postcode"
                hint="Street, city and postcode together add a default billing and shipping address (NZ)."
              >
                <input
                  id="new-site-postcode"
                  type="text"
                  placeholder="1010"
                  value={sitePostalCode}
                  onChange={(e) => setSitePostalCode(e.target.value)}
                  style={fieldStyle()}
                />
              </Field>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
              }}
            >
              <Field
                label="Monthly Budget"
                htmlFor="new-site-budget"
                hint="Leave blank for no cap."
              >
                <input
                  id="new-site-budget"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 2500.00"
                  value={siteMonthlyBudget}
                  onChange={(e) => setSiteMonthlyBudget(e.target.value)}
                  style={fieldStyle()}
                />
              </Field>
              <Field label="Cost Centre" htmlFor="new-site-cost-centre">
                <input
                  id="new-site-cost-centre"
                  type="text"
                  maxLength={64}
                  value={siteCostCentre}
                  onChange={(e) => setSiteCostCentre(e.target.value)}
                  style={fieldStyle()}
                />
              </Field>
              <Field label="PO Prefix" htmlFor="new-site-po-prefix">
                <input
                  id="new-site-po-prefix"
                  type="text"
                  maxLength={32}
                  value={sitePoPrefix}
                  onChange={(e) => setSitePoPrefix(e.target.value)}
                  style={{ ...fieldStyle(), fontFamily: 'monospace' }}
                />
              </Field>
            </div>
            <CheckboxField
              id="new-site-po-required"
              label="Require a purchase order number for this branch"
              checked={sitePoRequired}
              onChange={setSitePoRequired}
            />
            <ErrorNote error={createError} />
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
                marginTop: '4px',
              }}
            >
              <button
                type="button"
                onClick={() => setIsAdding(false)}
                style={buttonStyle('secondary')}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                style={buttonStyle('primary', isSubmitting)}
              >
                {isSubmitting ? 'Registering...' : 'Register Site'}
              </button>
            </div>
          </form>
        )}

        {isAdding && (activeTab === 'users' || activeTab === 'invitations') && (
          <UserInviteForm
            isAdmin={isAdmin}
            accounts={accountChoices}
            ownAccountName={user?.accountName}
            defaultAccountId={accountScope}
            onCancel={() => setIsAdding(false)}
            onViewInvitations={() => setTab('invitations')}
          />
        )}

        {/* Global Search & Filters Bar */}
        {/* Plain fields on the page rather than a white strip holding a
            borderless input: the field itself is the frame, so the strip was
            a card with nothing in it but a search box. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          {/* The invitations endpoint has no search. */}
          {activeTab !== 'invitations' && (
            <div
              style={{
                position: 'relative',
                flex: '1 1 280px',
                maxWidth: '460px',
              }}
            >
              <Search
                size={16}
                color="#A39BB3"
                style={{
                  position: 'absolute',
                  left: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                }}
              />
              <input
                type="text"
                aria-label="Search"
                placeholder={
                  activeTab === 'accounts'
                    ? 'Search accounts by organization name or account code...'
                    : activeTab === 'sites'
                      ? 'Search branches by site name or code...'
                      : 'Search users by name, email or login...'
                }
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ ...fieldStyle(), padding: '8px 12px 8px 34px' }}
              />
            </div>
          )}

          {isAdmin && activeTab !== 'accounts' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label
                htmlFor="customer-account-filter"
                style={{
                  fontSize: '0.78rem',
                  color: '#6E6781',
                  fontWeight: 500,
                }}
              >
                Account:
              </label>
              <select
                id="customer-account-filter"
                value={selectedAccountFilter}
                onChange={(e) => changeAccountFilter(e.target.value)}
                style={{ ...fieldStyle(), width: 'auto' }}
              >
                <option value="">{ownAccountLabel}</option>
                {accountChoices.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* TAB 1: ACCOUNTS TABLE */}
        {activeTab === 'accounts' && (
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            {accountsQuery.isLoading ? (
              <SkeletonTable rows={6} columns={6} label="Loading accounts" />
            ) : accountsQuery.error ? (
              <div style={{ padding: '16px' }}>
                <ErrorNote
                  message={`Could not load accounts: ${errorMessage(accountsQuery.error)}`}
                />
              </div>
            ) : (accountsData?.items.length ?? 0) === 0 ? (
              /* The customer directory is platform-operator data: reading it
                 needs ACCOUNT_MANAGE, which only an administrator holds. A
                 head-office user reaching this tab gets nothing back, which is
                 the rule working rather than a fault — so it says so. */
              <StateMessage>
                {canManageAccounts
                  ? searchQuery
                    ? 'No accounts match this search.'
                    : 'No customer accounts yet.'
                  : 'The customer account directory is restricted to platform administrators. Your own account and its branches are on the Sites and Users tabs.'}
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
                    <th style={{ ...headerCell, padding: '10px 20px' }}>
                      Account Name
                    </th>
                    <th style={headerCell}>Account Code</th>
                    <th style={headerCell}>Sites Count</th>
                    <th style={{ ...headerCell, textAlign: 'right' }}>
                      Approval Threshold
                    </th>
                    <th style={headerCell}>Status</th>
                    <th
                      style={{
                        ...headerCell,
                        padding: '10px 20px',
                        textAlign: 'right',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {accountsData?.items.map((acc) => (
                    <tr key={acc.id} style={{ borderTop: '1px solid #F5EEF2' }}>
                      <td
                        style={{
                          padding: '12px 20px',
                          fontWeight: 600,
                          color: '#2B253E',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                          }}
                        >
                          <Building2
                            size={16}
                            color="#A39BB3"
                            style={{ flexShrink: 0 }}
                          />
                          <div>
                            <div>{acc.name}</div>
                            <div
                              style={{
                                fontSize: '0.72rem',
                                color: '#A39BB3',
                                fontWeight: 400,
                              }}
                            >
                              {acc.contactEmail || 'No contact email'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          fontFamily: 'monospace',
                          color: '#6E6781',
                          fontSize: '0.78rem',
                        }}
                      >
                        {acc.accountCode}
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          fontWeight: 600,
                          color: '#2B253E',
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            changeAccountFilter(acc.id)
                            setTab('sites')
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#F73582',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: 0,
                          }}
                        >
                          <span>{acc.sitesCount || 0} Branches</span>
                          <ArrowRight size={13} />
                        </button>
                      </td>
                      <td
                        style={{
                          padding: '12px 14px',
                          textAlign: 'right',
                          fontWeight: 600,
                          color: '#2B253E',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {acc.approvalThreshold != null
                          ? formatMoney(acc.approvalThreshold)
                          : 'None'}
                        {acc.requirePoNumber && (
                          <div
                            style={{
                              fontSize: '0.7rem',
                              color: '#A39BB3',
                              fontWeight: 400,
                            }}
                          >
                            PO required
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <CustomerStatusBadge status={acc.status} />
                      </td>
                      <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                        <div
                          style={{
                            display: 'inline-flex',
                            gap: '6px',
                          }}
                        >
                          <RowActionButton
                            icon={<Pencil size={13} />}
                            label={canManageAccounts ? 'Edit' : 'View'}
                            onClick={() => setEditAccount(acc)}
                          />
                          <RowActionButton
                            tone="danger"
                            icon={<Power size={13} />}
                            label="Deactivate"
                            disabled={!canManageAccounts}
                            title={
                              !canManageAccounts ? NO_PERMISSION : undefined
                            }
                            onClick={() => setDeactivatingAccount(acc)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {accountsData && (
              <Pager
                page={accountsData.page}
                totalPages={accountsData.totalPages}
                onPageChange={setAccountsPage}
              />
            )}
          </div>
        )}

        {/* TAB 2: SITE BRANCHES GRID */}
        {activeTab === 'sites' && (
          <div
            style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
          >
            {sitesQuery.isLoading ? (
              <SkeletonList count={4} label="Loading branches" />
            ) : sitesQuery.error ? (
              <ErrorNote
                message={`Could not load branches: ${errorMessage(sitesQuery.error)}`}
              />
            ) : (sitesData?.items.length ?? 0) === 0 ? (
              <div style={cardStyle}>
                <StateMessage>
                  {searchQuery
                    ? 'No branches match this search.'
                    : 'No branches for this account yet.'}
                </StateMessage>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                  gap: '14px',
                }}
              >
                {sitesData?.items.map((site) => {
                  const shipTo = pickAddress(site, 'SHIPPING')
                  return (
                    <div
                      key={site.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setEditSite(site)}
                      onKeyDown={(e) => {
                        // Only the card itself: Enter on one of its action
                        // buttons bubbles here too, and must not also open
                        // the drawer.
                        if (e.key === 'Enter' && e.target === e.currentTarget)
                          setEditSite(site)
                      }}
                      style={{
                        ...cardStyle,
                        padding: '18px',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        gap: '14px',
                        cursor: 'pointer',
                        opacity: site.status === 'INACTIVE' ? 0.75 : 1,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '10px',
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              minWidth: 0,
                            }}
                          >
                            <MapPin
                              size={16}
                              color="#A39BB3"
                              style={{ flexShrink: 0 }}
                            />
                            <div>
                              <div
                                style={{
                                  fontWeight: 700,
                                  fontSize: '0.95rem',
                                  color: '#2B253E',
                                }}
                              >
                                {site.name}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.76rem',
                                  color: '#A39BB3',
                                }}
                              >
                                {site.accountName}
                              </div>
                            </div>
                          </div>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '0.7rem',
                              fontWeight: 600,
                              backgroundColor: '#F5EEF2',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              color: '#5C566E',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {site.code}
                          </span>
                        </div>

                        {/* No inner panel: a bordered, tinted box inside the card
                          was a second frame round three lines of text. */}
                        <div
                          style={{
                            marginTop: '14px',
                            fontSize: '0.8rem',
                            color: '#5C566E',
                          }}
                        >
                          <div
                            style={{
                              fontSize: '0.74rem',
                              fontWeight: 500,
                              color: '#A39BB3',
                              marginBottom: '2px',
                            }}
                          >
                            Ship-To Address:
                          </div>
                          {shipTo ? (
                            <>
                              <div>
                                {shipTo.line1}
                                {shipTo.line2 ? `, ${shipTo.line2}` : ''}
                              </div>
                              <div>
                                {[shipTo.city, shipTo.region, shipTo.postcode]
                                  .filter(Boolean)
                                  .join(', ')}
                              </div>
                            </>
                          ) : (
                            <div style={{ color: '#A39BB3' }}>
                              No shipping address on file
                            </div>
                          )}
                        </div>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '8px',
                          flexWrap: 'wrap',
                          borderTop: '1px solid #F5EEF2',
                          paddingTop: '12px',
                          fontSize: '0.78rem',
                        }}
                      >
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          <CustomerStatusBadge status={site.status} />
                          <span style={{ color: '#6E6781' }}>
                            {site.monthlyBudget
                              ? `${formatMoney(site.monthlyBudget)} / month`
                              : 'No budget cap'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <RowActionButton
                            icon={<Pencil size={13} />}
                            label={canManageSites ? 'Edit' : 'View'}
                            onClick={() => setEditSite(site)}
                          />
                          <RowActionButton
                            tone="danger"
                            icon={<Power size={13} />}
                            label="Deactivate"
                            disabled={!canManageSites}
                            title={!canManageSites ? NO_PERMISSION : undefined}
                            onClick={() => setDeactivatingSite(site)}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {sitesData && (
              <Pager
                page={sitesData.page}
                totalPages={sitesData.totalPages}
                isFetching={sitesQuery.isFetching}
                onPageChange={setSitesPage}
              />
            )}
          </div>
        )}

        {/* TAB 3: ACCOUNT USERS TABLE */}
        {activeTab === 'users' && (
          <div style={{ ...cardStyle, overflowX: 'auto' }}>
            {usersQuery.isLoading ? (
              <SkeletonTable rows={6} columns={6} label="Loading users" />
            ) : usersQuery.error ? (
              <div style={{ padding: '16px' }}>
                <ErrorNote
                  message={`Could not load users: ${errorMessage(usersQuery.error)}`}
                />
              </div>
            ) : (usersData?.items.length ?? 0) === 0 ? (
              <StateMessage>
                {!canManageUsers
                  ? 'The user directory needs the user management permission, which your role does not include.'
                  : searchQuery
                    ? 'No users match this search.'
                    : 'No users in this account yet. Invited people appear here once they accept.'}
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
                    <th style={{ ...headerCell, padding: '10px 20px' }}>
                      User Profile
                    </th>
                    <th style={headerCell}>Role</th>
                    <th style={headerCell}>Branch & Org</th>
                    <th style={headerCell}>Status</th>
                    <th
                      style={{
                        ...headerCell,
                        padding: '10px 20px',
                        textAlign: 'right',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usersData?.items.map((u) => {
                    const isSelf = u.id === user?.id
                    // Head office holds USER_MANAGE too, but deactivating an
                    // administrator is as privileged as making one.
                    const adminOnly = u.role === 'ADMIN' && !isAdmin
                    return (
                      <tr
                        key={u.id}
                        tabIndex={0}
                        onClick={() => setEditUser(u)}
                        onKeyDown={(e) => {
                          // As for the site cards: not when Enter comes from
                          // an action button inside the row.
                          if (e.key === 'Enter' && e.target === e.currentTarget)
                            setEditUser(u)
                        }}
                        style={{
                          borderTop: '1px solid #F5EEF2',
                          cursor: 'pointer',
                        }}
                      >
                        <td style={{ padding: '12px 20px' }}>
                          <div
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                            }}
                          >
                            <div
                              style={{
                                width: '32px',
                                height: '32px',
                                flexShrink: 0,
                                borderRadius: '50%',
                                backgroundColor: '#F5EEF2',
                                color: '#5C566E',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 600,
                                fontSize: '0.78rem',
                              }}
                            >
                              {u.name[0]}
                            </div>
                            <div>
                              <div
                                style={{ fontWeight: 600, color: '#2B253E' }}
                              >
                                {u.name}
                                {isSelf && (
                                  <span
                                    style={{
                                      color: '#A39BB3',
                                      fontWeight: 400,
                                    }}
                                  >
                                    {' '}
                                    (you)
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  fontSize: '0.72rem',
                                  color: '#A39BB3',
                                }}
                              >
                                {u.email}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          {/* One neutral tag for every role. Pink, green and
                            amber read as status colours, and a role is not a
                            status; the words already tell the three apart. */}
                          <Tag>{ROLE_LABELS[u.role]}</Tag>
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            color: '#2B253E',
                            fontWeight: 500,
                          }}
                        >
                          <div>{u.siteName || 'Account-wide'}</div>
                          <div
                            style={{
                              fontSize: '0.72rem',
                              color: '#A39BB3',
                            }}
                          >
                            {u.siteCode && (
                              <span style={{ fontFamily: 'monospace' }}>
                                {u.siteCode}
                              </span>
                            )}
                            {u.siteCode && u.accountName ? ' · ' : ''}
                            {u.accountName}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <CustomerStatusBadge status={u.status} />
                        </td>
                        <td
                          style={{ padding: '12px 20px', textAlign: 'right' }}
                        >
                          <div style={{ display: 'inline-flex', gap: '6px' }}>
                            <RowActionButton
                              icon={<Pencil size={13} />}
                              label={canManageUsers ? 'Edit' : 'View'}
                              onClick={() => setEditUser(u)}
                            />
                            <RowActionButton
                              tone="danger"
                              icon={<Power size={13} />}
                              label="Deactivate"
                              disabled={!canManageUsers || isSelf || adminOnly}
                              title={
                                isSelf
                                  ? 'You cannot deactivate your own account.'
                                  : !canManageUsers
                                    ? NO_PERMISSION
                                    : adminOnly
                                      ? 'Only an administrator can deactivate another administrator.'
                                      : undefined
                              }
                              onClick={() => setDeactivatingUser(u)}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
            {usersData && (
              <Pager
                page={usersData.page}
                totalPages={usersData.totalPages}
                onPageChange={setUsersPage}
              />
            )}
          </div>
        )}

        {/* TAB 4: INVITATIONS */}
        {activeTab === 'invitations' &&
          (canInvite ? (
            <InvitationsPanel
              key={accountScope ?? 'own-account'}
              accountId={accountScope}
              canInvite={canInvite}
            />
          ) : (
            <div style={cardStyle}>
              <StateMessage>
                Invitations are visible to users who can invite others. Your
                role does not include that permission.
              </StateMessage>
            </div>
          ))}
      </main>

      <AccountEditDrawer
        account={editAccount}
        canManage={canManageAccounts}
        onClose={() => setEditAccount(null)}
      />
      <AccountDeactivateModal
        account={deactivatingAccount}
        currentAccountId={user?.accountId}
        onDeactivated={(account) => {
          // A deactivated account leaves the picker; a filter still naming it
          // would scope the other tabs to an option no longer offered.
          if (account.id === selectedAccountFilter) changeAccountFilter('')
        }}
        onClose={() => setDeactivatingAccount(null)}
      />
      <SiteEditDrawer
        site={editSite}
        canManage={canManageSites}
        onClose={() => setEditSite(null)}
      />
      <SiteDeactivateModal
        site={deactivatingSite}
        onClose={() => setDeactivatingSite(null)}
      />
      <UserEditDrawer
        user={editUser}
        canManage={canManageUsers}
        isAdmin={isAdmin}
        currentUserId={user?.id}
        onClose={() => setEditUser(null)}
      />
      <UserDeactivateModal
        user={deactivatingUser}
        currentUserId={user?.id}
        onClose={() => setDeactivatingUser(null)}
      />
    </>
  )
}

export default function CustomerAccountsPage() {
  return (
    <Suspense
      fallback={
        <div style={{ padding: '24px' }}>
          <SkeletonTable rows={6} columns={6} label="Loading customers" />
        </div>
      }
    >
      <CustomerAccountsContent />
    </Suspense>
  )
}
