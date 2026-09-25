// src/components/billing/InvoicesPanel.tsx
'use client'

import { SkeletonTable } from '@/components/ui/Skeleton'
import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileSpreadsheet, FileText } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { InvoicePdfViewer } from './InvoicePdfViewer'
import { StatusPill } from '@/components/admin/StatusPill'
import { useAuth } from '@/hooks/useAuth'
import { useAccounts } from '@/hooks/useAccounts'
import { toApiError } from '@/services/api.service'
import {
  downloadInvoice,
  generateInvoice,
  issueInvoice,
  listInvoices,
  markInvoicePaid,
  saveBlob,
  voidInvoice,
  type InvoiceFormat,
} from '@/services/data-source/api/api-reports.adapter'
import type { ApiInvoice } from '@/services/data-source/api/report.types'
import { formatMoney, formatDate } from '@/lib/format'

const invoicesKey = (billingPeriod: string, accountId?: string) =>
  ['billing', 'invoices', billingPeriod, accountId ?? ''] as const

/**
 * The invoices for one billing period, as the server holds them (SOW M-11).
 *
 * Every document here is rendered by the API from the invoice's frozen rows —
 * PDF, CSV and XLSX alike — so what someone downloads is what the account was
 * actually billed, not a browser's reading of a report.
 *
 * With BILLING_MANAGE it is also where the lifecycle happens: build a draft for
 * an account, issue it (which numbers and freezes it), record payment, or void
 * it with a reason. Without it — head office — it is download-only, because the
 * API refuses the rest and a button that can only fail is worse than none.
 */
export function InvoicesPanel({
  billingPeriod,
  accountId,
  title = 'Invoices',
  subtitle = 'Documents rendered by the server from the issued invoice',
}: {
  billingPeriod: string
  /** Narrows the list to one account. Head office sees its own regardless. */
  accountId?: string
  title?: string
  subtitle?: string
}) {
  const { hasPermission } = useAuth()
  const canManage = hasPermission('BILLING_MANAGE')
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: invoicesKey(billingPeriod, accountId),
    queryFn: () => listInvoices({ billingPeriod, accountId, pageSize: 100 }),
  })
  // A draft is work in progress: it is not a document anyone was billed by.
  const invoices = (query.data?.items ?? []).filter(
    (invoice) => canManage || invoice.status !== 'DRAFT'
  )

  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<{
    kind: 'issue' | 'paid' | 'void'
    invoice: ApiInvoice
  } | null>(null)

  const run = async (key: string, action: () => Promise<unknown>) => {
    if (busy) return false
    setBusy(key)
    setError(null)
    try {
      await action()
      await queryClient.invalidateQueries({ queryKey: ['billing', 'invoices'] })
      return true
    } catch (err) {
      setError(toApiError(err).message || 'That did not work. Try again.')
      return false
    } finally {
      setBusy(null)
    }
  }

  const download = (invoice: ApiInvoice, format: InvoiceFormat) =>
    run(`${invoice.id}:${format}`, async () => {
      const { blob } = await downloadInvoice(invoice.id, format)
      saveBlob(blob, `${documentName(invoice)}.${format}`)
    })

  const closeDialog = () => setDialog(null)
  const [viewing, setViewing] = useState<ApiInvoice | null>(null)

  return (
    <div style={card}>
      <div style={header}>
        <div>
          <h3 style={cardTitle}>{title}</h3>
          <p style={cardSubtitle}>{subtitle}</p>
        </div>
        {canManage && (
          <BuildDraft
            billingPeriod={billingPeriod}
            fixedAccountId={accountId}
            busy={busy === 'generate'}
            onBuild={(forAccount) =>
              void run('generate', () =>
                generateInvoice(billingPeriod, forAccount)
              )
            }
          />
        )}
      </div>

      {error && (
        <div role="alert" style={alertBox}>
          {error}
        </div>
      )}

      {query.isPending ? (
        <SkeletonTable rows={3} columns={8} label="Loading invoices" />
      ) : query.isError ? (
        <p style={{ ...emptyText, color: '#DC2626' }}>
          {toApiError(query.error).message || 'Invoices could not be loaded.'}
        </p>
      ) : invoices.length === 0 ? (
        <p style={emptyText}>
          No invoice for this period yet.
          {canManage
            ? ' Build a draft to see what an account would be billed.'
            : ' It appears here once it has been issued.'}
        </p>
      ) : (
        <div className="table-scroll">
          {/* Nine columns, two of them rows of buttons: it keeps its width and
              scrolls inside the card rather than widening the page. */}
          <table style={{ ...table, minWidth: '1040px' }}>
            <thead>
              <tr>
                <th style={thEdge}>Account</th>
                <th style={th}>Invoice</th>
                <th style={th}>Status</th>
                <th style={{ ...th, textAlign: 'center' }}>Orders</th>
                <th style={{ ...th, textAlign: 'center' }}>Sites</th>
                <th style={{ ...th, textAlign: 'right' }}>Total</th>
                <th style={th}>Due / paid</th>
                <th style={{ ...th, textAlign: 'right' }}>Documents</th>
                {canManage && (
                  <th style={{ ...thEdge, textAlign: 'right' }}>Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} style={{ borderTop: '1px solid #F5EEF2' }}>
                  <td style={{ ...td, padding: '12px 20px' }}>
                    <div style={{ fontWeight: 600, color: '#2B253E' }}>
                      {invoice.accountName}
                    </div>
                    <div style={mono}>{invoice.accountCode}</div>
                  </td>
                  <td style={td}>
                    {invoice.invoiceNumber ? (
                      <span style={{ ...mono, color: '#2B253E' }}>
                        {invoice.invoiceNumber}
                      </span>
                    ) : (
                      <span style={{ color: '#A39BB3' }}>Not numbered</span>
                    )}
                  </td>
                  <td style={td}>
                    <StatusPill status={invoice.status} size="sm" />
                    {invoice.overdue && (
                      <div style={{ ...small, color: '#DC2626' }}>Overdue</div>
                    )}
                    {invoice.status === 'VOID' && invoice.voidReason && (
                      <div style={small} title={invoice.voidReason}>
                        {truncate(invoice.voidReason, 40)}
                      </div>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    {invoice.orderCount}
                  </td>
                  <td style={{ ...td, textAlign: 'center' }}>
                    {invoice.siteCount}
                  </td>
                  <td style={{ ...td, ...amount }}>
                    {formatMoney(invoice.total)}
                  </td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {invoice.paidAt ? (
                      <>
                        Paid {formatDate(invoice.paidAt)}
                        {invoice.paymentReference && (
                          <div style={small}>{invoice.paymentReference}</div>
                        )}
                      </>
                    ) : invoice.dueAt ? (
                      `Due ${formatDate(invoice.dueAt)}`
                    ) : (
                      <span style={{ color: '#A39BB3' }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    <div style={buttonRow}>
                      <button
                        type="button"
                        className="touch-target"
                        onClick={() => setViewing(invoice)}
                        style={primarySmall}
                        aria-label={`View invoice ${invoice.invoiceNumber ?? 'draft'}`}
                      >
                        <FileText size={13} /> View
                      </button>
                      <DocButton
                        label="PDF"
                        icon={<FileText size={13} />}
                        busy={busy === `${invoice.id}:pdf`}
                        onClick={() => void download(invoice, 'pdf')}
                      />
                      <DocButton
                        label="CSV"
                        icon={<Download size={13} />}
                        busy={busy === `${invoice.id}:csv`}
                        onClick={() => void download(invoice, 'csv')}
                      />
                      <DocButton
                        label="XLSX"
                        icon={<FileSpreadsheet size={13} />}
                        busy={busy === `${invoice.id}:xlsx`}
                        onClick={() => void download(invoice, 'xlsx')}
                      />
                    </div>
                  </td>
                  {canManage && (
                    <td style={{ ...td, padding: '12px 20px' }}>
                      <div style={buttonRow}>
                        {invoice.status === 'DRAFT' && (
                          <>
                            <button
                              type="button"
                              className="touch-target"
                              style={secondarySmall}
                              disabled={busy !== null}
                              title="Rebuild the draft from the orders now in the period"
                              onClick={() =>
                                void run(`${invoice.id}:rebuild`, () =>
                                  generateInvoice(
                                    invoice.billingPeriod,
                                    invoice.accountId
                                  )
                                )
                              }
                            >
                              {busy === `${invoice.id}:rebuild`
                                ? 'Rebuilding…'
                                : 'Rebuild'}
                            </button>
                            <button
                              type="button"
                              className="touch-target"
                              style={primarySmall}
                              onClick={() =>
                                setDialog({ kind: 'issue', invoice })
                              }
                            >
                              Issue
                            </button>
                          </>
                        )}
                        {invoice.status === 'ISSUED' && (
                          <button
                            type="button"
                            className="touch-target"
                            style={secondarySmall}
                            onClick={() => setDialog({ kind: 'paid', invoice })}
                          >
                            Mark paid
                          </button>
                        )}
                        {(invoice.status === 'ISSUED' ||
                          invoice.status === 'PAID') && (
                          <button
                            type="button"
                            className="touch-target"
                            style={{ ...secondarySmall, color: '#B91C1C' }}
                            onClick={() => setDialog({ kind: 'void', invoice })}
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {viewing && (
        <Modal
          isOpen
          onClose={() => setViewing(null)}
          title={`Invoice ${viewing.invoiceNumber ?? '(draft)'} · ${viewing.accountName}`}
          maxWidth="960px"
        >
          <InvoicePdfViewer
            invoiceId={viewing.id}
            version={viewing.updatedAt}
          />
        </Modal>
      )}

      {dialog?.kind === 'issue' && (
        <IssueDialog
          invoice={dialog.invoice}
          busy={busy !== null}
          onClose={closeDialog}
          onConfirm={async (days) => {
            const done = await run('issue', () =>
              issueInvoice(dialog.invoice.id, days)
            )
            if (done) closeDialog()
          }}
        />
      )}
      {dialog?.kind === 'paid' && (
        <PaidDialog
          invoice={dialog.invoice}
          busy={busy !== null}
          onClose={closeDialog}
          onConfirm={async (input) => {
            const done = await run('paid', () =>
              markInvoicePaid(dialog.invoice.id, input)
            )
            if (done) closeDialog()
          }}
        />
      )}
      {dialog?.kind === 'void' && (
        <VoidDialog
          invoice={dialog.invoice}
          busy={busy !== null}
          onClose={closeDialog}
          onConfirm={async (reason) => {
            const done = await run('void', () =>
              voidInvoice(dialog.invoice.id, reason)
            )
            if (done) closeDialog()
          }}
        />
      )}
    </div>
  )
}

/* ── Build a draft ─────────────────────────────────────────────── */

function BuildDraft({
  billingPeriod,
  fixedAccountId,
  busy,
  onBuild,
}: {
  billingPeriod: string
  fixedAccountId?: string
  busy: boolean
  onBuild: (accountId: string | undefined) => void
}) {
  // Only an administrator names another account; listing them is refused
  // for everyone else, so the picker does not ask.
  const { role } = useAuth()
  const needsAccount = role === 'admin' && !fixedAccountId
  const accounts = useAccounts(
    { pageSize: 100, status: 'ACTIVE' },
    { enabled: needsAccount }
  )
  const [chosen, setChosen] = useState('')

  return (
    <div className="row-wrap" style={{ gap: '8px' }}>
      {needsAccount && (
        <select
          className="touch-target"
          aria-label="Account to bill"
          value={chosen}
          onChange={(e) => setChosen(e.target.value)}
          style={select}
        >
          <option value="">
            {accounts.isLoading ? 'Loading accounts…' : 'Choose an account'}
          </option>
          {accounts.data?.items.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.accountCode})
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        className="touch-target"
        style={primarySmall}
        disabled={busy || (needsAccount && !chosen)}
        title={`Build or rebuild the ${billingPeriod} draft`}
        onClick={() => onBuild(needsAccount ? chosen : fixedAccountId)}
      >
        {busy ? 'Building…' : 'Build draft'}
      </button>
    </div>
  )
}

/* ── Dialogs ───────────────────────────────────────────────────── */

function IssueDialog({
  invoice,
  busy,
  onClose,
  onConfirm,
}: {
  invoice: ApiInvoice
  busy: boolean
  onClose: () => void
  onConfirm: (paymentTermDays: number) => void
}) {
  const [days, setDays] = useState('30')
  const parsed = Number(days)
  const valid =
    days.trim() !== '' &&
    Number.isInteger(parsed) &&
    parsed >= 0 &&
    parsed <= 365

  return (
    <Modal isOpen onClose={onClose} title="Issue invoice" maxWidth="460px">
      <div style={dialogBody}>
        <p style={dialogText}>
          Issuing gives the {invoice.accountName} invoice for{' '}
          {invoice.billingPeriod} its number and freezes its{' '}
          {invoice.orderCount} order{invoice.orderCount === 1 ? '' : 's'} at{' '}
          {formatMoney(invoice.total)}. After that the amount cannot change; a
          correction means voiding it.
        </p>
        <label style={fieldLabel}>
          Payment terms (days)
          <input
            type="number"
            min={0}
            max={365}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            style={input}
          />
        </label>
        {!valid && (
          <p style={fieldError}>Enter a whole number from 0 to 365.</p>
        )}
        <DialogActions
          busy={busy}
          confirmLabel="Issue invoice"
          disabled={!valid}
          onClose={onClose}
          onConfirm={() => onConfirm(parsed)}
        />
      </div>
    </Modal>
  )
}

function PaidDialog({
  invoice,
  busy,
  onClose,
  onConfirm,
}: {
  invoice: ApiInvoice
  busy: boolean
  onClose: () => void
  onConfirm: (input: { paymentReference?: string; paidAt?: string }) => void
}) {
  const [reference, setReference] = useState('')
  const [paidOn, setPaidOn] = useState(todayInputValue)

  return (
    <Modal isOpen onClose={onClose} title="Record payment" maxWidth="460px">
      <div style={dialogBody}>
        <p style={dialogText}>
          {invoice.invoiceNumber} · {invoice.accountName} ·{' '}
          {formatMoney(invoice.total)}
        </p>
        <label style={fieldLabel}>
          Payment reference (optional)
          <input
            value={reference}
            maxLength={120}
            onChange={(e) => setReference(e.target.value)}
            style={input}
          />
        </label>
        <label style={fieldLabel}>
          Date received
          <input
            type="date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            style={input}
          />
        </label>
        <DialogActions
          busy={busy}
          confirmLabel="Mark paid"
          disabled={!paidOn}
          onClose={onClose}
          onConfirm={() =>
            onConfirm({
              paymentReference: reference.trim() || undefined,
              // Midday UTC, so the calendar date survives any timezone.
              paidAt: `${paidOn}T12:00:00.000Z`,
            })
          }
        />
      </div>
    </Modal>
  )
}

function VoidDialog({
  invoice,
  busy,
  onClose,
  onConfirm,
}: {
  invoice: ApiInvoice
  busy: boolean
  onClose: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()

  return (
    <Modal isOpen onClose={onClose} title="Void invoice" maxWidth="460px">
      <div style={dialogBody}>
        <p style={dialogText}>
          Voiding {invoice.invoiceNumber} ({invoice.accountName},{' '}
          {formatMoney(invoice.total)}) cannot be undone. The number stays used,
          and the reason is kept on the invoice and in the audit log.
        </p>
        <label style={fieldLabel}>
          Reason
          <textarea
            value={reason}
            maxLength={500}
            rows={3}
            onChange={(e) => setReason(e.target.value)}
            style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
          />
        </label>
        <DialogActions
          busy={busy}
          confirmLabel="Void invoice"
          danger
          disabled={!trimmed}
          onClose={onClose}
          onConfirm={() => onConfirm(trimmed)}
        />
      </div>
    </Modal>
  )
}

function DialogActions({
  busy,
  confirmLabel,
  danger = false,
  disabled,
  onClose,
  onConfirm,
}: {
  busy: boolean
  confirmLabel: string
  danger?: boolean
  disabled: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    /* Cancel beside a long confirm label did not fit a 360px dialog. */
    <div className="row-wrap" style={{ justifyContent: 'flex-end' }}>
      <button
        type="button"
        className="touch-target"
        style={secondarySmall}
        onClick={onClose}
      >
        Cancel
      </button>
      <button
        type="button"
        className="touch-target"
        style={
          danger
            ? {
                ...primarySmall,
                backgroundColor: '#B91C1C',
                border: '1px solid #B91C1C',
              }
            : primarySmall
        }
        disabled={busy || disabled}
        onClick={onConfirm}
      >
        {busy ? 'Working…' : confirmLabel}
      </button>
    </div>
  )
}

function DocButton({
  label,
  icon,
  busy,
  onClick,
}: {
  label: string
  icon: React.ReactNode
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="touch-target"
      aria-label={`Download ${label}`}
      style={secondarySmall}
    >
      {icon}
      {busy ? '…' : label}
    </button>
  )
}

/* ── Formatting ────────────────────────────────────────────────── */

function documentName(invoice: ApiInvoice): string {
  const base =
    invoice.invoiceNumber ??
    `draft-${invoice.accountCode}-${invoice.billingPeriod}`
  return base.replace(/[^A-Za-z0-9._-]/g, '')
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

function todayInputValue(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/* ── Styles ────────────────────────────────────────────────────── */

const card: React.CSSProperties = {
  backgroundColor: '#FFFFFF',
  borderRadius: '14px',
  boxShadow:
    '0 1px 2px rgba(43, 37, 62, 0.04), 0 6px 16px rgba(43, 37, 62, 0.05)',
  border: '1px solid #F0E6EC',
  overflow: 'hidden',
}
const header: React.CSSProperties = {
  padding: '16px 20px',
  borderBottom: '1px solid #F5EEF2',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '12px',
}
const cardTitle: React.CSSProperties = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#2B253E',
  letterSpacing: '-0.01em',
  margin: 0,
}
const cardSubtitle: React.CSSProperties = {
  fontSize: '0.76rem',
  color: '#A39BB3',
  margin: '3px 0 0',
}
const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  textAlign: 'left',
  fontSize: '0.84rem',
}
const th: React.CSSProperties = {
  padding: '10px 14px',
  color: '#A39BB3',
  fontWeight: 500,
  fontSize: '0.74rem',
  whiteSpace: 'nowrap',
}
const thEdge: React.CSSProperties = { ...th, padding: '10px 20px' }
const td: React.CSSProperties = {
  padding: '12px 14px',
  color: '#6E6781',
  verticalAlign: 'top',
}
const amount: React.CSSProperties = {
  textAlign: 'right',
  fontWeight: 700,
  color: '#2B253E',
  whiteSpace: 'nowrap',
}
const mono: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '0.76rem',
  color: '#A39BB3',
}
const small: React.CSSProperties = {
  fontSize: '0.72rem',
  color: '#A39BB3',
  marginTop: '3px',
}
const emptyText: React.CSSProperties = {
  padding: '28px 20px',
  margin: 0,
  textAlign: 'center',
  color: '#A39BB3',
  fontSize: '0.84rem',
}
const alertBox: React.CSSProperties = {
  margin: '12px 20px 0',
  padding: '10px 14px',
  borderRadius: '10px',
  backgroundColor: '#FEF2F2',
  border: '1px solid #FECACA',
  color: '#DC2626',
  fontSize: '0.8rem',
  fontWeight: 500,
}
/** Four document buttons in one cell: they wrap rather than stretch the row. */
const buttonRow: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: '6px',
}
const secondarySmall: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  padding: '6px 10px',
  borderRadius: '8px',
  backgroundColor: '#FFFFFF',
  border: '1px solid #F0E6EC',
  color: '#2B253E',
  fontSize: '0.76rem',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
const primarySmall: React.CSSProperties = {
  ...secondarySmall,
  backgroundColor: '#F73582',
  border: '1px solid #F73582',
  color: '#FFFFFF',
}
const select: React.CSSProperties = {
  padding: '7px 10px',
  borderRadius: '8px',
  border: '1px solid #F0E6EC',
  fontSize: '0.8rem',
  color: '#2B253E',
  backgroundColor: '#FFFFFF',
  maxWidth: '100%',
}
const dialogBody: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}
const dialogText: React.CSSProperties = {
  margin: 0,
  fontSize: '0.84rem',
  color: '#2B253E',
  lineHeight: 1.5,
}
const fieldLabel: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  fontSize: '0.78rem',
  fontWeight: 600,
  color: '#5C566E',
}
const input: React.CSSProperties = {
  padding: '8px 10px',
  borderRadius: '8px',
  border: '1px solid #F0E6EC',
  fontSize: '0.84rem',
  color: '#2B253E',
}
const fieldError: React.CSSProperties = {
  margin: 0,
  fontSize: '0.74rem',
  color: '#DC2626',
}
