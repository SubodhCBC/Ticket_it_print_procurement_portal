// src/app/shop/cart/page.tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '@/hooks/useAuth'
import { useCart } from '@/hooks/useCart'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { QuantitySelector } from '@/components/shop/QuantitySelector'
import { CartLineSummary } from '@/components/shop/cart/CartLineSummary'
import { LineNoteEditor } from '@/components/shop/cart/LineNoteEditor'
import {
  OrderTotals,
  useTaxBasisNote,
} from '@/components/shop/cart/OrderTotals'
import { shippingOptionName } from '@/components/shop/cart/line-format'
import {
  ShoppingBag,
  ArrowRight,
  ArrowLeft,
  Trash2,
  ShieldCheck,
  Building2,
  LayoutTemplate,
} from 'lucide-react'
import { formatMoney } from '@/lib/format'

/**
 * Issues that already have a row of their own below — the purchase order and
 * the budget — or that belong to a later step, like the delivery method.
 * Listing them again would say the same thing twice.
 */
const HANDLED_ELSEWHERE = new Set([
  'SHIPPING_METHOD_REQUIRED',
  'PO_REQUIRED',
  'PO_PREFIX_MISMATCH',
  'PO_TOO_SHORT',
  'PO_INVALID_CHARACTERS',
  'PO_FORMAT_MISMATCH',
  'BUDGET_EXCEEDED',
  'USER_BUDGET_EXCEEDED',
])

const C = {
  text: '#2B253E',
  secondary: '#6E6781',
  muted: '#A39BB3',
  border: '#F0E6EC',
  hairline: '#F5EEF2',
  accent: '#F73582',
  accentSoft: '#FDE8F1',
  danger: '#DC2626',
}

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '16px',
  border: `1px solid ${C.border}`,
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 8px 24px rgba(43, 37, 62, 0.05)',
}

const summaryRow: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: '12px',
  color: C.secondary,
}

const notice = (tone: 'error' | 'warning' | 'info'): React.CSSProperties => ({
  padding: '10px 12px',
  borderRadius: '10px',
  fontSize: '0.78rem',
  fontWeight: 500,
  lineHeight: 1.45,
  ...(tone === 'error'
    ? {
        backgroundColor: '#FEF2F2',
        border: '1px solid #FECACA',
        color: C.danger,
      }
    : tone === 'warning'
      ? {
          backgroundColor: '#FFFBEB',
          border: '1px solid #FDE68A',
          color: '#B45309',
        }
      : {
          backgroundColor: '#EFF6FF',
          border: '1px solid #BFDBFE',
          color: '#1E40AF',
        }),
})

const primaryAction: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  padding: '12px 16px',
  borderRadius: '12px',
  backgroundColor: C.accent,
  color: '#FFFFFF',
  fontSize: '0.88rem',
  fontWeight: 600,
  textDecoration: 'none',
  boxShadow: '0 6px 16px rgba(247, 53, 130, 0.22)',
}

const secondaryAction: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  padding: '9px 14px',
  borderRadius: '10px',
  backgroundColor: '#FFFFFF',
  border: `1px solid ${C.border}`,
  color: C.text,
  fontSize: '0.82rem',
  fontWeight: 600,
  textDecoration: 'none',
  cursor: 'pointer',
}

export default function CartPage() {
  const { user } = useAuth()
  const {
    items,
    subtotal,
    catalogSubtotal,
    saving,
    shipping,
    total,
    totalCount,
    budget,
    userBudget,
    purchaseOrder,
    issues,
    warnings,
    siteName,
    siteCode,
    isLoading,
    isMutating,
    error: cartError,
    updateItemQty,
    updateItemNotes,
    removeItem,
    clearCart,
    acceptAdjustments,
  } = useCart()

  // Whether the account's prices include GST is a setting, so the note is read
  // rather than hardcoded. Until a method is chosen the total is not the whole
  // bill, and the note says so instead of implying it is.
  const taxNote = useTaxBasisNote(
    shipping ? 'on account' : 'shipping added at checkout'
  )

  // Below 768px — the toolkit's phone breakpoint, the same one `.stack-sm`
  // uses inside `CartLineSummary` — the rows stack their controls, so the
  // column header above them is no longer describing anything.
  const narrow = useMediaQuery('(max-width: 767.98px)')
  // Emptying the whole basket is one click from gone, so it asks first.
  const [confirmingClear, setConfirmingClear] = useState(false)

  // A line the server will not order — withdrawn, out of stock, unavailable —
  // has to be fixed here: every later step would only refuse it again.
  const blockedLineCount = items.filter((item) => item.issues.length > 0).length
  // Lines the server rounded to their MOQ or multiple. False for every line
  // when the account does not enforce MOQs, even though a warning remains.
  const hasAdjustedLines = items.some((item) => item.quantityAdjusted)

  const branchName = siteName ?? user?.siteName ?? null
  const branchCode = siteCode ?? user?.siteCode ?? null
  const visibleIssues = issues.filter(
    (issue) => !HANDLED_ELSEWHERE.has(issue.code)
  )

  // No page padding here: SaaSLayout's `<main>` already pads the page.
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '1240px',
        width: '100%',
        margin: '0 auto',
      }}
    >
      {/* 1. Page header */}
      <div
        className="row-wrap"
        style={{
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '12px 16px',
        }}
      >
        <div style={{ minWidth: 0 }}>
          {/* The ordering branch, when there is one to name: an icon and a
              dash said nothing and looked broken. */}
          {branchName && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '6px',
                fontSize: '0.76rem',
                fontWeight: 500,
                color: C.secondary,
              }}
            >
              <Building2 size={14} color={C.muted} />
              <span>
                {branchName}
                {branchCode && ` (${branchCode})`}
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: C.text,
                letterSpacing: '-0.02em',
                margin: 0,
              }}
            >
              Your cart
            </h1>
            {!isLoading && items.length > 0 && (
              <span
                style={{
                  padding: '2px 10px',
                  borderRadius: '999px',
                  backgroundColor: C.accentSoft,
                  color: C.accent,
                  fontSize: '0.76rem',
                  fontWeight: 700,
                }}
              >
                {totalCount} {totalCount === 1 ? 'item' : 'items'}
              </span>
            )}
          </div>

          <p
            style={{
              fontSize: '0.86rem',
              color: C.secondary,
              margin: '6px 0 0',
            }}
          >
            Check your items and quantities, then check out on account.
          </p>
        </div>

        {items.length > 0 && (
          <div className="row-wrap" style={{ gap: '8px' }}>
            {confirmingClear ? (
              <div
                role="group"
                aria-label="Clear the cart"
                className="row-wrap"
                style={{
                  gap: '8px',
                  padding: '6px 6px 6px 12px',
                  borderRadius: '12px',
                  border: '1px solid #FECACA',
                  backgroundColor: '#FEF2F2',
                  fontSize: '0.8rem',
                  color: C.danger,
                  fontWeight: 600,
                }}
              >
                Remove every item?
                <button
                  type="button"
                  onClick={() => {
                    setConfirmingClear(false)
                    void clearCart()
                  }}
                  className="touch-target"
                  style={{
                    ...secondaryAction,
                    padding: '6px 12px',
                    backgroundColor: C.danger,
                    borderColor: C.danger,
                    color: '#FFFFFF',
                  }}
                >
                  Clear cart
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  className="touch-target"
                  style={{ ...secondaryAction, padding: '6px 12px' }}
                >
                  Keep items
                </button>
              </div>
            ) : (
              <>
                <Link
                  href="/shop/templates"
                  className="touch-target"
                  style={secondaryAction}
                >
                  <LayoutTemplate size={14} />
                  <span>Browse designs</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(true)}
                  className="touch-target"
                  style={{ ...secondaryAction, color: C.danger }}
                >
                  <Trash2 size={14} />
                  <span>Clear cart</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* 2. Main content */}
      {/* Loading first: the basket starts empty on every page load now that it
          lives on the server, and "your cart is empty" before it arrives is
          a message about nothing. */}
      {isLoading ? (
        <div
          aria-busy="true"
          aria-label="Loading your cart"
          style={{ ...card, padding: '8px 20px' }}
        >
          <style>{`@keyframes cart-pulse { 0%,100% { opacity: .55 } 50% { opacity: 1 } }`}</style>
          {[0, 1, 2].map((row) => (
            <div
              key={row}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px 0',
                borderTop: row ? `1px solid ${C.hairline}` : 'none',
                animation: 'cart-pulse 1.4s ease-in-out infinite',
              }}
            >
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '12px',
                  backgroundColor: C.hairline,
                  flexShrink: 0,
                }}
              />
              <div style={{ flex: 1, display: 'grid', gap: '8px' }}>
                <div
                  style={{
                    width: '45%',
                    height: '12px',
                    borderRadius: '6px',
                    backgroundColor: C.hairline,
                  }}
                />
                <div
                  style={{
                    width: '70%',
                    height: '10px',
                    borderRadius: '6px',
                    backgroundColor: C.hairline,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            ...card,
            padding: '48px 24px',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: C.accentSoft,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '16px',
            }}
          >
            <ShoppingBag size={28} color={C.accent} />
          </div>

          <h2
            style={{
              fontSize: '1.1rem',
              fontWeight: 700,
              color: C.text,
              margin: '0 0 6px 0',
            }}
          >
            Your cart is empty
          </h2>

          <p
            style={{
              fontSize: '0.86rem',
              color: C.secondary,
              margin: '0 0 22px 0',
              lineHeight: 1.55,
              maxWidth: 'min(380px, 100%)',
            }}
          >
            Personalise a design or pick items from the catalogue — they will
            wait here until you check out.
          </p>

          <div
            className="row-wrap"
            style={{ justifyContent: 'center', gap: '10px' }}
          >
            <Link
              href="/shop/templates"
              className="touch-target"
              style={{ ...primaryAction, padding: '10px 18px' }}
            >
              <LayoutTemplate size={16} />
              <span>Browse designs</span>
            </Link>
            <Link
              href="/shop/catalogue"
              className="touch-target"
              style={secondaryAction}
            >
              <span>Return to catalogue</span>
            </Link>
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '20px',
            alignItems: 'flex-start',
          }}
        >
          {/* Items */}
          <div
            style={{
              ...card,
              flex: '999 1 560px',
              minWidth: 0,
              padding: narrow ? '4px 16px 14px' : '6px 22px 16px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {!narrow && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 0',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                  color: C.muted,
                }}
              >
                <span>Item</span>
                <span>Quantity &amp; total</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <AnimatePresence initial={false}>
                {items.map((item, index) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{
                      padding: '16px 0',
                      borderTop:
                        index === 0 && narrow
                          ? 'none'
                          : `1px solid ${C.hairline}`,
                    }}
                  >
                    <CartLineSummary
                      item={item}
                      variant="page"
                      onRemove={() => void removeItem(item.id)}
                      noteControl={
                        <LineNoteEditor
                          note={item.notes}
                          onSave={(note) => updateItemNotes(item.id, note)}
                        />
                      }
                      quantityControl={
                        <QuantitySelector
                          product={item.product}
                          value={item.qty}
                          onChange={(newQty) => updateItemQty(item.id, newQty)}
                          size="md"
                          showInlineHelp={false}
                        />
                      }
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            <div
              className="row-wrap"
              style={{
                justifyContent: 'space-between',
                paddingTop: '14px',
                borderTop: `1px solid ${C.hairline}`,
                fontSize: '0.8rem',
                color: C.muted,
              }}
            >
              <Link
                href="/shop/catalogue"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  color: C.accent,
                  textDecoration: 'none',
                }}
              >
                <ArrowLeft size={14} />
                <span>Add more from the catalogue</span>
              </Link>

              <span>
                <strong style={{ color: C.text, fontWeight: 600 }}>
                  {totalCount}
                </strong>{' '}
                {totalCount === 1 ? 'item' : 'items'} in your cart
              </span>
            </div>
          </div>

          {/* Summary: beside the items when there is room, under them when not.
              Sticky only beside them — stacked, it would ride over the list. */}
          <aside
            aria-label="Order summary"
            style={{
              ...card,
              flex: '1 1 320px',
              maxWidth: narrow ? 'none' : '380px',
              minWidth: 0,
              position: narrow ? 'static' : 'sticky',
              top: '80px',
              padding: '22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
            }}
          >
            <h2
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                color: C.text,
                letterSpacing: '-0.01em',
                margin: 0,
              }}
            >
              Order summary
            </h2>

            {/* Who is being billed: only the details that are known. */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                backgroundColor: '#FAF6F8',
                border: `1px solid ${C.hairline}`,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.8rem',
              }}
            >
              {user?.accountName && (
                <div style={summaryRow}>
                  <span>Account</span>
                  <strong
                    style={{
                      color: C.text,
                      fontWeight: 600,
                      textAlign: 'right',
                    }}
                  >
                    {user.accountName}
                  </strong>
                </div>
              )}
              {branchCode && (
                <div style={summaryRow}>
                  <span>Branch</span>
                  <strong
                    style={{
                      color: C.text,
                      fontWeight: 600,
                      textAlign: 'right',
                    }}
                  >
                    {branchCode}
                  </strong>
                </div>
              )}
              <div style={summaryRow}>
                <span>Payment</span>
                <strong
                  style={{ color: C.text, fontWeight: 600, textAlign: 'right' }}
                >
                  Monthly on account
                </strong>
              </div>
            </div>

            {/* What the server said about this basket. Blocking problems and
                acceptable adjustments are different things, so they read
                differently: an issue stops checkout, a warning offers a fix. */}
            {(cartError ||
              visibleIssues.length > 0 ||
              warnings.length > 0 ||
              budget?.wouldExceed ||
              userBudget?.wouldExceed ||
              (purchaseOrder?.required && !purchaseOrder.valid)) && (
              <div
                style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
              >
                {cartError && (
                  <div
                    role="alert"
                    style={{ ...notice('error'), fontWeight: 600 }}
                  >
                    {cartError}
                  </div>
                )}

                {/* The delivery method is chosen at checkout, so its absence
                    is not something to fix here. */}
                {visibleIssues.map((issue) => (
                  <div
                    key={`${issue.code}-${issue.lineId ?? 'cart'}`}
                    style={notice('error')}
                  >
                    {issue.message}
                  </div>
                ))}

                {budget?.wouldExceed && (
                  <div style={notice('warning')}>
                    This order would put the branch{' '}
                    {formatMoney(budget.overage)} over its monthly budget.
                  </div>
                )}

                {userBudget?.wouldExceed && (
                  <div style={notice('warning')}>
                    {userBudget.cap === 0
                      ? 'Your account is not currently permitted to place orders.'
                      : `This order would take you ${formatMoney(userBudget.overage)} over your personal monthly limit.`}
                  </div>
                )}

                {purchaseOrder?.required && !purchaseOrder.valid && (
                  <div style={notice('warning')}>
                    {purchaseOrder.message ??
                      'A purchase-order reference is required at checkout.'}
                  </div>
                )}

                {warnings.length > 0 && (
                  <div
                    style={{
                      ...notice('info'),
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                    }}
                  >
                    {warnings.map((warning) => (
                      <span key={`${warning.code}-${warning.lineId ?? 'cart'}`}>
                        {warning.message}
                      </span>
                    ))}
                    {/* Only when the server actually rounded a line. With
                        MOQ enforcement off for the account the warning still
                        suggests a quantity, but nothing was adjusted, so
                        there is nothing to apply. */}
                    {hasAdjustedLines && (
                      <button
                        type="button"
                        onClick={() => void acceptAdjustments()}
                        disabled={isMutating}
                        style={{
                          alignSelf: 'flex-start',
                          marginTop: '2px',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          border: '1px solid #BFDBFE',
                          backgroundColor: '#FFFFFF',
                          color: '#1E40AF',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          cursor: isMutating ? 'not-allowed' : 'pointer',
                          opacity: isMutating ? 0.5 : 1,
                        }}
                      >
                        Apply these quantities
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Every figure is the server's: the total already includes the
                delivery method once one is chosen. */}
            <OrderTotals
              subtotal={subtotal}
              shippingMethod={shipping ? shippingOptionName(shipping) : null}
              shippingPrice={shipping ? Number(shipping.price) : null}
              total={total}
              totalLabel="Total"
              size="lg"
              // The GST basis is the account's, not a constant — see
              // `useTaxBasisNote`.
              totalNote={taxNote}
              leadingRows={
                /*
                  Only when there is a difference to show. A design's price has
                  no catalogue counterfactual, so these rows would otherwise
                  print the subtotal twice and imply a saving of nothing.
                */
                saving > 0 && (
                  <>
                    <div style={summaryRow}>
                      <span>Catalogue price</span>
                      <span
                        style={{
                          color: C.muted,
                          textDecoration: 'line-through',
                        }}
                      >
                        {formatMoney(catalogSubtotal)}
                      </span>
                    </div>
                    <div style={summaryRow}>
                      <span>Contract saving</span>
                      <strong style={{ color: '#3F9C68', fontWeight: 600 }}>
                        -{formatMoney(saving)}
                      </strong>
                    </div>
                  </>
                )
              }
              extraRows={
                <>
                  {budget !== null && budget.cap !== null && (
                    <div style={summaryRow}>
                      <span>Branch budget remaining</span>
                      <strong
                        style={{
                          color: budget.wouldExceed ? C.danger : '#3F9C68',
                          fontWeight: 600,
                        }}
                      >
                        {formatMoney(budget.remaining ?? 0)}
                      </strong>
                    </div>
                  )}
                  {userBudget !== null && userBudget.cap !== null && (
                    <div style={summaryRow}>
                      <span>Your monthly limit remaining</span>
                      <strong
                        style={{
                          color: userBudget.wouldExceed ? C.danger : '#3F9C68',
                          fontWeight: 600,
                        }}
                      >
                        {formatMoney(userBudget.remaining ?? 0)}
                      </strong>
                    </div>
                  )}
                </>
              }
            />

            {blockedLineCount > 0 ? (
              <>
                <span
                  aria-disabled="true"
                  style={{
                    ...primaryAction,
                    opacity: 0.5,
                    boxShadow: 'none',
                    cursor: 'not-allowed',
                  }}
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight size={16} />
                </span>
                <span
                  style={{
                    fontSize: '0.78rem',
                    color: C.danger,
                    textAlign: 'center',
                  }}
                >
                  {blockedLineCount === 1
                    ? 'One item cannot be ordered — fix or remove it to continue.'
                    : `${blockedLineCount} items cannot be ordered — fix or remove them to continue.`}
                </span>
              </>
            ) : (
              <Link href="/shop/checkout/details" style={primaryAction}>
                <span>Proceed to Checkout</span>
                <ArrowRight size={16} />
              </Link>
            )}

            {/* Reassurance: not a warning, so a quiet line under the action. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'center',
                gap: '6px',
                color: C.secondary,
                fontSize: '0.76rem',
                lineHeight: 1.45,
                textAlign: 'center',
              }}
            >
              <ShieldCheck
                size={15}
                color={C.muted}
                style={{ flexShrink: 0, marginTop: '1px' }}
              />
              <span>No card needed — your order is placed on account.</span>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}
