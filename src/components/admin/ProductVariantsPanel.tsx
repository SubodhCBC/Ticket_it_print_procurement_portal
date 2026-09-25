// src/components/admin/ProductVariantsPanel.tsx
'use client'

import { useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { StatusPill } from '@/components/admin/StatusPill'
import { useProductAdminMutations } from '@/hooks/useProducts'
import type {
  AdminProductVariant,
  AdminProductView,
  CatalogVariantStatus,
  UpdateVariantInput,
} from '@/types/catalog-admin'
import {
  ActionButton,
  AdminCard,
  AdminTable,
  ConfirmModal,
  Field,
  Notice,
  ReadOnlyNotice,
  SectionHeading,
  SelectInput,
  StateBlock,
  Td,
  Th,
  TextInput,
} from './ProductAdminUi'
import { errorMessage, formatMoney, MONEY_PATTERN } from './ProductAdminUtils'
import { ProductOptionAxesEditor } from './ProductOptionAxesEditor'

const SKU_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/

function sameAttributes(
  a: Record<string, string>,
  b: Record<string, string>
): boolean {
  const keys = Object.keys(a)
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => a[key] === b[key])
  )
}

/**
 * Option axes and the variants built on them. Deleting a variant is soft on
 * the server: order lines keep its SKU.
 */
export function ProductVariantsPanel({
  view,
  canManage,
}: {
  view: AdminProductView
  canManage: boolean
}) {
  const { removeVariant } = useProductAdminMutations(view.id)
  const [isAdding, setIsAdding] = useState(false)
  const [editing, setEditing] = useState<AdminProductVariant | null>(null)
  const [deleting, setDeleting] = useState<AdminProductVariant | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const optionsKey = view.options
    .map((option) => `${option.name}=${option.values.join(',')}`)
    .join(';')

  const confirmDelete = async () => {
    if (!deleting) return
    setDeleteError(null)
    try {
      await removeVariant.mutateAsync(deleting.id)
      setDeleting(null)
    } catch (err) {
      setDeleteError(errorMessage(err, 'The variant could not be deleted.'))
    }
  }

  return (
    <AdminCard>
      {!canManage && (
        <ReadOnlyNotice>
          Editing options and variants needs the Catalog Manage permission.
        </ReadOnlyNotice>
      )}

      <ProductOptionAxesEditor
        key={optionsKey}
        view={view}
        canManage={canManage}
      />

      <div style={{ borderTop: '1px solid #F5EEF2', paddingTop: '16px' }}>
        <SectionHeading
          title="Variants"
          description="Each orderable combination of option values, with its own SKU and optional price override."
          action={
            canManage && (
              <ActionButton
                variant="primary"
                icon={<Plus size={15} />}
                disabled={view.options.length === 0}
                title={
                  view.options.length === 0
                    ? 'Define option axes first'
                    : undefined
                }
                onClick={() => setIsAdding(true)}
              >
                Add variant
              </ActionButton>
            )
          }
        />
      </div>

      {view.variants.length === 0 ? (
        <StateBlock
          title="No variants"
          description={
            view.options.length === 0
              ? 'Add option axes above, then a variant for each combination you sell.'
              : 'This product has options but no variants, so it cannot be published or ordered yet.'
          }
        />
      ) : (
        <AdminTable
          head={
            <>
              <Th first>SKU</Th>
              <Th>Attributes</Th>
              <Th align="right">Price override</Th>
              <Th align="right">Effective price</Th>
              <Th>Status</Th>
              {canManage && <Th align="right">Actions</Th>}
            </>
          }
        >
          {view.variants.map((variant) => (
            <tr key={variant.id} style={{ borderTop: '1px solid #F5EEF2' }}>
              <Td first mono>
                {variant.sku}
              </Td>
              <Td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {Object.entries(variant.attributes).map(([name, value]) => (
                    <span
                      key={name}
                      style={{
                        fontSize: '0.72rem',
                        padding: '2px 8px',
                        borderRadius: '9999px',
                        backgroundColor: '#F5EEF2',
                        color: '#5C566E',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {name}: <strong>{value}</strong>
                    </span>
                  ))}
                </div>
              </Td>
              <Td align="right" style={{ color: '#6E6781' }}>
                {variant.priceOverride === null
                  ? 'Base price'
                  : formatMoney(variant.priceOverride)}
              </Td>
              <Td align="right" style={{ fontWeight: 600 }}>
                {formatMoney(variant.effectivePrice)}
              </Td>
              <Td>
                <StatusPill status={variant.status} size="sm" />
              </Td>
              {canManage && (
                <Td align="right">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: '6px',
                    }}
                  >
                    <ActionButton
                      size="sm"
                      icon={<Pencil size={13} />}
                      onClick={() => setEditing(variant)}
                    >
                      Edit
                    </ActionButton>
                    <ActionButton
                      size="sm"
                      variant="danger"
                      icon={<Trash2 size={13} />}
                      onClick={() => {
                        setDeleteError(null)
                        setDeleting(variant)
                      }}
                    >
                      Delete
                    </ActionButton>
                  </div>
                </Td>
              )}
            </tr>
          ))}
        </AdminTable>
      )}

      {isAdding && (
        <AddVariantDialog view={view} onClose={() => setIsAdding(false)} />
      )}
      {editing && (
        <EditVariantDialog
          productId={view.id}
          variant={editing}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmModal
        isOpen={deleting !== null}
        title="Delete variant"
        message={
          <>
            Delete variant <strong>{deleting?.sku}</strong>? It is deactivated
            and hidden from the catalogue; past orders keep referencing its SKU.
          </>
        }
        confirmLabel="Delete variant"
        pendingLabel="Deleting…"
        pending={removeVariant.isPending}
        error={deleteError}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleting(null)}
      />
    </AdminCard>
  )
}

function AddVariantDialog({
  view,
  onClose,
}: {
  view: AdminProductView
  onClose: () => void
}) {
  const { createVariant } = useProductAdminMutations(view.id)
  const axes = [...view.options].sort((a, b) => a.sortOrder - b.sortOrder)
  const [sku, setSku] = useState(`${view.sku}-`)
  const [attributes, setAttributes] = useState<Record<string, string>>({})
  const [priceOverride, setPriceOverride] = useState('')
  const [sortOrder, setSortOrder] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const pending = createVariant.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const code = sku.trim().toUpperCase()
    if (code.length < 2 || code.length > 64 || !SKU_PATTERN.test(code)) {
      setError(
        'SKU must be 2–64 characters: letters, digits, dot, dash, slash or underscore.'
      )
      return
    }
    const missing = axes.filter((axis) => !attributes[axis.name])
    if (missing.length > 0) {
      setError(
        `Choose a value for ${missing.map((axis) => axis.name).join(', ')}.`
      )
      return
    }
    const clash = view.variants.find((variant) =>
      sameAttributes(variant.attributes, attributes)
    )
    if (clash) {
      setError(`Variant ${clash.sku} already covers that combination.`)
      return
    }
    const price = priceOverride.trim()
    if (price && !MONEY_PATTERN.test(price)) {
      setError('Price override must be an amount such as "12.50".')
      return
    }
    const order = Number(sortOrder || 0)
    if (!Number.isInteger(order) || order < 0 || order > 9999) {
      setError('Sort order must be a whole number from 0 to 9999.')
      return
    }

    try {
      await createVariant.mutateAsync({
        sku: code,
        attributes,
        ...(price ? { priceOverride: price } : {}),
        sortOrder: order,
      })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'The variant could not be created.'))
    }
  }

  return (
    <Modal
      isOpen
      onClose={pending ? () => undefined : onClose}
      title="Add variant"
      maxWidth="560px"
    >
      <form
        onSubmit={submit}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <Field label="Variant SKU *">
          <TextInput
            value={sku}
            maxLength={64}
            disabled={pending}
            style={{ fontFamily: 'monospace' }}
            onChange={(e) => setSku(e.target.value.toUpperCase())}
          />
        </Field>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
          }}
        >
          {axes.map((axis) => (
            <Field key={axis.id} label={`${axis.name} *`}>
              <SelectInput
                value={attributes[axis.name] ?? ''}
                disabled={pending}
                onChange={(e) =>
                  setAttributes((prev) => ({
                    ...prev,
                    [axis.name]: e.target.value,
                  }))
                }
              >
                <option value="">Select…</option>
                {axis.values.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </SelectInput>
            </Field>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
          }}
        >
          <Field
            label="Price override"
            hint={`Leave blank to sell at the base price (${formatMoney(view.basePrice)}).`}
          >
            <TextInput
              inputMode="decimal"
              placeholder="e.g. 18.50"
              value={priceOverride}
              disabled={pending}
              onChange={(e) => setPriceOverride(e.target.value)}
            />
          </Field>
          <Field label="Sort order">
            <TextInput
              type="number"
              min={0}
              max={9999}
              step={1}
              value={sortOrder}
              disabled={pending}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
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
            pendingLabel="Creating…"
          >
            Create variant
          </ActionButton>
        </div>
      </form>
    </Modal>
  )
}

function EditVariantDialog({
  productId,
  variant,
  onClose,
}: {
  productId: string
  variant: AdminProductVariant
  onClose: () => void
}) {
  const { updateVariant } = useProductAdminMutations(productId)
  const [priceOverride, setPriceOverride] = useState(
    variant.priceOverride ?? ''
  )
  const [status, setStatus] = useState<CatalogVariantStatus>(
    variant.status === 'INACTIVE' ? 'INACTIVE' : 'ACTIVE'
  )
  const [sortOrder, setSortOrder] = useState('')
  const [error, setError] = useState<string | null>(null)
  const pending = updateVariant.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    const input: UpdateVariantInput = {}
    const price = priceOverride.trim()
    if (price !== (variant.priceOverride ?? '')) {
      if (price && !MONEY_PATTERN.test(price)) {
        setError('Price override must be an amount such as "12.50".')
        return
      }
      input.priceOverride = price ? price : null
    }
    if (status !== variant.status) input.status = status
    if (sortOrder.trim() !== '') {
      const order = Number(sortOrder)
      if (!Number.isInteger(order) || order < 0 || order > 9999) {
        setError('Sort order must be a whole number from 0 to 9999.')
        return
      }
      input.sortOrder = order
    }

    if (Object.keys(input).length === 0) {
      setError('Nothing has changed.')
      return
    }

    try {
      await updateVariant.mutateAsync({ variantId: variant.id, input })
      onClose()
    } catch (err) {
      setError(errorMessage(err, 'The variant could not be updated.'))
    }
  }

  return (
    <Modal
      isOpen
      onClose={pending ? () => undefined : onClose}
      title={`Edit variant ${variant.sku}`}
      maxWidth="520px"
    >
      <form
        onSubmit={submit}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        <div style={{ fontSize: '0.8rem', color: '#6E6781' }}>
          {Object.entries(variant.attributes)
            .map(([name, value]) => `${name}: ${value}`)
            .join(' · ')}
          . SKU and attributes cannot be changed; delete and re-create the
          variant instead.
        </div>

        <Field
          label="Price override"
          hint="Clear it to sell at the product's base price."
        >
          <TextInput
            inputMode="decimal"
            placeholder="Base price"
            value={priceOverride}
            disabled={pending}
            onChange={(e) => setPriceOverride(e.target.value)}
          />
        </Field>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
          }}
        >
          <Field label="Status">
            <SelectInput
              value={status}
              disabled={pending}
              onChange={(e) =>
                setStatus(e.target.value as CatalogVariantStatus)
              }
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </SelectInput>
          </Field>
          <Field
            label="Sort order"
            hint="The API does not report the current value; leave blank to keep it."
          >
            <TextInput
              type="number"
              min={0}
              max={9999}
              step={1}
              placeholder="Unchanged"
              value={sortOrder}
              disabled={pending}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </Field>
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
