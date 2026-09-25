'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { RotateCcw, TriangleAlert } from 'lucide-react'

/**
 * What a thrown render error looks like.
 *
 * Without this file Next shows its own blank page in production, which during
 * a demo reads as "the portal died". The user gets a way out — try again, or
 * go back to the portal — and the real error goes to the console for whoever
 * is debugging, never onto the screen: a stack trace tells a branch manager
 * nothing and tells an attacker something.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled application error', error)
  }, [error])

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
        backgroundColor: '#FCF7FA',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: '#FFFFFF',
          border: '1px solid #F0E6EC',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 10px 30px rgba(43, 37, 62, 0.06)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '44px',
            height: '44px',
            borderRadius: '12px',
            background: 'rgba(247, 53, 130, 0.12)',
            color: '#F73582',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 14px',
          }}
        >
          <TriangleAlert size={22} />
        </div>

        <h1
          style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            color: '#2B253E',
            margin: '0 0 6px',
          }}
        >
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: '0.86rem',
            color: '#6E6781',
            margin: '0 0 18px',
            lineHeight: 1.5,
          }}
        >
          This screen could not be loaded. Nothing you had saved is lost — try
          again, and if it keeps happening tell your administrator.
        </p>

        {error.digest && (
          <p
            style={{
              fontSize: '0.72rem',
              color: '#A39BB3',
              margin: '0 0 18px',
              fontFamily: 'monospace',
            }}
          >
            Reference: {error.digest}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            gap: '10px',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={reset}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              padding: '9px 16px',
              borderRadius: '10px',
              border: 'none',
              background: '#F73582',
              color: '#FFFFFF',
              fontSize: '0.84rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <RotateCcw size={15} />
            Try again
          </button>
          <Link
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '9px 16px',
              borderRadius: '10px',
              border: '1px solid #F0E6EC',
              color: '#2B253E',
              fontSize: '0.84rem',
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Back to the portal
          </Link>
        </div>
      </div>
    </div>
  )
}
