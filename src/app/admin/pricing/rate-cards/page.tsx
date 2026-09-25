// src/app/admin/pricing/rate-cards/page.tsx
'use client'

import { SkeletonList } from '@/components/ui/Skeleton'
import React, { useCallback, useEffect, useState } from 'react'
import {
  Archive,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Edit3,
  Percent,
  Plus,
  Search,
  Trash2,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { StatusPill } from '@/components/admin/StatusPill'
import { RateCardConfirmModal } from '@/components/admin/RateCardConfirmModal'
import { RateCardEditModal } from '@/components/admin/RateCardEditModal'
import { RateCardItemsTable } from '@/components/admin/RateCardItemsTable'
import { RateCardStatusModal } from '@/components/admin/RateCardStatusModal'
import {
  useRateCardAdminMutations,
  useRateCardMutations,
  useRateCards,
} from '@/hooks/usePricing'
import { useAccounts } from '@/hooks/useAccounts'
import { useAuth } from '@/hooks/useAuth'
import { FieldError, fieldOutline } from '@/components/ui/FormField'
import { toApiError } from '@/services'
import type { RateCard } from '@/types'
import { formatDate } from '@/lib/format'

/**
 * The transitions the API allows (see ALLOWED_TRANSITIONS in
 * rate-cards.service). A card never returns to DRAFT, and ARCHIVED is final.
 */
const RATE_CARD_NEXT_STATUSES: Readonly<
  Record<RateCard['status'], readonly RateCard['status'][]>
> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ARCHIVED'],
  ARCHIVED: [],
}

const PAGE_SIZE = 20

const panelStyle: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  color: '#A39BB3',
  fontSize: '0.84rem',
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: '1px solid #F0E6EC',
}

function actionButtonStyle(
  tone: 'default' | 'success' | 'danger' = 'default'
): React.CSSProperties {
  const palette = {
    default: { border: '#F0E6EC', color: '#2B253E' },
    success: { border: 'rgba(63, 156, 104, 0.35)', color: '#3F9C68' },
    danger: { border: '#FECACA', color: '#DC2626' },
  }[tone]

  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 10px',
    borderRadius: '10px',
    border: `1px solid ${palette.border}`,
    backgroundColor: '#FFFFFF',
    color: palette.color,
    fontSize: '0.76rem',
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

export default function RateCardsPage() {
  const { hasPermission } = useAuth()
  // Head office can open this page; only PRICING_MANAGE may change anything.
  const canManage = hasPermission('PRICING_MANAGE')

  // What is typed, and the search actually sent once typing pauses — one
  // request per pause rather than one per keystroke.
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(searchInput.trim())
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])
  const {
    data: rateCardsData,
    isLoading,
    isFetching,
    error: listError,
    refetch,
  } = useRateCards({ search: searchQuery, page, pageSize: PAGE_SIZE })
  // Only the create form reads accounts, and only PRICING_MANAGE sees it. The
  // default page of 25 left later accounts impossible to give a card to.
  const { data: accountsData } = useAccounts(
    { pageSize: 100 },
    { enabled: canManage }
  )
  const { createRateCard } = useRateCardMutations()
  const { deleteCard, changeStatus } = useRateCardAdminMutations()
  const [createNotice, setCreateNotice] = useState<{
    tone: 'success' | 'warning'
    message: string
  } | null>(null)

  const [expandedCardId, setExpandedCardId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState('')
  const [discountPct, setDiscountPct] = useState(15)
  const [isSubmitting, setIsSubmitting] = useState(false)
  /** Server refusals only. Anything the form can see lands on its field. */
  const [formError, setFormError] = useState<string | null>(null)
  const [createErrors, setCreateErrors] = useState<{
    name?: string
    accountId?: string
    discountPct?: string
  }>({})

  const [editingCard, setEditingCard] = useState<RateCard | null>(null)
  const [statusChange, setStatusChange] = useState<{
    card: RateCard
    target: 'ACTIVE' | 'ARCHIVED'
  } | null>(null)
  const [deletingCard, setDeletingCard] = useState<RateCard | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const toggleCard = useCallback((id: string) => {
    setExpandedCardId((current) => (current === id ? null : id))
  }, [])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()

    // Every field is checked in one pass, so an empty form names all of its
    // gaps at once rather than one refusal at a time.
    const found: typeof createErrors = {}
    if (!name.trim()) found.name = 'Enter a name for this rate card.'
    if (!accountId)
      found.accountId = 'Choose the client account this card prices for.'
    if (!Number.isFinite(discountPct) || discountPct < 0 || discountPct > 100) {
      found.discountPct = 'Discount must be between 0 and 100.'
    }
    setCreateErrors(found)
    if (Object.keys(found).length > 0) return

    const acc = accountsData?.items.find((a) => a.id === accountId)

    setIsSubmitting(true)
    setFormError(null)
    setCreateNotice(null)

    // Created as a DRAFT, then activated as its own step. Done in one call,
    // a refused activation (it overlaps this account's live card) left the
    // draft behind while the form still said the save had failed — so each
    // retry added another copy of the card.
    let created: RateCard
    try {
      created = await createRateCard({
        name,
        accountId,
        accountName: acc?.name || 'Client',
        defaultDiscountPct: Number(discountPct),
        status: 'DRAFT',
        effectiveFrom: new Date().toISOString(),
        items: [],
      })
    } catch (err) {
      setFormError(toApiError(err).message)
      setIsSubmitting(false)
      return
    }

    // From here the card exists, so the form closes whatever activation says.
    setName('')
    setCreateErrors({})
    setIsAdding(false)
    setSearchInput('')
    setSearchQuery('')
    setPage(1)
    setExpandedCardId(created.id)
    try {
      await changeStatus.mutateAsync({ id: created.id, status: 'ACTIVE' })
      setCreateNotice({
        tone: 'success',
        message: `${created.name} is published and active.`,
      })
    } catch (err) {
      setCreateNotice({
        tone: 'warning',
        message: `${created.name} was saved as a draft but could not be activated: ${toApiError(err).message} Fix the overlap, then use Activate on the card.`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const closeDelete = () => {
    setDeletingCard(null)
    setDeleteError(null)
  }

  const confirmDelete = async () => {
    if (!deletingCard) return
    setDeleteError(null)
    try {
      await deleteCard.mutateAsync(deletingCard.id)
      if (expandedCardId === deletingCard.id) setExpandedCardId(null)
      // The last card on a later page: step back rather than show an empty page.
      if (page > 1 && rateCardsData?.items.length === 1) setPage(page - 1)
      closeDelete()
    } catch (err) {
      setDeleteError(toApiError(err).message)
    }
  }

  return (
    <>
      <AdminHeader
        title="Rate cards"
        subtitle="Account discounts, per-SKU price overrides and the dates each card applies"
        actionButton={
          canManage ? (
            <button
              type="button"
              className="touch-target"
              onClick={() => {
                setCreateErrors({})
                setFormError(null)
                setIsAdding(!isAdding)
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#F73582',
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 600,
              }}
            >
              <Plus size={16} />
              <span>{isAdding ? 'Cancel' : 'New Rate Card'}</span>
            </button>
          ) : undefined
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
        {canManage && isAdding && (
          <form
            onSubmit={handleCreate}
            noValidate
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              boxShadow:
                '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
              padding: '20px',
              border: '1px solid #F0E6EC',
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
              }}
            >
              Create New Commercial Rate Card Agreement
            </div>
            <div
              className="grid-auto"
              style={{ ['--min']: '200px' } as React.CSSProperties}
            >
              <div>
                <label
                  htmlFor="rc-new-name"
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Rate Card Agreement Name *
                </label>
                <input
                  id="rc-new-name"
                  type="text"
                  placeholder="2026 Standard Print Rates"
                  value={name}
                  aria-invalid={createErrors.name ? true : undefined}
                  aria-describedby={
                    createErrors.name ? 'rc-new-name-error' : undefined
                  }
                  onChange={(e) => {
                    setName(e.target.value)
                    setCreateErrors((prev) => ({ ...prev, name: undefined }))
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '0.84rem',
                    color: '#2B253E',
                    ...fieldOutline(Boolean(createErrors.name)),
                  }}
                />
                {createErrors.name && (
                  <FieldError id="rc-new-name-error">
                    {createErrors.name}
                  </FieldError>
                )}
              </div>
              <div>
                <label
                  htmlFor="rc-new-account"
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Target Client Account *
                </label>
                <select
                  id="rc-new-account"
                  value={accountId}
                  aria-invalid={createErrors.accountId ? true : undefined}
                  aria-describedby={
                    createErrors.accountId ? 'rc-new-account-error' : undefined
                  }
                  onChange={(e) => {
                    setAccountId(e.target.value)
                    setCreateErrors((prev) => ({
                      ...prev,
                      accountId: undefined,
                    }))
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '0.84rem',
                    color: '#2B253E',
                    ...fieldOutline(Boolean(createErrors.accountId)),
                  }}
                >
                  <option value="">Select Account...</option>
                  {accountsData?.items.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
                {createErrors.accountId && (
                  <FieldError id="rc-new-account-error">
                    {createErrors.accountId}
                  </FieldError>
                )}
              </div>
              <div>
                <label
                  htmlFor="rc-new-discount"
                  style={{
                    display: 'block',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                    marginBottom: '6px',
                  }}
                >
                  Master Discount (%)
                </label>
                <input
                  id="rc-new-discount"
                  type="number"
                  step="0.01"
                  value={discountPct}
                  aria-invalid={createErrors.discountPct ? true : undefined}
                  aria-describedby={
                    createErrors.discountPct
                      ? 'rc-new-discount-error'
                      : undefined
                  }
                  onChange={(e) => {
                    setDiscountPct(parseFloat(e.target.value) || 0)
                    setCreateErrors((prev) => ({
                      ...prev,
                      discountPct: undefined,
                    }))
                  }}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    fontSize: '0.84rem',
                    color: '#2B253E',
                    ...fieldOutline(Boolean(createErrors.discountPct)),
                  }}
                />
                {createErrors.discountPct && (
                  <FieldError id="rc-new-discount-error">
                    {createErrors.discountPct}
                  </FieldError>
                )}
              </div>
            </div>
            {formError && (
              <div
                role="alert"
                style={{
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#FEF2F2',
                  color: '#DC2626',
                  fontSize: '0.8rem',
                  fontWeight: 500,
                }}
              >
                {formError}
              </div>
            )}

            <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="touch-target"
                onClick={() => {
                  setCreateErrors({})
                  setFormError(null)
                  setIsAdding(false)
                }}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: '1px solid #F0E6EC',
                  backgroundColor: '#FFFFFF',
                  color: '#2B253E',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="touch-target"
                disabled={isSubmitting}
                style={{
                  padding: '8px 14px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: '#F73582',
                  color: '#FFFFFF',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  opacity: isSubmitting ? 0.5 : 1,
                }}
              >
                {isSubmitting ? 'Saving...' : 'Publish Rate Card'}
              </button>
            </div>
          </form>
        )}

        {createNotice && (
          <div
            role={createNotice.tone === 'warning' ? 'alert' : 'status'}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '10px 14px',
              borderRadius: '10px',
              fontSize: '0.8rem',
              fontWeight: 500,
              ...(createNotice.tone === 'warning'
                ? {
                    backgroundColor: '#FFFBEB',
                    border: '1px solid #FDE68A',
                    color: '#B45309',
                  }
                : {
                    backgroundColor: 'rgba(63, 156, 104, 0.08)',
                    border: '1px solid rgba(63, 156, 104, 0.3)',
                    color: '#3F9C68',
                  }),
            }}
          >
            <span>{createNotice.message}</span>
            <button
              type="button"
              className="touch-target"
              onClick={() => setCreateNotice(null)}
              aria-label="Dismiss"
              style={{
                border: 'none',
                background: 'none',
                color: 'inherit',
                fontWeight: 700,
                cursor: 'pointer',
                fontSize: '0.9rem',
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Search — served by the API, not filtered in the browser: a card list
            is paginated, so a client-side filter would only search the page
            that happens to be loaded. */}
        <div style={{ position: 'relative', maxWidth: '420px' }}>
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
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            // The API matches the card's name only, not the account's.
            placeholder="Search rate cards by name..."
            aria-label="Search rate cards"
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              borderRadius: '10px',
              border: '1px solid #F0E6EC',
              fontSize: '0.84rem',
              backgroundColor: '#FFFFFF',
              color: '#2B253E',
            }}
          />
        </div>

        {/* Rate Cards Listing */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {isLoading && <SkeletonList count={4} label="Loading rate cards" />}

          {!isLoading && listError && (
            <div role="alert" style={{ ...panelStyle, color: '#DC2626' }}>
              {toApiError(listError).message}{' '}
              <button
                type="button"
                onClick={() => void refetch()}
                style={{
                  border: 'none',
                  background: 'none',
                  color: '#F73582',
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {!isLoading && !listError && rateCardsData?.items.length === 0 && (
            <div style={panelStyle}>
              {searchQuery
                ? `No rate cards match "${searchQuery}".`
                : 'No rate cards yet. Every account is quoted at catalogue list price until one exists.'}
            </div>
          )}

          {rateCardsData?.items.map((rc) => {
            const isExpanded = expandedCardId === rc.id
            const nextStatuses = RATE_CARD_NEXT_STATUSES[rc.status]
            const isArchived = rc.status === 'ARCHIVED'

            return (
              <div
                key={rc.id}
                // One border whether open or closed. The open card used to turn
                // pink as well; the chevron and the lines underneath already
                // say which card is open.
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  boxShadow:
                    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                  border: '1px solid #F0E6EC',
                  overflow: 'hidden',
                }}
              >
                <div
                  onClick={() => toggleCard(rc.id)}
                  role="button"
                  tabIndex={0}
                  aria-expanded={isExpanded}
                  aria-controls={`rate-card-panel-${rc.id}`}
                  onKeyDown={(e) => {
                    if (e.target !== e.currentTarget) return
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      toggleCard(rc.id)
                    }
                  }}
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '16px',
                    cursor: 'pointer',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      minWidth: 0,
                    }}
                  >
                    <Percent
                      size={16}
                      color="#A39BB3"
                      style={{ flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          flexWrap: 'wrap',
                          gap: '10px',
                          minWidth: 0,
                        }}
                      >
                        <span
                          className="truncate"
                          title={rc.name}
                          style={{
                            fontWeight: 700,
                            fontSize: '0.95rem',
                            color: '#2B253E',
                          }}
                        >
                          {rc.name}
                        </span>
                        <StatusPill status={rc.status} size="sm" />
                        {rc.status === 'ACTIVE' && rc.isInForce === false && (
                          <span
                            title="Active, but today is outside its effective dates, so it prices nothing right now."
                            style={{
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              color: '#B45309',
                            }}
                          >
                            Not in force today
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: '#6E6781',
                          marginTop: '2px',
                        }}
                      >
                        Account: <strong>{rc.accountName}</strong> • Master
                        Blanket Discount:{' '}
                        <strong>{rc.defaultDiscountPct}%</strong>
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '16px',
                    }}
                  >
                    {canManage && (
                      // Clicks here act on the card; they must not also
                      // open or close it.
                      <div
                        className="row-wrap"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        {!isArchived && (
                          <button
                            type="button"
                            className="touch-target"
                            onClick={() => setEditingCard(rc)}
                            style={actionButtonStyle()}
                          >
                            <Edit3 size={12} />
                            Edit
                          </button>
                        )}
                        {nextStatuses.includes('ACTIVE') && (
                          <button
                            type="button"
                            className="touch-target"
                            onClick={() =>
                              setStatusChange({ card: rc, target: 'ACTIVE' })
                            }
                            style={actionButtonStyle('success')}
                          >
                            <CheckCircle2 size={12} />
                            Activate
                          </button>
                        )}
                        {nextStatuses.includes('ARCHIVED') && (
                          <button
                            type="button"
                            className="touch-target"
                            onClick={() =>
                              setStatusChange({ card: rc, target: 'ARCHIVED' })
                            }
                            style={actionButtonStyle()}
                          >
                            <Archive size={12} />
                            Archive
                          </button>
                        )}
                        <button
                          type="button"
                          className="touch-target"
                          onClick={() => {
                            setDeleteError(null)
                            setDeletingCard(rc)
                          }}
                          aria-label={`Delete ${rc.name}`}
                          title="Delete rate card"
                          style={actionButtonStyle('danger')}
                        >
                          <Trash2 size={12} />
                          Delete
                        </button>
                      </div>
                    )}

                    <div style={{ textAlign: 'right' }}>
                      <div
                        style={{
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          color: '#2B253E',
                        }}
                      >
                        {rc.itemCount} Custom SKU Overrides
                      </div>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: '#A39BB3',
                          marginTop: '2px',
                        }}
                      >
                        {rc.effectiveTo
                          ? `Valid through ${formatDate(rc.effectiveTo)}`
                          : `From ${formatDate(rc.effectiveFrom)} - open-ended`}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={16} color="#A39BB3" />
                    ) : (
                      <ChevronDown size={16} color="#A39BB3" />
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div
                    id={`rate-card-panel-${rc.id}`}
                    style={{
                      paddingTop: '14px',
                      borderTop: '1px solid #F5EEF2',
                    }}
                  >
                    {rc.notes && (
                      <div
                        style={{
                          fontSize: '0.78rem',
                          color: '#6E6781',
                          padding: '0 20px 12px',
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        <strong style={{ color: '#2B253E' }}>Notes:</strong>{' '}
                        {rc.notes}
                      </div>
                    )}
                    <RateCardItemsTable rateCard={rc} canManage={canManage} />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {rateCardsData && rateCardsData.totalPages > 1 && (
          <nav
            aria-label="Rate card pages"
            className="row-wrap"
            style={{
              justifyContent: 'space-between',
              fontSize: '0.8rem',
              color: '#6E6781',
            }}
          >
            <span>
              Showing {(rateCardsData.page - 1) * rateCardsData.pageSize + 1}–
              {Math.min(
                rateCardsData.page * rateCardsData.pageSize,
                rateCardsData.total
              )}{' '}
              of {rateCardsData.total} rate cards
              {isFetching && !isLoading ? ' · Loading…' : ''}
            </span>
            <div className="row-wrap">
              <button
                type="button"
                className="touch-target"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || isFetching}
                style={{
                  ...actionButtonStyle(),
                  opacity: page <= 1 ? 0.5 : 1,
                  cursor: page <= 1 ? 'default' : 'pointer',
                }}
              >
                Previous
              </button>
              <span>
                Page {rateCardsData.page} of {rateCardsData.totalPages}
              </span>
              <button
                type="button"
                className="touch-target"
                onClick={() =>
                  setPage((p) => Math.min(rateCardsData.totalPages, p + 1))
                }
                disabled={page >= rateCardsData.totalPages || isFetching}
                style={{
                  ...actionButtonStyle(),
                  opacity: page >= rateCardsData.totalPages ? 0.5 : 1,
                  cursor:
                    page >= rateCardsData.totalPages ? 'default' : 'pointer',
                }}
              >
                Next
              </button>
            </div>
          </nav>
        )}
      </main>

      {editingCard && (
        <RateCardEditModal
          key={editingCard.id}
          rateCard={editingCard}
          onClose={() => setEditingCard(null)}
        />
      )}

      {statusChange && (
        <RateCardStatusModal
          key={`${statusChange.card.id}-${statusChange.target}`}
          rateCard={statusChange.card}
          targetStatus={statusChange.target}
          onClose={() => setStatusChange(null)}
        />
      )}

      <RateCardConfirmModal
        isOpen={deletingCard !== null}
        title="Delete rate card"
        message={
          deletingCard && (
            <>
              Delete <strong>{deletingCard.name}</strong> for{' '}
              <strong>{deletingCard.accountName}</strong>? The card is archived
              and removed from this list. Orders already priced under it keep
              their reference.
              {deletingCard.status === 'ACTIVE' && (
                <>
                  {' '}
                  It is active now, so the account falls back to catalogue
                  pricing unless another card is active.
                </>
              )}{' '}
              This cannot be undone here.
            </>
          )
        }
        confirmLabel="Delete card"
        pendingLabel="Deleting..."
        isPending={deleteCard.isPending}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onClose={closeDelete}
      />
    </>
  )
}
