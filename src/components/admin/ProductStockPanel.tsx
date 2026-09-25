// src/components/admin/ProductStockPanel.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ClipboardList, SlidersHorizontal } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { StatusPill } from '@/components/admin/StatusPill'
import { useProductAdminMutations } from '@/hooks/useProducts'
import type { AdminProductView } from '@/types/catalog-admin'
import {
  ActionButton,
  AdminCard,
  AdminTable,
  Field,
  Notice,
  ReadOnlyNotice,
  SectionHeading,
  SelectInput,
  StatTile,
  Td,
  Th,
  TextInput,
} from './ProductAdminUi'
import { errorMessage } from './ProductAdminUtils'

const REASON_SUGGESTIONS = [
  'Stock received',
  'Opening balance',
  'Damaged / written off',
  'Recount correction',
  'Returned to stock',
]

/**
 * Warehouse stock for one product: the shelf, what is promised, what is left,
 * and a signed adjustment. Absolute counts belong to the stocktake page.
 */
export function ProductStockPanel({
  view,
  canAdjust,
}: {
  view: AdminProductView
  canAdjust: boolean
}) {
  const [isAdjusting, setIsAdjusting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  return (
    <AdminCard>
      <SectionHeading
        title="Inventory"
        description="Adjustments are signed movements with a reason, recorded in the audit trail. For a physical count of many SKUs use the stocktake page."
        action={
          <>
            <Link
              href="/admin/catalogue/inventory"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                color: '#2B253E',
                fontSize: '0.82rem',
                fontWeight: 600,
                textDecoration: 'none',
                backgroundColor: '#FFFFFF',
              }}
            >
              <ClipboardList size={15} />
              Stocktake
            </Link>
            {canAdjust && (
              <ActionButton
                variant="primary"
                icon={<SlidersHorizontal size={15} />}
                disabled={!view.trackInventory}
                title={
                  view.trackInventory
                    ? undefined
                    : 'This product does not track inventory'
                }
                onClick={() => {
                  setSuccess(null)
                  setIsAdjusting(true)
                }}
              >
                Adjust stock
              </ActionButton>
            )}
          </>
        }
      />

      {!canAdjust && (
        <ReadOnlyNotice>
          Stock adjustments need the Inventory Manage permission.
        </ReadOnlyNotice>
      )}

      {!view.trackInventory && (
        <Notice tone="info">
          This product does not track inventory (for example, print on demand),
          so there is no shelf count to adjust. Turn on inventory tracking in
          Edit Attributes first.
        </Notice>
      )}

      {success && <Notice tone="success">{success}</Notice>}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '14px 20px',
        }}
      >
        <StatTile label="On hand (shelf)" value={view.stockOnHand} />
        <StatTile
          label="Reserved"
          value={view.stockReserved}
          hint="Held for placed orders"
        />
        <StatTile
          label="Available"
          value={view.availableStock}
          tone={view.availableStock === 0 ? 'danger' : 'default'}
        />
        <StatTile
          label="Low-stock threshold"
          value={view.lowStockThreshold}
          tone={view.isLowStock ? 'danger' : 'default'}
          hint={view.isLowStock ? 'At or below threshold' : 'Above threshold'}
        />
        <StatTile
          label="Reorder quantity"
          value={view.reorderQuantity ?? '—'}
        />
      </div>

      {view.variants.length > 0 && (
        <>
          <div
            style={{ fontSize: '0.84rem', fontWeight: 600, color: '#2B253E' }}
          >
            Variant stock
          </div>
          <AdminTable
            head={
              <>
                <Th first>Variant SKU</Th>
                <Th>Options</Th>
                <Th align="right">On hand</Th>
                <Th align="right">Available</Th>
                <Th>Status</Th>
              </>
            }
          >
            {view.variants.map((variant) => (
              <tr key={variant.id} style={{ borderTop: '1px solid #F5EEF2' }}>
                <Td first mono>
                  {variant.sku}
                </Td>
                <Td style={{ color: '#6E6781', fontSize: '0.8rem' }}>
                  {Object.entries(variant.attributes)
                    .map(([name, value]) => `${name}: ${value}`)
                    .join(' · ') || '—'}
                </Td>
                <Td align="right">{variant.stockOnHand}</Td>
                <Td align="right">{variant.availableStock}</Td>
                <Td>
                  <StatusPill status={variant.status} size="sm" />
                </Td>
              </tr>
            ))}
          </AdminTable>
        </>
      )}

      {isAdjusting && (
        <StockAdjustmentDialog
          view={view}
          onClose={() => setIsAdjusting(false)}
          onDone={(message) => {
            setIsAdjusting(false)
            setSuccess(message)
          }}
        />
      )}
    </AdminCard>
  )
}

function StockAdjustmentDialog({
  view,
  onClose,
  onDone,
}: {
  view: AdminProductView
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { adjustStock } = useProductAdminMutations(view.id)
  const [target, setTarget] = useState('')
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState('')
  /** The server's refusal; everything this form can see belongs to its field. */
  const [error, setError] = useState<string | null>(null)
  const [errors, setErrors] = useState<{
    quantity?: string
    reason?: string
  }>({})

  const variant = view.variants.find((v) => v.id === target)
  const current = variant ? variant.stockOnHand : view.stockOnHand
  const targetSku = variant ? variant.sku : view.sku
  // The shelf may not drop below what placed orders hold: the database refuses
  // it with a CHECK constraint, which reaches the screen as a bare 500. The
  // view carries the product's reserved figure but not a variant's (and a
  // variant's `availableStock` is clamped at zero, so it cannot be worked
  // back), so a variant is held to zero here and the server has the last word.
  const reserved = variant ? null : view.stockReserved
  const floor = reserved ?? 0

  const qty = Number(quantity)
  const qtyValid = /^\d+$/.test(quantity.trim()) && qty >= 1
  const delta = qtyValid ? (direction === 'in' ? qty : -qty) : 0
  const next = current + delta
  const pending = adjustStock.isPending

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Both boxes are checked in one pass: an empty reason is found on the same
    // attempt as a quantity that would take the shelf below what is reserved.
    const found: typeof errors = {}
    if (!qtyValid) {
      found.quantity = 'Enter a whole quantity of 1 or more.'
    } else if (next < floor) {
      found.quantity =
        reserved === null
          ? `That would take ${targetSku} to ${next}. Stock cannot go below zero.`
          : `That would take ${targetSku} to ${next} on hand, below the ${reserved} reserved for placed orders ` +
            `(on hand ${current}, reserved ${reserved}, available ${view.availableStock}). ` +
            `Remove at most ${Math.max(0, current - reserved)}.`
    }
    if (!reason.trim()) {
      found.reason = 'Say why stock changed — it is written to the audit log.'
    }
    setErrors(found)
    if (Object.values(found).some(Boolean)) return

    try {
      const result = await adjustStock.mutateAsync({
        delta,
        reason: reason.trim(),
        ...(variant ? { variantId: variant.id } : {}),
      })
      onDone(
        `${targetSku}: ${delta > 0 ? '+' : ''}${delta}. On hand is now ${result.stockOnHand}.`
      )
    } catch (err) {
      setError(errorMessage(err, 'The stock adjustment was not applied.'))
    }
  }

  return (
    <Modal
      isOpen
      onClose={pending ? () => undefined : onClose}
      title="Adjust stock"
      maxWidth="520px"
    >
      <form
        noValidate
        onSubmit={submit}
        style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
      >
        {view.variants.length > 0 && (
          <Field
            label="Stock to adjust"
            hint="Variants keep their own shelf count."
          >
            <SelectInput
              value={target}
              disabled={pending}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Product — {view.sku}</option>
              {view.variants.map((v) => (
                <option key={v.id} value={v.id}>
                  Variant — {v.sku}
                </option>
              ))}
            </SelectInput>
          </Field>
        )}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '12px',
          }}
        >
          <Field label="Movement" htmlFor="stock-direction">
            <SelectInput
              id="stock-direction"
              value={direction}
              disabled={pending}
              onChange={(e) => {
                setErrors((previous) => ({ ...previous, quantity: undefined }))
                setDirection(e.target.value as 'in' | 'out')
              }}
            >
              <option value="in">Add to stock (+)</option>
              <option value="out">Remove from stock (−)</option>
            </SelectInput>
          </Field>
          <Field
            label="Quantity *"
            htmlFor="stock-quantity"
            error={errors.quantity}
          >
            <TextInput
              id="stock-quantity"
              type="number"
              step={1}
              inputMode="numeric"
              placeholder="e.g. 250"
              value={quantity}
              disabled={pending}
              invalid={
                Boolean(errors.quantity) || (quantity !== '' && !qtyValid)
              }
              aria-describedby={
                errors.quantity ? 'stock-quantity-error' : undefined
              }
              onChange={(e) => {
                setErrors((previous) => ({ ...previous, quantity: undefined }))
                setQuantity(e.target.value)
              }}
            />
          </Field>
        </div>

        <Field
          label="Reason *"
          htmlFor="stock-reason"
          hint="Up to 200 characters."
          error={errors.reason}
        >
          <TextInput
            id="stock-reason"
            list="stock-reason-suggestions"
            maxLength={200}
            value={reason}
            disabled={pending}
            invalid={Boolean(errors.reason)}
            aria-describedby={errors.reason ? 'stock-reason-error' : undefined}
            placeholder="e.g. Stock received"
            onChange={(e) => {
              setErrors((previous) => ({ ...previous, reason: undefined }))
              setReason(e.target.value)
            }}
          />
          <datalist id="stock-reason-suggestions">
            {REASON_SUGGESTIONS.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        </Field>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: '#FCF7FA',
            fontSize: '0.82rem',
            color: '#6E6781',
          }}
        >
          <span>
            {targetSku}: on hand <strong>{current}</strong>
            {reserved !== null && reserved > 0 && (
              <>
                {' '}
                · reserved <strong>{reserved}</strong>
              </>
            )}
          </span>
          <span>
            after:{' '}
            <strong style={{ color: next < floor ? '#DC2626' : '#2B253E' }}>
              {qtyValid ? next : '—'}
            </strong>
          </span>
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
            pendingLabel="Applying…"
          >
            Apply adjustment
          </ActionButton>
        </div>
      </form>
    </Modal>
  )
}
