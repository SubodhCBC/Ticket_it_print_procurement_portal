// src/app/head-office/image-library/page.tsx
'use client'

import { Building2 } from 'lucide-react'
import { DamLibrary } from '@/components/dam/DamLibrary'
import { useAuth } from '@/hooks/useAuth'

/**
 * The image library inside the head-office portal. SaaSLayout already draws
 * the top bar and pads <main>, so the page brings only its own heading, like
 * the catalogue page beside it.
 */
export default function HeadOfficeImageLibraryPage() {
  const { user } = useAuth()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        minWidth: 0,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '6px',
            fontSize: '0.76rem',
            fontWeight: 500,
            color: '#A39BB3',
          }}
        >
          <Building2 size={14} />
          <span>{user?.organization ?? 'Your account'} • Brand assets</span>
        </div>

        <h1
          style={{
            fontSize: '1.25rem',
            fontWeight: 700,
            color: '#2B253E',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          Image Library
        </h1>

        <p style={{ fontSize: '0.8rem', color: '#6E6781', margin: '4px 0 0' }}>
          The logos, photos and PDFs held in your Ticket-IT library, ready for
          branch templates and print artwork.
        </p>
      </div>

      <section
        style={{
          backgroundColor: '#FFFFFF',
          borderRadius: '14px',
          border: '1px solid #F0E6EC',
          boxShadow:
            '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
          padding: 'clamp(12px, 3vw, 20px)',
          minWidth: 0,
        }}
      >
        <DamLibrary mode="manage" />
      </section>
    </div>
  )
}
