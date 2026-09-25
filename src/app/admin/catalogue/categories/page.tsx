// src/app/admin/catalogue/categories/page.tsx
'use client'

import { SkeletonTable, SkeletonList } from '@/components/ui/Skeleton'
import React, { useState } from 'react'
import { Globe, Layers, Lock, Pencil, Plus, PowerOff } from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { StatusPill } from '@/components/admin/StatusPill'
import { Modal } from '@/components/ui/Modal'
import {
  ActionButton,
  AdminCard,
  ConfirmModal,
  Field,
  Notice,
  ReadOnlyNotice,
  SelectInput,
  StateBlock,
  TextArea,
  TextInput,
} from '@/components/admin/ProductAdminUi'
import { errorMessage } from '@/components/admin/ProductAdminUtils'
import { AccountPicker } from '@/components/admin/ProductVisibilityPanel'
import { useAuth } from '@/hooks/useAuth'
import {
  useCatalogCategories,
  useCategoryMutations,
  useCategoryVisibility,
} from '@/hooks/useProducts'
import type {
  CatalogCategory,
  CatalogCategoryStatus,
  CatalogVisibility,
  UpdateCategoryInput,
} from '@/types/catalog-admin'

const MAX_ACCOUNTS = 500

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

function parseSortOrder(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const value = Number(text)
  return value <= 9999 ? value : null
}

/** The message for a sort order the API would refuse, or null when it is fine. */
function sortOrderError(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return 'Sort order must be 0 or higher.'
  if (!/^\d+$/.test(trimmed)) return 'Sort order must be 0 or higher.'
  return Number(trimmed) > 9999 ? 'Sort order must be 9999 or lower.' : null
}

/** The message for a category code the API would refuse, or null when it is fine. */
function codeError(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return 'Enter a category code.'
  if (trimmed.length < 2 || trimmed.length > 48) {
    return 'A code is 2 to 48 characters long.'
  }
  return CODE_PATTERN.test(trimmed)
    ? null
    : 'Category code uses capitals, digits and dashes, like POS-SIGNS.'
}

export default function CategoriesPage() {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('CATALOG_MANAGE')

  const [statusFilter, setStatusFilter] = useState<
    CatalogCategoryStatus | 'ALL'
  >('ALL')
  const [hideEmpty, setHideEmpty] = useState(false)
  const [visibilityFilter, setVisibilityFilter] = useState<
    CatalogVisibility | 'ALL'
  >('ALL')

  const { categories, isLoading, error, refetch } = useCatalogCategories({
    ...(statusFilter !== 'ALL' ? { status: statusFilter } : {}),
    ...(hideEmpty ? { includeEmpty: false } : {}),
    ...(visibilityFilter !== 'ALL' ? { visibility: visibilityFilter } : {}),
  })
  const { create, deactivate } = useCategoryMutations()

  const [isAdding, setIsAdding] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [description, setDescription] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  /** The server's refusal; everything this form can see belongs to its field. */
  const [createError, setCreateError] = useState<string | null>(null)
  const [createErrors, setCreateErrors] = useState<{
    name?: string
    code?: string
    sortOrder?: string
  }>({})

  const [editing, setEditing] = useState<CatalogCategory | null>(null)
  const [restricting, setRestricting] = useState<CatalogCategory | null>(null)
  const [deactivating, setDeactivating] = useState<CatalogCategory | null>(null)
  const [deactivateError, setDeactivateError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    const trimmedCode = code.trim()

    // Checked in one pass: three empty boxes are reported together, not one
    // refusal at a time.
    const found: typeof createErrors = {}
    if (!name.trim()) found.name = 'Enter a category name.'
    const codeProblem = codeError(trimmedCode)
    if (codeProblem) found.code = codeProblem
    const orderProblem = sortOrderError(sortOrder || '0')
    if (orderProblem) found.sortOrder = orderProblem
    setCreateErrors(found)
    if (Object.values(found).some(Boolean)) return

    const order = parseSortOrder(sortOrder || '0') ?? 0

    try {
      await create.mutateAsync({
        code: trimmedCode.toUpperCase(),
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        sortOrder: order,
      })
      setName('')
      setCode('')
      setDescription('')
      setSortOrder('0')
      setCreateErrors({})
      setIsAdding(false)
      setNotice(`Category ${trimmedCode.toUpperCase()} created.`)
    } catch (err) {
      setCreateError(errorMessage(err, 'The category could not be created.'))
    }
  }

  const confirmDeactivate = async () => {
    if (!deactivating) return
    setDeactivateError(null)
    try {
      await deactivate.mutateAsync(deactivating.id)
      setNotice(`${deactivating.name} was deactivated.`)
      setDeactivating(null)
    } catch (err) {
      setDeactivateError(
        errorMessage(err, 'The category could not be deactivated.')
      )
    }
  }

  return (
    <>
      <AdminHeader
        title="Catalogue Categories"
        subtitle="Organize collateral types, packaging groups, and visibility classifications"
        actionButton={
          canManage ? (
            <ActionButton
              variant="primary"
              icon={<Plus size={16} />}
              onClick={() => {
                setIsAdding(!isAdding)
                setCreateError(null)
                setCreateErrors({})
              }}
            >
              {isAdding ? 'Cancel' : 'New Category'}
            </ActionButton>
          ) : undefined
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
        {!canManage && (
          <ReadOnlyNotice>
            Creating and editing categories needs the Catalog Manage permission.
          </ReadOnlyNotice>
        )}

        {notice && <Notice tone="success">{notice}</Notice>}

        {canManage && isAdding && (
          <form noValidate onSubmit={handleCreate}>
            <AdminCard>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  color: '#2B253E',
                }}
              >
                Add New Product Category
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '14px',
                }}
              >
                <Field
                  label="Category Name *"
                  htmlFor="category-name"
                  error={createErrors.name}
                >
                  <TextInput
                    id="category-name"
                    maxLength={120}
                    placeholder="e.g. Clinical Infusion Supplies"
                    value={name}
                    disabled={create.isPending}
                    invalid={Boolean(createErrors.name)}
                    aria-describedby={
                      createErrors.name ? 'category-name-error' : undefined
                    }
                    onChange={(e) => {
                      setName(e.target.value)
                      setCreateErrors((previous) => ({
                        ...previous,
                        name: undefined,
                      }))
                    }}
                  />
                </Field>
                <Field
                  label="Category Code *"
                  htmlFor="category-code"
                  hint="Used in import files; cannot be changed later."
                  error={createErrors.code}
                >
                  <TextInput
                    id="category-code"
                    maxLength={48}
                    placeholder="e.g. POS-SIGNS"
                    value={code}
                    disabled={create.isPending}
                    invalid={Boolean(createErrors.code)}
                    aria-describedby={
                      createErrors.code ? 'category-code-error' : undefined
                    }
                    style={{ fontFamily: 'monospace' }}
                    onChange={(e) => {
                      setCode(e.target.value.toUpperCase())
                      setCreateErrors((previous) => ({
                        ...previous,
                        code: undefined,
                      }))
                    }}
                  />
                </Field>
                <Field
                  label="Sort Order"
                  htmlFor="category-sort-order"
                  hint="Lower numbers come first in the catalogue."
                  error={createErrors.sortOrder}
                >
                  <TextInput
                    id="category-sort-order"
                    type="number"
                    step={1}
                    placeholder="e.g. 10"
                    value={sortOrder}
                    disabled={create.isPending}
                    invalid={Boolean(createErrors.sortOrder)}
                    aria-describedby={
                      createErrors.sortOrder
                        ? 'category-sort-order-error'
                        : undefined
                    }
                    onChange={(e) => {
                      setSortOrder(e.target.value)
                      setCreateErrors((previous) => ({
                        ...previous,
                        sortOrder: undefined,
                      }))
                    }}
                  />
                </Field>
              </div>
              <Field label="Description">
                <TextArea
                  rows={2}
                  maxLength={1000}
                  placeholder="e.g. Printed signage and posters for in-store campaigns"
                  value={description}
                  disabled={create.isPending}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </Field>
              {createError && <Notice tone="error">{createError}</Notice>}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '8px',
                }}
              >
                <ActionButton
                  onClick={() => setIsAdding(false)}
                  disabled={create.isPending}
                >
                  Cancel
                </ActionButton>
                <ActionButton
                  type="submit"
                  variant="primary"
                  pending={create.isPending}
                  pendingLabel="Saving…"
                >
                  Create Category
                </ActionButton>
              </div>
            </AdminCard>
          </form>
        )}

        {/* Filters */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '14px',
            boxShadow:
              '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
            padding: '14px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            border: '1px solid #F0E6EC',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{ fontSize: '0.78rem', color: '#6E6781', fontWeight: 500 }}
            >
              Status:
            </span>
            <SelectInput
              value={statusFilter}
              style={{ width: 'auto' }}
              onChange={(e) =>
                setStatusFilter(e.target.value as CatalogCategoryStatus | 'ALL')
              }
            >
              <option value="ALL">All statuses</option>
              <option value="ACTIVE">Active only</option>
              <option value="INACTIVE">Inactive only</option>
            </SelectInput>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              style={{ fontSize: '0.78rem', color: '#6E6781', fontWeight: 500 }}
            >
              Visibility:
            </span>
            <SelectInput
              value={visibilityFilter}
              style={{ width: 'auto' }}
              onChange={(e) =>
                setVisibilityFilter(e.target.value as CatalogVisibility | 'ALL')
              }
            >
              <option value="ALL">All</option>
              <option value="ALL_ACCOUNTS">All accounts</option>
              <option value="RESTRICTED">Restricted</option>
            </SelectInput>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '0.8rem',
              color: '#2B253E',
            }}
          >
            <input
              type="checkbox"
              checked={hideEmpty}
              onChange={(e) => setHideEmpty(e.target.checked)}
            />
            Only categories with active products
          </label>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: '0.78rem',
              color: '#A39BB3',
            }}
          >
            {isLoading
              ? ''
              : `${categories.length} categor${categories.length === 1 ? 'y' : 'ies'}`}
          </span>
        </div>

        {isLoading ? (
          <AdminCard>
            <SkeletonTable rows={6} columns={5} label="Loading categories" />
          </AdminCard>
        ) : error ? (
          <AdminCard>
            <StateBlock
              tone="error"
              title="Categories could not be loaded"
              description={errorMessage(error, 'Try again in a moment.')}
            />
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <ActionButton onClick={() => void refetch()}>Retry</ActionButton>
            </div>
          </AdminCard>
        ) : categories.length === 0 ? (
          <AdminCard>
            <StateBlock
              icon={<Layers size={20} color="#DCD3E0" />}
              title="No categories match"
              description={
                statusFilter !== 'ALL' ||
                hideEmpty ||
                visibilityFilter !== 'ALL'
                  ? 'Try clearing the filters.'
                  : 'Create the first category to start organising the catalogue.'
              }
            />
          </AdminCard>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '16px',
            }}
          >
            {categories.map((cat) => (
              <div
                key={cat.id}
                style={{
                  backgroundColor: '#FFFFFF',
                  borderRadius: '14px',
                  boxShadow:
                    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
                  padding: '20px',
                  border: '1px solid #F0E6EC',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: '14px',
                  opacity: cat.status === 'INACTIVE' ? 0.8 : 1,
                }}
              >
                <div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '8px',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        minWidth: 0,
                      }}
                    >
                      <Layers size={16} color="#A39BB3" />
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: '0.95rem',
                          color: '#2B253E',
                          overflowWrap: 'anywhere',
                        }}
                      >
                        {cat.name}
                      </div>
                    </div>
                    <StatusPill status={cat.status} size="sm" />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      gap: '8px',
                      alignItems: 'center',
                      marginTop: '8px',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        backgroundColor: '#F5EEF2',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        color: '#5C566E',
                      }}
                    >
                      {cat.code}
                    </span>
                    <span style={{ fontSize: '0.74rem', color: '#A39BB3' }}>
                      Sort {cat.sortOrder}
                    </span>
                    <VisibilityBadge visibility={cat.visibility} />
                  </div>
                  <p
                    style={{
                      fontSize: '0.8rem',
                      color: cat.description ? '#6E6781' : '#A39BB3',
                      margin: '8px 0 0',
                      lineHeight: 1.4,
                    }}
                  >
                    {cat.description || 'No description.'}
                  </p>
                </div>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    borderTop: '1px solid #F5EEF2',
                    paddingTop: '12px',
                    fontSize: '0.78rem',
                    gap: '8px',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    <span style={{ color: '#A39BB3' }}>Catalogue Items: </span>
                    <span style={{ fontWeight: 600, color: '#2B253E' }}>
                      {cat.itemCount} SKUs
                    </span>
                  </span>
                  {canManage && (
                    <div
                      style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}
                    >
                      <ActionButton
                        size="sm"
                        icon={
                          cat.visibility === 'RESTRICTED' ? (
                            <Lock size={13} />
                          ) : (
                            <Globe size={13} />
                          )
                        }
                        onClick={() => {
                          setNotice(null)
                          setRestricting(cat)
                        }}
                      >
                        Visibility
                      </ActionButton>
                      <ActionButton
                        size="sm"
                        icon={<Pencil size={13} />}
                        onClick={() => {
                          setNotice(null)
                          setEditing(cat)
                        }}
                      >
                        Edit
                      </ActionButton>
                      <ActionButton
                        size="sm"
                        variant="danger"
                        icon={<PowerOff size={13} />}
                        onClick={() => {
                          setNotice(null)
                          setDeactivateError(null)
                          setDeactivating(cat)
                        }}
                      >
                        Deactivate
                      </ActionButton>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {editing && (
        <EditCategoryDialog
          category={editing}
          onClose={() => setEditing(null)}
          onSaved={(saved) => {
            setEditing(null)
            setNotice(`${saved.name} was updated.`)
          }}
        />
      )}

      {restricting && (
        <CategoryVisibilityDialog
          category={restricting}
          onClose={() => setRestricting(null)}
          onSaved={(saved) => {
            setRestricting(null)
            setNotice(
              saved.visibility === 'RESTRICTED'
                ? `${saved.name} is now restricted to the selected accounts.`
                : `${saved.name} is visible to all accounts.`
            )
          }}
        />
      )}

      <ConfirmModal
        isOpen={deactivating !== null}
        title="Deactivate category"
        message={
          <>
            Deactivate <strong>{deactivating?.name}</strong> (
            {deactivating?.code})? It is removed from the catalogue and its code
            cannot be reused. To hide it temporarily instead, edit it and set
            its status to Inactive.
          </>
        }
        confirmLabel="Deactivate"
        pendingLabel="Deactivating…"
        pending={deactivate.isPending}
        error={deactivateError}
        onConfirm={() => void confirmDeactivate()}
        onCancel={() => setDeactivating(null)}
      >
        {deactivating && deactivating.itemCount > 0 && (
          <Notice tone="warning">
            {deactivating.itemCount} product(s) still use this category. The
            server refuses to deactivate it until they are moved or deleted.
          </Notice>
        )}
      </ConfirmModal>
    </>
  )
}

function EditCategoryDialog({
  category,
  onClose,
  onSaved,
}: {
  category: CatalogCategory
  onClose: () => void
  onSaved: (category: CatalogCategory) => void
}) {
  const { update } = useCategoryMutations()
  const [name, setName] = useState(category.name)
  const [description, setDescription] = useState(category.description ?? '')
  const [sortOrder, setSortOrder] = useState(String(category.sortOrder))
  const [status, setStatus] = useState<CatalogCategoryStatus>(category.status)
  /** The server's refusal; everything this form can see belongs to its field. */
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<{ name?: string; sortOrder?: string }>(
    {}
  )
  const pending = update.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const trimmedName = name.trim()
    const found: typeof errors = {}
    if (!trimmedName) found.name = 'Enter a category name.'
    const orderProblem = sortOrderError(sortOrder)
    if (orderProblem) found.sortOrder = orderProblem
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    const input: UpdateCategoryInput = {}
    if (trimmedName !== category.name) input.name = trimmedName

    const trimmedDescription = description.trim()
    if (trimmedDescription !== (category.description ?? '')) {
      // Empty clears it: the API takes null as "remove the description".
      input.description = trimmedDescription ? trimmedDescription : null
    }

    const order = parseSortOrder(sortOrder) ?? category.sortOrder
    if (order !== category.sortOrder) input.sortOrder = order
    if (status !== category.status) input.status = status

    if (Object.keys(input).length === 0) {
      setError('Nothing has changed.')
      return
    }

    try {
      const saved = await update.mutateAsync({ id: category.id, input })
      onSaved(saved)
    } catch (err) {
      setError(errorMessage(err, 'The category could not be saved.'))
    }
  }

  return (
    <Modal
      isOpen
      onClose={pending ? () => undefined : onClose}
      title={`Edit ${category.code}`}
      maxWidth="520px"
    >
      <form
        noValidate
        onSubmit={submit}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <Field label="Name *" htmlFor="edit-category-name" error={errors.name}>
          <TextInput
            id="edit-category-name"
            maxLength={120}
            value={name}
            disabled={pending}
            invalid={Boolean(errors.name)}
            aria-describedby={
              errors.name ? 'edit-category-name-error' : undefined
            }
            onChange={(e) => {
              setName(e.target.value)
              setErrors((previous) => ({ ...previous, name: undefined }))
            }}
          />
        </Field>
        <Field label="Description" hint="Leave empty to clear it.">
          <TextArea
            rows={3}
            maxLength={1000}
            placeholder="e.g. Printed signage and posters for in-store campaigns"
            value={description}
            disabled={pending}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
          }}
        >
          <Field
            label="Sort order"
            htmlFor="edit-category-sort-order"
            hint="Lower numbers come first in the catalogue."
            error={errors.sortOrder}
          >
            <TextInput
              id="edit-category-sort-order"
              type="number"
              step={1}
              placeholder="e.g. 10"
              value={sortOrder}
              disabled={pending}
              invalid={Boolean(errors.sortOrder)}
              aria-describedby={
                errors.sortOrder ? 'edit-category-sort-order-error' : undefined
              }
              onChange={(e) => {
                setSortOrder(e.target.value)
                setErrors((previous) => ({
                  ...previous,
                  sortOrder: undefined,
                }))
              }}
            />
          </Field>
          <Field
            label="Status"
            hint="Inactive keeps the category and its code, hidden from use."
          >
            <SelectInput
              value={status}
              disabled={pending}
              onChange={(e) =>
                setStatus(e.target.value as CatalogCategoryStatus)
              }
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </SelectInput>
          </Field>
        </div>
        <div style={{ fontSize: '0.76rem', color: '#A39BB3' }}>
          The code ({category.code}) cannot be changed: it appears in import
          files and saved links.
        </div>

        {error && <Notice tone="error">{error}</Notice>}

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <ActionButton onClick={onClose} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton
            type="submit"
            variant="primary"
            pending={pending}
            pendingLabel="Saving…"
          >
            Save changes
          </ActionButton>
        </div>
      </form>
    </Modal>
  )
}

function VisibilityBadge({ visibility }: { visibility: CatalogVisibility }) {
  const restricted = visibility === 'RESTRICTED'
  return (
    <span
      title={
        restricted
          ? 'Only the accounts on its allow-list see this category and its products'
          : 'Every account sees this category'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '0.7rem',
        fontWeight: 600,
        padding: '2px 8px',
        borderRadius: '9999px',
        backgroundColor: restricted ? '#FDE8F1' : '#F5EEF2',
        color: restricted ? '#F73582' : '#5C566E',
      }}
    >
      {restricted ? <Lock size={11} /> : <Globe size={11} />}
      {restricted ? 'Restricted' : 'All accounts'}
    </span>
  )
}

/**
 * Who may see a category, and so every product in it.
 *
 * Pre-filled from the stored allow-list — kept even while the category is
 * unrestricted — so saving never silently drops accounts nobody re-ticked.
 * A product's own visibility still applies inside a restricted category.
 */
function CategoryVisibilityDialog({
  category,
  onClose,
  onSaved,
}: {
  category: CatalogCategory
  onClose: () => void
  onSaved: (category: CatalogCategory) => void
}) {
  const { setVisibility } = useCategoryMutations()
  const stored = useCategoryVisibility(category.id)
  const [mode, setMode] = useState<CatalogVisibility>(category.visibility)
  const [selected, setSelected] = useState<Map<string, string>>(new Map())
  const [seeded, setSeeded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = setVisibility.isPending

  // Once, when the stored list arrives; after that the selection is the user's.
  // Adjusted during render rather than in an effect, so the picker never paints
  // an empty selection first.
  if (!seeded && stored.data) {
    setSeeded(true)
    setSelected(new Map(stored.data.accounts.map((a) => [a.id, a.name])))
  }

  const toggle = (id: string, name: string) => {
    setError(null)
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(id)) next.delete(id)
      else next.set(id, name)
      return next
    })
  }

  const persist = async () => {
    setError(null)
    try {
      const saved = await setVisibility.mutateAsync({
        id: category.id,
        input: { visibility: mode, accountIds: [...selected.keys()] },
      })
      onSaved(saved)
    } catch (err) {
      setError(errorMessage(err, 'Visibility could not be saved.'))
    }
  }

  const save = () => {
    if (mode === 'RESTRICTED') {
      if (selected.size === 0) {
        setError(
          'Select at least one account, or no customer will see this category.'
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

  const noChange =
    mode === 'ALL_ACCOUNTS' && category.visibility === 'ALL_ACCOUNTS'

  return (
    <Modal
      isOpen
      onClose={pending ? () => undefined : onClose}
      title={`Visibility — ${category.name}`}
      maxWidth="620px"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div style={{ fontSize: '0.8rem', color: '#6E6781', lineHeight: 1.5 }}>
          A restricted category is hidden, with all {category.itemCount} of its
          products, from every account not on its allow-list. Products that are
          themselves restricted stay restricted inside it.
        </div>

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
                  name="category-visibility"
                  value={option.value}
                  checked={active}
                  disabled={pending}
                  onChange={() => {
                    setMode(option.value)
                    setError(null)
                  }}
                />
                {option.icon}
                {option.label}
              </label>
            )
          })}
        </div>

        {mode === 'RESTRICTED' &&
          (stored.isLoading ? (
            <SkeletonList
              count={3}
              avatar={false}
              label="Loading the current allow-list"
            />
          ) : stored.error ? (
            <Notice tone="error">
              {errorMessage(
                stored.error,
                'The current allow-list could not be loaded, so saving now could remove accounts from it. Close and try again.'
              )}
            </Notice>
          ) : (
            <AccountPicker
              selected={selected}
              disabled={pending}
              onToggle={toggle}
            />
          ))}

        {mode === 'ALL_ACCOUNTS' && category.visibility === 'RESTRICTED' && (
          <Notice tone="info">
            Lifting the restriction keeps the stored allow-list, so it can be
            reinstated later.
          </Notice>
        )}

        {error && !confirming && <Notice tone="error">{error}</Notice>}

        <div
          style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}
        >
          <ActionButton onClick={onClose} disabled={pending}>
            Cancel
          </ActionButton>
          <ActionButton
            variant="primary"
            pending={pending}
            pendingLabel="Saving…"
            disabled={
              noChange ||
              (mode === 'RESTRICTED' && (stored.isLoading || !!stored.error))
            }
            onClick={save}
          >
            Save visibility
          </ActionButton>
        </div>
      </div>

      <ConfirmModal
        isOpen={confirming}
        title="Restrict category visibility"
        tone="primary"
        message={
          <>
            Only the <strong>{selected.size}</strong> selected account(s) will
            see <strong>{category.name}</strong> and its products. Any other
            account can no longer see or order them, even from a saved cart.
          </>
        }
        confirmLabel="Save allow-list"
        pendingLabel="Saving…"
        pending={pending}
        error={confirming ? error : null}
        onConfirm={() => void persist()}
        onCancel={() => setConfirming(false)}
      />
    </Modal>
  )
}
