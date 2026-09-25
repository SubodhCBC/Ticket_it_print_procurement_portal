// src/app/admin/reports/monthly-billing/_components/invoice-ui.tsx
'use client'

import React from 'react'
import type { ApiInvoiceStatus } from '@/services/data-source/api/report.types'
import { INVOICE_STATUS_STYLES } from './invoice-shared'

export function InvoiceStatusBadge({
  status,
  overdue = false,
}: {
  status: ApiInvoiceStatus
  overdue?: boolean
}) {
  const styles = INVOICE_STATUS_STYLES[status] ?? INVOICE_STATUS_STYLES.DRAFT

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '3px 10px',
          borderRadius: '9999px',
          backgroundColor: styles.bg,
          color: styles.text,
          border: `1px solid ${styles.border}`,
          fontSize: '0.72rem',
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '9999px',
            backgroundColor: styles.dot,
          }}
        />
        {styles.label}
      </span>
      {overdue && (
        <span
          style={{
            padding: '3px 10px',
            borderRadius: '9999px',
            backgroundColor: '#FFFBEB',
            color: '#B45309',
            border: '1px solid rgba(245, 158, 11, 0.35)',
            fontSize: '0.72rem',
            fontWeight: 600,
            whiteSpace: 'nowrap',
          }}
        >
          Overdue
        </span>
      )}
    </span>
  )
}

export function InlineAlert({
  tone = 'error',
  children,
}: {
  tone?: 'error' | 'info' | 'success'
  children: React.ReactNode
}) {
  const palette = {
    error: { bg: '#FEF2F2', border: '#FECACA', text: '#DC2626' },
    info: { bg: '#FCF7FA', border: '#F0E6EC', text: '#6E6781' },
    success: { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857' },
  }[tone]

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      style={{
        padding: '10px 14px',
        borderRadius: '10px',
        backgroundColor: palette.bg,
        border: `1px solid ${palette.border}`,
        color: palette.text,
        fontSize: '0.8rem',
        fontWeight: 500,
      }}
    >
      {children}
    </div>
  )
}
