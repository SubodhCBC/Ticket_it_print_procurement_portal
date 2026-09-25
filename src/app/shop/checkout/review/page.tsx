// src/app/shop/checkout/review/page.tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { toApiError } from '@/services'
import {
  describePlacementFailure,
  placeReviewedOrder,
  type PlacementFailure,
} from '@/services/checkout.service'
import {
  getCartShipping,
  validate,
} from '@/services/data-source/api/api-cart.adapter'
import type {
  ApiApprovalPreview,
  ApiCartIssue,
  ApiCartShipping,
  ApiCartValidation,
} from '@/services/data-source/api/cart.types'
import { formatAddressSnapshot } from '@/services/data-source/api/cart.types'
import { getSiteAddresses } from '@/services/accounts.service'
import type { SiteAddressOption } from '@/services/data-source/api/api-accounts.adapter'
import { CartLineSummary } from '@/components/shop/cart/CartLineSummary'
import {
  OrderTotals,
  useTaxBasisNote,
} from '@/components/shop/cart/OrderTotals'
import { formatDate, formatMoney, formatDateTime } from '@/lib/format'
import {
  PAYMENT_METHOD_LABELS,
  shippingOptionName,
} from '@/components/shop/cart/line-format'
import {
  Building2,
  Truck,
  ShieldCheck,
  ArrowRight,
  Package,
  Receipt,
  AlertCircle,
  Loader2,
} from 'lucide-react'

const fieldLabel: React.CSSProperties = {
  color: '#A39BB3',
  fontSize: '0.74rem',
  fontWeight: 500,
  display: 'block',
  marginBottom: '2px',
}

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: '1px solid #F0E6EC',
  padding: '20px',
}

const editLink: React.CSSProperties = {
  fontSize: '0.78rem',
  color: '#F73582',
  fontWeight: 600,
  textDecoration: 'none',
}

/** Settled on this page, so they need no link to another step. */
const FIXED_ON_THIS_PAGE = new Set([
  'TERMS_NOT_ACCEPTED',
  'PAYMENT_METHOD_REQUIRED',
])

const EDIT_DETAILS = {
  href: '/shop/checkout/details',
  label: 'Edit PO reference',
}
const EDIT_CART = { href: '/shop/cart', label: 'Edit cart' }

/**
 * Where each blocking issue is fixed.
 *
 * The server names the problem; this sends the buyer to the step that solves
 * it, rather than leaving them to work out which of three pages that is.
 */
const ISSUE_FIX: Partial<Record<string, { href: string; label: string }>> = {
  PO_REQUIRED: EDIT_DETAILS,
  PO_PREFIX_MISMATCH: EDIT_DETAILS,
  PO_TOO_SHORT: EDIT_DETAILS,
  PO_INVALID_CHARACTERS: EDIT_DETAILS,
  PO_FORMAT_MISMATCH: EDIT_DETAILS,
  NO_SHIPPING_ADDRESS: {
    href: '/shop/checkout/delivery',
    label: 'Choose a delivery address',
  },
  BILLING_ADDRESS_NOT_AVAILABLE: {
    href: '/shop/checkout/delivery',
    label: 'Review the delivery step',
  },
  ADDRESS_NOT_AVAILABLE: {
    href: '/shop/checkout/delivery',
    label: 'Choose another address',
  },
  SHIPPING_METHOD_REQUIRED: {
    href: '/shop/checkout/delivery',
    label: 'Choose a delivery method',
  },
  DELIVERY_DATE_IN_PAST: {
    href: '/shop/checkout/delivery',
    label: 'Change the date',
  },
  DELIVERY_NOTES_REQUIRED: {
    href: '/shop/checkout/delivery',
    label: 'Add delivery instructions',
  },
  EMPTY_CART: EDIT_CART,
  PRODUCT_UNAVAILABLE: EDIT_CART,
  VARIANT_UNAVAILABLE: EDIT_CART,
  INSUFFICIENT_STOCK: EDIT_CART,
  TEMPLATE_UNAVAILABLE: EDIT_CART,
  BUDGET_EXCEEDED: EDIT_CART,
}

const DELIVERY_NOTES_ISSUE: ApiCartIssue = {
  code: 'DELIVERY_NOTES_REQUIRED',
  message:
    'Add delivery instructions — this account requires them on every order.',
  lineId: null,
}

/** Who an approval step waits on, in the buyer's words. */
const APPROVER_ROLE_LABELS: Record<string, string> = {
  HEAD_OFFICE: 'Head Office',
  ADMIN: 'an administrator',
  SITE_USER: 'a branch approver',
}

function approverOf(step: ApiApprovalPreview['steps'][number]): string {
  if (step.approverUserId) return 'a named approver'
  return step.approverRole
    ? (APPROVER_ROLE_LABELS[step.approverRole] ?? step.approverRole)
    : 'an approver'
}

/** Money compared in whole cents, so "12.5" and "12.50" are the same total. */
function cents(amount: number | string): number {
  return Math.round(Number(amount) * 100)
}

export default function CheckoutReviewPage() {
  const router = useRouter()
  const { user } = useAuth()
  const {
    cartId,
    items,
    subtotal,
    shipping,
    total,
    totalCount,
    checkoutState,
    isLoading,
    siteId,
    siteName,
    siteCode,
    approval,
    deliveryNotesRequired,
    billTo,
    customDeliveryAddress,
    applyValidation,
    reload,
    onCheckedOut,
    updateCheckoutState,
  } = useCart()

  // Below 1024px the submit card drops under the review rather than beside it.
  // Stacked it is the last thing on the page — which is also the order the
  // buyer reads in: check the items, check the addresses, then submit — and it
  // stays in the flow, so the button is scrolled to rather than pinned over
  // the terms it sits above.
  const stacked = useMediaQuery('(max-width: 1023.98px)')

  const [isSubmitting, setIsSubmitting] = useState(false)
  /**
   * Set synchronously on submit. `isSubmitting` only disables the button once
   * React re-renders, and a fast double click lands both presses before that.
   */
  const submitInFlight = useRef(false)
  const [isSavingTerms, setIsSavingTerms] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  /** How the last submit failed, which decides what the buyer is offered. */
  const [failure, setFailure] = useState<PlacementFailure['kind'] | null>(null)

  const instructions = checkoutState.deliveryInstructions.trim()

  // The account decides whether its prices include GST; this reads that rather
  // than asserting a basis the invoice may contradict.
  const taxNote = useTaxBasisNote('on account')

  /** What checkout validation still refuses. Null until first checked. */
  const [blockers, setBlockers] = useState<ApiCartIssue[] | null>(null)

  /**
   * The terms selector shows "Invoice, net 30" by default, so that is what the
   * basket has to hold. Displaying a default the server has never been told
   * about is what made checkout fail with `PAYMENT_METHOD_REQUIRED` while the
   * page showed a chosen method.
   */
  useEffect(() => {
    if (isLoading || checkoutState.paymentMethod) return
    void updateCheckoutState({ paymentMethod: 'CORPORATE_INVOICE' })
  }, [isLoading, checkoutState.paymentMethod, updateCheckoutState])

  /**
   * The branch address the basket ships to, resolved by the id the server
   * holds. Only that one: showing the branch default when none is chosen would
   * describe a destination the order does not have.
   */
  const branchId = siteId ?? user?.siteId ?? null
  const shipToKey =
    branchId && checkoutState.shippingAddressId
      ? `${branchId}|${checkoutState.shippingAddressId}`
      : null
  // Kept with the branch and address it was looked up for, so a changed
  // choice never shows the previous address while the new lookup is out.
  const [shipToLookup, setShipToLookup] = useState<{
    key: string
    option: SiteAddressOption | null
  } | null>(null)
  const shipTo =
    shipToKey && shipToLookup?.key === shipToKey ? shipToLookup.option : null

  useEffect(() => {
    if (!branchId || !checkoutState.shippingAddressId || !shipToKey) return

    let cancelled = false
    getSiteAddresses(branchId)
      .then((site) => {
        if (cancelled) return
        setShipToLookup({
          key: shipToKey,
          option:
            site?.addresses.find(
              (option) => option.id === checkoutState.shippingAddressId
            ) ?? null,
        })
      })
      .catch(() => {
        if (!cancelled) setShipToLookup({ key: shipToKey, option: null })
      })

    return () => {
      cancelled = true
    }
  }, [branchId, checkoutState.shippingAddressId, shipToKey])

  /** The NZ Post choice, when one was made. Shown, never required. */
  const [nzPost, setNzPost] = useState<ApiCartShipping | null>(null)

  useEffect(() => {
    let cancelled = false
    getCartShipping()
      .then((view) => {
        if (!cancelled) setNzPost(view)
      })
      .catch(() => {
        if (!cancelled) setNzPost(null)
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * Whether the server would order this basket right now.
   *
   * `validate(forCheckout)` reports every blocking problem without refusing, so
   * the page can list them — and link to where each is fixed — before the
   * buyer presses submit, instead of after.
   *
   * Re-checked whenever anything the answer depends on changes. "Checking" is
   * derived: the current inputs have not been answered for yet.
   */
  const readinessKey = JSON.stringify([
    checkoutState.poReference,
    checkoutState.shippingAddressId,
    checkoutState.shippingMethod,
    checkoutState.paymentMethod,
    checkoutState.termsAcceptedAt,
    checkoutState.requestedDeliveryDate,
    totalCount,
    subtotal,
  ])
  const [checkedKey, setCheckedKey] = useState<string | null>(null)
  const isChecking = !isLoading && checkedKey !== readinessKey

  useEffect(() => {
    if (isLoading) return
    // State is set only once the answer is in, so the effect itself never
    // renders twice. Not cancelled on change: a late answer still prices the
    // page, and `checkedKey` records which inputs it answered for.
    validate(undefined, true)
      .then((result) => {
        // The same answer prices the page: a rate card, stock level or approval
        // rule that moved since the basket was last loaded shows here now,
        // rather than first appearing on the confirmation.
        applyValidation(result)
        setBlockers(result.issues)
      })
      .catch((err) => setSubmitError(toApiError(err).message))
      .finally(() => setCheckedKey(readinessKey))
  }, [isLoading, applyValidation, readinessKey])

  const outstanding = [
    ...(blockers ?? []).filter(
      (issue) =>
        !FIXED_ON_THIS_PAGE.has(issue.code) &&
        // Reported by a refused submit; stale once instructions are added.
        !(issue.code === 'DELIVERY_NOTES_REQUIRED' && instructions)
    ),
    // Validation cannot report this one — the instructions are not on the
    // basket — so the page raises it from the account's setting instead of
    // letting the submit be refused for it.
    ...(deliveryNotesRequired &&
    !instructions &&
    !(blockers ?? []).some((issue) => issue.code === 'DELIVERY_NOTES_REQUIRED')
      ? [DELIVERY_NOTES_ISSUE]
      : []),
  ]

  /**
   * Submits the basket the buyer is looking at.
   *
   * Nothing about the order is assembled here. The lines, their prices, the
   * delivery charge, the total, the billing period and whether it needs
   * approval are all decided server-side from the validated cart — a browser
   * that could name its own line prices could name its own discount. What is
   * sent is the basket's id and the details the basket has no field for.
   *
   *   1. A last `validate(forCheckout)`, which writes nothing. If the total
   *      moved since the page priced it — a rate card, a stock-driven change,
   *      a delivery charge — the buyer sees the new figure and submits again,
   *      rather than finding it on the confirmation.
   *   2. `POST /orders` with the reviewed `cartId`. Safe to repeat: if that
   *      basket already became an order (a double click, a lost response) the
   *      server answers with that order. A rolled-back attempt is retried once.
   */
  const handleSubmitOrder = async () => {
    if (submitInFlight.current) return

    if (!checkoutState.termsAcceptedAt) {
      setSubmitError('Accept the terms of supply before submitting.')
      return
    }

    if (outstanding.length > 0) {
      setSubmitError('Resolve the items listed above before submitting.')
      return
    }

    if (!cartId) {
      setSubmitError('Your basket is still loading. Try again in a moment.')
      return
    }

    submitInFlight.current = true
    setIsSubmitting(true)
    setSubmitError(null)
    setFailure(null)

    const reviewedCartId = cartId
    const reviewedTotal = total

    try {
      // 1. The last look.
      let fresh: ApiCartValidation
      try {
        fresh = await validate(undefined, true)
      } catch (err) {
        const found = describePlacementFailure(err)
        setFailure(found.kind === 'session-expired' ? found.kind : 'busy')
        setSubmitError(
          found.kind === 'session-expired'
            ? found.message
            : `Could not check the order before submitting — nothing was placed. ${toApiError(err).message}`
        )
        return
      }

      // A different basket means the reviewed one is no longer open — most
      // likely an earlier submit placed it and its answer was lost. It is not
      // checked or shown: sending its id lets the server say what happened.
      if (fresh.cart.id === reviewedCartId) {
        applyValidation(fresh)
        setBlockers(fresh.issues)

        if (fresh.issues.length > 0) {
          setSubmitError(
            'This order is not ready yet — see the items listed above.'
          )
          return
        }

        if (cents(fresh.total) !== cents(reviewedTotal)) {
          setSubmitError(
            `The order total changed from ${formatMoney(reviewedTotal)} to ${formatMoney(Number(fresh.total))} since this page was priced. Check the updated figures, then submit again.`
          )
          return
        }

        if (fresh.deliveryNotesRequired && !instructions) {
          setSubmitError(DELIVERY_NOTES_ISSUE.message)
          return
        }
      }

      // 2. The order. One transaction server-side: it re-checks the basket,
      //    reserves stock, routes approval and closes the cart.
      try {
        const order = await placeReviewedOrder({
          cartId: reviewedCartId,
          deliveryNotes: instructions,
          recipientName: checkoutState.deliveryContactName,
          recipientPhone: checkoutState.deliveryContactPhone,
          recipientEmail: checkoutState.deliveryContactEmail,
          projectCode: checkoutState.projectCode,
        })

        // The basket is closed server-side by the order write; this clears
        // the local copy rather than issuing a second call to empty it.
        onCheckedOut()
        router.push(`/shop/order-confirmation/${order.id}`)
      } catch (err) {
        const found = describePlacementFailure(err)
        setFailure(found.kind)
        setSubmitError(found.message)

        if (found.kind === 'not-ready' && found.issues.length > 0)
          setBlockers(found.issues)

        // Show the basket that is open now. Nothing was placed.
        if (found.kind === 'basket-changed') void reload()
      }
    } finally {
      submitInFlight.current = false
      setIsSubmitting(false)
    }
  }

  const toggleTerms = async () => {
    setIsSavingTerms(true)
    setSubmitError(null)
    const saved = await updateCheckoutState({
      // An empty string withdraws acceptance; the server stamps the instant.
      termsAcceptedAt: checkoutState.termsAcceptedAt
        ? ''
        : new Date().toISOString(),
    })
    setIsSavingTerms(false)
    if (!saved.success) setSubmitError(saved.error)
  }

  const shipToText = shipTo
    ? [
        [shipTo.address.street, shipTo.address.suite]
          .filter(Boolean)
          .join(', '),
        [shipTo.address.city, shipTo.address.state].filter(Boolean).join(', '),
        shipTo.address.postalCode,
      ]
        .filter(Boolean)
        .join(', ')
    : null

  const nzPostSelection = nzPost?.selection ?? null

  const submitDisabled =
    isSubmitting ||
    isChecking ||
    !cartId ||
    items.length === 0 ||
    !checkoutState.termsAcceptedAt ||
    outstanding.length > 0

  /** A failure the buyer answers by pressing submit again — which is safe. */
  const canRetry = failure === 'unconfirmed' || failure === 'busy'
  const isWarning = canRetry || failure === 'basket-changed'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header */}
      <div style={{ minWidth: 0 }}>
        <span
          style={{
            display: 'block',
            marginBottom: '4px',
            fontSize: '0.76rem',
            fontWeight: 500,
            color: '#A39BB3',
          }}
        >
          Step 3 of 3
        </span>
        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#2B253E',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          Review and submit
        </h1>
        <p style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}>
          Check your items and delivery details before placing the order on your
          company account.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: stacked
            ? 'minmax(0, 1fr)'
            : 'minmax(0, 1fr) 340px',
          gap: '20px',
          alignItems: 'start',
        }}
      >
        {/* Main Review Section (Left) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 1. Items Breakdown Box */}
          <div style={{ ...card, display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                paddingBottom: '12px',
              }}
            >
              <h3
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: '#2B253E',
                  letterSpacing: '-0.01em',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  margin: 0,
                }}
              >
                <Package size={16} color="#A39BB3" />
                <span>Collateral Assets ({totalCount} items)</span>
              </h3>
              <Link href="/shop/cart" className="touch-target" style={editLink}>
                Edit Cart
              </Link>
            </div>

            {/* Rows divided by a hairline, not filled tiles in the card. */}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {items.map((item) => (
                <div
                  key={item.id}
                  style={{ padding: '12px 0', borderTop: '1px solid #F5EEF2' }}
                >
                  <CartLineSummary item={item} variant="review" />
                </div>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                paddingTop: '12px',
                borderTop: '1px solid #F5EEF2',
                fontSize: '0.84rem',
              }}
            >
              <span style={{ fontWeight: 500, color: '#6E6781' }}>
                Items Subtotal:
              </span>
              <span
                style={{
                  fontSize: '0.95rem',
                  fontWeight: 700,
                  color: '#2B253E',
                }}
              >
                {formatMoney(subtotal)}
              </span>
            </div>
          </div>

          {/* 2. Customer & Address Breakdown */}
          <div className="grid-2" style={{ gap: '20px' }}>
            {/* Account & PO Info */}
            <div
              style={{
                ...card,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '0.84rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    letterSpacing: '-0.01em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Building2 size={16} color="#A39BB3" />
                  <span>Account & PO Info</span>
                </span>
                <Link
                  href="/shop/checkout/details"
                  className="touch-target"
                  style={editLink}
                >
                  Edit
                </Link>
              </div>

              {/* Labels in grey above their values, so the values are what
                  the eye lands on. */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  color: '#2B253E',
                }}
              >
                <p style={{ margin: 0 }}>
                  <strong style={fieldLabel}>Customer Account:</strong>
                  {user?.accountName ?? '—'}
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={fieldLabel}>Branch:</strong>
                  {siteName ?? user?.siteName ?? '—'}
                  {(siteCode ?? user?.siteCode) &&
                    ` (${siteCode ?? user?.siteCode})`}
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={fieldLabel}>PO Reference:</strong>
                  <span
                    style={{
                      fontFamily: 'monospace',
                      fontWeight: 600,
                      color: '#2B253E',
                    }}
                  >
                    {checkoutState.poReference || 'None'}
                  </span>
                </p>
              </div>
            </div>

            {/* Delivery Info */}
            <div
              style={{
                ...card,
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                fontSize: '0.84rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    letterSpacing: '-0.01em',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Truck size={16} color="#A39BB3" />
                  <span>Delivery Destination</span>
                </span>
                <Link
                  href="/shop/checkout/delivery"
                  className="touch-target"
                  style={editLink}
                >
                  Edit
                </Link>
              </div>

              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  color: '#2B253E',
                }}
              >
                <div>
                  <strong style={fieldLabel}>Delivery Method:</strong>
                  {shipping ? (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                    >
                      <span>{shippingOptionName(shipping)}</span>
                      <strong style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {formatMoney(Number(shipping.price))}
                      </strong>
                    </span>
                  ) : (
                    <span style={{ color: '#DC2626', fontWeight: 500 }}>
                      Not chosen yet —{' '}
                      <Link
                        href="/shop/checkout/delivery"
                        className="touch-target"
                        style={editLink}
                      >
                        choose a delivery method
                      </Link>
                    </span>
                  )}
                </div>
                <p style={{ margin: 0 }}>
                  <strong style={fieldLabel}>Recipient Contact:</strong>
                  {checkoutState.deliveryContactName || '—'}
                  {checkoutState.deliveryContactPhone
                    ? ` (${checkoutState.deliveryContactPhone})`
                    : ''}
                  {checkoutState.deliveryContactEmail && (
                    <span style={{ display: 'block', color: '#6E6781' }}>
                      {checkoutState.deliveryContactEmail}
                    </span>
                  )}
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={fieldLabel}>Ship-To Address:</strong>
                  {customDeliveryAddress.current &&
                  customDeliveryAddress.current.id ===
                    checkoutState.shippingAddressId ? (
                    <>
                      <span style={{ fontWeight: 600, display: 'block' }}>
                        {customDeliveryAddress.current.label ||
                          'One-off delivery'}
                        {customDeliveryAddress.current.recipientName
                          ? ` — ${customDeliveryAddress.current.recipientName}`
                          : ''}
                      </span>
                      <span style={{ color: '#6E6781' }}>
                        {formatAddressSnapshot(customDeliveryAddress.current)}
                      </span>
                    </>
                  ) : shipTo ? (
                    <>
                      <span style={{ fontWeight: 600, display: 'block' }}>
                        {shipTo.label}
                      </span>
                      <span style={{ color: '#6E6781' }}>{shipToText}</span>
                    </>
                  ) : (
                    'No delivery address selected.'
                  )}
                </p>
                <p style={{ margin: 0 }}>
                  <strong style={fieldLabel}>Bill-To Address:</strong>
                  {billTo ? (
                    <>
                      {(billTo.address.label ||
                        billTo.address.recipientName) && (
                        <span style={{ fontWeight: 600, display: 'block' }}>
                          {billTo.address.label || billTo.address.recipientName}
                        </span>
                      )}
                      <span style={{ color: '#6E6781' }}>
                        {formatAddressSnapshot(billTo.address)}
                      </span>
                    </>
                  ) : (
                    'No billing address on file.'
                  )}
                </p>
                {checkoutState.requestedDeliveryDate && (
                  <p style={{ margin: 0 }}>
                    <strong style={fieldLabel}>Requested Delivery:</strong>
                    {formatDate(checkoutState.requestedDeliveryDate)}
                  </p>
                )}
                {nzPostSelection && (
                  <p style={{ margin: 0 }}>
                    <strong style={fieldLabel}>NZ Post:</strong>
                    {nzPostSelection.deliveryKind === 'COLLECTION' &&
                    nzPostSelection.collectionPoint
                      ? `Collect from ${nzPostSelection.collectionPoint.name}`
                      : (nzPostSelection.fullAddress ?? 'Address confirmed')}
                    {nzPostSelection.service?.description && (
                      <span style={{ display: 'block', color: '#6E6781' }}>
                        {nzPostSelection.service.description} · recorded for
                        dispatch, not billed
                      </span>
                    )}
                  </p>
                )}
                {instructions ? (
                  <p style={{ margin: 0 }}>
                    <strong style={fieldLabel}>Delivery Instructions:</strong>
                    <span
                      style={{
                        fontSize: '0.8rem',
                        fontStyle: 'italic',
                        color: '#6E6781',
                      }}
                    >
                      &ldquo;{instructions}&rdquo;
                    </span>
                  </p>
                ) : (
                  deliveryNotesRequired && (
                    <p style={{ margin: 0 }}>
                      <strong style={fieldLabel}>Delivery Instructions:</strong>
                      <span style={{ color: '#DC2626', fontWeight: 500 }}>
                        Required for this account —{' '}
                        <Link
                          href="/shop/checkout/delivery"
                          className="touch-target"
                          style={editLink}
                        >
                          add them
                        </Link>
                      </span>
                    </p>
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Action / Submit Card (Right). A plain card: the server's totals,
            then the terms and the one primary button. */}
        <div
          style={{
            ...card,
            position: stacked ? 'static' : 'sticky',
            top: '80px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <h3
              style={{
                fontSize: '0.95rem',
                fontWeight: 700,
                color: '#2B253E',
                letterSpacing: '-0.01em',
                margin: 0,
              }}
            >
              Authorisation summary
            </h3>
            <Receipt size={16} color="#A39BB3" />
          </div>

          {/* Every figure is the server's. No tax is estimated here — the note
              states the account's basis so this reconciles with the invoice. */}
          <OrderTotals
            subtotal={subtotal}
            shippingMethod={shipping ? shippingOptionName(shipping) : null}
            shippingPrice={shipping ? Number(shipping.price) : null}
            total={total}
            pendingShippingText="Not chosen"
            totalLabel="Total Order Value"
            totalNote={taxNote}
          />

          {/* Campaign Code. A line like the rows above; the indigo box around
              it carried no meaning. */}
          {checkoutState.campaignCode && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                fontSize: '0.8rem',
              }}
            >
              <span style={{ color: '#6E6781' }}>Allocated Campaign:</span>
              <strong
                style={{
                  color: '#2B253E',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                }}
              >
                {checkoutState.campaignCode}
              </strong>
            </div>
          )}

          {checkoutState.projectCode && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                fontSize: '0.8rem',
              }}
            >
              <span style={{ color: '#6E6781' }}>Project Code:</span>
              <strong
                style={{
                  color: '#2B253E',
                  fontWeight: 600,
                  fontFamily: 'monospace',
                }}
              >
                {checkoutState.projectCode}
              </strong>
            </div>
          )}

          {checkoutState.customerReference && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                fontSize: '0.8rem',
              }}
            >
              <span style={{ color: '#6E6781', flexShrink: 0 }}>
                Your Reference:
              </span>
              <strong
                style={{
                  color: '#2B253E',
                  fontWeight: 600,
                  textAlign: 'right',
                  overflowWrap: 'anywhere',
                }}
              >
                {checkoutState.customerReference}
              </strong>
            </div>
          )}

          {/* Approval. Previewed by the server from the same rules placement
              applies — the account's approval rules, or its threshold when it
              has none — measured on the total including delivery. Placement
              decides again, so this is a forecast; the confirmation says which
              way it went. */}
          <div
            style={{
              padding: '10px 12px',
              borderRadius: '10px',
              backgroundColor: approval?.required ? '#FFFBEB' : '#FCF7FA',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
              fontSize: '0.76rem',
              lineHeight: 1.45,
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontWeight: 600,
                color: '#2B253E',
              }}
            >
              <ShieldCheck
                size={14}
                color={approval?.required ? '#B45309' : '#A39BB3'}
              />
              <span>
                {approval === null
                  ? 'Charge-to-Account Order'
                  : approval.required
                    ? 'Needs approval before fulfilment'
                    : 'No approval needed'}
              </span>
            </div>
            <p style={{ margin: 0, color: '#6E6781' }}>
              No online card payment required.{' '}
              {approval === null
                ? "If this order meets your account's approval rules it goes to Head Office for sign-off before fulfilment; otherwise it is released straight away."
                : !approval.required
                  ? 'It is released to fulfilment as soon as it is placed.'
                  : approval.reason === 'ACCOUNT_THRESHOLD' &&
                      approval.threshold !== null
                    ? `This total is above your account's approval limit of ${formatMoney(Number(approval.threshold))}, so Head Office signs it off before fulfilment.`
                    : 'It waits for sign-off before fulfilment:'}
            </p>
            {approval?.required && approval.steps.length > 0 && (
              <ol
                style={{
                  margin: 0,
                  paddingLeft: '18px',
                  color: '#5C566E',
                }}
              >
                {approval.steps.map((step) => (
                  <li key={`${step.tier}-${step.ruleName}`}>
                    {approval.steps.some((other) => other.tier !== step.tier)
                      ? `Round ${step.tier}: `
                      : ''}
                    {approverOf(step)}
                    <span style={{ color: '#A39BB3' }}> · {step.ruleName}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          {/* Settlement terms and acceptance.

              Both live on the server's basket: the payment method is the terms
              the order is placed under, and acceptance is stamped server-side
              so the client cannot choose the instant it claims to have
              happened. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              paddingTop: '16px',
              borderTop: '1px solid #F5EEF2',
            }}
          >
            <label
              htmlFor="settlementTerms"
              style={{
                fontSize: '0.78rem',
                fontWeight: 600,
                color: '#5C566E',
              }}
            >
              Settlement terms
            </label>
            <select
              id="settlementTerms"
              value={checkoutState.paymentMethod ?? 'CORPORATE_INVOICE'}
              disabled={isSubmitting}
              onChange={(e) => {
                void updateCheckoutState({
                  paymentMethod: e.target.value as NonNullable<
                    typeof checkoutState.paymentMethod
                  >,
                })
              }}
              style={{
                padding: '8px 12px',
                borderRadius: '10px',
                border: '1px solid #F0E6EC',
                backgroundColor: '#FFFFFF',
                fontSize: '0.84rem',
                color: '#2B253E',
              }}
            >
              {(
                [
                  'CORPORATE_INVOICE',
                  'PURCHASING_CARD',
                  'CORPORATE_ACH',
                ] as const
              ).map((method) => (
                <option key={method} value={method}>
                  {PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>

            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                fontSize: '0.78rem',
                lineHeight: 1.45,
                color: '#5C566E',
                cursor: isSavingTerms ? 'wait' : 'pointer',
              }}
            >
              <input
                type="checkbox"
                checked={Boolean(checkoutState.termsAcceptedAt)}
                disabled={isSavingTerms || isSubmitting}
                onChange={() => void toggleTerms()}
                style={{ marginTop: '2px', accentColor: '#F73582' }}
              />
              <span>
                I accept the terms of supply for this on-account order.
                {checkoutState.termsAcceptedAt && (
                  <strong
                    style={{
                      color: '#3F9C68',
                      display: 'block',
                      marginTop: '2px',
                      fontSize: '0.74rem',
                      fontWeight: 600,
                    }}
                  >
                    Accepted {formatDateTime(checkoutState.termsAcceptedAt)}
                  </strong>
                )}
              </span>
            </label>
          </div>

          {/* What the server still refuses, each with the way to fix it. */}
          {isChecking && blockers === null && (
            <p
              style={{
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.76rem',
                color: '#6E6781',
              }}
            >
              <Loader2
                size={12}
                style={{ animation: 'spin 1s linear infinite' }}
              />
              Checking this order with the server…
            </p>
          )}

          {outstanding.length > 0 && (
            <div
              role="alert"
              style={{
                padding: '10px 12px',
                borderRadius: '10px',
                backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.78rem',
                lineHeight: 1.45,
                color: '#DC2626',
              }}
            >
              <strong style={{ fontWeight: 600 }}>
                Before this order can be placed
              </strong>
              {outstanding.map((issue) => {
                const fix = ISSUE_FIX[issue.code]
                return (
                  <div key={`${issue.code}-${issue.lineId ?? 'cart'}`}>
                    <span>{issue.message}</span>
                    {fix && (
                      <Link
                        href={fix.href}
                        style={{
                          ...editLink,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginLeft: '6px',
                        }}
                      >
                        {fix.label} <ArrowRight size={12} />
                      </Link>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '8px',
                padding: '8px 12px',
                borderRadius: '10px',
                backgroundColor: isWarning ? '#FFFBEB' : '#FEF2F2',
                border: isWarning ? '1px solid #FDE68A' : '1px solid #FECACA',
                color: isWarning ? '#B45309' : '#DC2626',
                fontSize: '0.78rem',
                fontWeight: 500,
                lineHeight: 1.45,
              }}
            >
              <AlertCircle
                size={14}
                style={{ flexShrink: 0, marginTop: '2px' }}
              />
              <span>
                {submitError}
                {canRetry && (
                  <span
                    style={{
                      display: 'flex',
                      gap: '12px',
                      marginTop: '6px',
                      flexWrap: 'wrap',
                    }}
                  >
                    {/* The same basket id goes with it, so a retry after an
                        order that did land returns that order. */}
                    <button
                      type="button"
                      onClick={() => void handleSubmitOrder()}
                      disabled={submitDisabled}
                      style={{
                        ...editLink,
                        border: 'none',
                        background: 'none',
                        padding: 0,
                        cursor: submitDisabled ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isSubmitting ? 'Trying again…' : 'Try again'}
                    </button>
                    {failure === 'unconfirmed' && (
                      <Link
                        href="/shop/orders/history"
                        style={{ ...editLink, color: '#6E6781' }}
                      >
                        Check order history
                      </Link>
                    )}
                  </span>
                )}
                {failure === 'session-expired' && (
                  <Link
                    href="/login"
                    style={{ ...editLink, display: 'block', marginTop: '6px' }}
                  >
                    Sign in again
                  </Link>
                )}
              </span>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handleSubmitOrder}
            disabled={submitDisabled}
            className="touch-target"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '10px',
              backgroundColor: '#F73582',
              color: '#FFFFFF',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: submitDisabled ? 'not-allowed' : 'pointer',
              border: 'none',
              opacity: submitDisabled ? 0.5 : 1,
              transition: 'background-color 0.15s ease',
            }}
          >
            {isSubmitting ? (
              <>
                <Loader2
                  size={14}
                  style={{ animation: 'spin 1s linear infinite' }}
                />
                <span>Placing Order...</span>
              </>
            ) : (
              <>
                <span>Submit Order On-Account</span>
                <ArrowRight size={14} />
              </>
            )}
          </button>

          <Link
            href="/shop/checkout/delivery"
            className="touch-target"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: '#6E6781',
              textDecoration: 'none',
              padding: '4px',
            }}
          >
            Back to Delivery Details
          </Link>
        </div>
      </div>
    </div>
  )
}
