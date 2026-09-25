// src/lib/export/csv.ts
import type { MonthlyBillingReport, Order, HOBillingLineItem } from '@/types'

export function exportBillingReportCSV(report: MonthlyBillingReport): string {
  const headers = [
    'Period',
    'Invoice Reference',
    'Account Name',
    'Site Code',
    'Site Name',
    'Orders Count',
    'POs Count',
    'Primary Category',
    'Total Spend (USD)',
    'Status',
  ]

  const rows = report.siteBreakdowns.map((s) => [
    `"${report.period}"`,
    `"${report.invoiceNumber}"`,
    `"${s.accountName}"`,
    `"${s.siteCode}"`,
    `"${s.siteName}"`,
    s.ordersCount,
    s.purchaseOrdersCount,
    `"${s.topCategory}"`,
    s.totalSpend.toFixed(2),
    `"${s.status}"`,
  ])

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

export function exportOrdersCSV(orders: Order[]): string {
  const headers = [
    'Order #',
    'Date Created',
    'Account',
    'Site Code',
    'Site Name',
    'PO Reference',
    'Status',
    'Items Qty',
    'Total Amount ($)',
    'Carrier',
    'Tracking #',
  ]

  const rows = orders.map((o) => [
    `"${o.orderNumber}"`,
    `"${new Date(o.createdAt).toLocaleDateString()}"`,
    `"${o.accountName}"`,
    `"${o.siteCode}"`,
    `"${o.siteName}"`,
    `"${o.poReference || 'N/A'}"`,
    `"${o.status}"`,
    o.itemCount,
    o.totalAmount.toFixed(2),
    `"${o.carrier || 'Pending'}"`,
    `"${o.trackingNumber || 'Pending'}"`,
  ])

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * One CSV field, safe to open in a spreadsheet.
 *
 * Quoted and with inner quotes doubled, so a comma or a newline in a site name
 * cannot shift the columns; and a leading = + - @ (or tab/CR) is neutralised
 * with an apostrophe, because Excel runs a cell that starts with one as a
 * formula — and these values include whatever a buyer typed into notes.
 */
export function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

/**
 * The head-office backing detail, one row per product line, as shown on screen.
 *
 * This is the screen's own export. The billed invoice's documents — rendered by
 * the server from the frozen invoice — are downloaded from the Invoices panel.
 */
export function exportBackingLinesCSV(
  lineItems: HOBillingLineItem[],
  period: string,
  accountName: string
) {
  const headers = [
    'Order Number',
    'Order Date',
    'Account Name',
    'Account ID',
    'Site Name',
    'Site ID',
    'Site Code',
    'Ordered By User',
    'Ordered By Email',
    'PO Reference',
    'Product Name',
    'SKU',
    'Pack Size',
    'UOM',
    'Qty',
    'Unit Price',
    'Line Value',
    'Tax Treatment',
    'Order Total',
    'Ship To Address',
    'Delivery Contact',
    'Delivery Instructions',
    'Bill To Address',
    'Bill To Entity',
    'Status',
    'Notes',
  ]
  const rows = lineItems.map((li) => [
    li.orderNumber,
    new Date(li.orderDate).toLocaleDateString('en-NZ'),
    li.accountName,
    li.accountId,
    li.siteName,
    li.siteId,
    li.siteCode,
    li.orderedByUser,
    li.orderedByEmail,
    li.poReference,
    li.productName,
    li.sku,
    li.packSize,
    li.uom,
    li.qty,
    li.unitPrice.toFixed(2),
    li.lineValue.toFixed(2),
    li.taxTreatment,
    li.orderTotal.toFixed(2),
    li.shipToAddress,
    li.deliveryContact,
    li.deliveryInstructions,
    li.billToAddress,
    li.billToEntity,
    li.status,
    li.notes,
  ])
  const content = [headers, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\r\n')
  const safeName = accountName.replace(/[^A-Za-z0-9._-]+/g, '_') || 'account'
  downloadCSV(content, `${safeName}_Billing_${period}.csv`)
}
