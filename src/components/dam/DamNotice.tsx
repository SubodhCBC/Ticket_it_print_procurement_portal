// src/components/dam/DamNotice.tsx
'use client'

import React from 'react'
import { LoaderCircle } from 'lucide-react'

/**
 * A centred message in place of the library: loading, the access gate, empty
 * folders and failed listings all share it so they read as one family.
 */
export function DamNotice({
  icon,
  title,
  message,
  tone = 'neutral',
  loading = false,
  action,
  children,
}: {
  icon?: React.ReactNode
  title: string
  message?: React.ReactNode
  tone?: 'neutral' | 'danger'
  loading?: boolean
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  const accent = tone === 'danger' ? '#DC2626' : '#F73582'
  const soft = tone === 'danger' ? '#FEF2F2' : '#FDE8F1'

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '10px',
        padding: '36px 16px',
        color: '#6E6781',
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '14px',
          backgroundColor: soft,
          color: accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {loading ? (
          <LoaderCircle
            size={22}
            style={{ animation: 'spin 0.8s linear infinite' }}
          />
        ) : (
          icon
        )}
      </div>
      <div
        style={{
          fontSize: '0.95rem',
          fontWeight: 700,
          color: '#2B253E',
          overflowWrap: 'anywhere',
        }}
      >
        {title}
      </div>
      {message && (
        <div
          style={{
            fontSize: '0.8rem',
            lineHeight: 1.5,
            maxWidth: '460px',
            overflowWrap: 'anywhere',
          }}
        >
          {message}
        </div>
      )}
      {children}
      {action && (
        <div
          style={{
            display: 'flex',
            gap: '8px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: '4px',
          }}
        >
          {action}
        </div>
      )}
    </div>
  )
}
