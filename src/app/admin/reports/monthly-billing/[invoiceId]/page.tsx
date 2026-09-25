// src/app/admin/reports/monthly-billing/[invoiceId]/page.tsx
'use client'

import { SkeletonDetail } from '@/components/ui/Skeleton'
import React, { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  ArrowLeft,
  Ban,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Send,
} from 'lucide-react'
import { AdminHeader } from '@/components/admin/AdminHeader'
import { InvoicePdfViewer } from '@/components/billing/InvoicePdfViewer'
import { useAuth } from '@/hooks/useAuth'
import {
  downloadInvoice,
  generateInvoice,
  getInvoice,
  issueInvoice,
  markInvoicePaid,
  saveBlob,
  voidInvoice,
  type InvoiceFormat,
} from '@/services/data-source/api/api-reports.adapter'
import { InlineAlert, InvoiceStatusBadge } from '../_components/invoice-ui'
import { formatDate, formatMoney } from '@/lib/format'
import {
  card,
  cardSubtitle,
  cardTitle,
  dangerButton,
  disabledWhen,
  errorMessage,
  periodLabel,
  primaryButton,
  secondaryButton,
  th,
  thEdge,
  type InvoiceDetail,
} from '../_components/invoice-shared'
import {
  IssueInvoiceDialog,
  MarkPaidDialog,
  RegenerateDraftDialog,
  VoidInvoiceDialog,
  type InvoiceAction,
} from '../_components/InvoiceActionDialogs'

const BACK_HREF = '/admin/reports/monthly-billing'

/**
 * The transitions the billing service accepts from each status.
 *
 * Mirrors `billing.service.ts`: only a draft is issued (or rebuilt), only an
 * issued invoice is settled, and anything already sent — issued or paid — can
 * be voided. A void is final.
 */
const ALLOWED_ACTIONS: Record<InvoiceDetail['status'], InvoiceAction[]> = {
  DRAFT: ['issue', 'regenerate'],
  ISSUED: ['paid', 'void'],
  PAID: ['void'],
  VOID: [],
}

const tdBase: React.CSSProperties = {
  padding: '12px 14px',
  color: '#2B253E',
  verticalAlign: 'top',
}

export default function InvoiceDetailPage() {
  const params = useParams()
  const invoiceId = (params.invoiceId as string) || ''
  const { hasPermission } = useAuth()
  const canManage = hasPermission('BILLING_MANAGE')
  // Closed at first: the PDF is rendered on request, not on every visit.
  const [showDocument, setShowDocument] = useState(false)

  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [dialog, setDialog] = useState<InvoiceAction | null>(null)
  const [isPending, setIsPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const [downloading, setDownloading] = useState<InvoiceFormat | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [expandedLines, setExpandedLines] = useState<Set<string>>(
    () => new Set()
  )

  const load = useCallback(async () => {
    if (!invoiceId) return
    setLoadError(null)
    try {
      setInvoice((await getInvoice(invoiceId)) as InvoiceDetail)
    } catch (error) {
      setLoadError(errorMessage(error, 'Could not load this invoice.'))
    } finally {
      setIsLoading(false)
    }
  }, [invoiceId])

  useEffect(() => {
    if (!invoiceId) return
    let cancelled = false

    getInvoice(invoiceId)
      .then((found) => {
        if (!cancelled) setInvoice(found as InvoiceDetail)
      })
      .catch((error) => {
        if (!cancelled)
          setLoadError(errorMessage(error, 'Could not load this invoice.'))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [invoiceId])

  const closeDialog = () => {
    if (isPending) return
    setDialog(null)
    setActionError(null)
  }

  /** Runs a transition, then re-reads the invoice so every figure is the server's. */
  const runAction = async (
    action: () => Promise<unknown>,
    successNotice: string
  ) => {
    setIsPending(true)
    setActionError(null)
    try {
      await action()
      setDialog(null)
      setNotice(successNotice)
      await load()
    } catch (error) {
      setActionError(errorMessage(error, 'The request failed.'))
      // The invoice may have moved on under us (another admin issued it, say);
      // re-read so the actions on screen match its real status.
      void load()
    } finally {
      setIsPending(false)
    }
  }

  const handleDownload = async (format: InvoiceFormat) => {
    if (!invoice) return
    setDownloading(format)
    setDownloadError(null)
    try {
      const { blob } = await downloadInvoice(invoice.id, format)
      const name = invoice.invoiceNumber ?? `draft-${invoice.billingPeriod}`
      saveBlob(blob, `invoice-${name}.${format}`)
    } catch (error) {
      setDownloadError(
        errorMessage(error, 'Could not download the invoice document.')
      )
    } finally {
      setDownloading(null)
    }
  }

  const toggleLine = (lineId: string) =>
    setExpandedLines((current) => {
      const next = new Set(current)
      if (next.has(lineId)) next.delete(lineId)
      else next.add(lineId)
      return next
    })

  if (isLoading) {
    return (
      <>
        <AdminHeader title="Invoice" />
        <main className="page-pad" style={{ paddingBlock: '24px' }}>
          <SkeletonDetail label="Loading invoice" />
        </main>
      </>
    )
  }

  if (!invoice) {
    return (
      <>
        <AdminHeader title="Invoice not found" />
        <div style={placeholderStyle}>
          <div style={{ marginBottom: '12px' }}>
            {loadError ?? 'This invoice could not be found.'}
          </div>
          <Link href={BACK_HREF} style={backLinkStyle}>
            ← Back to Monthly Billing
          </Link>
        </div>
      </>
    )
  }

  const actions = canManage ? ALLOWED_ACTIONS[invoice.status] : []
  const title = invoice.invoiceNumber
    ? `Invoice ${invoice.invoiceNumber}`
    : `Draft invoice — ${periodLabel(invoice.billingPeriod)}`
  const lines = invoice.lines ?? []
  const sites = invoice.sites ?? []
  const hasItemTax = lines.some((line) => line.tax !== undefined)

  return (
    <>
      <AdminHeader
        title={title}
        subtitle={`${invoice.accountName} (${invoice.accountCode}) · ${periodLabel(invoice.billingPeriod)}`}
        actionButton={
          <div className="row-wrap" style={{ gap: '8px' }}>
            {(
              [
                ['pdf', 'PDF', FileText],
                ['csv', 'CSV', Download],
                ['xlsx', 'Excel', FileSpreadsheet],
              ] as const
            ).map(([format, label, Icon]) => (
              <button
                key={format}
                type="button"
                className="touch-target"
                onClick={() => handleDownload(format)}
                disabled={downloading !== null}
                style={disabledWhen(secondaryButton, downloading !== null)}
              >
                <Icon size={15} />
                <span>{downloading === format ? 'Preparing...' : label}</span>
              </button>
            ))}
          </div>
        }
      />

      <main
        className="page-pad"
        style={{
          paddingBlock: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <Link href={BACK_HREF} style={backLinkStyle}>
          <ArrowLeft size={14} style={{ verticalAlign: '-2px' }} /> Back to
          Monthly Billing
        </Link>

        {downloadError && <InlineAlert>{downloadError}</InlineAlert>}
        {loadError && <InlineAlert>{loadError}</InlineAlert>}
        {notice && <InlineAlert tone="success">{notice}</InlineAlert>}

        {/* Header: status, dates and the lifecycle actions it permits */}
        <section style={{ ...card, padding: '20px' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ minWidth: 0 }}>
              {/* A long invoice number beside its status badge could not both
                  fit on one phone line. */}
              <div className="row-wrap">
                <h2 style={{ ...cardTitle, fontSize: '1.1rem' }}>
                  {invoice.invoiceNumber ?? 'Draft (not yet numbered)'}
                </h2>
                <InvoiceStatusBadge
                  status={invoice.status}
                  overdue={invoice.overdue}
                />
              </div>
              <p style={cardSubtitle}>
                {invoice.accountName} · {invoice.accountCode} ·{' '}
                {periodLabel(invoice.billingPeriod)}
              </p>
            </div>

            {actions.length > 0 && (
              <div className="row-wrap" style={{ gap: '8px' }}>
                {actions.includes('regenerate') && (
                  <button
                    type="button"
                    className="touch-target"
                    onClick={() => setDialog('regenerate')}
                    style={secondaryButton}
                  >
                    <RefreshCw size={15} />
                    <span>Rebuild draft</span>
                  </button>
                )}
                {actions.includes('issue') && (
                  <button
                    type="button"
                    className="touch-target"
                    onClick={() => setDialog('issue')}
                    disabled={invoice.orderCount === 0}
                    title={
                      invoice.orderCount === 0
                        ? 'This draft has no billable orders to issue.'
                        : undefined
                    }
                    style={disabledWhen(
                      primaryButton,
                      invoice.orderCount === 0
                    )}
                  >
                    <Send size={15} />
                    <span>Issue invoice</span>
                  </button>
                )}
                {actions.includes('paid') && (
                  <button
                    type="button"
                    className="touch-target"
                    onClick={() => setDialog('paid')}
                    style={primaryButton}
                  >
                    <CheckCircle size={15} />
                    <span>Mark paid</span>
                  </button>
                )}
                {actions.includes('void') && (
                  <button
                    type="button"
                    className="touch-target"
                    onClick={() => setDialog('void')}
                    style={dangerButton}
                  >
                    <Ban size={15} />
                    <span>Void</span>
                  </button>
                )}
              </div>
            )}
          </div>

          <dl
            className="grid-auto"
            style={
              {
                ['--min']: '150px',
                gap: '16px',
                margin: '20px 0 0',
              } as React.CSSProperties
            }
          >
            <Fact label="Created" value={formatDate(invoice.createdAt)} />
            <Fact label="Issued" value={formatDate(invoice.issuedAt)} />
            <Fact label="Due" value={formatDate(invoice.dueAt)} />
            <Fact label="Paid" value={formatDate(invoice.paidAt)} />
            {invoice.paymentReference && (
              <Fact
                label="Payment reference"
                value={invoice.paymentReference}
              />
            )}
            <Fact label="Orders" value={String(invoice.orderCount)} />
            <Fact label="Sites" value={String(invoice.siteCount)} />
          </dl>

          {invoice.status === 'VOID' && (
            <div style={{ marginTop: '16px' }}>
              <InlineAlert>
                Voided: {invoice.voidReason ?? 'no reason recorded'}
              </InlineAlert>
            </div>
          )}
          {invoice.status === 'DRAFT' && invoice.orderCount === 0 && (
            <div style={{ marginTop: '16px' }}>
              <InlineAlert tone="info">
                This draft has no billable orders, so it cannot be issued.
                Rebuild it once orders for the period have shipped.
              </InlineAlert>
            </div>
          )}
          {invoice.notes && (
            <p
              style={{
                margin: '16px 0 0',
                fontSize: '0.82rem',
                color: '#6E6781',
              }}
            >
              <strong style={{ color: '#2B253E' }}>Notes:</strong>{' '}
              {invoice.notes}
            </p>
          )}
        </section>

        {/* Totals */}
        <section
          className="grid-auto"
          style={
            {
              ...card,
              ['--min']: '160px',
              padding: '20px',
              gap: '20px',
            } as React.CSSProperties
          }
        >
          <Figure label="Subtotal" value={formatMoney(invoice.subtotal)} />
          <Figure
            label={
              invoice.taxRatePercent
                ? `GST (${Number(invoice.taxRatePercent)}%${invoice.pricesIncludeTax ? ', included' : ''})`
                : 'Tax'
            }
            value={formatMoney(invoice.tax)}
          />
          <Figure label="Total payable" value={formatMoney(invoice.total)} />
        </section>
        {invoice.pricesIncludeTax && (
          <div
            style={{ fontSize: '0.74rem', color: '#A39BB3', marginTop: -12 }}
          >
            Prices on this invoice already include GST, so the total equals the
            subtotal.
          </div>
        )}

        {/* The document itself, as the customer receives it (SOW M-11). */}
        <section style={{ ...card, overflow: 'hidden' }}>
          <div style={sectionHeader}>
            <h3 style={cardTitle}>Invoice document</h3>
            <button
              type="button"
              className="touch-target"
              onClick={() => setShowDocument((open) => !open)}
              style={secondaryButton}
            >
              <FileText size={15} />
              <span>{showDocument ? 'Hide' : 'Show'} PDF</span>
            </button>
          </div>
          {showDocument && (
            <div style={{ padding: '0 20px 20px' }}>
              <InvoicePdfViewer
                invoiceId={invoice.id}
                version={invoice.updatedAt}
              />
            </div>
          )}
        </section>

        {/* Per-site totals */}
        {sites.length > 0 && (
          <section style={{ ...card, overflow: 'hidden' }}>
            <div style={sectionHeader}>
              <h3 style={cardTitle}>By site</h3>
            </div>
            <div className="table-scroll">
              {/* Site, code, orders, tax and amount: dense by nature, so it
                  scrolls in its card rather than wrapping every figure. */}
              <table style={{ ...tableStyle, minWidth: '560px' }}>
                <thead>
                  <tr>
                    <th style={thEdge}>Site</th>
                    <th style={th}>Code</th>
                    <th style={{ ...th, textAlign: 'center' }}>Orders</th>
                    {hasItemTax && (
                      <th style={{ ...th, textAlign: 'right' }}>Tax</th>
                    )}
                    <th style={{ ...thEdge, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.map((site) => (
                    <tr key={site.siteId} style={rowBorder}>
                      <td style={{ ...tdBase, padding: '12px 20px' }}>
                        {site.siteName}
                      </td>
                      <td style={{ ...tdBase, ...monoCell }}>
                        {site.siteCode}
                      </td>
                      <td style={{ ...tdBase, textAlign: 'center' }}>
                        {site.orders}
                      </td>
                      {hasItemTax && (
                        <td style={{ ...tdBase, textAlign: 'right' }}>
                          {formatMoney(site.tax)}
                        </td>
                      )}
                      <td
                        style={{
                          ...tdBase,
                          padding: '12px 20px',
                          textAlign: 'right',
                          fontWeight: 700,
                        }}
                      >
                        {formatMoney(site.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Lines: one per order, expandable to its items */}
        <section style={{ ...card, overflow: 'hidden' }}>
          <div style={sectionHeader}>
            <div>
              <h3 style={cardTitle}>Invoice lines</h3>
              <p style={cardSubtitle}>
                One line per billed order
                {lines.some((line) => (line.items?.length ?? 0) > 0)
                  ? ' — expand a line to see its items'
                  : ''}
              </p>
            </div>
          </div>
          {lines.length === 0 ? (
            <div style={placeholderStyle}>No orders on this invoice.</div>
          ) : (
            <div className="table-scroll">
              {/* Eight columns per order line, and the expanded item rows sit
                  inside the same grid — it keeps its width and scrolls. */}
              <table style={{ ...tableStyle, minWidth: '900px' }}>
                <thead>
                  <tr>
                    <th style={thEdge}>Order</th>
                    <th style={th}>Ordered</th>
                    <th style={th}>Site</th>
                    <th style={th}>PO</th>
                    <th style={th}>Cost centre</th>
                    <th style={{ ...th, textAlign: 'center' }}>Items</th>
                    {hasItemTax && (
                      <th style={{ ...th, textAlign: 'right' }}>Tax</th>
                    )}
                    <th style={{ ...thEdge, textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => {
                    const items = line.items ?? []
                    const expanded = expandedLines.has(line.id)
                    return (
                      <Fragment key={line.id}>
                        <tr style={rowBorder}>
                          <td style={{ ...tdBase, padding: '12px 20px' }}>
                            {items.length > 0 ? (
                              <button
                                type="button"
                                onClick={() => toggleLine(line.id)}
                                aria-expanded={expanded}
                                style={expandButton}
                              >
                                {expanded ? (
                                  <ChevronDown size={14} />
                                ) : (
                                  <ChevronRight size={14} />
                                )}
                                {line.orderNumber}
                              </button>
                            ) : (
                              <span style={{ fontWeight: 600 }}>
                                {line.orderNumber}
                              </span>
                            )}
                          </td>
                          <td style={{ ...tdBase, color: '#6E6781' }}>
                            {formatDate(line.orderedAt)}
                          </td>
                          <td style={tdBase}>
                            {line.siteName}
                            <div style={{ ...monoCell, padding: 0 }}>
                              {line.siteCode}
                            </div>
                          </td>
                          <td style={{ ...tdBase, color: '#6E6781' }}>
                            {line.poNumber ?? '—'}
                          </td>
                          <td style={{ ...tdBase, color: '#6E6781' }}>
                            {line.costCentre ?? '—'}
                          </td>
                          <td style={{ ...tdBase, textAlign: 'center' }}>
                            {line.itemCount}
                          </td>
                          {hasItemTax && (
                            <td style={{ ...tdBase, textAlign: 'right' }}>
                              {formatMoney(line.tax)}
                            </td>
                          )}
                          <td
                            style={{
                              ...tdBase,
                              padding: '12px 20px',
                              textAlign: 'right',
                              fontWeight: 700,
                            }}
                          >
                            {formatMoney(line.amount)}
                          </td>
                        </tr>
                        {expanded &&
                          items.map((item) => (
                            <tr
                              key={item.id}
                              style={{ backgroundColor: '#FCF7FA' }}
                            >
                              <td
                                colSpan={3}
                                style={{
                                  ...tdBase,
                                  padding: '8px 20px 8px 40px',
                                  fontSize: '0.78rem',
                                }}
                              >
                                {item.kind === 'DELIVERY'
                                  ? 'Delivery'
                                  : item.name}
                                <div style={{ ...monoCell, padding: 0 }}>
                                  {item.variantSku ?? item.sku}
                                </div>
                              </td>
                              <td
                                colSpan={2}
                                style={{
                                  ...tdBase,
                                  padding: '8px 14px',
                                  fontSize: '0.78rem',
                                  color: '#6E6781',
                                }}
                              >
                                {item.quantity} × {formatMoney(item.unitPrice)}
                                {item.uom ? ` / ${item.uom}` : ''}
                              </td>
                              <td
                                style={{
                                  ...tdBase,
                                  padding: '8px 14px',
                                  fontSize: '0.74rem',
                                  color: '#A39BB3',
                                  textAlign: 'center',
                                }}
                              >
                                {item.taxTreatment}
                              </td>
                              {hasItemTax && (
                                <td
                                  style={{
                                    ...tdBase,
                                    padding: '8px 14px',
                                    fontSize: '0.78rem',
                                    textAlign: 'right',
                                  }}
                                >
                                  {formatMoney(item.taxAmount)}
                                </td>
                              )}
                              <td
                                style={{
                                  ...tdBase,
                                  padding: '8px 20px',
                                  fontSize: '0.78rem',
                                  textAlign: 'right',
                                }}
                              >
                                {formatMoney(item.lineValue)}
                              </td>
                            </tr>
                          ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {dialog === 'issue' && (
        <IssueInvoiceDialog
          invoice={invoice}
          isPending={isPending}
          error={actionError}
          onClose={closeDialog}
          onConfirm={(days) =>
            runAction(
              () => issueInvoice(invoice.id, days),
              'Invoice issued. Its number is allocated and its lines are frozen.'
            )
          }
        />
      )}
      {dialog === 'paid' && (
        <MarkPaidDialog
          invoice={invoice}
          isPending={isPending}
          error={actionError}
          onClose={closeDialog}
          onConfirm={(input) =>
            runAction(
              () => markInvoicePaid(invoice.id, input),
              'Payment recorded.'
            )
          }
        />
      )}
      {dialog === 'void' && (
        <VoidInvoiceDialog
          invoice={invoice}
          isPending={isPending}
          error={actionError}
          onClose={closeDialog}
          onConfirm={(reason) =>
            runAction(
              () => voidInvoice(invoice.id, reason),
              'Invoice voided. Its orders can now be billed on a new invoice.'
            )
          }
        />
      )}
      {dialog === 'regenerate' && (
        <RegenerateDraftDialog
          invoice={invoice}
          isPending={isPending}
          error={actionError}
          onClose={closeDialog}
          onConfirm={() =>
            runAction(
              () => generateInvoice(invoice.billingPeriod, invoice.accountId),
              'Draft rebuilt from the current billable orders.'
            )
          }
        />
      )}
    </>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ fontSize: '0.74rem', color: '#A39BB3', fontWeight: 500 }}>
        {label}
      </dt>
      <dd
        style={{
          margin: '4px 0 0',
          fontSize: '0.86rem',
          color: '#2B253E',
          fontWeight: 600,
        }}
      >
        {value}
      </dd>
    </div>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: '0.78rem', fontWeight: 500, color: '#6E6781' }}>
        {label}
      </div>
      <div
        style={{
          marginTop: '4px',
          fontSize: '1.5rem',
          fontWeight: 700,
          color: '#2B253E',
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  )
}

const placeholderStyle: React.CSSProperties = {
  padding: '32px',
  textAlign: 'center',
  color: '#A39BB3',
  fontSize: '0.84rem',
}

const backLinkStyle: React.CSSProperties = {
  color: '#F73582',
  fontSize: '0.8rem',
  fontWeight: 600,
  textDecoration: 'none',
}

const sectionHeader: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #F5EEF2',
}

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
  fontSize: '0.84rem',
}

const rowBorder: React.CSSProperties = { borderTop: '1px solid #F5EEF2' }

const monoCell: React.CSSProperties = {
  fontFamily: 'monospace',
  color: '#6E6781',
  fontSize: '0.76rem',
}

const expandButton: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: 0,
  border: 'none',
  background: 'none',
  fontWeight: 600,
  color: '#2B253E',
  fontSize: '0.84rem',
  cursor: 'pointer',
}
