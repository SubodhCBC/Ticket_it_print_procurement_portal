// src/components/admin/ProductVolumeTiersEditor.tsx
'use client'

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { useProductAdminMutations } from '@/hooks/useProducts'
import type { AdminProductView, VolumeTierInput } from '@/types/catalog-admin'
import {
  ActionButton,
  AdminCard,
  AdminTable,
  ConfirmModal,
  Notice,
  ReadOnlyNotice,
  SectionHeading,
  StateBlock,
  Td,
  Th,
  TextInput,
} from './ProductAdminUi'
import { formatMoney } from '@/lib/format'
import { errorMessage } from './ProductAdminUtils'

const MAX_TIERS = 20

interface TierDraft {
  key: number
  minQuantity: string
  discountPercent: string
}

function toDrafts(view: AdminProductView): TierDraft[] {
  return view.volumeTiers.map((tier, index) => ({
    key: index,
    minQuantity: String(tier.minQuantity),
    // "10.00" → "10" reads better in an input; the value is the same.
    discountPercent: String(Number(tier.discountPercent)),
  }))
}

function rowIssue(draft: TierDraft): string | null {
  const qty = Number(draft.minQuantity)
  if (!/^\d+$/.test(draft.minQuantity.trim()) || qty < 2)
    return 'Quantity must be a whole number of 2 or more'
  const pct = Number(draft.discountPercent)
  if (
    draft.discountPercent.trim() === '' ||
    !Number.isFinite(pct) ||
    pct < 0.01 ||
    pct > 100 ||
    !/^\d+(\.\d{1,2})?$/.test(draft.discountPercent.trim())
  )
    return 'Discount must be 0.01–100, up to two decimals'
  return null
}

/**
 * The volume-discount ladder, replaced wholesale.
 *
 * A price change rather than a catalogue edit, so it needs PRICING_MANAGE.
 * The server refuses duplicate start quantities and a ladder whose discount
 * does not grow with quantity; both are checked here first so the message
 * points at the row.
 */
export function ProductVolumeTiersEditor({
  view,
  canEdit,
}: {
  view: AdminProductView
  canEdit: boolean
}) {
  const { setVolumeTiers } = useProductAdminMutations(view.id)
  const [drafts, setDrafts] = useState<TierDraft[]>(() => toDrafts(view))
  const [nextKey, setNextKey] = useState(view.volumeTiers.length)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const pending = setVolumeTiers.isPending
  const base = Number(view.basePrice)

  const change = (key: number, patch: Partial<TierDraft>) => {
    setError(null)
    setSaved(false)
    setDrafts((prev) =>
      prev.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft))
    )
  }

  const baseline = toDrafts(view)
  const isDirty =
    baseline.length !== drafts.length ||
    baseline.some(
      (tier, index) =>
        Number(tier.minQuantity) !== Number(drafts[index]?.minQuantity) ||
        Number(tier.discountPercent) !== Number(drafts[index]?.discountPercent)
    )

  const validate = (): VolumeTierInput[] | string => {
    if (drafts.length > MAX_TIERS) return `At most ${MAX_TIERS} tiers.`
    for (const [index, draft] of drafts.entries()) {
      const issue = rowIssue(draft)
      if (issue) return `Row ${index + 1}: ${issue}.`
    }
    const tiers = drafts
      .map((draft) => ({
        minQuantity: Number(draft.minQuantity),
        discountPercent: Number(draft.discountPercent),
      }))
      .sort((a, b) => a.minQuantity - b.minQuantity)

    for (let index = 1; index < tiers.length; index += 1) {
      const prev = tiers[index - 1]
      const tier = tiers[index]
      if (tier.minQuantity === prev.minQuantity)
        return `Two tiers both start at ${tier.minQuantity}.`
      if (tier.discountPercent <= prev.discountPercent)
        return `The tier at ${tier.minQuantity} must discount more than the one at ${prev.minQuantity}.`
    }
    return tiers
  }

  const persist = async (tiers: VolumeTierInput[]) => {
    setError(null)
    setSaved(false)
    try {
      await setVolumeTiers.mutateAsync(tiers)
      // The server stores the ladder sorted by quantity; mirror that so the
      // draft matches the refreshed product and no longer reads as dirty.
      setDrafts(
        tiers.map((tier, index) => ({
          key: index,
          minQuantity: String(tier.minQuantity),
          discountPercent: String(tier.discountPercent),
        }))
      )
      setNextKey(tiers.length)
      setConfirmClear(false)
      setSaved(true)
    } catch (err) {
      setError(errorMessage(err, 'The volume tiers could not be saved.'))
    }
  }

  const save = () => {
    const result = validate()
    if (typeof result === 'string') {
      setError(result)
      return
    }
    if (result.length === 0 && view.volumeTiers.length > 0) {
      setConfirmClear(true)
      return
    }
    void persist(result)
  }

  return (
    <AdminCard>
      <SectionHeading
        title="Volume discount tiers"
        description={`Percentage off the base price (${formatMoney(view.basePrice)}) from a minimum quantity. Customer rate cards are applied separately.`}
      />

      {!canEdit && (
        <ReadOnlyNotice>
          Changing volume pricing needs the Pricing Manage permission.
        </ReadOnlyNotice>
      )}

      {!canEdit ? (
        view.volumeTiers.length === 0 ? (
          <StateBlock
            title="No volume tiers"
            description="Every quantity sells at the base price."
          />
        ) : (
          <AdminTable
            head={
              <>
                <Th first>From quantity</Th>
                <Th align="right">Discount</Th>
                <Th align="right">Unit price</Th>
              </>
            }
          >
            {view.volumeTiers.map((tier) => (
              <tr
                key={tier.minQuantity}
                style={{ borderTop: '1px solid #F5EEF2' }}
              >
                <Td first>{tier.minQuantity}+</Td>
                <Td align="right">{tier.discountPercent}%</Td>
                <Td align="right" style={{ fontWeight: 600 }}>
                  {formatMoney(tier.unitPrice)}
                </Td>
              </tr>
            ))}
          </AdminTable>
        )
      ) : (
        <>
          {drafts.length === 0 ? (
            <StateBlock
              title="No volume tiers"
              description="Every quantity sells at the base price. Add a tier to discount larger orders."
            />
          ) : (
            <AdminTable
              head={
                <>
                  <Th first>From quantity</Th>
                  <Th>Discount %</Th>
                  <Th align="right">Unit price</Th>
                  <Th align="right"> </Th>
                </>
              }
            >
              {drafts.map((draft) => {
                const issue = rowIssue(draft)
                const pct = Number(draft.discountPercent)
                return (
                  <tr
                    key={draft.key}
                    style={{ borderTop: '1px solid #F5EEF2' }}
                  >
                    <Td first>
                      <TextInput
                        type="number"
                        min={2}
                        step={1}
                        value={draft.minQuantity}
                        disabled={pending}
                        aria-label="Minimum quantity"
                        invalid={
                          draft.minQuantity !== '' &&
                          issue?.startsWith('Quantity')
                        }
                        style={{ maxWidth: '140px' }}
                        onChange={(e) =>
                          change(draft.key, { minQuantity: e.target.value })
                        }
                      />
                    </Td>
                    <Td>
                      <TextInput
                        type="number"
                        min={0.01}
                        max={100}
                        step={0.01}
                        value={draft.discountPercent}
                        disabled={pending}
                        aria-label="Discount percent"
                        invalid={
                          draft.discountPercent !== '' &&
                          issue?.startsWith('Discount')
                        }
                        style={{ maxWidth: '140px' }}
                        onChange={(e) =>
                          change(draft.key, { discountPercent: e.target.value })
                        }
                      />
                    </Td>
                    <Td align="right" style={{ fontWeight: 600 }}>
                      {issue ? '—' : formatMoney(base * (1 - pct / 100))}
                    </Td>
                    <Td align="right">
                      <ActionButton
                        size="sm"
                        variant="ghost"
                        aria-label="Remove tier"
                        disabled={pending}
                        icon={<X size={14} />}
                        onClick={() => {
                          setError(null)
                          setSaved(false)
                          setDrafts((prev) =>
                            prev.filter((d) => d.key !== draft.key)
                          )
                        }}
                      >
                        Remove
                      </ActionButton>
                    </Td>
                  </tr>
                )
              })}
            </AdminTable>
          )}

          {error && <Notice tone="error">{error}</Notice>}
          {saved && !isDirty && (
            <Notice tone="success">Volume tiers saved.</Notice>
          )}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <ActionButton
              icon={<Plus size={15} />}
              disabled={pending || drafts.length >= MAX_TIERS}
              onClick={() => {
                const last = drafts[drafts.length - 1]
                setDrafts((prev) => [
                  ...prev,
                  {
                    key: nextKey,
                    minQuantity: last
                      ? String(Number(last.minQuantity || 0) * 2 || 10)
                      : '10',
                    discountPercent: '',
                  },
                ])
                setNextKey((key) => key + 1)
                setSaved(false)
              }}
            >
              Add tier
            </ActionButton>
            <div style={{ display: 'flex', gap: '8px' }}>
              <ActionButton
                disabled={pending || !isDirty}
                onClick={() => {
                  setDrafts(toDrafts(view))
                  setError(null)
                }}
              >
                Reset
              </ActionButton>
              <ActionButton
                variant="primary"
                pending={pending}
                pendingLabel="Saving…"
                disabled={!isDirty}
                onClick={save}
              >
                Save tiers
              </ActionButton>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={confirmClear}
        title="Remove all volume tiers"
        message="Every quantity will sell at the base price. Existing orders are not affected."
        confirmLabel="Remove all tiers"
        pendingLabel="Saving…"
        pending={pending}
        error={confirmClear ? error : null}
        onConfirm={() => void persist([])}
        onCancel={() => setConfirmClear(false)}
      />
    </AdminCard>
  )
}
