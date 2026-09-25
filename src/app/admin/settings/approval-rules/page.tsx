// src/app/admin/settings/approval-rules/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertTriangle,
  ClipboardCheck,
  GitBranch,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { ApprovalConfirmDialog } from '@/components/admin/ApprovalConfirmDialog'
import { ApprovalRuleFormDrawer } from '@/components/admin/ApprovalRuleFormDrawer'
import { formatMoney } from '@/lib/format'
import {
  APPROVAL_COLORS,
  approvalCard,
  approvalTh,
  approvalThEdge,
  destructiveButton,
  disabledLook,
  emptyState,
  errorBanner,
  errorMessage,
  fieldControl,
  primaryButton,
  ROLE_LABELS,
  secondaryButton,
  successBanner,
  warningBanner,
} from '@/components/admin/ApprovalShared'
import { useAccounts, useSites, useUsers } from '@/hooks/useAccounts'
import {
  useApprovalRuleMutations,
  useApprovalRules,
} from '@/hooks/useApprovals'
import { useAuth } from '@/hooks/useAuth'
import { useProductCategories } from '@/hooks/useProducts'
import type { ApprovalRuleView } from '@/services/data-source/api/approval.types'

const C = APPROVAL_COLORS

const chip = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '2px 8px',
  borderRadius: '9999px',
  backgroundColor: C.hairline,
  color: C.text,
  fontSize: '0.72rem',
  fontWeight: 500,
  whiteSpace: 'nowrap',
} as const

export default function ApprovalRulesPage() {
  const { user, role, hasPermission } = useAuth()
  const canManage = hasPermission('USER_MANAGE')
  const canSeeQueue = hasPermission('APPROVAL_ACT')
  const isAdmin = role === 'admin'

  // An administrator can manage any account's rules and starts on their own;
  // everyone else manages only their own account's.
  const [pickedAccountId, setPickedAccountId] = useState('')
  const accountId = isAdmin
    ? pickedAccountId || user?.accountId || ''
    : user?.accountId || ''

  const { data: accountsPage } = useAccounts(
    { pageSize: 100 },
    { enabled: isAdmin }
  )
  const { rules, isLoading, isFetching, error, refetch } = useApprovalRules(
    accountId,
    { enabled: canManage && Boolean(accountId) }
  )
  const { data: sitesPage } = useSites({ accountId, pageSize: 100 })
  const { data: usersPage } = useUsers({ accountId, pageSize: 100 })
  const { categories } = useProductCategories()
  const { removeRule, isRemoving } = useApprovalRuleMutations()

  const [formKey, setFormKey] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<ApprovalRuleView | null>(null)
  const [retiring, setRetiring] = useState<ApprovalRuleView | null>(null)
  const [retireError, setRetireError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const accountOptions = useMemo(() => {
    const options = (accountsPage?.items ?? []).map((account) => ({
      id: account.id,
      label: `${account.name} (${account.accountCode})`,
    }))
    if (user?.accountId && !options.some((o) => o.id === user.accountId)) {
      options.unshift({
        id: user.accountId,
        label: `${user.accountName} (${user.accountCode})`,
      })
    }
    return options
  }, [accountsPage, user])

  const accountLabel =
    accountOptions.find((option) => option.id === accountId)?.label ??
    user?.accountName

  const sites = useMemo(() => sitesPage?.items ?? [], [sitesPage])
  const users = useMemo(() => usersPage?.items ?? [], [usersPage])
  const siteById = useMemo(
    () => new Map(sites.map((site) => [site.id, site])),
    [sites]
  )
  const userById = useMemo(
    () => new Map(users.map((portalUser) => [portalUser.id, portalUser])),
    [users]
  )

  const catchAllCount = rules.filter(
    (rule) => rule.active && rule.matchesEverything
  ).length

  const openForm = (rule: ApprovalRuleView | null) => {
    setEditing(rule)
    setFormKey((key) => key + 1)
    setFormOpen(true)
  }

  const handleRetire = async () => {
    if (!retiring) return
    setRetireError(null)
    try {
      await removeRule(retiring.id)
      setNotice(`"${retiring.name}" was deactivated.`)
      setRetiring(null)
    } catch (err) {
      setRetireError(errorMessage(err, 'The rule could not be deactivated.'))
    }
  }

  if (!canManage) {
    return (
      <>
        <AdminHeader title="Approval rules" />
        <main className="page-pad" style={{ paddingBlock: '24px' }}>
          <div style={{ ...approvalCard, ...emptyState }}>
            <ShieldCheck
              size={24}
              color="#DCD3E0"
              style={{ display: 'block', margin: '0 auto 8px' }}
            />
            <div style={{ fontWeight: 600, color: C.text }}>
              You do not have access to approval rules
            </div>
            <div style={{ marginTop: '4px' }}>
              Deciding who approves orders needs the user management permission.
            </div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <AdminHeader
        title="Approval rules"
        subtitle="Which orders need approving, and who approves them"
        actionButton={
          <div className="row-wrap">
            {canSeeQueue && (
              <Link
                href="/admin/orders/approvals"
                className="touch-target"
                style={{ ...secondaryButton, textDecoration: 'none' }}
              >
                <ClipboardCheck size={15} />
                <span>Approvals Queue</span>
              </Link>
            )}
            <button
              type="button"
              className="touch-target"
              onClick={() => openForm(null)}
              disabled={!accountId}
              style={{
                ...primaryButton,
                border: `1px solid ${C.accent}`,
                ...disabledLook(!accountId),
              }}
            >
              <Plus size={15} />
              <span>New Rule</span>
            </button>
          </div>
        }
      />

      <main
        className="page-pad"
        style={{
          paddingBlock: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div
          className="row-wrap"
          style={{
            ...approvalCard,
            padding: '12px 16px',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: '0.8rem', color: C.secondary }}>
            Rules are checked when an order is placed. Every rule that matches
            adds a step at its tier; tiers are decided lowest first.
          </div>
          {isAdmin ? (
            <select
              aria-label="Account"
              value={accountId}
              onChange={(event) => {
                setPickedAccountId(event.target.value)
                setNotice(null)
              }}
              style={{
                ...fieldControl,
                width: 'auto',
                minWidth: '220px',
                maxWidth: '100%',
              }}
            >
              {accountOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <span
              style={{ fontSize: '0.82rem', fontWeight: 600, color: C.text }}
            >
              {user?.accountName}
            </span>
          )}
        </div>

        {notice && (
          <div role="status" style={successBanner}>
            <span>{notice}</span>
            <button
              type="button"
              className="touch-target"
              aria-label="Dismiss"
              onClick={() => setNotice(null)}
              style={{
                background: 'none',
                border: 'none',
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 600,
              }}
            >
              ✕
            </button>
          </div>
        )}

        {catchAllCount > 0 && (
          <div style={{ ...warningBanner, justifyContent: 'flex-start' }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span>
              {catchAllCount === 1
                ? '1 active rule has no conditions and'
                : `${catchAllCount} active rules have no conditions and`}{' '}
              <strong>match every order</strong> in this account. Check that is
              intended.
            </span>
          </div>
        )}

        {error && (
          <div role="alert" style={{ ...errorBanner, alignItems: 'center' }}>
            <span>
              Could not load approval rules:{' '}
              {errorMessage(error, 'unexpected error.')}
            </span>
            <button
              type="button"
              className="touch-target"
              onClick={() => void refetch()}
              style={secondaryButton}
            >
              Retry
            </button>
          </div>
        )}

        <div style={{ ...approvalCard, overflow: 'hidden' }}>
          {isLoading ? (
            <SkeletonTable
              rows={4}
              columns={6}
              label="Loading approval rules"
            />
          ) : rules.length === 0 ? (
            !error && (
              <div style={emptyState}>
                <GitBranch
                  size={24}
                  color="#DCD3E0"
                  style={{ display: 'block', margin: '0 auto 8px' }}
                />
                <div style={{ fontWeight: 600, color: C.secondary }}>
                  No approval rules for this account
                </div>
                <div style={{ marginTop: '4px' }}>
                  Without rules, orders go straight through unless the account
                  threshold applies.
                </div>
                <button
                  type="button"
                  className="touch-target"
                  onClick={() => openForm(null)}
                  disabled={!accountId}
                  style={{
                    ...primaryButton,
                    marginTop: '12px',
                    ...disabledLook(!accountId),
                  }}
                >
                  <Plus size={14} />
                  Create the first rule
                </button>
              </div>
            )
          ) : (
            <div className="table-scroll">
              <table
                style={{
                  width: '100%',
                  minWidth: '840px',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.84rem',
                  opacity: isFetching ? 0.7 : 1,
                  transition: 'opacity 150ms ease',
                }}
              >
                <thead>
                  <tr>
                    <th style={approvalThEdge}>Tier</th>
                    <th style={approvalTh}>Rule</th>
                    <th style={approvalTh}>Conditions</th>
                    <th style={approvalTh}>Approver</th>
                    <th style={approvalTh}>Status</th>
                    <th style={{ ...approvalThEdge, textAlign: 'right' }}>
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((rule) => {
                    const site = rule.siteId ? siteById.get(rule.siteId) : null
                    const approver = rule.approverUserId
                      ? userById.get(rule.approverUserId)
                      : null

                    return (
                      <tr
                        key={rule.id}
                        style={{
                          borderTop: `1px solid ${C.hairline}`,
                          opacity: rule.active ? 1 : 0.65,
                        }}
                      >
                        <td
                          style={{
                            padding: '12px 20px',
                            fontWeight: 700,
                            color: C.text,
                            verticalAlign: 'top',
                          }}
                        >
                          {rule.tier}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            verticalAlign: 'top',
                            minWidth: '200px',
                          }}
                        >
                          <div style={{ fontWeight: 600, color: C.text }}>
                            {rule.name}
                          </div>
                          {rule.description && (
                            <div
                              style={{
                                fontSize: '0.76rem',
                                color: C.secondary,
                                marginTop: '2px',
                              }}
                            >
                              {rule.description}
                            </div>
                          )}
                        </td>
                        <td
                          style={{ padding: '12px 14px', verticalAlign: 'top' }}
                        >
                          {rule.matchesEverything ? (
                            <span
                              title="This rule has no conditions, so it applies to every order in the account."
                              style={{
                                ...chip,
                                gap: '4px',
                                backgroundColor: C.warningSoft,
                                color: C.warning,
                                border: '1px solid rgba(245, 158, 11, 0.35)',
                                fontWeight: 600,
                              }}
                            >
                              <AlertTriangle size={12} />
                              Matches every order
                            </span>
                          ) : (
                            <div
                              style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: '4px',
                              }}
                            >
                              {rule.minTotal && (
                                <span style={chip}>
                                  Total ≥ {formatMoney(rule.minTotal)}
                                </span>
                              )}
                              {rule.categoryId && (
                                <span style={chip}>
                                  Category:{' '}
                                  {rule.categoryName ?? rule.categoryId}
                                </span>
                              )}
                              {rule.requesterRole && (
                                <span style={chip}>
                                  Requester: {ROLE_LABELS[rule.requesterRole]}
                                </span>
                              )}
                              {rule.siteId && (
                                <span style={chip}>
                                  Site:{' '}
                                  {site
                                    ? `${site.name} (${site.code})`
                                    : rule.siteId}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            color: C.text,
                            verticalAlign: 'top',
                          }}
                        >
                          {rule.approverRole ? (
                            <>
                              <div>{ROLE_LABELS[rule.approverRole]}</div>
                              <div
                                style={{ fontSize: '0.72rem', color: C.muted }}
                              >
                                Any holder of the role
                              </div>
                            </>
                          ) : rule.approverUserId ? (
                            <>
                              <div>{approver?.name ?? rule.approverUserId}</div>
                              <div
                                style={{ fontSize: '0.72rem', color: C.muted }}
                              >
                                {approver?.email ?? 'Named person'}
                              </div>
                            </>
                          ) : (
                            <span style={{ color: C.danger }}>No approver</span>
                          )}
                        </td>
                        <td
                          style={{ padding: '12px 14px', verticalAlign: 'top' }}
                        >
                          <span
                            style={{
                              ...chip,
                              backgroundColor: rule.active
                                ? C.successSoft
                                : C.hairline,
                              color: rule.active ? C.success : C.secondary,
                              fontWeight: 600,
                            }}
                          >
                            {rule.active ? 'Active' : 'Paused'}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: '12px 20px',
                            textAlign: 'right',
                            verticalAlign: 'top',
                          }}
                        >
                          <div
                            className="row-wrap"
                            style={{ justifyContent: 'flex-end' }}
                          >
                            <button
                              type="button"
                              className="touch-target"
                              onClick={() => openForm(rule)}
                              style={{
                                ...secondaryButton,
                                padding: '5px 10px',
                                fontSize: '0.78rem',
                              }}
                            >
                              <Pencil size={13} />
                              Edit
                            </button>
                            <button
                              type="button"
                              className="touch-target"
                              onClick={() => {
                                setRetireError(null)
                                setRetiring(rule)
                              }}
                              style={{
                                ...destructiveButton,
                                padding: '5px 10px',
                                fontSize: '0.78rem',
                              }}
                            >
                              <Trash2 size={13} />
                              Deactivate
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      <ApprovalRuleFormDrawer
        key={formKey}
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        rule={editing}
        accountId={accountId}
        accountLabel={accountLabel}
        sendAccountId={isAdmin}
        sites={sites}
        users={users}
        categories={categories}
        onSaved={(saved, kind) => {
          setFormOpen(false)
          setNotice(`"${saved.name}" was ${kind}.`)
        }}
      />

      <ApprovalConfirmDialog
        isOpen={retiring !== null}
        title="Deactivate this rule?"
        message={
          <>
            <strong style={{ color: C.text }}>{retiring?.name}</strong> stops
            matching new orders and is removed from this list. Orders already
            waiting on it keep their approval steps, so nothing in flight is
            stranded. To stop it temporarily instead, edit the rule and pause
            it.
          </>
        }
        confirmLabel="Deactivate rule"
        tone="danger"
        isPending={isRemoving}
        error={retireError}
        onConfirm={() => void handleRetire()}
        onCancel={() => {
          setRetiring(null)
          setRetireError(null)
        }}
      />
    </>
  )
}
