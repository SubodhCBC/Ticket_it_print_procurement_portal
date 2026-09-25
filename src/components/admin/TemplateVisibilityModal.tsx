// src/components/admin/TemplateVisibilityModal.tsx
'use client'

import { SkeletonForm, SkeletonList } from '@/components/ui/Skeleton'
import React, { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Globe, Lock, Search, Users, X } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { useAccounts } from '@/hooks/useAccounts'
import {
  useCachedTemplate,
  useSetTemplateVisibility,
  useTemplate,
} from '@/hooks/useTemplates'
import { toApiError } from '@/services'
import type { PrintTemplate } from '@/types'

type OperatorVisibility = 'ALL_ACCOUNTS' | 'RESTRICTED'

/** The API refuses more grants than this in one request. */
const MAX_ACCOUNTS = 500
/** The accounts endpoint caps a page at 100. */
const ACCOUNT_PAGE_SIZE = 100

/**
 * ACCOUNT and PRIVATE templates belong to a customer, not to the operator's
 * library, and their audience follows from who owns them. Offering to widen
 * one to every account would publish a customer's own design to everyone.
 */
function isCustomerOwnedTemplate(
  template: Pick<PrintTemplate, 'visibility'>
): boolean {
  return template.visibility === 'ACCOUNT' || template.visibility === 'PRIVATE'
}

/**
 * The visibility label a gallery tile shows.
 *
 * A gallery row carries no grants, so the count appears only once the detail
 * is in the cache (the visibility dialog loads it). No request per tile.
 */
export function TemplateVisibilityBadge({
  template,
}: {
  template: PrintTemplate
}) {
  const cached = useCachedTemplate(template.id)

  let icon = <Globe size={12} />
  let label = 'All accounts'
  let color = '#3F9C68'
  let background = '#EAF8EF'

  if (template.visibility === 'RESTRICTED') {
    const count =
      cached?.visibility === 'RESTRICTED'
        ? cached.restrictedToAccountIds?.length
        : undefined
    icon = <Lock size={12} />
    label = count !== undefined ? `Restricted · ${count}` : 'Restricted'
    color = '#B45309'
    background = '#FFFBEB'
  } else if (template.visibility === 'ACCOUNT') {
    icon = <Users size={12} />
    label = 'Account-owned'
    color = '#6E6781'
    background = '#F5EEF2'
  } else if (template.visibility === 'PRIVATE') {
    icon = <Lock size={12} />
    label = 'Private'
    color = '#6E6781'
    background = '#F5EEF2'
  }

  return (
    <span
      title={
        template.visibility === 'RESTRICTED'
          ? 'Visible only to the accounts it is granted to'
          : undefined
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: '9999px',
        fontSize: '0.72rem',
        fontWeight: 600,
        color,
        backgroundColor: background,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      {label}
    </span>
  )
}

interface TemplateVisibilityModalProps {
  /** The gallery row. Its detail is loaded here to prefill the grants. */
  template: PrintTemplate
  onClose: () => void
}

/**
 * Sets who may see an operator template: every account, or named accounts.
 *
 * Admin only (TEMPLATE_MANAGE). Mount with `key={template.id}` so the draft
 * selection starts from the template each time it opens.
 */
export function TemplateVisibilityModal({
  template,
  onClose,
}: TemplateVisibilityModalProps) {
  const {
    template: detail,
    isLoading: isLoadingDetail,
    error: detailError,
    refetch: refetchDetail,
  } = useTemplate(template.id, { fresh: true })
  const setVisibility = useSetTemplateVisibility()

  // Null until the user changes something; until then the saved state shows.
  const [draftMode, setDraftMode] = useState<OperatorVisibility | null>(null)
  const [draftSelected, setDraftSelected] = useState<string[] | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [saveError, setSaveError] = useState<string | null>(null)

  const savedMode: OperatorVisibility =
    detail?.visibility === 'RESTRICTED' ? 'RESTRICTED' : 'ALL_ACCOUNTS'
  const savedGrants = useMemo(
    () => detail?.restrictedToAccountIds ?? [],
    [detail]
  )
  const mode = draftMode ?? savedMode
  const selected = draftSelected ?? savedGrants

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  const {
    data: accountsPage,
    isLoading: isLoadingAccounts,
    error: accountsError,
  } = useAccounts({
    search: search || undefined,
    pageSize: ACCOUNT_PAGE_SIZE,
  })

  // Names for chips. A granted account may not be on the page the current
  // search returned, so names come from every account page already in the
  // cache (earlier searches here, other admin screens). Read during render;
  // `accountsPage` changing is what brings a new page into view.
  const queryClient = useQueryClient()
  const knownAccounts = useMemo(() => {
    const names: Record<string, { name: string; accountCode: string }> = {}
    const cached = queryClient.getQueriesData<{
      items?: { id: string; name: string; accountCode: string }[]
    }>({ queryKey: ['accounts'] })
    for (const [, page] of cached) {
      if (!Array.isArray(page?.items)) continue
      for (const account of page.items) {
        names[account.id] = {
          name: account.name,
          accountCode: account.accountCode,
        }
      }
    }
    return names
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, accountsPage])

  const selectedSet = useMemo(() => new Set(selected), [selected])
  const isCustomerOwned = detail ? isCustomerOwnedTemplate(detail) : false
  const isPending = setVisibility.isPending
  const atLimit = selected.length >= MAX_ACCOUNTS

  const hasChanges =
    mode !== savedMode ||
    (mode === 'RESTRICTED' &&
      (selected.length !== savedGrants.length ||
        selected.some((id) => !savedGrants.includes(id))))

  const wipesGrants =
    mode === 'ALL_ACCOUNTS' &&
    savedMode === 'RESTRICTED' &&
    savedGrants.length > 0

  const canSave =
    Boolean(detail) &&
    !isCustomerOwned &&
    !isPending &&
    hasChanges &&
    (mode === 'ALL_ACCOUNTS' ||
      (selected.length > 0 && selected.length <= MAX_ACCOUNTS))

  const toggleAccount = (id: string) => {
    setSaveError(null)
    setDraftSelected(
      selectedSet.has(id)
        ? selected.filter((existing) => existing !== id)
        : [...selected, id]
    )
  }

  const handleSave = async () => {
    if (!canSave) return
    setSaveError(null)
    try {
      await setVisibility.mutateAsync({
        id: template.id,
        visibility: mode,
        accountIds: mode === 'RESTRICTED' ? selected : [],
      })
      onClose()
    } catch (err) {
      setSaveError(toApiError(err).message)
    }
  }

  const radioCard = (
    value: OperatorVisibility,
    title: string,
    description: string,
    icon: React.ReactNode
  ) => {
    const isSelected = mode === value
    return (
      <label
        style={{
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
          padding: '12px',
          borderRadius: '10px',
          border: `1px solid ${isSelected ? '#F73582' : '#F0E6EC'}`,
          backgroundColor: isSelected ? '#FDE8F1' : '#FFFFFF',
          cursor: isPending ? 'not-allowed' : 'pointer',
          flex: '1 1 200px',
          minWidth: 0,
        }}
      >
        <input
          type="radio"
          name="template-visibility"
          value={value}
          checked={isSelected}
          disabled={isPending}
          onChange={() => {
            setSaveError(null)
            setDraftMode(value)
          }}
          style={{ marginTop: '3px', accentColor: '#F73582' }}
        />
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.84rem',
              fontWeight: 700,
              color: '#2B253E',
            }}
          >
            {icon}
            {title}
          </div>
          <div
            style={{ fontSize: '0.76rem', color: '#6E6781', marginTop: '2px' }}
          >
            {description}
          </div>
        </div>
      </label>
    )
  }

  return (
    <Modal
      isOpen
      onClose={isPending ? () => undefined : onClose}
      title="Template visibility"
      maxWidth="620px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '0.8rem', color: '#6E6781' }}>
          Who can see{' '}
          <strong style={{ color: '#2B253E' }}>{template.name}</strong>
          {template.status !== 'PUBLISHED' &&
            '. Customers only see it once it is published'}
          .
        </div>

        {isLoadingDetail ? (
          <div style={{ padding: '16px 0' }}>
            <SkeletonForm fields={3} label="Loading current visibility" />
          </div>
        ) : detailError || !detail ? (
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
            {detailError
              ? toApiError(detailError).message
              : 'This template could not be loaded.'}{' '}
            <button
              type="button"
              onClick={() => void refetchDetail()}
              style={{
                border: 'none',
                background: 'none',
                color: '#F73582',
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: '0.8rem',
              }}
            >
              Retry
            </button>
          </div>
        ) : isCustomerOwned ? (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: '10px',
              backgroundColor: '#F5EEF2',
              color: '#5C566E',
              fontSize: '0.8rem',
            }}
          >
            This template belongs to a customer (
            {detail.visibility === 'ACCOUNT' ? 'account-owned' : 'private'}).
            Who can see it follows from its owner, so it cannot be shared from
            here.
          </div>
        ) : (
          <>
            <div className="row-wrap" style={{ alignItems: 'stretch' }}>
              {radioCard(
                'ALL_ACCOUNTS',
                'All accounts',
                'Every customer account can use it.',
                <Globe size={14} />
              )}
              {radioCard(
                'RESTRICTED',
                'Restricted',
                'Only the accounts selected below.',
                <Lock size={14} />
              )}
            </div>

            {wipesGrants && (
              <div
                role="status"
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start',
                  padding: '10px 14px',
                  borderRadius: '10px',
                  backgroundColor: '#FFFBEB',
                  color: '#B45309',
                  fontSize: '0.78rem',
                  fontWeight: 500,
                }}
              >
                <AlertTriangle
                  size={14}
                  style={{ flexShrink: 0, marginTop: '2px' }}
                />
                <span>
                  Saving as All accounts deletes the {savedGrants.length}{' '}
                  existing account{' '}
                  {savedGrants.length === 1 ? 'grant' : 'grants'}. To restrict
                  it again later you will have to select the accounts again.
                </span>
              </div>
            )}

            {mode === 'RESTRICTED' && (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    color: '#5C566E',
                  }}
                >
                  <span>
                    Granted accounts ({selected.length}
                    {atLimit ? `, max ${MAX_ACCOUNTS}` : ''})
                  </span>
                  {selected.length > 0 && (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => setDraftSelected([])}
                      style={{
                        border: 'none',
                        background: 'none',
                        color: '#F73582',
                        fontSize: '0.76rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {selected.length === 0 ? (
                  <div style={{ fontSize: '0.76rem', color: '#DC2626' }}>
                    Select at least one account. A restricted template with no
                    accounts would be visible to nobody.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '6px',
                      maxHeight: '96px',
                      overflowY: 'auto',
                    }}
                  >
                    {selected.map((id) => {
                      const known = knownAccounts[id]
                      return (
                        <span
                          key={id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 6px 3px 10px',
                            borderRadius: '9999px',
                            backgroundColor: '#FDE8F1',
                            color: '#2B253E',
                            fontSize: '0.74rem',
                            fontWeight: 600,
                          }}
                        >
                          {known ? known.name : id}
                          <button
                            type="button"
                            disabled={isPending}
                            onClick={() => toggleAccount(id)}
                            aria-label={`Remove ${known?.name ?? id}`}
                            style={{
                              display: 'inline-flex',
                              border: 'none',
                              background: 'none',
                              padding: '1px',
                              color: '#6E6781',
                              cursor: 'pointer',
                            }}
                          >
                            <X size={12} />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                )}

                <div style={{ position: 'relative' }}>
                  <Search
                    size={14}
                    color="#A39BB3"
                    style={{
                      position: 'absolute',
                      left: '10px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  />
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search accounts by name or code..."
                    aria-label="Search accounts"
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 30px',
                      borderRadius: '10px',
                      border: '1px solid #F0E6EC',
                      fontSize: '0.82rem',
                      backgroundColor: '#FFFFFF',
                      color: '#2B253E',
                    }}
                  />
                </div>

                <div
                  style={{
                    border: '1px solid #F0E6EC',
                    borderRadius: '10px',
                    maxHeight: '240px',
                    overflowY: 'auto',
                  }}
                >
                  {isLoadingAccounts ? (
                    <div style={{ padding: '10px 12px' }}>
                      <SkeletonList
                        count={4}
                        avatar={false}
                        bordered={false}
                        label="Loading accounts"
                      />
                    </div>
                  ) : accountsError ? (
                    <div
                      role="alert"
                      style={{
                        padding: '16px',
                        color: '#DC2626',
                        fontSize: '0.8rem',
                      }}
                    >
                      {toApiError(accountsError).message}
                    </div>
                  ) : !accountsPage?.items.length ? (
                    <div
                      style={{
                        padding: '16px',
                        textAlign: 'center',
                        color: '#A39BB3',
                        fontSize: '0.8rem',
                      }}
                    >
                      {search
                        ? `No accounts match "${search}".`
                        : 'No accounts found.'}
                    </div>
                  ) : (
                    accountsPage.items.map((account) => {
                      const checked = selectedSet.has(account.id)
                      const disabled = isPending || (!checked && atLimit)
                      return (
                        <label
                          key={account.id}
                          className="touch-target"
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            minWidth: 0,
                            borderBottom: '1px solid #F5EEF2',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            opacity: disabled && !checked ? 0.5 : 1,
                            backgroundColor: checked ? '#FFF7FB' : '#FFFFFF',
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={() => toggleAccount(account.id)}
                            style={{ accentColor: '#F73582' }}
                          />
                          <span
                            className="truncate"
                            title={account.name}
                            style={{
                              flex: 1,
                              fontSize: '0.82rem',
                              color: '#2B253E',
                              fontWeight: 500,
                            }}
                          >
                            {account.name}
                          </span>
                          <span
                            style={{
                              fontFamily: 'monospace',
                              fontSize: '0.72rem',
                              color: '#A39BB3',
                            }}
                          >
                            {account.accountCode}
                          </span>
                          {account.status !== 'ACTIVE' && (
                            <span
                              style={{ fontSize: '0.7rem', color: '#6E6781' }}
                            >
                              {account.status.toLowerCase()}
                            </span>
                          )}
                        </label>
                      )
                    })
                  )}
                </div>
                {accountsPage &&
                  accountsPage.total > accountsPage.items.length && (
                    <div style={{ fontSize: '0.72rem', color: '#A39BB3' }}>
                      Showing {accountsPage.items.length} of{' '}
                      {accountsPage.total} accounts. Search to find others.
                    </div>
                  )}
              </div>
            )}
          </>
        )}

        {saveError && (
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
            {saveError}
          </div>
        )}

        <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            style={{
              padding: '8px 14px',
              borderRadius: '10px',
              border: '1px solid #F0E6EC',
              backgroundColor: '#FFFFFF',
              color: '#2B253E',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            Cancel
          </button>
          {!isCustomerOwned && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!canSave}
              style={{
                padding: '8px 14px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#F73582',
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: canSave ? 'pointer' : 'not-allowed',
                opacity: canSave ? 1 : 0.5,
              }}
            >
              {isPending ? 'Saving...' : 'Save visibility'}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
