// src/components/shop/customise/SmallScreenNotice.tsx
'use client'

import Link from 'next/link'
import { MonitorSmartphone } from 'lucide-react'
import { T, cardStyle, primaryButton, secondaryButton } from './theme'

/**
 * What a phone gets instead of the studio.
 *
 * The canvas and its panels need a tablet's width before any of it is usable,
 * and a squeezed version of it would be worse than saying so. The rest of the
 * flow — review, options, the cart — works at 360px, so this is only ever in
 * place of the canvas.
 *
 * The studio route has no padding from SaaSLayout's `<main>`, so this carries
 * its own: `.page-pad` for the sides, `paddingBlock` inline.
 */
export function SmallScreenNotice() {
  return (
    <div
      className="page-pad"
      style={{
        width: '100%',
        minHeight: '100%',
        overflowY: 'auto',
        paddingBlock: '32px',
        backgroundColor: T.page,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          ...cardStyle,
          maxWidth: '420px',
          margin: '0 auto',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '44px',
            height: '44px',
            borderRadius: '50%',
            backgroundColor: T.accentSoft,
            color: T.accent,
          }}
        >
          <MonitorSmartphone size={22} />
        </span>

        <div>
          <h1
            style={{
              margin: 0,
              fontSize: '1.25rem',
              fontWeight: 700,
              color: T.text,
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
            }}
          >
            Personalising a design needs a larger screen
          </h1>
          <p
            style={{
              margin: '8px 0 0',
              fontSize: '0.88rem',
              color: T.secondary,
              lineHeight: 1.5,
            }}
          >
            The design canvas and its panels need the width of a tablet, laptop
            or desktop. Open this design on a larger screen to personalise it.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <Link
            href="/shop/templates"
            style={{
              ...primaryButton(),
              width: '100%',
              padding: '12px 18px',
              textDecoration: 'none',
            }}
          >
            Back to designs
          </Link>
          <Link
            href="/shop/catalogue"
            style={{
              ...secondaryButton(),
              width: '100%',
              padding: '12px 18px',
              textDecoration: 'none',
            }}
          >
            Browse the catalogue
          </Link>
        </div>
      </div>
    </div>
  )
}
