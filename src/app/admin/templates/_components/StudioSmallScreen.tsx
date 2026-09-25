// src/app/admin/templates/_components/StudioSmallScreen.tsx
'use client'

import type { ReactNode } from 'react'
import Link from 'next/link'
import { ArrowLeft, Monitor } from 'lucide-react'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/**
 * The template studio is a fabric.js canvas with layer, type and image panels
 * around it. There is no honest way to fit that on a phone — a 360px canvas
 * with a dozen collapsed panels is not a design tool, it is a trap — so below
 * 768px the studio is not offered at all and this says so plainly instead.
 *
 * The cut is made in JavaScript rather than with `.hide-sm`, so the canvas is
 * never built at a size it cannot work at. `useMediaQuery` reports false on the
 * server and through hydration, which is why the studio is what the markup
 * carries; on a phone it is replaced on the first commit after mount.
 */
/**
 * Below this the studio is not offered.
 *
 * Not the 768px phone breakpoint the rest of the portal uses: the studio's two
 * rails are 260px and 300px and do not shrink, so a 768px tablet leaves about
 * 208px of canvas — narrower than the layer list beside it. Landscape on a
 * tablet is 1024px, and that is where the thing becomes usable.
 */
export const STUDIO_TOO_NARROW = '(max-width: 1023.98px)'

export function StudioNeedsWiderScreen({
  /** Head office owns its own templates, so "back" is not always the admin list. */
  backHref = '/admin/templates',
}: {
  backHref?: string
} = {}) {
  return (
    <main
      className="page-pad"
      style={{
        paddingBlock: '48px',
        minHeight: '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          border: '1px solid #F0E6EC',
          padding: '28px 24px',
          maxWidth: '420px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            margin: '0 auto 14px',
            borderRadius: '12px',
            backgroundColor: '#FCF7FA',
            border: '1px solid #F0E6EC',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#A39BB3',
          }}
        >
          <Monitor size={20} />
        </div>
        <h2
          style={{
            fontSize: '1rem',
            fontWeight: 700,
            color: '#2B253E',
            margin: 0,
          }}
        >
          The template studio needs a wider screen
        </h2>
        <p
          style={{
            fontSize: '0.84rem',
            color: '#6E6781',
            lineHeight: 1.55,
            margin: '8px 0 0',
          }}
        >
          Designing a template means a canvas, a layer list and the type and
          image controls, side by side. Open this page on a tablet held
          landscape, a laptop or a desktop and the studio is waiting exactly as
          you left it. Nothing here has changed.
        </p>
        <Link
          href={backHref}
          className="touch-target"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            marginTop: '18px',
            padding: '10px 16px',
            borderRadius: '10px',
            backgroundColor: '#F73582',
            color: '#FFFFFF',
            fontSize: '0.84rem',
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} />
          Back to templates
        </Link>
      </div>
    </main>
  )
}

/** Renders the studio on a tablet and up, the note above on a phone. */
export function StudioSmallScreenGuard({
  children,
  backHref,
}: {
  children: ReactNode
  backHref?: string
}) {
  const tooNarrow = useMediaQuery(STUDIO_TOO_NARROW)
  if (tooNarrow) return <StudioNeedsWiderScreen backHref={backHref} />
  return <>{children}</>
}
