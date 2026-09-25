// src/components/admin/ProductVisibilityPanel.tsx
'use client'

import { SkeletonList } from '@/components/ui/Skeleton'
import { useState } from 'react'
import { Globe, Lock, X } from 'lucide-react'
import { useAccounts } from '@/hooks/useAccounts'
import { useProductAdminMutations } from '@/hooks/useProducts'
import type { AdminProductView, CatalogVisibility } from '@/types/catalog-admin'
import {
  ActionButton,
  AdminCard,
  ConfirmModal,
  Field,
  Notice,
  ReadOnlyNotice,
  SectionHeading,
  TextInput,
} from './ProductAdminUi'
import { errorMessage } from './ProductAdminUtils'

const MAX_ACCOUNTS = 500

/**
 * Who may see and order this product.
 *
 * RESTRICTED replaces the allow-list wholesale. The product view does not
 * include the current list, so the picker starts empty and says so — saving
 * without re-selecting everyone who should keep access would remove them.
 */
export function ProductVisibilityPanel({
  view,
  canManage,
}: {
  view: AdminProductView
  canManage: boolean
}) {
  const { setVisibility } = useProductAdminMutations(view.id)
  const [mode, setMode] = useState<CatalogVisibility>(view.visibility)
  const [selected, setSelected] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const pending = setVisibility.isPending

  const persist = async () => {
    setError(null)
    setSaved(null)
    try {
      await setVisibility.mutateAsync({
        visibility: mode,
        accountIds: [...selected.keys()],
      })
      setConfirming(false)
      setSaved(
        mode === 'RESTRICTED'
          ? `Restricted to ${selected.size} account(s).`
          : 'Visible to all accounts.'
      )
    } catch (err) {
      setError(errorMessage(err, 'Visibility could not be saved.'))
    }
  }

  const save = () => {
    setSaved(null)
    if (mode === 'RESTRICTED') {
      if (selected.size === 0) {
        setError(
          'Select at least one account, or nobody will be able to order this product.'
        )
        return
      }
      if (selected.size > MAX_ACCOUNTS) {
        setError(`At most ${MAX_ACCOUNTS} accounts.`)
        return
      }
      setError(null)
      setConfirming(true)
      return
    }
    void persist()
  }

  const toggle = (id: string, name: string) => {
    setError(null)
    setSaved(null)
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, name)
      return next
    })
  }

  const noChange = mode === 'ALL_ACCOUNTS' && view.visibility === 'ALL_ACCOUNTS'

  return (
    <AdminCard>
      <SectionHeading
        title="Visibility"
        description="Unrestricted products are visible to every account. Restricted products are visible only to the accounts on their allow-list."
      />

      <div style={{ fontSize: '0.84rem', color: '#2B253E' }}>
        Currently:{' '}
        <strong>
          {view.visibility === 'ALL_ACCOUNTS'
            ? 'All accounts'
            : 'Restricted to selected accounts'}
        </strong>
      </div>

      {!canManage ? (
        <ReadOnlyNotice>
          Changing visibility needs the Catalogue Manage permission.
        </ReadOnlyNotice>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {(
              [
                {
                  value: 'ALL_ACCOUNTS',
                  label: 'All accounts',
                  icon: <Globe size={15} />,
                },
                {
                  value: 'RESTRICTED',
                  label: 'Selected accounts only',
                  icon: <Lock size={15} />,
                },
              ] as const
            ).map((option) => {
              const active = mode === option.value
              return (
                <label
                  key={option.value}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: `1px solid ${active ? '#F73582' : '#F0E6EC'}`,
                    backgroundColor: active ? '#FDE8F1' : '#FFFFFF',
                    color: '#2B253E',
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    cursor: pending ? 'not-allowed' : 'pointer',
                  }}
                >
                  <input
                    type="radio"
                    name="product-visibility"
                    value={option.value}
                    checked={active}
                    disabled={pending}
                    onChange={() => {
                      setMode(option.value)
                      setError(null)
                      setSaved(null)
                    }}
                  />
                  {option.icon}
                  {option.label}
                </label>
              )
            })}
          </div>

          {mode === 'RESTRICTED' && (
            <>
              {view.visibility === 'RESTRICTED' && (
                <Notice tone="warning">
                  The API does not return the accounts currently on this
                  product&apos;s allow-list, so the selection below starts
                  empty. Saving replaces the existing list with exactly the
                  accounts you select here.
                </Notice>
              )}
              <AccountPicker
                selected={selected}
                disabled={pending}
                onToggle={toggle}
              />
            </>
          )}

          {mode === 'ALL_ACCOUNTS' && view.visibility === 'RESTRICTED' && (
            <Notice tone="info">
              Lifting the restriction keeps the stored allow-list on the server,
              so it can be reinstated later.
            </Notice>
          )}

          {error && <Notice tone="error">{error}</Notice>}
          {saved && <Notice tone="success">{saved}</Notice>}

          <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
            <ActionButton
              variant="primary"
              pending={pending}
              pendingLabel="Saving…"
              disabled={noChange}
              onClick={save}
            >
              Save visibility
            </ActionButton>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={confirming}
        title="Restrict product visibility"
        tone="primary"
        message={
          <>
            Only the <strong>{selected.size}</strong> selected account(s) will
            be able to see and order <strong>{view.name}</strong>. Any account
            not selected loses access.
          </>
        }
        confirmLabel="Save allow-list"
        pendingLabel="Saving…"
        pending={pending}
        error={confirming ? error : null}
        onConfirm={() => void persist()}
        onCancel={() => setConfirming(false)}
      />
    </AdminCard>
  )
}

/**
 * Mounted only in RESTRICTED mode, so the account list is fetched on demand.
 * Shared with the category visibility editor.
 */
export function AccountPicker({
  selected,
  disabled,
  onToggle,
}: {
  selected: Map<string, string>
  disabled: boolean
  onToggle: (id: string, name: string) => void
}) {
  const [search, setSearch] = useState('')
  const { data, isLoading, error } = useAccounts({
    search: search.trim() || undefined,
    pageSize: 50,
  })
  const accounts = data?.items ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {selected.size > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {[...selected.entries()].map(([id, name]) => (
            <span
              key={id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '3px 6px 3px 10px',
                borderRadius: '9999px',
                backgroundColor: '#FDE8F1',
                color: '#F73582',
                fontSize: '0.76rem',
                fontWeight: 600,
              }}
            >
              {name}
              <button
                type="button"
                aria-label={`Remove ${name}`}
                disabled={disabled}
                onClick={() => onToggle(id, name)}
                style={{
                  display: 'flex',
                  border: 'none',
                  background: 'transparent',
                  color: '#F73582',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      <Field
        label="Find accounts"
        hint={
          data && data.total > accounts.length
            ? `Showing ${accounts.length} of ${data.total}; refine the search to find others.`
            : undefined
        }
      >
        <TextInput
          type="search"
          placeholder="Search by account name or code…"
          value={search}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>

      <div
        style={{
          maxHeight: '260px',
          overflowY: 'auto',
          border: '1px solid #F0E6EC',
          borderRadius: '10px',
        }}
      >
        {isLoading ? (
          <div style={{ padding: '10px 14px' }}>
            <SkeletonList
              count={4}
              avatar={false}
              bordered={false}
              label="Loading accounts"
            />
          </div>
        ) : error ? (
          <div style={{ padding: '14px' }}>
            <Notice tone="error">
              {errorMessage(error, 'Accounts could not be loaded.')}
            </Notice>
          </div>
        ) : accounts.length === 0 ? (
          <div
            style={{ padding: '14px', fontSize: '0.8rem', color: '#A39BB3' }}
          >
            No accounts match.
          </div>
        ) : (
          accounts.map((account) => (
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
                fontSize: '0.84rem',
                color: '#2B253E',
                cursor: disabled ? 'not-allowed' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={selected.has(account.id)}
                disabled={disabled}
                onChange={() => onToggle(account.id, account.name)}
              />
              <span
                className="truncate"
                title={account.name}
                style={{ flex: 1 }}
              >
                {account.name}
              </span>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontSize: '0.74rem',
                  color: '#A39BB3',
                }}
              >
                {account.accountCode}
              </span>
              {account.status !== 'ACTIVE' && (
                <span style={{ fontSize: '0.72rem', color: '#DC2626' }}>
                  {account.status}
                </span>
              )}
            </label>
          ))
        )}
      </div>
    </div>
  )
}
