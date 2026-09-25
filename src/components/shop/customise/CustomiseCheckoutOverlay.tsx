// src/components/shop/customise/CustomiseCheckoutOverlay.tsx
'use client'

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import type { PrintTemplate } from '@/types'
import type { ReviewIssue, ReviewSide } from '@/lib/design/review-checks'
import { withOrderArtwork } from '@/lib/design/order-artwork'
import { customiseTemplate } from '@/services/templates.service'
import { findVariant } from '@/services/data-source/api/product.mapper'
import { toApiError } from '@/services'
import { useProduct } from '@/hooks/useProducts'
import { useAppDispatch } from '@/store/hooks'
import { addCartLine, updateCartLine } from '@/store/cartSlice'
import type { PreparedReview, PreviewHighlight } from './types'
import { SidePreview } from './SidePreview'
import { ReviewPanel } from './ReviewPanel'
import {
  AddedPanel,
  FinalStepsPanel,
  OrderBar,
  type ProductState,
} from './FinalStepsPanel'
import {
  initialOptions,
  optionSurcharge,
  packChoices,
  splitOptionAxes,
  unitNoun,
} from './order-options'
import { formatMoney, formatNumber } from '@/lib/format'
import { OVERLAY_CLASS, T, cardStyle, overlayCss } from './theme'

const NARROW_QUERY = '(max-width: 899.98px)'

/** Stacks the two columns under ~900px. */
function useIsNarrow(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const media = window.matchMedia(NARROW_QUERY)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false
  )
}

function messageOf(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) return error
  return toApiError(error)?.message || fallback
}

type Step = 'review' | 'final' | 'added'

interface CustomiseCheckoutOverlayProps {
  /** The published template: its price, pack size and product. */
  template: PrintTemplate
  templateVersionId?: string
  prepared: PreparedReview
  /** Present when the buyer re-opened a cart line: Update cart, not Add. */
  existingLineId?: string
  savedQuantity?: number
  savedOptions?: Record<string, string> | null
  /** Back to the studio. */
  onClose: () => void
  /** Back to the studio, on the side the named field is on. */
  onEditIssue: (issue: ReviewIssue) => void
}

/**
 * Review → final steps → in the cart, over the studio.
 *
 * Full-screen and on top of the canvas rather than a route of its own: "Edit
 * my design" has to put the buyer back exactly where they were, with their
 * undo history, and a navigation would throw both away.
 */
export function CustomiseCheckoutOverlay({
  template,
  templateVersionId,
  prepared,
  existingLineId,
  savedQuantity,
  savedOptions,
  onClose,
  onEditIssue,
}: CustomiseCheckoutOverlayProps) {
  const narrow = useIsNarrow()
  const dispatch = useAppDispatch()
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const checkboxRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<Step>('review')
  const [side, setSide] = useState<ReviewSide>('front')
  const [highlight, setHighlight] = useState<PreviewHighlight | null>(null)
  const [approved, setApproved] = useState(false)
  const [showApprovalError, setShowApprovalError] = useState(false)

  // Each screen starts with its heading focused, so a keyboard or screen
  // reader user lands at the top of what just changed.
  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  /* ── Review ─────────────────────────────────────────────────── */

  const handleHighlight = (issue: ReviewIssue | null) => {
    if (!issue) {
      setHighlight(null)
      return
    }
    setSide(issue.side)
    setHighlight({ side: issue.side, objectId: issue.objectId })
  }

  const handleContinue = () => {
    if (!approved) {
      setShowApprovalError(true)
      checkboxRef.current?.focus()
      return
    }
    setShowApprovalError(false)
    setHighlight(null)
    setStep('final')
  }

  /* ── Final steps ────────────────────────────────────────────── */

  const {
    product,
    isLoading: productLoading,
    error: productError,
    refetch: refetchProduct,
  } = useProduct(template.productId)

  const productState: ProductState = !template.productId
    ? 'missing'
    : product
      ? 'ready'
      : productError
        ? 'error'
        : productLoading
          ? 'loading'
          : 'error'

  const axes = useMemo(() => product?.optionAxes ?? [], [product])
  const { stock: stockAxes, other: otherAxes } = useMemo(
    () => splitOptionAxes(axes),
    [axes]
  )

  const choices = useMemo(
    () => packChoices(product, savedQuantity),
    [product, savedQuantity]
  )
  const [pickedPacks, setPickedPacks] = useState<number | null>(null)
  const packs =
    pickedPacks ??
    choices.find((n) => n >= (savedQuantity ?? 0)) ??
    choices[0] ??
    1

  const defaults = useMemo(
    () => (product ? initialOptions(product, savedOptions) : {}),
    [product, savedOptions]
  )
  const [pickedOptions, setPickedOptions] = useState<Record<
    string,
    string
  > | null>(null)
  const options = pickedOptions ?? defaults

  const hasOptions = axes.length > 0
  const variant =
    product && hasOptions ? findVariant(product, options) : undefined
  const variantMissing = hasOptions && !variant

  const unitsPerPack = template.unitsPerPack ?? null
  const packPrice =
    template.price != null
      ? template.price + optionSurcharge(axes, options)
      : null
  const total = packPrice != null ? packPrice * packs : null
  const units = unitsPerPack ? unitsPerPack * packs : null

  const nounHints = [template.category, template.productName, product?.name]
  const quantityText = (n: number) =>
    unitsPerPack
      ? `${formatNumber(unitsPerPack * n)} ${unitNoun(unitsPerPack * n, ...nounHints)}`
      : `${n} ${n === 1 ? 'pack' : 'packs'}`

  const packChoiceList = choices.map((n) => ({
    packs: n,
    label:
      packPrice != null
        ? `${quantityText(n)} (${formatMoney(packPrice * n)})`
        : quantityText(n),
  }))

  const eachLine =
    total != null && units
      ? `${formatMoney(total / units)} each / ${formatNumber(units)} ${unitNoun(units, ...nounHints)}`
      : null

  const summary = [
    {
      label: 'Quantity',
      value: unitsPerPack
        ? `${quantityText(packs)} · ${packs} ${packs === 1 ? 'pack' : 'packs'}`
        : quantityText(packs),
    },
    ...(stockAxes.length > 0
      ? [
          {
            label: 'Stock',
            value: stockAxes
              .map((axis) => options[axis.name])
              .filter(Boolean)
              .join(' · '),
          },
        ]
      : []),
    ...otherAxes
      .filter((axis) => options[axis.name])
      .map((axis) => ({ label: axis.name, value: options[axis.name] })),
    {
      label: 'Back',
      value: prepared.backName ?? 'Blank (nothing printed)',
    },
  ]

  const [saving, setSaving] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const disabledReason = !templateVersionId
    ? 'This design is not available to order right now.'
    : productState === 'missing'
      ? 'This design is not linked to a product yet.'
      : productState === 'loading'
        ? 'Loading quantities and stock…'
        : productState === 'error'
          ? "We couldn't load this product's options."
          : variantMissing
            ? 'Choose a stock that is available.'
            : null

  const handleSubmit = async () => {
    if (saving || disabledReason || !templateVersionId) return
    setSubmitError(null)
    setSaving(true)
    try {
      // The server decides what may print: it rebuilds the wording from the
      // published layers and answers with the version it checked it against.
      let accepted: Awaited<ReturnType<typeof customiseTemplate>>
      try {
        accepted = await customiseTemplate(template.id, prepared.values)
      } catch (error) {
        setSubmitError(
          messageOf(
            error,
            'Some of your details could not be accepted. Go back to your design and check them.'
          )
        )
        return
      }

      const { customisation, oversized } = withOrderArtwork(
        accepted.fields,
        prepared.design,
        { preview: prepared.cartPreview, backName: prepared.backName }
      )
      if (oversized) {
        // Without the artwork the line would print the operator's design, not
        // this one — so it is refused rather than added half-way.
        setSubmitError(
          'This design is too large to add to your cart. Replace any very large image in it and try again.'
        )
        return
      }

      if (existingLineId) {
        await dispatch(
          updateCartLine({
            lineId: existingLineId,
            input: {
              quantity: packs,
              ...(variant ? { variantId: variant.id } : {}),
              templateId: template.id,
              templateVersionId: accepted.versionId,
              customisation,
            },
          })
        ).unwrap()
      } else {
        await dispatch(
          addCartLine({
            productId: template.productId,
            quantity: packs,
            variantId: variant?.id ?? null,
            templateId: template.id,
            templateVersionId: accepted.versionId,
            customisation,
          })
        ).unwrap()
      }
      setStep('added')
    } catch (error) {
      setSubmitError(
        messageOf(
          error,
          'This design could not be added to your cart. Please try again.'
        )
      )
    } finally {
      setSaving(false)
    }
  }

  /* ── Frame ──────────────────────────────────────────────────── */

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The studio underneath listens on the window for Delete, Ctrl+Z and the
    // arrow keys. None of those should reach a canvas nobody can see.
    event.stopPropagation()
    if (event.key === 'Escape' && !saving) {
      event.preventDefault()
      onClose()
    }
  }

  const steps: { id: Step; label: string }[] = [
    { id: 'review', label: 'Review' },
    { id: 'final', label: 'Final steps' },
  ]
  const stepIndex = step === 'review' ? 0 : 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      className={OVERLAY_CLASS}
      onKeyDown={handleKeyDown}
      onKeyUp={(event) => event.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: T.page,
        color: T.text,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <style>{overlayCss}</style>

      {/* .row-wrap so the three parts drop to a second line on a phone
          rather than pushing the design's name off the screen; minHeight,
          not height, so that second line has somewhere to go. */}
      <header
        className="row-wrap"
        style={{
          flexShrink: 0,
          minHeight: '60px',
          justifyContent: 'space-between',
          padding: narrow ? '8px 16px' : '0 40px',
          backgroundColor: T.card,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="touch-target"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'none',
            border: 'none',
            padding: '6px 4px',
            color: T.secondary,
            fontSize: '0.84rem',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          <ArrowLeft size={16} /> {narrow ? 'Design' : 'Back to my design'}
        </button>

        <ol
          aria-label="Progress"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: narrow ? '8px' : '14px',
          }}
        >
          {steps.map((item, index) => {
            const done = index < stepIndex || step === 'added'
            const current = index === stepIndex && step !== 'added'
            return (
              <li
                key={item.id}
                aria-current={current ? 'step' : undefined}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: narrow ? '8px' : '14px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: current || done ? T.text : T.muted,
                }}
              >
                {/* A line from the step before: filled once it is behind you. */}
                {index > 0 && (
                  <span
                    aria-hidden="true"
                    style={{
                      width: narrow ? '18px' : '40px',
                      height: '2px',
                      borderRadius: '2px',
                      backgroundColor: done || current ? T.accent : T.border,
                    }}
                  />
                )}
                <span
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      fontSize: '0.72rem',
                      backgroundColor: current || done ? T.accent : T.card,
                      color: current || done ? '#FFFFFF' : T.muted,
                      border: `1px solid ${current || done ? T.accent : T.border}`,
                      boxShadow: current
                        ? '0 0 0 4px rgba(247, 53, 130, 0.15)'
                        : 'none',
                    }}
                  >
                    {done ? (
                      <Check size={13} strokeWidth={3} aria-label="done" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {!narrow && item.label}
                </span>
              </li>
            )
          })}
        </ol>

        <span
          className="truncate"
          style={{
            fontSize: '0.84rem',
            fontWeight: 600,
            color: T.text,
            maxWidth: narrow ? '110px' : '280px',
          }}
          title={template.name}
        >
          {template.name}
        </span>
      </header>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        <div
          style={{
            display: 'grid',
            // minmax(0, …) stacked as well as side by side: a wide summary
            // value must wrap inside the column, not widen it.
            gridTemplateColumns: narrow
              ? 'minmax(0, 1fr)'
              : 'minmax(0, 1fr) 440px',
            gap: narrow ? '16px' : '32px',
            alignItems: 'start',
            maxWidth: '1280px',
            margin: '0 auto',
            padding: narrow ? '16px 16px 28px' : '28px 40px 40px',
          }}
        >
          <div
            style={{
              position: narrow ? 'static' : 'sticky',
              top: '28px',
              borderRadius: '16px',
              // A lighter stage: the card on it is what should draw the eye.
              background: `linear-gradient(180deg, ${T.stage} 0%, #F8F2F5 100%)`,
              border: `1px solid ${T.border}`,
              padding: narrow ? '20px 14px' : '36px 32px',
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <SidePreview
              front={prepared.front}
              back={prepared.back}
              backName={prepared.backName}
              side={side}
              onSideChange={(face) => {
                setSide(face)
                setHighlight(null)
              }}
              highlight={highlight}
              compact={narrow}
              templateName={template.name}
            />
          </div>

          <div style={{ ...cardStyle, padding: narrow ? '20px' : '28px' }}>
            {step === 'review' && (
              <ReviewPanel
                headingId={headingId}
                headingRef={headingRef}
                issues={prepared.issues}
                approved={approved}
                onApprovedChange={(value) => {
                  setApproved(value)
                  if (value) setShowApprovalError(false)
                }}
                showApprovalError={showApprovalError}
                checkboxRef={checkboxRef}
                onContinue={handleContinue}
                onEdit={onClose}
                onHighlight={handleHighlight}
                onIssueClick={onEditIssue}
              />
            )}

            {step === 'final' && (
              <FinalStepsPanel
                headingId={headingId}
                headingRef={headingRef}
                onBack={() => setStep('review')}
                productState={productState}
                onRetryProduct={() => void refetchProduct()}
                packs={packs}
                packChoices={packChoiceList}
                onPacksChange={setPickedPacks}
                stockAxes={stockAxes}
                otherAxes={otherAxes}
                options={options}
                onOptionChange={(axis, value) =>
                  setPickedOptions({ ...options, [axis]: value })
                }
                variantMissing={variantMissing}
                summary={summary}
              />
            )}

            {step === 'added' && (
              <AddedPanel
                headingId={headingId}
                headingRef={headingRef}
                updated={Boolean(existingLineId)}
                summary={summary}
                total={total}
                onKeepEditing={onClose}
              />
            )}
          </div>
        </div>
      </div>

      {step === 'final' && (
        <OrderBar
          total={total}
          eachLine={eachLine}
          actionLabel={existingLineId ? 'Update cart' : 'Add to Cart'}
          busy={saving}
          disabled={Boolean(disabledReason)}
          disabledReason={disabledReason}
          error={submitError}
          onSubmit={() => void handleSubmit()}
          compact={narrow}
        />
      )}
    </div>
  )
}
