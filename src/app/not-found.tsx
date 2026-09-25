import Link from 'next/link'
import { Compass } from 'lucide-react'

/**
 * A mistyped or retired URL, answered inside the portal's own look.
 *
 * Without this file a stale bookmark drops the user onto Next's default black
 * and white 404, which looks like a different application altogether.
 */
export default function NotFound() {
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
          <Compass size={22} />
        </div>

        <h1
          style={{
            fontSize: '1.15rem',
            fontWeight: 700,
            color: '#2B253E',
            margin: '0 0 6px',
          }}
        >
          Page not found
        </h1>
        <p
          style={{
            fontSize: '0.86rem',
            color: '#6E6781',
            margin: '0 0 18px',
            lineHeight: 1.5,
          }}
        >
          This address does not exist, or the page has moved. The link may be an
          old bookmark.
        </p>

        <Link
          href="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '9px 18px',
            borderRadius: '10px',
            background: '#F73582',
            color: '#FFFFFF',
            fontSize: '0.84rem',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Back to the portal
        </Link>
      </div>
    </div>
  )
}
