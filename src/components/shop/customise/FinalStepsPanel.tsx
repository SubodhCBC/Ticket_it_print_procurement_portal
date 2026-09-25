// src/components/shop/customise/FinalStepsPanel.tsx
'use client'

import type { RefObject } from 'react'
import Link from 'next/link'
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  ShoppingCart,
  Truck,
} from 'lucide-react'
import type { ProductOptionAxis } from '@/types'
import { formatMoney } from '@/lib/format'
import {
  OVERLAY_CLASS,
  T,
  errorBox,
  primaryButton,
  secondaryButton,
} from './theme'

/* ── Final steps ──────────────────────────────────────────────── */

export type ProductState = 'loading' | 'error' | 'ready' | 'missing'

interface FinalStepsPanelProps {
  headingId: string
  headingRef: RefObject<HTMLHeadingElement | null>
  onBack: () => void
  productState: ProductState
  onRetryProduct: () => void
  packs: number
  packChoices: { packs: number; label: string }[]
  onPacksChange: (packs: number) => void
  stockAxes: ProductOptionAxis[]
  otherAxes: ProductOptionAxis[]
  options: Record<string, string>
  onOptionChange: (axis: string, value: string) => void
  variantMissing: boolean
  summary: { label: string; value: string }[]
}

const sectionTitle = {
  margin: 0,
  fontSize: '0.92rem',
  fontWeight: 700,
  color: T.text,
} as const

const fieldLabel = {
  display: 'block',
  fontSize: '0.76rem',
  fontWeight: 600,
  color: T.secondary,
  marginBottom: '6px',
} as const

const selectStyle = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: `1px solid ${T.border}`,
  backgroundColor: T.card,
  color: T.text,
  fontSize: '0.86rem',
  fontWeight: 500,
  cursor: 'pointer',
} as const

const addOn = (price: number | undefined) =>
  price && price > 0 ? `+${formatMoney(price)}` : 'Included'

export function FinalStepsPanel({
  headingId,
  headingRef,
  onBack,
  productState,
  onRetryProduct,
  packs,
  packChoices,
  onPacksChange,
  stockAxes,
  otherAxes,
  options,
  onOptionChange,
  variantMissing,
  summary,
}: FinalStepsPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '22px' }}>
      <div>
        <button
          type="button"
          onClick={onBack}
          className="touch-target"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            background: 'none',
            border: 'none',
            padding: 0,
            marginBottom: '10px',
            color: T.secondary,
            fontSize: '0.78rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={14} /> Back to review
        </button>
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          style={{
            margin: 0,
            fontSize: '1.4rem',
            fontWeight: 700,
            color: T.text,
            letterSpacing: '-0.01em',
          }}
        >
          Final steps
        </h2>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '0.88rem',
            color: T.secondary,
            lineHeight: 1.5,
          }}
        >
          Your design is approved. Choose how many you need
          {stockAxes.length > 0 ? ' and what to print them on' : ''}, then add
          them to your cart.
        </p>
      </div>

      {productState === 'loading' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.84rem',
            color: T.muted,
          }}
        >
          <Loader2 size={16} className={`${OVERLAY_CLASS}-spin`} /> Loading
          quantities and stock…
        </div>
      )}

      {productState === 'error' && (
        <div role="alert" style={errorBox}>
          We couldn&apos;t load the quantities and stock for this product.{' '}
          <button
            type="button"
            onClick={onRetryProduct}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              fontWeight: 700,
              color: T.errorText,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      )}

      {productState === 'missing' && (
        <div role="alert" style={errorBox}>
          This design is not linked to a product yet, so it can&apos;t be
          ordered. Please contact your administrator.
        </div>
      )}

      {productState === 'ready' && (
        <>
          {/* Quantity */}
          <section
            style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
          >
            {packChoices.length <= 6 ? (
              <>
                {/* A handful of amounts reads better as cards to tap than as
                    a list to open. */}
                <h3 id={`${headingId}-quantity`} style={sectionTitle}>
                  Quantity
                </h3>
                <div
                  role="radiogroup"
                  aria-labelledby={`${headingId}-quantity`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns:
                      'repeat(auto-fill, minmax(120px, 1fr))',
                    gap: '10px',
                  }}
                >
                  {packChoices.map((choice) => {
                    const on = choice.packs === packs
                    // "100 cards ($100.00)" -> amount and price on two lines.
                    const match = /^(.*) \((.*)\)$/.exec(choice.label)
                    return (
                      <button
                        key={choice.packs}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() => onPacksChange(choice.packs)}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          gap: '2px',
                          padding: '10px 12px',
                          borderRadius: '12px',
                          border: `1px solid ${on ? T.accent : T.border}`,
                          boxShadow: on
                            ? `inset 0 0 0 1px ${T.accent}`
                            : 'none',
                          backgroundColor: on ? T.accentSoft : T.card,
                          textAlign: 'left',
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          style={{
                            fontSize: '0.86rem',
                            fontWeight: 700,
                            color: T.text,
                          }}
                        >
                          {match ? match[1] : choice.label}
                        </span>
                        {match && (
                          <span
                            style={{
                              fontSize: '0.76rem',
                              fontWeight: 600,
                              color: on ? T.accent : T.secondary,
                            }}
                          >
                            {match[2]}
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </>
            ) : (
              <>
                <h3 style={sectionTitle}>
                  <label htmlFor={`${headingId}-quantity`}>Quantity</label>
                </h3>
                <select
                  id={`${headingId}-quantity`}
                  value={packs}
                  onChange={(e) => onPacksChange(Number(e.target.value))}
                  className="touch-target"
                  style={selectStyle}
                >
                  {packChoices.map((choice) => (
                    <option key={choice.packs} value={choice.packs}>
                      {choice.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </section>

          {/* Stock */}
          {stockAxes.length > 0 && (
            <section
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <h3 style={sectionTitle}>Stock</h3>
              {stockAxes.map((axis) => (
                <div key={axis.id}>
                  {stockAxes.length > 1 && (
                    <div style={fieldLabel}>{axis.name}</div>
                  )}
                  <div
                    role="radiogroup"
                    aria-label={axis.name}
                    style={{
                      display: 'grid',
                      gridTemplateColumns:
                        'repeat(auto-fill, minmax(150px, 1fr))',
                      gap: '10px',
                    }}
                  >
                    {axis.values.map((value) => {
                      const on = options[axis.name] === value
                      return (
                        <button
                          key={value}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => onOptionChange(axis.name, value)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'flex-start',
                            gap: '4px',
                            padding: '12px 14px',
                            borderRadius: '12px',
                            border: `1px solid ${on ? T.accent : T.border}`,
                            boxShadow: on
                              ? `inset 0 0 0 1px ${T.accent}`
                              : 'none',
                            backgroundColor: on ? T.accentSoft : T.card,
                            textAlign: 'left',
                            cursor: 'pointer',
                          }}
                        >
                          <span
                            style={{
                              fontSize: '0.86rem',
                              fontWeight: 600,
                              color: T.text,
                              lineHeight: 1.3,
                            }}
                          >
                            {value}
                          </span>
                          <span
                            style={{
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              color: on ? T.accent : T.secondary,
                            }}
                          >
                            {addOn(axis.valuePrices?.[value])}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Everything else the product can be configured by */}
          {otherAxes.length > 0 && (
            <section
              style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
            >
              <h3 style={sectionTitle}>Options</h3>
              {otherAxes.map((axis) => (
                <div key={axis.id}>
                  <label
                    htmlFor={`${headingId}-axis-${axis.id}`}
                    style={fieldLabel}
                  >
                    {axis.name}
                  </label>
                  <select
                    id={`${headingId}-axis-${axis.id}`}
                    value={options[axis.name] ?? ''}
                    onChange={(e) => onOptionChange(axis.name, e.target.value)}
                    className="touch-target"
                    style={selectStyle}
                  >
                    {axis.values.map((value) => {
                      const price = axis.valuePrices?.[value]
                      return (
                        <option key={value} value={value}>
                          {value}
                          {price && price > 0
                            ? ` (+${formatMoney(price)})`
                            : ''}
                        </option>
                      )
                    })}
                  </select>
                </div>
              ))}
            </section>
          )}

          {variantMissing && (
            <div role="alert" style={errorBox}>
              That combination isn&apos;t available. Choose a different stock or
              option.
            </div>
          )}
        </>
      )}

      {/* What is being ordered, in one place. */}
      <section
        aria-label="Your selection"
        style={{
          borderRadius: '12px',
          backgroundColor: T.page,
          border: `1px solid ${T.border}`,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        <div
          style={{
            fontSize: '0.72rem',
            fontWeight: 700,
            color: T.muted,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Your selection
        </div>
        {summary.map((row) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '0.84rem',
            }}
          >
            <span style={{ color: T.secondary }}>{row.label}</span>
            <span
              style={{
                color: T.text,
                fontWeight: 600,
                textAlign: 'right',
                // A long stock name wraps inside its own half of the row
                // instead of widening the card on a phone.
                minWidth: 0,
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
      </section>
    </div>
  )
}

/* ── The sticky bar ───────────────────────────────────────────── */

interface OrderBarProps {
  total: number | null
  /** "$0.48 each / 100 cards", or null when it cannot be worked out. */
  eachLine: string | null
  actionLabel: string
  busy: boolean
  disabled: boolean
  disabledReason: string | null
  error: string | null
  onSubmit: () => void
  compact: boolean
}

export function OrderBar({
  total,
  eachLine,
  actionLabel,
  busy,
  disabled,
  disabledReason,
  error,
  onSubmit,
  compact,
}: OrderBarProps) {
  return (
    <div
      style={{
        flexShrink: 0,
        backgroundColor: T.card,
        borderTop: `1px solid ${T.border}`,
        boxShadow: '0 -6px 20px rgba(43, 37, 62, 0.06)',
        padding: compact ? '12px 16px' : '14px 40px',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
        }}
      >
        {error && (
          <div role="alert" style={errorBox}>
            {error}
          </div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: compact ? '10px' : '24px',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span
              style={{
                fontSize: '1.3rem',
                fontWeight: 700,
                color: T.text,
                lineHeight: 1.2,
              }}
            >
              {total != null ? formatMoney(total) : 'Priced in your cart'}
            </span>
            {eachLine && (
              <span style={{ fontSize: '0.78rem', color: T.secondary }}>
                {eachLine}
              </span>
            )}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.78rem',
              color: T.secondary,
              flex: compact ? '1 1 100%' : '1 1 auto',
              order: compact ? 3 : 0,
            }}
          >
            <Truck size={15} color={T.muted} aria-hidden="true" />
            Shipping chosen at checkout — from $6.50
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
              justifyContent: 'flex-end',
            }}
          >
            {disabled && disabledReason && !busy && (
              <span
                style={{
                  fontSize: '0.76rem',
                  color: T.muted,
                  maxWidth: '240px',
                }}
              >
                {disabledReason}
              </span>
            )}
            <button
              type="button"
              onClick={onSubmit}
              disabled={disabled || busy}
              aria-busy={busy}
              className="touch-target"
              style={{
                ...primaryButton(disabled || busy),
                padding: '12px 26px',
                opacity: disabled ? 0.55 : 1,
                cursor: busy
                  ? 'progress'
                  : disabled
                    ? 'not-allowed'
                    : 'pointer',
              }}
            >
              {busy ? (
                <>
                  <Loader2 size={16} className={`${OVERLAY_CLASS}-spin`} />{' '}
                  {actionLabel === 'Update cart' ? 'Updating…' : 'Adding…'}
                </>
              ) : (
                <>
                  <ShoppingCart size={16} /> {actionLabel}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Done ─────────────────────────────────────────────────────── */

interface AddedPanelProps {
  headingId: string
  headingRef: RefObject<HTMLHeadingElement | null>
  updated: boolean
  summary: { label: string; value: string }[]
  total: number | null
  onKeepEditing: () => void
}

export function AddedPanel({
  headingId,
  headingRef,
  updated,
  summary,
  total,
  onKeepEditing,
}: AddedPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          backgroundColor: T.accentSoft,
          color: T.accent,
        }}
      >
        <CheckCircle2 size={26} aria-hidden="true" />
      </div>
      <div role="status">
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          style={{
            margin: 0,
            fontSize: '1.4rem',
            fontWeight: 700,
            color: T.text,
          }}
        >
          {updated ? 'Your cart has been updated' : 'Added to your cart'}
        </h2>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '0.88rem',
            color: T.secondary,
            lineHeight: 1.5,
          }}
        >
          {updated
            ? 'Your changes are saved on this cart item.'
            : 'You can check out now, or design something else to order with it.'}
        </p>
      </div>

      <div
        style={{
          borderRadius: '12px',
          backgroundColor: T.page,
          border: `1px solid ${T.border}`,
          padding: '14px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {summary.map((row) => (
          <div
            key={row.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '0.84rem',
            }}
          >
            <span style={{ color: T.secondary }}>{row.label}</span>
            <span
              style={{
                color: T.text,
                fontWeight: 600,
                textAlign: 'right',
                minWidth: 0,
              }}
            >
              {row.value}
            </span>
          </div>
        ))}
        {total != null && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: '12px',
              fontSize: '0.88rem',
              borderTop: `1px solid ${T.border}`,
              paddingTop: '8px',
              marginTop: '2px',
            }}
          >
            <span style={{ color: T.text, fontWeight: 600 }}>Item total</span>
            <span style={{ color: T.text, fontWeight: 700 }}>
              {formatMoney(total)}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <Link
          href="/shop/cart"
          className="touch-target"
          style={{
            ...primaryButton(),
            width: '100%',
            padding: '12px 18px',
            textDecoration: 'none',
          }}
        >
          <ShoppingCart size={16} /> View cart
        </Link>
        <Link
          href="/shop/templates"
          className="touch-target"
          style={{
            ...secondaryButton(),
            width: '100%',
            padding: '11px 18px',
            textDecoration: 'none',
          }}
        >
          Design another
        </Link>
        <button
          type="button"
          onClick={onKeepEditing}
          className="touch-target"
          style={{
            background: 'none',
            border: 'none',
            padding: '4px',
            color: T.secondary,
            fontSize: '0.8rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Back to this design
        </button>
      </div>
    </div>
  )
}
