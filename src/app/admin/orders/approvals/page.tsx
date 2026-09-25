// src/app/admin/orders/approvals/page.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ExternalLink,
  RefreshCw,
  Settings,
  ShieldCheck,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { ApprovalDetailDrawer } from '@/components/admin/ApprovalDetailDrawer'
import { ApprovalStatusBadge } from '@/components/admin/ApprovalStatusBadge'
import { formatMoney, formatDateTime } from '@/lib/format'
import {
  APPROVAL_COLORS,
  approvalCard,
  approvalTh,
  approvalThEdge,
  disabledLook,
  emptyState,
  errorBanner,
  errorMessage,
  fieldControl,
  formatAge,
  maxTier,
  predictDecisionRefusal,
  secondaryButton,
} from '@/components/admin/ApprovalShared'
import { useAccounts } from '@/hooks/useAccounts'
import { useApprovals } from '@/hooks/useApprovals'
import { useAuth } from '@/hooks/useAuth'
import type {
  ApprovalRequestStatus,
  ApprovalRequestView,
  ListApprovalsParams,
} from '@/services/data-source/api/approval.types'

const C = APPROVAL_COLORS
const PAGE_SIZE = 25

type StatusTab = ApprovalRequestStatus | 'ALL'

const STATUS_TABS: { id: StatusTab; label: string }[] = [
  { id: 'PENDING', label: 'Pending' },
  { id: 'CHANGES_REQUESTED', label: 'Changes requested' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
  { id: 'CANCELLED', label: 'Cancelled' },
  { id: 'ALL', label: 'All' },
]

export default function AdminApprovalsQueuePage() {
  const { user, role, hasPermission } = useAuth()
  const canAct = hasPermission('APPROVAL_ACT')
  const canManageRules = hasPermission('USER_MANAGE')
  const isAdmin = role === 'admin'

  const [status, setStatus] = useState<StatusTab>('PENDING')
  const [accountId, setAccountId] = useState('')
  const [mine, setMine] = useState(false)
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<ApprovalRequestView | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)

  const params = useMemo<ListApprovalsParams>(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      ...(status !== 'ALL' ? { status } : {}),
      ...(isAdmin && accountId ? { accountId } : {}),
      ...(mine ? { mine: true } : {}),
    }),
    [page, status, isAdmin, accountId, mine]
  )

  const { data, isLoading, isFetching, error, refetch } = useApprovals(params, {
    enabled: canAct,
  })
  // Only an administrator gets the picker; anyone else is answered with an
  // empty page by the adapter, so this costs them nothing visible.
  const { data: accountsPage } = useAccounts(
    { pageSize: 100 },
    { enabled: isAdmin }
  )

  const accountName = useMemo(() => {
    if (!isAdmin) return user?.accountName
    if (!accountId) return undefined
    return accountsPage?.items.find((account) => account.id === accountId)?.name
  }, [isAdmin, accountId, accountsPage, user])

  const items = data?.items ?? []

  // The clock the "Age" column is measured against. Held in state and ticked
  // once a minute, rather than read during render, so a re-render for any
  // other reason never shifts the numbers on its own.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  // With `mine`, the API filters after paging and reports only what survived
  // on this page as the total, so the pager cannot trust `totalPages` there.
  const hasPrevious = page > 1
  const hasNext = mine ? items.length > 0 : page < (data?.totalPages ?? 1)

  const openRequest = (request: ApprovalRequestView) => {
    setSelected(request)
    setDrawerOpen(true)
  }

  const toggleMine = () => {
    const next = !mine
    setMine(next)
    // Only pending requests can be waiting on anyone.
    if (next) setStatus('PENDING')
    setPage(1)
  }

  if (!canAct) {
    return (
      <>
        <AdminHeader title="Approvals queue" />
        <main className="page-pad" style={{ paddingBlock: '24px' }}>
          <div style={{ ...approvalCard, ...emptyState }}>
            <ShieldCheck
              size={24}
              color="#DCD3E0"
              style={{ display: 'block', margin: '0 auto 8px' }}
            />
            <div style={{ fontWeight: 600, color: C.text }}>
              You do not have access to the approvals queue
            </div>
            <div style={{ marginTop: '4px' }}>
              Deciding orders needs the approval permission. Ask an
              administrator if you should have it.
            </div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <AdminHeader
        title="Approvals queue"
        subtitle="Orders waiting on a decision, tier by tier"
        actionButton={
          <div className="row-wrap" style={{ gap: '8px' }}>
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              style={{ ...secondaryButton, ...disabledLook(isFetching) }}
            >
              <RefreshCw size={15} />
              <span>{isFetching ? 'Refreshing…' : 'Refresh'}</span>
            </button>
            {canManageRules && (
              <Link
                href="/admin/settings/approval-rules"
                style={{ ...secondaryButton, textDecoration: 'none' }}
              >
                <Settings size={15} />
                <span>Approval Rules</span>
              </Link>
            )}
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
        {/* Filters */}
        <div
          className="row-wrap"
          style={{
            ...approvalCard,
            padding: '12px 16px',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div
            className="row-wrap"
            role="tablist"
            aria-label="Approval status"
            style={{
              gap: '2px',
              backgroundColor: C.hairline,
              padding: '3px',
              borderRadius: '10px',
            }}
          >
            {STATUS_TABS.map((tab) => {
              const isActive = status === tab.id
              const isDisabled = mine && tab.id !== 'PENDING'
              return (
                <button
                  key={tab.id}
                  className="touch-target"
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  disabled={isDisabled}
                  title={
                    isDisabled
                      ? '"Assigned to me" shows pending requests only'
                      : undefined
                  }
                  onClick={() => {
                    setStatus(tab.id)
                    setPage(1)
                  }}
                  style={{
                    padding: '5px 12px',
                    borderRadius: '6px',
                    border: 'none',
                    fontSize: '0.78rem',
                    fontWeight: isActive ? 600 : 500,
                    backgroundColor: isActive ? '#FFFFFF' : 'transparent',
                    color: isActive ? C.accent : C.secondary,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    opacity: isDisabled ? 0.45 : 1,
                    transition: 'background-color 150ms ease, color 150ms ease',
                  }}
                >
                  {tab.label}
                </button>
              )
            })}
          </div>

          <div className="row-wrap" style={{ gap: '12px' }}>
            {isAdmin && (
              <select
                className="touch-target"
                aria-label="Account"
                value={accountId}
                onChange={(event) => {
                  setAccountId(event.target.value)
                  setPage(1)
                }}
                /* A long account name used to stretch the picker past the
                   filter bar; it now shrinks with the row. */
                style={{
                  ...fieldControl,
                  width: 'auto',
                  flex: '1 1 180px',
                  minWidth: 0,
                }}
              >
                <option value="">All accounts</option>
                {(accountsPage?.items ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} ({account.accountCode})
                  </option>
                ))}
              </select>
            )}

            <button
              className="touch-target"
              type="button"
              role="switch"
              aria-checked={mine}
              onClick={toggleMine}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: C.text,
              }}
            >
              <span
                aria-hidden
                style={{
                  width: '36px',
                  height: '20px',
                  borderRadius: '9999px',
                  backgroundColor: mine ? C.accent : '#DCD3E0',
                  position: 'relative',
                  transition: 'background-color 150ms ease',
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '2px',
                    left: mine ? '18px' : '2px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    backgroundColor: '#FFFFFF',
                    transition: 'left 150ms ease',
                  }}
                />
              </span>
              Assigned to me
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ ...errorBanner, alignItems: 'center' }}>
            <span>
              Could not load the approvals queue:{' '}
              {errorMessage(error, 'unexpected error.')}
            </span>
            <button
              type="button"
              onClick={() => void refetch()}
              style={secondaryButton}
            >
              Retry
            </button>
          </div>
        )}

        {/* Queue */}
        <div style={{ ...approvalCard, overflow: 'hidden' }}>
          {isLoading ? (
            <SkeletonTable rows={6} columns={8} label="Loading approvals" />
          ) : items.length === 0 ? (
            !error && (
              <div style={emptyState}>
                <ClipboardCheck
                  size={24}
                  color="#DCD3E0"
                  style={{ display: 'block', margin: '0 auto 8px' }}
                />
                <div style={{ fontWeight: 600, color: C.secondary }}>
                  {page > 1
                    ? 'No more requests'
                    : mine
                      ? 'Nothing is waiting on you'
                      : status === 'PENDING'
                        ? 'No orders are waiting on approval'
                        : 'No approval requests match these filters'}
                </div>
                {page > 1 && (
                  <button
                    type="button"
                    onClick={() => setPage(1)}
                    style={{ ...secondaryButton, marginTop: '12px' }}
                  >
                    Back to the first page
                  </button>
                )}
              </div>
            )
          ) : (
            // Eight columns cannot fit a phone: the queue scrolls sideways
            // inside its own card instead of widening the page.
            <div className="table-scroll">
              <table
                style={{
                  width: '100%',
                  minWidth: '900px',
                  borderCollapse: 'collapse',
                  textAlign: 'left',
                  fontSize: '0.84rem',
                  opacity: isFetching ? 0.7 : 1,
                  transition: 'opacity 150ms ease',
                }}
              >
                <thead>
                  <tr>
                    <th style={approvalThEdge}>Order #</th>
                    <th style={approvalTh}>Site</th>
                    <th style={approvalTh}>Requested by</th>
                    <th style={{ ...approvalTh, textAlign: 'right' }}>Total</th>
                    <th style={approvalTh}>Tier</th>
                    <th style={approvalTh}>Status</th>
                    <th style={approvalTh}>Age</th>
                    <th style={{ ...approvalThEdge, textAlign: 'right' }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((request) => {
                    const awaitingYou =
                      request.status === 'PENDING' &&
                      request.steps.some(
                        (step) =>
                          step.isOpen &&
                          predictDecisionRefusal(
                            request,
                            step,
                            user ?? null
                          ) === null
                      )

                    return (
                      <tr
                        key={request.id}
                        tabIndex={0}
                        onClick={() => openRequest(request)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openRequest(request)
                          }
                        }}
                        style={{
                          borderTop: `1px solid ${C.hairline}`,
                          cursor: 'pointer',
                          transition: 'background-color 120ms ease',
                        }}
                        onMouseEnter={(event) =>
                          (event.currentTarget.style.backgroundColor = C.fill)
                        }
                        onMouseLeave={(event) =>
                          (event.currentTarget.style.backgroundColor =
                            'transparent')
                        }
                      >
                        <td
                          style={{
                            padding: '12px 20px',
                            fontWeight: 600,
                            color: C.text,
                          }}
                        >
                          <Link
                            href={`/admin/orders/${request.orderId}`}
                            onClick={(event) => event.stopPropagation()}
                            style={{
                              color: C.text,
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                            }}
                          >
                            <span>{request.orderNumber}</span>
                            <ExternalLink size={12} color={C.muted} />
                          </Link>
                          {request.poNumber && (
                            <div
                              style={{
                                fontSize: '0.72rem',
                                color: C.muted,
                                fontWeight: 400,
                                fontFamily: 'monospace',
                              }}
                            >
                              PO {request.poNumber}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 14px', color: C.text }}>
                          <div>{request.siteName}</div>
                          <div style={{ fontSize: '0.72rem', color: C.muted }}>
                            {request.siteCode}
                            {accountName ? ` · ${accountName}` : ''}
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', color: C.text }}>
                          {request.requestedByName}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            textAlign: 'right',
                            fontWeight: 700,
                            color: C.text,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {formatMoney(request.orderTotal)}
                          {request.totalAtRequest !== request.orderTotal && (
                            <div
                              style={{
                                fontSize: '0.72rem',
                                fontWeight: 400,
                                color: C.warning,
                              }}
                            >
                              {formatMoney(request.totalAtRequest)} when raised
                            </div>
                          )}
                        </td>
                        <td
                          style={{
                            padding: '12px 14px',
                            color: C.secondary,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {request.currentTier} of {maxTier(request)}
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-start',
                              gap: '4px',
                            }}
                          >
                            <ApprovalStatusBadge status={request.status} />
                            {awaitingYou && (
                              <span
                                style={{
                                  fontSize: '0.7rem',
                                  fontWeight: 600,
                                  color: C.accent,
                                }}
                              >
                                Awaiting you
                              </span>
                            )}
                          </div>
                        </td>
                        <td
                          title={formatDateTime(request.createdAt)}
                          style={{
                            padding: '12px 14px',
                            color: C.secondary,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {request.completedAt
                            ? `closed ${formatAge(request.completedAt, now)} ago`
                            : formatAge(request.createdAt, now)}
                        </td>
                        <td
                          style={{ padding: '12px 20px', textAlign: 'right' }}
                        >
                          <button
                            className="touch-target"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              openRequest(request)
                            }}
                            style={{
                              ...secondaryButton,
                              padding: '5px 12px',
                              fontSize: '0.78rem',
                            }}
                          >
                            {awaitingYou ? 'Review' : 'View'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Pager */}
          {!isLoading && (items.length > 0 || page > 1) && (
            <div
              className="row-wrap"
              style={{
                justifyContent: 'space-between',
                gap: '12px',
                padding: '10px 20px',
                borderTop: `1px solid ${C.hairline}`,
                fontSize: '0.78rem',
                color: C.secondary,
              }}
            >
              <span>
                {mine || !data
                  ? `Page ${page}`
                  : items.length > 0
                    ? `Showing ${(page - 1) * PAGE_SIZE + 1}–${
                        (page - 1) * PAGE_SIZE + items.length
                      } of ${data.total}`
                    : `Page ${page} of ${data.totalPages}`}
              </span>
              <div className="row-wrap" style={{ gap: '6px' }}>
                <button
                  className="touch-target"
                  type="button"
                  aria-label="Previous page"
                  disabled={!hasPrevious || isFetching}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  style={{
                    ...secondaryButton,
                    padding: '5px 10px',
                    ...disabledLook(!hasPrevious || isFetching),
                  }}
                >
                  <ChevronLeft size={14} />
                  Previous
                </button>
                <button
                  className="touch-target"
                  type="button"
                  aria-label="Next page"
                  disabled={!hasNext || isFetching}
                  onClick={() => setPage((current) => current + 1)}
                  style={{
                    ...secondaryButton,
                    padding: '5px 10px',
                    ...disabledLook(!hasNext || isFetching),
                  }}
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </main>

      <ApprovalDetailDrawer
        request={selected}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        canAct={canAct}
        onDecided={(updated) => setSelected(updated)}
      />
    </>
  )
}
