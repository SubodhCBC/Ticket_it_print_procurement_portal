// src/app/admin/reports/monthly-billing/_components/PeriodInvoices.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import React, { useId, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FilePlus, ChevronRight } from 'lucide-react'
import { AuditAccountPicker } from '@/components/admin/AuditAccountPicker'
import { generateInvoice } from '@/services/data-source/api/api-reports.adapter'
import type { ApiInvoice } from '@/services/data-source/api/report.types'
import { InlineAlert, InvoiceStatusBadge } from './invoice-ui'
import { formatDate, formatMoney } from '@/lib/format'
import {
  card,
  cardSubtitle,
  cardTitle,
  controlStyle,
  disabledWhen,
  errorMessage,
  labelStyle,
  periodLabel,
  primaryButton,
  th,
  thEdge,
} from './invoice-shared'

interface PeriodInvoicesProps {
  billingPeriod: string
  invoices: ApiInvoice[]
  isLoading: boolean
  error: string | null
  /** Generate is offered only with BILLING_MANAGE. */
  canManage: boolean
  /** Only an administrator may generate for an account other than their own. */
  isAdmin: boolean
  ownAccountId?: string
  ownAccountName?: string
}

const detailHref = (invoiceId: string) =>
  `/admin/reports/monthly-billing/${encodeURIComponent(invoiceId)}`

/**
 * Every invoice in the period, with a way to draft one.
 *
 * Generating opens the draft it produced: issuing is a separate, deliberate
 * step taken from the detail page, never a side effect of generating.
 */
export function PeriodInvoices({
  billingPeriod,
  invoices,
  isLoading,
  error,
  canManage,
  isAdmin,
  ownAccountId,
  ownAccountName,
}: PeriodInvoicesProps) {
  const router = useRouter()
  const accountFieldId = useId()
  const [accountId, setAccountId] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)

  const targetAccountId = accountId || ownAccountId
  const existingDraft = invoices.find(
    (invoice) =>
      invoice.status === 'DRAFT' &&
      (!targetAccountId || invoice.accountId === targetAccountId)
  )

  const handleGenerate = async () => {
    setIsGenerating(true)
    setGenerateError(null)
    try {
      const draft = await generateInvoice(billingPeriod, accountId || undefined)
      router.push(detailHref(draft.id))
    } catch (err) {
      setGenerateError(errorMessage(err, 'Could not generate the invoice.'))
      setIsGenerating(false)
    }
  }

  return (
    <section style={{ ...card, overflow: 'hidden' }}>
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #F5EEF2',
        }}
      >
        <h3 style={cardTitle}>Invoices — {periodLabel(billingPeriod)}</h3>
        <p style={cardSubtitle}>
          Drafts, issued, paid and void invoices for the period. Open one to
          issue, settle or void it.
        </p>
      </div>

      {canManage && (
        /* Kept as its own flex row rather than `.row-wrap`: the Generate
           button is aligned with the bottom of the account field, which
           centring would undo. */
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #F5EEF2',
            display: 'flex',
            alignItems: 'flex-end',
            gap: '12px',
            flexWrap: 'wrap',
            minWidth: 0,
          }}
        >
          {isAdmin && (
            // A 240px floor plus the card's gutter did not fit a 360px phone.
            <div style={{ minWidth: 0, flex: '1 1 260px' }}>
              <label htmlFor={accountFieldId} style={labelStyle}>
                Account to bill
              </label>
              <AuditAccountPicker
                id={accountFieldId}
                value={accountId}
                ownAccountId={ownAccountId}
                ownAccountName={ownAccountName}
                onChange={setAccountId}
                style={controlStyle}
              />
            </div>
          )}
          <div>
            <button
              type="button"
              className="touch-target"
              onClick={handleGenerate}
              disabled={isGenerating}
              style={disabledWhen(primaryButton, isGenerating)}
            >
              <FilePlus size={15} />
              <span>
                {isGenerating
                  ? 'Generating...'
                  : existingDraft
                    ? 'Rebuild draft invoice'
                    : 'Generate invoice'}
              </span>
            </button>
          </div>
          <div
            style={{
              fontSize: '0.74rem',
              color: '#A39BB3',
              flex: '1 1 240px',
              alignSelf: 'center',
            }}
          >
            Drafts from the period&apos;s billable orders not already on an
            issued invoice. Running it again rebuilds the existing draft.
          </div>
          {generateError && (
            <div style={{ flexBasis: '100%' }}>
              <InlineAlert>{generateError}</InlineAlert>
            </div>
          )}
        </div>
      )}

      {error && (
        <div style={{ padding: '16px 20px' }}>
          <InlineAlert>{error}</InlineAlert>
        </div>
      )}

      {isLoading ? (
        <SkeletonTable rows={4} columns={6} label="Loading invoices" />
      ) : invoices.length === 0 ? (
        !error && (
          <div style={emptyStyle}>
            No invoice has been generated for {periodLabel(billingPeriod)} yet.
          </div>
        )
      ) : (
        <div className="table-scroll">
          {/* Eight columns of invoice, account, dates and money — it scrolls
              inside the card instead of crushing the account name. */}
          <table
            style={{
              width: '100%',
              minWidth: '860px',
              borderCollapse: 'collapse',
              textAlign: 'left',
              fontSize: '0.84rem',
            }}
          >
            <thead>
              <tr>
                <th style={thEdge}>Invoice</th>
                <th style={th}>Account</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'center' }}>Orders</th>
                <th style={th}>Issued</th>
                <th style={th}>Due</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={thEdge} aria-label="Open" />
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr
                  key={invoice.id}
                  onClick={() => router.push(detailHref(invoice.id))}
                  tabIndex={0}
                  aria-label={`Open invoice ${invoice.invoiceNumber ?? 'draft'}`}
                  onKeyDown={(event) => {
                    // Only the row's own keystrokes: the invoice link inside
                    // it navigates on its own.
                    if (event.target !== event.currentTarget) return
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      router.push(detailHref(invoice.id))
                    }
                  }}
                  style={{ borderTop: '1px solid #F5EEF2', cursor: 'pointer' }}
                >
                  <td style={{ padding: '12px 20px' }}>
                    <Link
                      href={detailHref(invoice.id)}
                      onClick={(event) => event.stopPropagation()}
                      style={{
                        fontWeight: 600,
                        color: '#2B253E',
                        textDecoration: 'none',
                        fontFamily: invoice.invoiceNumber
                          ? 'monospace'
                          : undefined,
                      }}
                    >
                      {invoice.invoiceNumber ?? 'Draft'}
                    </Link>
                  </td>
                  <td style={{ padding: '12px 14px', color: '#2B253E' }}>
                    {invoice.accountName}
                    <div
                      style={{
                        fontFamily: 'monospace',
                        fontSize: '0.74rem',
                        color: '#A39BB3',
                      }}
                    >
                      {invoice.accountCode}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <InvoiceStatusBadge
                      status={invoice.status}
                      overdue={invoice.overdue}
                    />
                  </td>
                  <td
                    style={{
                      padding: '12px 14px',
                      textAlign: 'center',
                      color: '#6E6781',
                    }}
                  >
                    {invoice.orderCount}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#6E6781' }}>
                    {formatDate(invoice.issuedAt)}
                  </td>
                  <td style={{ padding: '12px 14px', color: '#6E6781' }}>
                    {formatDate(invoice.dueAt)}
                  </td>
                  <td
                    style={{
                      padding: '12px 14px',
                      textAlign: 'right',
                      fontWeight: 700,
                      color: '#2B253E',
                    }}
                  >
                    {formatMoney(invoice.total)}
                  </td>
                  <td
                    style={{
                      padding: '12px 20px',
                      textAlign: 'right',
                      color: '#A39BB3',
                    }}
                  >
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

const emptyStyle: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  color: '#A39BB3',
  fontSize: '0.84rem',
}
