// src/components/admin/ProductLifecycleActions.tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Archive, Replace, RotateCcw, Send, Trash2 } from 'lucide-react'
import { useProductAdminMutations, useProducts } from '@/hooks/useProducts'
import type { Product } from '@/types'
import type { AdminProductView } from '@/types/catalog-admin'
import {
  ActionButton,
  ConfirmModal,
  Field,
  Notice,
  SelectInput,
  TextArea,
  TextInput,
} from './ProductAdminUi'
import { errorMessage } from './ProductAdminUtils'

type Dialog = 'publish' | 'unavailable' | 'reactivate' | 'supersede' | 'delete'

/** The list endpoint's largest page (`ListProductsQuerySchema`). */
const SUCCESSOR_PAGE_SIZE = 100

/**
 * Status changes for one product, following the server's transition table:
 *
 *   DRAFT ──► ACTIVE ◄──► UNAVAILABLE
 *               └─────┬──────┘
 *                     ▼
 *                SUPERSEDED (terminal, names its replacement)
 *
 * "Archive" is UNAVAILABLE, not DELETE: the API only deletes drafts, because a
 * published product is referenced by orders and invoices. Delete is offered on
 * drafts alone.
 */
export function ProductLifecycleActions({
  view,
  canManage,
  onDeleted,
}: {
  view: AdminProductView
  canManage: boolean
  onDeleted: () => void
}) {
  const { changeStatus, deleteDraft } = useProductAdminMutations(view.id)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [reason, setReason] = useState('')
  const [successorId, setSuccessorId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const open = (next: Dialog) => {
    setDialog(next)
    setReason('')
    setSuccessorId('')
    setError(null)
  }
  const close = () => setDialog(null)

  const pending = changeStatus.isPending || deleteDraft.isPending

  const runStatus = async (status: 'ACTIVE' | 'UNAVAILABLE' | 'SUPERSEDED') => {
    setError(null)
    try {
      await changeStatus.mutateAsync({
        status,
        ...(status === 'SUPERSEDED' ? { supersededById: successorId } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      })
      close()
    } catch (err) {
      setError(errorMessage(err, 'The status could not be changed.'))
    }
  }

  const runDelete = async () => {
    setError(null)
    try {
      await deleteDraft.mutateAsync()
      close()
      onDeleted()
    } catch (err) {
      setError(errorMessage(err, 'The draft could not be deleted.'))
    }
  }

  const hasOptionsWithoutVariants =
    view.options.length > 0 &&
    !view.variants.some((variant) => variant.status === 'ACTIVE')

  const reasonField = (
    <Field label="Reason (optional, recorded in the audit trail)">
      <TextArea
        rows={2}
        maxLength={500}
        value={reason}
        disabled={pending}
        onChange={(e) => setReason(e.target.value)}
      />
    </Field>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {view.supersededBy && (
        <Notice tone="info">
          Superseded by{' '}
          <Link
            href={`/admin/catalogue/products/${view.supersededBy.id}`}
            style={{ color: '#F73582', fontWeight: 600 }}
          >
            {view.supersededBy.name} ({view.supersededBy.sku})
          </Link>
          . A superseded product cannot change status again.
        </Notice>
      )}

      {canManage && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {view.status === 'DRAFT' && (
            <>
              <ActionButton
                variant="primary"
                icon={<Send size={15} />}
                onClick={() => open('publish')}
              >
                Publish
              </ActionButton>
              <ActionButton
                variant="danger"
                icon={<Trash2 size={15} />}
                onClick={() => open('delete')}
              >
                Delete draft
              </ActionButton>
            </>
          )}

          {view.status === 'ACTIVE' && (
            <ActionButton
              variant="danger"
              icon={<Archive size={15} />}
              onClick={() => open('unavailable')}
              title="Mark unavailable: hidden from ordering, kept for order history"
            >
              Archive (mark unavailable)
            </ActionButton>
          )}

          {view.status === 'UNAVAILABLE' && (
            <ActionButton
              variant="primary"
              icon={<RotateCcw size={15} />}
              onClick={() => open('reactivate')}
            >
              Reactivate
            </ActionButton>
          )}

          {(view.status === 'ACTIVE' || view.status === 'UNAVAILABLE') && (
            <ActionButton
              icon={<Replace size={15} />}
              onClick={() => open('supersede')}
            >
              Supersede…
            </ActionButton>
          )}
        </div>
      )}

      <ConfirmModal
        isOpen={dialog === 'publish'}
        title="Publish product"
        tone="primary"
        message={
          <>
            <strong>{view.name}</strong> becomes orderable by every account that
            can see it. A published product can be archived later but never
            returns to draft.
          </>
        }
        confirmLabel="Publish"
        pendingLabel="Publishing…"
        pending={pending}
        error={error}
        onConfirm={() => void runStatus('ACTIVE')}
        onCancel={close}
      >
        {hasOptionsWithoutVariants && (
          <Notice tone="warning">
            This product defines options but has no active variants, so the
            server will refuse to publish it. Add a variant first.
          </Notice>
        )}
        {reasonField}
      </ConfirmModal>

      <ConfirmModal
        isOpen={dialog === 'unavailable'}
        title="Archive product"
        message={
          <>
            <strong>{view.name}</strong> will be marked <em>unavailable</em>:
            buyers can no longer order it, and existing orders and invoices keep
            referencing it. You can reactivate it at any time.
          </>
        }
        confirmLabel="Mark unavailable"
        pendingLabel="Archiving…"
        pending={pending}
        error={error}
        onConfirm={() => void runStatus('UNAVAILABLE')}
        onCancel={close}
      >
        {reasonField}
      </ConfirmModal>

      <ConfirmModal
        isOpen={dialog === 'reactivate'}
        title="Reactivate product"
        tone="primary"
        message={
          <>
            <strong>{view.name}</strong> becomes orderable again.
          </>
        }
        confirmLabel="Reactivate"
        pendingLabel="Reactivating…"
        pending={pending}
        error={error}
        onConfirm={() => void runStatus('ACTIVE')}
        onCancel={close}
      >
        {reasonField}
      </ConfirmModal>

      <ConfirmModal
        isOpen={dialog === 'supersede'}
        title="Supersede product"
        message={
          <>
            Superseding is <strong>permanent</strong>. {view.name} stops being
            orderable and re-orders are sent to the replacement you choose.
          </>
        }
        confirmLabel="Supersede"
        pendingLabel="Superseding…"
        pending={pending}
        error={error}
        confirmDisabled={!successorId}
        onConfirm={() => void runStatus('SUPERSEDED')}
        onCancel={close}
      >
        {dialog === 'supersede' && (
          <SuccessorPicker
            excludeId={view.id}
            value={successorId}
            disabled={pending}
            onChange={setSuccessorId}
          />
        )}
        {reasonField}
      </ConfirmModal>

      <ConfirmModal
        isOpen={dialog === 'delete'}
        title="Delete draft"
        message={
          <>
            Delete the draft <strong>{view.name}</strong> ({view.sku})? Only
            drafts can be deleted, because nobody has been able to order them.
          </>
        }
        confirmLabel="Delete draft"
        pendingLabel="Deleting…"
        pending={pending}
        error={error}
        onConfirm={() => void runDelete()}
        onCancel={close}
      />
    </div>
  )
}

/**
 * The replacement product. Only ACTIVE or UNAVAILABLE products qualify — the
 * server refuses a draft or an already-superseded one. Mounted only while the
 * dialog is open, so the search does not run on every product page load.
 */
function SuccessorPicker({
  excludeId,
  value,
  disabled,
  onChange,
}: {
  excludeId: string
  value: string
  disabled: boolean
  onChange: (id: string) => void
}) {
  // What is typed, and the search actually sent once typing pauses — one pair
  // of requests per pause rather than per keystroke.
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<Product | null>(null)
  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  // One request per qualifying status: the list endpoint filters on a single
  // status, and filtering a mixed page in the browser hid every valid
  // successor past that page. No thumbnails — the picker shows names only.
  const listParams = {
    search: query || undefined,
    pageSize: SUCCESSOR_PAGE_SIZE,
    withThumbnails: false,
  }
  const active = useProducts({ ...listParams, status: 'ACTIVE' })
  const unavailable = useProducts({ ...listParams, status: 'UNAVAILABLE' })

  const candidates = [
    ...(active.data?.items ?? []),
    ...(unavailable.data?.items ?? []),
  ].filter((product) => product.id !== excludeId)
  // The chosen product stays listed after the search moves on; otherwise the
  // select reads "Select a product…" over a selection that is still live.
  const options =
    chosen &&
    chosen.id === value &&
    !candidates.some((product) => product.id === chosen.id)
      ? [chosen, ...candidates]
      : candidates

  const isSearching =
    active.isLoading || unavailable.isLoading || search.trim() !== query
  const error = active.error ?? unavailable.error
  const isPartial = [active.data, unavailable.data].some(
    (page) => page !== null && page.total > page.items.length
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <Field label="Find the replacement product">
        <TextInput
          type="search"
          placeholder="Search by name or SKU…"
          value={search}
          maxLength={120}
          disabled={disabled}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Field>
      <Field
        label="Replacement *"
        hint={
          isSearching
            ? 'Searching…'
            : error
              ? errorMessage(error, 'Products could not be loaded.')
              : candidates.length === 0
                ? query
                  ? `No active or unavailable products match "${query}".`
                  : 'There are no active or unavailable products to choose from.'
                : isPartial
                  ? `Showing the first ${SUCCESSOR_PAGE_SIZE} active and ${SUCCESSOR_PAGE_SIZE} unavailable products; search to narrow the list.`
                  : undefined
        }
      >
        <SelectInput
          value={value}
          disabled={disabled || options.length === 0}
          onChange={(e) => {
            setChosen(
              options.find((product) => product.id === e.target.value) ?? null
            )
            onChange(e.target.value)
          }}
        >
          <option value="">Select a product…</option>
          {options.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name} — {product.sku} ({product.status})
            </option>
          ))}
        </SelectInput>
      </Field>
    </div>
  )
}
