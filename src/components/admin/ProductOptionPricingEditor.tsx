// src/components/admin/ProductOptionPricingEditor.tsx
'use client'

import { useState, type CSSProperties } from 'react'
import {
  useProductMutations,
  type OptionValuePrices,
} from '@/hooks/useProducts'
import type { Product, ProductOptionAxis } from '@/types'
import { formatMoney } from '@/lib/format'

/** The server's ceiling on one value's surcharge. Kept in step deliberately. */
const MAX_SURCHARGE = 100_000

/** Option name → value → the input's text, exactly as typed. */
type Draft = Record<string, Record<string, string>>

function toDraft(axes: ProductOptionAxis[]): Draft {
  return Object.fromEntries(
    axes.map((axis) => [
      axis.name,
      Object.fromEntries(
        axis.values.map((value) => {
          const amount = axis.valuePrices[value] ?? 0
          // Blank, not "0.00": an included stock reads as nothing to add.
          // A form field's value, so two bare decimals — not `formatMoney`.
          return [value, amount > 0 ? amount.toFixed(2) : '']
        })
      ),
    ])
  )
}

/** Blank is zero. Anything else must be a number from 0 to the ceiling. */
function parseAmount(text: string): number | null {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  const amount = Number(trimmed)
  if (!Number.isFinite(amount) || amount < 0 || amount > MAX_SURCHARGE) {
    return null
  }
  return Math.round(amount * 100) / 100
}

function sameDraft(a: Draft, b: Draft): boolean {
  return Object.keys(b).every((name) =>
    Object.keys(b[name]).every(
      (value) =>
        parseAmount(a[name]?.[value] ?? '') === parseAmount(b[name][value])
    )
  )
}

const card: CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  padding: '20px',
  border: '1px solid #F0E6EC',
  display: 'flex',
  flexDirection: 'column',
  gap: '18px',
}

/*
 * Value, price, and what that price means.
 *
 * Columns of 180px and 110px beside the value used to add up to more than a
 * phone's width, so the row itself pushed the page sideways. As a wrapping flex
 * row the price box keeps a usable minimum and drops to its own line instead.
 */
const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '12px',
  minWidth: 0,
}

/** The value's name: takes the slack, truncates rather than widening. */
const rowLabel: CSSProperties = { flex: '1 1 120px', minWidth: 0 }

/** The price box: 180px where there is room, never under 120px. */
const rowField: CSSProperties = {
  flex: '0 1 180px',
  minWidth: '120px',
  position: 'relative',
}

/** The "+$1.20" / "Included" note beside it. */
const rowNote: CSSProperties = { flex: '0 1 110px', minWidth: 0 }

export function ProductOptionPricingEditor({
  product,
  readOnly = false,
}: {
  product: Product
  /** Without CATALOG_MANAGE the prices are shown but cannot be saved. */
  readOnly?: boolean
}) {
  const { setProductOptionPrices } = useProductMutations()
  const axes = product.optionAxes ?? []

  const [baseline, setBaseline] = useState<Draft>(() => toDraft(axes))
  const [draft, setDraft] = useState<Draft>(() => toDraft(axes))
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const invalid = axes.flatMap((axis) =>
    axis.values
      .filter((value) => parseAmount(draft[axis.name]?.[value] ?? '') === null)
      .map((value) => `${axis.name}: ${value}`)
  )
  const isDirty = !sameDraft(draft, baseline)

  const handleChange = (axisName: string, value: string, text: string) => {
    setDraft((prev) => ({
      ...prev,
      [axisName]: { ...prev[axisName], [value]: text },
    }))
    setSaved(false)
    setError(null)
  }

  const handleSave = async () => {
    if (invalid.length > 0) {
      setError(
        `Enter an amount of 0 or more (up to ${formatMoney(MAX_SURCHARGE)}) for ${invalid.join(', ')}.`
      )
      return
    }

    const prices: OptionValuePrices = Object.fromEntries(
      axes.map((axis) => [
        axis.name,
        Object.fromEntries(
          axis.values.map((value) => [
            value,
            parseAmount(draft[axis.name]?.[value] ?? '') ?? 0,
          ])
        ),
      ])
    )

    setIsSaving(true)
    setSaved(false)
    setError(null)
    try {
      const updated = await setProductOptionPrices(product.id, prices)
      const next = toDraft(updated.optionAxes ?? [])
      setBaseline(next)
      setDraft(next)
      setSaved(true)
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not save the prices. Try again.'
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section style={card}>
      <div>
        <h2
          style={{
            fontSize: '0.95rem',
            fontWeight: 700,
            color: '#2B253E',
            margin: 0,
          }}
        >
          Options &amp; stock pricing
        </h2>
        <p
          style={{
            fontSize: '0.8rem',
            color: '#6E6781',
            margin: 0,
            marginTop: '4px',
            lineHeight: 1.5,
          }}
        >
          What choosing this adds to one pack. Buyers see it as +$ on the stock
          cards when ordering a design. Leave 0 for no extra charge.
        </p>
      </div>

      {axes.length === 0 ? (
        <p
          style={{
            fontSize: '0.8rem',
            color: '#A39BB3',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          This product has no options yet. Options — and a matching variant for
          each combination of their values — must exist before stock pricing can
          be set.
        </p>
      ) : (
        <>
          {axes.map((axis) => (
            <div
              key={axis.id}
              style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
            >
              <div
                style={{
                  ...row,
                  paddingBottom: '6px',
                  borderBottom: '1px solid #F5EEF2',
                }}
              >
                <div
                  className="truncate"
                  style={{
                    ...rowLabel,
                    fontSize: '0.84rem',
                    fontWeight: 600,
                    color: '#2B253E',
                  }}
                >
                  {axis.name}
                </div>
                <div
                  style={{
                    ...rowField,
                    fontSize: '0.74rem',
                    color: '#A39BB3',
                    fontWeight: 500,
                  }}
                >
                  + price per pack
                </div>
                <div style={rowNote} />
              </div>

              {axis.values.map((value) => {
                const text = draft[axis.name]?.[value] ?? ''
                const amount = parseAmount(text)
                return (
                  <div key={value} style={row}>
                    <div
                      className="truncate"
                      title={value}
                      style={{
                        ...rowLabel,
                        fontSize: '0.84rem',
                        color: '#2B253E',
                      }}
                    >
                      {value}
                    </div>
                    <div style={rowField}>
                      <span
                        aria-hidden="true"
                        style={{
                          position: 'absolute',
                          left: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          fontSize: '0.84rem',
                          color: '#A39BB3',
                          pointerEvents: 'none',
                        }}
                      >
                        $
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={MAX_SURCHARGE}
                        step={0.01}
                        placeholder="0.00"
                        value={text}
                        disabled={isSaving || readOnly}
                        aria-label={`${axis.name} ${value}: price per pack`}
                        aria-invalid={amount === null}
                        onChange={(e) =>
                          handleChange(axis.name, value, e.target.value)
                        }
                        style={{
                          width: '100%',
                          boxSizing: 'border-box',
                          borderRadius: '10px',
                          border: `1px solid ${amount === null ? '#DC2626' : '#F0E6EC'}`,
                          padding: '8px 12px 8px 24px',
                          fontSize: '0.84rem',
                          color: '#2B253E',
                          backgroundColor: '#FFFFFF',
                        }}
                      />
                    </div>
                    <div
                      style={{
                        ...rowNote,
                        fontSize: '0.76rem',
                        color: amount === null ? '#DC2626' : '#A39BB3',
                        fontWeight: 500,
                      }}
                    >
                      {amount === null
                        ? 'Invalid'
                        : amount > 0
                          ? `+${formatMoney(amount)}`
                          : 'Included'}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {(error || saved) && (
            <div
              role={error ? 'alert' : 'status'}
              style={{
                padding: '10px 14px',
                borderRadius: '10px',
                fontSize: '0.8rem',
                lineHeight: 1.5,
                color: error ? '#DC2626' : '#3F9C68',
                backgroundColor: error ? '#FEF2F2' : '#ECFDF5',
              }}
            >
              {error ?? 'Stock prices saved.'}
            </div>
          )}

          <div
            style={{
              display: readOnly ? 'none' : 'flex',
              justifyContent: 'flex-end',
            }}
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !isDirty}
              style={{
                padding: '8px 16px',
                borderRadius: '10px',
                border: 'none',
                backgroundColor: '#F73582',
                color: '#FFFFFF',
                fontSize: '0.82rem',
                fontWeight: 600,
                opacity: isSaving || !isDirty ? 0.55 : 1,
                cursor: isSaving || !isDirty ? 'default' : 'pointer',
              }}
            >
              {isSaving ? 'Saving…' : 'Save prices'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}
