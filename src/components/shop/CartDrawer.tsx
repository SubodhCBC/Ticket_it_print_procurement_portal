// src/components/shop/CartDrawer.tsx
'use client'

import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react'
import { useCart } from '@/hooks/useCart'
import { QuantitySelector } from './QuantitySelector'
import { CartLineSummary } from './cart/CartLineSummary'
import { OrderTotals } from './cart/OrderTotals'
import { shippingOptionName } from './cart/line-format'

export function CartDrawer() {
  const {
    items,
    subtotal,
    shipping,
    total,
    totalCount,
    isCartDrawerOpen,
    setIsCartDrawerOpen,
    updateItemQty,
    removeItem,
  } = useCart()

  if (!isCartDrawerOpen) return null

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 999,
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => setIsCartDrawerOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
          }}
        />

        {/* Drawer Panel */}
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 26, stiffness: 240 }}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth: '420px',
            backgroundColor: '#FFFFFF',
            height: '100%',
            // The one overlay shadow. The panel is flush with the right edge,
            // so only its exposed side carries the border and the rounding.
            boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)',
            borderLeft: '1px solid #F0E6EC',
            borderRadius: '12px 0 0 12px',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 10,
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid #F5EEF2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                minWidth: 0,
              }}
            >
              <ShoppingCart size={16} color="#A39BB3" />
              <div style={{ minWidth: 0 }}>
                <h3
                  style={{
                    fontSize: '1rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    letterSpacing: '-0.01em',
                    margin: 0,
                  }}
                >
                  Shopping Cart
                </h3>
                <p
                  style={{
                    fontSize: '0.76rem',
                    color: '#A39BB3',
                    fontWeight: 400,
                    margin: '2px 0 0',
                  }}
                >
                  {totalCount} {totalCount === 1 ? 'item' : 'items'} ready for
                  order
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsCartDrawerOpen(false)}
              aria-label="Close cart"
              className="touch-target"
              style={{
                width: '32px',
                height: '32px',
                flexShrink: 0,
                borderRadius: '10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6E6781',
                cursor: 'pointer',
                backgroundColor: 'transparent',
                border: 'none',
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Cart Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '4px 20px',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {items.length === 0 ? (
              <div
                style={{
                  height: '100%',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textAlign: 'center',
                  padding: '32px 16px',
                }}
              >
                <ShoppingBag
                  size={16}
                  color="#A39BB3"
                  style={{ marginBottom: '10px' }}
                />
                <h4
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: '#2B253E',
                    margin: 0,
                  }}
                >
                  Your Cart is Empty
                </h4>
                <p
                  style={{
                    fontSize: '0.84rem',
                    color: '#A39BB3',
                    maxWidth: '280px',
                    marginTop: '4px',
                    marginBottom: '16px',
                    lineHeight: 1.5,
                  }}
                >
                  Browse your approved branch catalogue and add items to place a
                  collateral order.
                </p>
                <button
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="touch-target"
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#F73582',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: 'none',
                  }}
                >
                  Browse catalogue
                </button>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {items.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    layout
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    // Rows, not tiles: a hairline between lines separates them
                    // without a boxed card per item inside the panel.
                    style={{
                      padding: '14px 0',
                      borderTop: idx === 0 ? 'none' : '1px solid #F5EEF2',
                    }}
                  >
                    <CartLineSummary
                      item={item}
                      variant="drawer"
                      onRemove={() => void removeItem(item.id)}
                      onEditDesign={() => setIsCartDrawerOpen(false)}
                      quantityControl={
                        <QuantitySelector
                          product={item.product}
                          value={item.qty}
                          onChange={(newQty) => updateItemQty(item.id, newQty)}
                          size="sm"
                          showInlineHelp={false}
                        />
                      }
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Footer / Summary */}
          {items.length > 0 && (
            <div
              style={{
                padding: '16px 20px',
                borderTop: '1px solid #F5EEF2',
                backgroundColor: '#FFFFFF',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}
            >
              {/* Account Billing Notice. Reassurance rather than a warning, so
                  it is a quiet line, not a tinted banner. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#6E6781',
                  fontSize: '0.76rem',
                }}
              >
                <ShieldCheck
                  size={16}
                  color="#A39BB3"
                  style={{ flexShrink: 0 }}
                />
                <span>
                  Billed on monthly consolidated account. No card required.
                </span>
              </div>

              <OrderTotals
                subtotal={subtotal}
                shippingMethod={shipping ? shippingOptionName(shipping) : null}
                shippingPrice={shipping ? Number(shipping.price) : null}
                total={total}
              />

              {/* Action Buttons */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '8px',
                }}
              >
                <Link
                  href="/shop/cart"
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="touch-target"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    border: '1px solid #F0E6EC',
                    backgroundColor: '#FFFFFF',
                    color: '#2B253E',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    textDecoration: 'none',
                  }}
                >
                  View Full Cart
                </Link>

                <Link
                  href="/shop/checkout/details"
                  onClick={() => setIsCartDrawerOpen(false)}
                  className="touch-target"
                  style={{
                    padding: '8px 14px',
                    borderRadius: '10px',
                    backgroundColor: '#F73582',
                    color: '#FFFFFF',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    textAlign: 'center',
                    textDecoration: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                  }}
                >
                  Checkout <ArrowRight size={14} />
                </Link>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
