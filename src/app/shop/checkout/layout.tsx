// src/app/shop/checkout/layout.tsx
'use client'

import React, { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useCart } from '@/hooks/useCart'
import { CheckoutStepper } from '@/components/shop/CheckoutStepper'

export default function CheckoutLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { items, isLoading, justCheckedOut } = useCart()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Only once the basket has actually been fetched. It starts empty on every
    // page load now that it lives on the server, so judging it before then
    // bounces the buyer out of checkout mid-load.
    if (isLoading) return

    // An order that has just been placed empties the basket on purpose. Without
    // this the guard fires between submitting and reaching the confirmation
    // page, and the buyer is sent back to an empty cart having just paid.
    if (justCheckedOut) return

    if (items.length === 0 && !pathname.includes('/order-confirmation')) {
      router.push('/shop/cart')
    }
  }, [isLoading, justCheckedOut, items.length, pathname, router])

  // No bottom padding: SaaSLayout's `<main>` already pads the page, and a
  // second band under it only pushed the last card further from the fold.
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '1080px',
        margin: '0 auto',
        width: '100%',
      }}
    >
      <CheckoutStepper />
      {children}
    </div>
  )
}
