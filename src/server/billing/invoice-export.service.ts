import { Prisma } from '@prisma/client'
import ExcelJS from 'exceljs'
import PDFDocument from 'pdfkit'
import type { AddressSnapshotView } from '../cart/cart.types'
import { fromJsonOr } from '../db/json-column'
// The quoting and the formula guard every export in the system shares.
import { csvCell, withBom } from '../utils/csv'
import type { FullInvoice } from './billing.service'

/**
 * The three shapes an invoice leaves the system in (SOW M-11, O-6).
 *
 * All three are rendered from the invoice's own frozen rows, so they are
 * reproducible: the same invoice generates a byte-identical CSV today and next
 * year. That is why none of them is stored — a stored PDF would be a second
 * copy of the truth, and the two would eventually disagree.
 *
 * Generated on demand rather than on the render queue. A month's invoice is
 * hundreds of rows, not a print-resolution artwork, and making finance poll a
 * job to download a CSV would be a worse experience for no gain.
 */

type InvoiceLineRow = FullInvoice['lines'][number]
type InvoiceItemRow = InvoiceLineRow['items'][number]

/**
 * An address snapshot as one cell (SOW B-08 ship-to, B-09 bill-to).
 *
 * One column rather than seven: a reconciler reads it to see where an order
 * went or was billed, not to re-key an address. Empty for an order placed
 * before the snapshot was captured — blank, not a guess.
 */
function addressCell(snapshot: string | null): string {
  const address = fromJsonOr<AddressSnapshotView | null>(snapshot, null)
  if (!address) return ''

  const parts = [
    address.label,
    address.recipientName,
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postcode,
    address.country,
  ]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))

  // A label and recipient are often the same words; say them once.
  return parts.filter((part, index) => parts.indexOf(part) === index).join(', ')
}

// --- The backing file ---------------------------------------------------------

/**
 * One row of the transaction-level backing file (SOW §15: "line-by-line
 * reconciliation of the consolidated invoice").
 *
 * One row per billed item — every order line, and the order's delivery charge —
 * so each billed amount traces back to an order, a site and a line (SOW §10
 * acceptance). Two columns reconcile it to the invoice with no variance:
 * `Line value` sums to the subtotal, `Line total payable` to the total.
 *
 * An invoice generated before items were recorded has none, and is written one
 * row per order with kind ORDER, which is everything that invoice ever knew.
 */
interface BackingRow {
  readonly line: InvoiceLineRow
  readonly item: InvoiceItemRow | null
}

function backingRows(invoice: FullInvoice): BackingRow[] {
  return invoice.lines.flatMap((line): BackingRow[] =>
    line.items.length > 0
      ? line.items.map((item) => ({ line, item }))
      : [{ line, item: null }]
  )
}

type CellKind = 'text' | 'money' | 'integer' | 'percent'

interface BackingColumn {
  readonly header: string
  readonly kind: CellKind
  readonly width: number
  readonly value: (
    row: BackingRow,
    invoice: FullInvoice
  ) => string | number | null
}

const money = (value: Prisma.Decimal): string => value.toFixed(2)

/** What a row adds to the amount payable: its value, plus GST if not in it. */
function payable(row: BackingRow, invoice: FullInvoice): Prisma.Decimal {
  const value = row.item ? row.item.lineValue : row.line.amount
  const tax = row.item ? row.item.taxAmount : row.line.tax
  return invoice.pricesIncludeTax ? value : value.plus(tax)
}

/**
 * The column layout, in the order SOW §15 lists the retained data (B-01 to
 * B-11), after the invoice's own identifiers.
 *
 * Declared once for the CSV and the XLSX so the two cannot disagree. When the
 * Head Office sample arrives (A-06) this list is the one place that changes.
 */
const BACKING_COLUMNS: readonly BackingColumn[] = [
  {
    header: 'Invoice',
    kind: 'text',
    width: 18,
    value: (_, inv) => inv.invoiceNumber ?? 'DRAFT',
  },
  {
    header: 'Billing period',
    kind: 'text',
    width: 10,
    value: (_, inv) => inv.billingPeriod,
  },
  // B-01
  {
    header: 'Account code',
    kind: 'text',
    width: 14,
    value: (_, inv) => inv.account.accountCode,
  },
  {
    header: 'Account',
    kind: 'text',
    width: 28,
    value: (_, inv) => inv.account.name,
  },
  // B-02
  {
    header: 'Site code',
    kind: 'text',
    width: 12,
    value: (r) => r.line.siteCode,
  },
  { header: 'Site', kind: 'text', width: 28, value: (r) => r.line.siteName },
  {
    header: 'Cost centre',
    kind: 'text',
    width: 14,
    value: (r) => r.line.costCentre,
  },
  // B-03
  {
    header: 'Order',
    kind: 'text',
    width: 20,
    value: (r) => r.line.orderNumber,
  },
  {
    header: 'Ordered at (UTC)',
    kind: 'text',
    width: 18,
    value: (r) => r.line.orderedAt.toISOString().slice(0, 16).replace('T', ' '),
  },
  // B-04
  {
    header: 'Ordered by',
    kind: 'text',
    width: 22,
    value: (r) => r.line.placedByName,
  },
  {
    header: 'Ordered by email',
    kind: 'text',
    width: 28,
    value: (r) => r.line.placedByEmail,
  },
  {
    header: 'Ordered by role',
    kind: 'text',
    width: 14,
    value: (r) => r.line.placedByRole,
  },
  // B-05
  {
    header: 'Purchase order',
    kind: 'text',
    width: 20,
    value: (r) => r.line.poNumber,
  },
  {
    header: 'Customer reference',
    kind: 'text',
    width: 22,
    value: (r) => r.line.customerReference,
  },
  {
    header: 'Campaign',
    kind: 'text',
    width: 16,
    value: (r) => r.line.campaignCode,
  },
  // B-06
  {
    header: 'Line',
    kind: 'integer',
    width: 6,
    value: (r) => r.item?.sequence ?? null,
  },
  {
    header: 'Kind',
    kind: 'text',
    width: 10,
    value: (r) => r.item?.kind ?? 'ORDER',
  },
  { header: 'SKU', kind: 'text', width: 20, value: (r) => r.item?.sku ?? null },
  {
    header: 'Product',
    kind: 'text',
    width: 32,
    value: (r) => r.item?.name ?? null,
  },
  {
    header: 'Variant SKU',
    kind: 'text',
    width: 20,
    value: (r) => r.item?.variantSku ?? null,
  },
  // B-07
  {
    header: 'Pack size',
    kind: 'integer',
    width: 9,
    value: (r) => r.item?.packSize ?? null,
  },
  { header: 'UOM', kind: 'text', width: 8, value: (r) => r.item?.uom ?? null },
  {
    header: 'Quantity',
    kind: 'integer',
    width: 9,
    value: (r) => r.item?.quantity ?? r.line.itemCount,
  },
  {
    header: 'Unit price',
    kind: 'money',
    width: 12,
    value: (r) => (r.item ? money(r.item.unitPrice) : null),
  },
  {
    header: 'Line value',
    kind: 'money',
    width: 12,
    value: (r) => money(r.item ? r.item.lineValue : r.line.amount),
  },
  {
    header: 'Tax treatment',
    kind: 'text',
    width: 12,
    value: (r) => r.item?.taxTreatment ?? null,
  },
  {
    header: 'GST',
    kind: 'money',
    width: 10,
    value: (r) => money(r.item ? r.item.taxAmount : r.line.tax),
  },
  {
    header: 'Line total payable',
    kind: 'money',
    width: 14,
    value: (r, inv) => money(payable(r, inv)),
  },
  // B-08
  {
    header: 'Ship to',
    kind: 'text',
    width: 44,
    value: (r) => addressCell(r.line.shippingSnapshot),
  },
  {
    header: 'Attention',
    kind: 'text',
    width: 20,
    value: (r) => r.line.recipientName,
  },
  {
    header: 'Delivery instructions',
    kind: 'text',
    width: 30,
    value: (r) => r.line.deliveryNotes,
  },
  // B-09
  {
    header: 'Bill to',
    kind: 'text',
    width: 44,
    value: (r) => addressCell(r.line.billingSnapshot),
  },
  // B-10
  {
    header: 'Order status',
    kind: 'text',
    width: 12,
    value: (r) => r.line.orderStatus,
  },
  {
    header: 'Tracking number',
    kind: 'text',
    width: 20,
    value: (r) => r.line.trackingNumber,
  },
  // B-11
  {
    header: 'Order notes',
    kind: 'text',
    width: 30,
    value: (r) => r.line.orderNotes,
  },
  {
    header: 'Line notes',
    kind: 'text',
    width: 30,
    value: (r) => r.item?.notes ?? null,
  },
]

/** CSV for an accounting import: the backing file, one row per billed item. */
export function toCsv(invoice: FullInvoice): string {
  const header = BACKING_COLUMNS.map((column) => column.header)
  const rows = backingRows(invoice).map((row) =>
    BACKING_COLUMNS.map((column) => {
      const value = column.value(row, invoice)
      return value === null ? '' : String(value)
    })
  )

  return withBom(
    [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')
  )
}

/**
 * XLSX: the backing file, the reconciliation to the invoice, and the site
 * breakdown.
 *
 * The reconciliation sheet uses formulas over the lines sheet rather than
 * figures copied into it, so anyone opening the file can see the lines add up
 * to the invoice for themselves — which is the question the sheet exists to
 * answer.
 */
export async function toXlsx(invoice: FullInvoice): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'Print Procurement Portal'
  workbook.created = invoice.issuedAt ?? invoice.createdAt

  const detail = workbook.addWorksheet('Lines', {
    views: [{ state: 'frozen', ySplit: 1 }],
  })
  detail.columns = BACKING_COLUMNS.map((column, index) => ({
    header: column.header,
    key: `c${index}`,
    width: column.width,
  }))
  detail.getRow(1).font = { bold: true }

  const rows = backingRows(invoice)
  for (const row of rows) {
    detail.addRow(
      BACKING_COLUMNS.map((column) => {
        const value = column.value(row, invoice)
        if (value === null) return null
        // Real numbers, not strings: these columns are summed and filtered in
        // Excel, and a text cell silently breaks both.
        return column.kind === 'money' || column.kind === 'integer'
          ? Number(value)
          : value
      })
    )
  }
  BACKING_COLUMNS.forEach((column, index) => {
    if (column.kind === 'money') detail.getColumn(index + 1).numFmt = '#,##0.00'
  })
  detail.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: BACKING_COLUMNS.length },
  }

  // --- Reconciliation -------------------------------------------------------
  const columnLetter = (header: string) =>
    detail.getColumn(
      BACKING_COLUMNS.findIndex((column) => column.header === header) + 1
    ).letter
  const lastRow = rows.length + 1
  const sumOf = (header: string) =>
    rows.length === 0
      ? '0'
      : `SUM(Lines!${columnLetter(header)}2:${columnLetter(header)}${lastRow})`

  const reconciliation = workbook.addWorksheet('Reconciliation')
  reconciliation.columns = [
    { header: '', key: 'label', width: 34 },
    { header: 'Invoice', key: 'invoice', width: 14 },
    { header: 'Backing lines', key: 'lines', width: 14 },
    { header: 'Variance', key: 'variance', width: 12 },
  ]
  reconciliation.getRow(1).font = { bold: true }
  const figures: [string, Prisma.Decimal, string][] = [
    ['Subtotal', invoice.subtotal, sumOf('Line value')],
    ['GST', invoice.tax, sumOf('GST')],
    ['Total payable', invoice.total, sumOf('Line total payable')],
  ]
  figures.forEach(([label, stated, formula], index) => {
    const rowNumber = index + 2
    const row = reconciliation.addRow({
      label,
      invoice: Number(stated.toFixed(2)),
    })
    row.getCell('lines').value = {
      formula,
      result: undefined,
    } as ExcelJS.CellFormulaValue
    row.getCell('variance').value = {
      formula: `ROUND(B${rowNumber}-C${rowNumber},2)`,
    } as ExcelJS.CellFormulaValue
  })
  for (const key of ['invoice', 'lines', 'variance']) {
    reconciliation.getColumn(key).numFmt = '#,##0.00'
  }
  reconciliation.addRow({})
  reconciliation.addRow({ label: taxBasisLabel(invoice) })

  // --- By site --------------------------------------------------------------
  const summary = workbook.addWorksheet('By site')
  summary.columns = [
    { header: 'Site code', key: 'siteCode', width: 12 },
    { header: 'Site', key: 'siteName', width: 28 },
    { header: 'Orders', key: 'orders', width: 10 },
    { header: 'Amount', key: 'amount', width: 14 },
    { header: 'GST', key: 'tax', width: 12 },
  ]
  summary.getRow(1).font = { bold: true }

  for (const site of bySite(invoice)) {
    summary.addRow({
      siteCode: site.siteCode,
      siteName: site.siteName,
      orders: site.orders,
      amount: Number(site.amount.toFixed(2)),
      tax: Number(site.tax.toFixed(2)),
    })
  }
  const total = summary.addRow({
    siteCode: '',
    siteName: 'Total',
    orders: invoice.orderCount,
    amount: Number(invoice.subtotal.toFixed(2)),
    tax: Number(invoice.tax.toFixed(2)),
  })
  total.font = { bold: true }
  summary.getColumn('amount').numFmt = '#,##0.00'
  summary.getColumn('tax').numFmt = '#,##0.00'

  // ExcelJS types this as its own Buffer-alike; the cast keeps the public
  // signature honest for the route, which wants a Node Buffer.
  return (await workbook.xlsx.writeBuffer()) as unknown as Buffer
}

// --- The PDF --------------------------------------------------------------------

/**
 * The PDF the customer receives: letterhead, tax summary and site breakdown
 * (SOW M-11).
 *
 * Laid out by hand rather than through a template engine: it is one document,
 * it is compiled with the application, and a runtime template would turn a
 * typo into a production failure instead of a build error.
 */
export async function toPdf(invoice: FullInvoice): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: PDF_MARGIN })
  const chunks: Buffer[] = []

  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  // --- Letterhead -----------------------------------------------------------
  doc.fontSize(20).text('Print Procurement Portal', { continued: false })
  doc.moveDown(1.5)

  doc
    .fillColor('#000000')
    .fontSize(16)
    .text(
      invoice.status === 'DRAFT'
        ? 'Draft tax invoice'
        : invoice.taxRatePercent === null
          ? 'Invoice'
          : 'Tax invoice'
    )
  doc.fontSize(10)
  // A draft is watermarked in words rather than graphics: it must be
  // impossible to mistake for the real thing if it is printed in black and
  // white, which is how these are usually filed.
  if (invoice.status === 'DRAFT') {
    doc
      .fillColor('#b00020')
      .text('NOT AN INVOICE — draft for review, not payable')
      .fillColor('#000000')
  }
  if (invoice.status === 'VOID') {
    doc
      .fillColor('#b00020')
      .text(`VOID — ${invoice.voidReason ?? 'cancelled'}`)
      .fillColor('#000000')
  }
  doc.moveDown(0.5)

  const facts: Array<[string, string]> = [
    ['Invoice number', invoice.invoiceNumber ?? '—'],
    ['Billing period', invoice.billingPeriod],
    [
      'Issued',
      invoice.issuedAt ? invoice.issuedAt.toISOString().slice(0, 10) : '—',
    ],
    ['Due', invoice.dueAt ? invoice.dueAt.toISOString().slice(0, 10) : '—'],
    ['Account', `${invoice.account.name} (${invoice.account.accountCode})`],
  ]
  for (const [label, value] of facts) {
    doc.fillColor('#666666').text(`${label}: `, { continued: true })
    doc.fillColor('#000000').text(value)
  }

  // --- Site breakdown -------------------------------------------------------
  // Columns at fixed positions: Helvetica is proportional, so padding with
  // spaces lets one wide code push every figure after it out of line.
  section(doc, 'By branch')
  tableRow(doc, 9, BRANCH_COLUMNS, ['Branch', 'Orders', 'Amount', 'GST'], true)
  for (const site of bySite(invoice)) {
    tableRow(doc, 9, BRANCH_COLUMNS, [
      `${site.siteCode}  ${site.siteName}`,
      String(site.orders),
      money(site.amount),
      money(site.tax),
    ])
  }

  // --- Orders ---------------------------------------------------------------
  section(doc, 'Orders')
  tableRow(
    doc,
    8,
    ORDER_COLUMNS,
    ['Order', 'Ordered', 'Branch', 'Purchase order', 'Amount', 'GST'],
    true
  )
  for (const line of invoice.lines) {
    tableRow(doc, 8, ORDER_COLUMNS, [
      line.orderNumber,
      line.orderedAt.toISOString().slice(0, 10),
      line.siteCode,
      line.poNumber ?? '',
      money(line.amount),
      money(line.tax),
    ])
  }

  // --- Tax summary ------------------------------------------------------------
  section(doc, 'Tax summary')
  doc
    .fontSize(9)
    .fillColor('#666666')
    .text(taxBasisLabel(invoice), PDF_MARGIN, doc.y)
    .fillColor('#000000')
  doc.moveDown(0.2)
  tableRow(doc, 9, SUMMARY_COLUMNS, ['', 'Value', 'GST'], true)
  for (const [treatment, figures] of byTreatment(invoice)) {
    tableRow(doc, 9, SUMMARY_COLUMNS, [
      TREATMENT_LABELS[treatment],
      money(figures.value),
      money(figures.tax),
    ])
  }

  // --- Totals ---------------------------------------------------------------
  doc.moveDown(0.8)
  tableRow(doc, 10, TOTAL_COLUMNS, [
    invoice.pricesIncludeTax ? 'Total (GST inclusive)' : 'Subtotal (excl. GST)',
    money(invoice.subtotal),
  ])
  // Printed even at zero, so the customer can see it was considered rather
  // than omitted.
  tableRow(doc, 10, TOTAL_COLUMNS, [
    invoice.pricesIncludeTax ? 'Includes GST of' : 'GST',
    money(invoice.tax),
  ])
  tableRow(doc, 12, TOTAL_COLUMNS, ['Total payable', money(invoice.total)])

  if (invoice.notes) {
    doc
      .moveDown(1)
      .fontSize(9)
      .fillColor('#666666')
      .text(invoice.notes, PDF_MARGIN, doc.y)
  }

  doc.end()
  return finished
}

// --- PDF layout -------------------------------------------------------------------

const PDF_MARGIN = 48

/** A column: where it starts from the margin, how wide, and how it aligns. */
type PdfColumn = readonly [x: number, width: number, align: 'left' | 'right']

// A4 is 595pt wide; 499pt sits between the margins.
const BRANCH_COLUMNS: readonly PdfColumn[] = [
  [0, 290, 'left'],
  [290, 50, 'right'],
  [340, 90, 'right'],
  [430, 69, 'right'],
]
const ORDER_COLUMNS: readonly PdfColumn[] = [
  [0, 92, 'left'],
  [92, 58, 'left'],
  [150, 78, 'left'],
  [228, 131, 'left'],
  [359, 80, 'right'],
  [439, 60, 'right'],
]
const SUMMARY_COLUMNS: readonly PdfColumn[] = [
  [0, 250, 'left'],
  [250, 110, 'right'],
  [360, 90, 'right'],
]
const TOTAL_COLUMNS: readonly PdfColumn[] = [
  [0, 250, 'left'],
  [250, 200, 'right'],
]

function section(doc: PDFKit.PDFDocument, title: string): void {
  doc.moveDown(1).fontSize(12).fillColor('#000000')
  doc.text(title, PDF_MARGIN, doc.y)
  doc.moveDown(0.3)
}

/**
 * One row of cells at fixed positions, on one line each. A cell too long for
 * its column is cut with an ellipsis rather than wrapping into the next row.
 */
function tableRow(
  doc: PDFKit.PDFDocument,
  size: number,
  columns: readonly PdfColumn[],
  cells: readonly string[],
  heading = false
): void {
  if (doc.y + size * 2 > doc.page.height - PDF_MARGIN) doc.addPage()
  const y = doc.y
  doc.fontSize(size).fillColor(heading ? '#666666' : '#000000')
  cells.forEach((cell, index) => {
    const [x, width, align] = columns[index]
    doc.text(cell, PDF_MARGIN + x, y, {
      width: width - 4,
      align,
      lineBreak: false,
      ellipsis: true,
    })
  })
  doc.fillColor('#000000')
  doc.x = PDF_MARGIN
  doc.y = y + size * 1.35
}

// --- Shared ---------------------------------------------------------------------

const TREATMENT_LABELS: Record<string, string> = {
  STANDARD: 'Standard-rated supplies',
  ZERO_RATED: 'Zero-rated supplies',
  EXEMPT: 'Exempt supplies',
  NOT_RECORDED: 'Not itemised',
}

/** The sentence that says what the tax figures mean. */
function taxBasisLabel(invoice: FullInvoice): string {
  if (invoice.taxRatePercent === null) {
    return 'Generated before tax was applied to invoices: no GST was calculated.'
  }
  const rate = `${invoice.taxRatePercent.toFixed(2).replace(/\.00$/, '')}%`
  return invoice.pricesIncludeTax
    ? `Prices include GST at ${rate}. The GST shown is the amount they contain.`
    : `Prices exclude GST. GST at ${rate} is added.`
}

/** Value and GST per tax treatment, in a fixed order, for the tax summary. */
function byTreatment(
  invoice: FullInvoice
): [string, { value: Prisma.Decimal; tax: Prisma.Decimal }][] {
  const totals = new Map<
    string,
    { value: Prisma.Decimal; tax: Prisma.Decimal }
  >()
  for (const { line, item } of backingRows(invoice)) {
    const key = item?.taxTreatment ?? 'NOT_RECORDED'
    const existing = totals.get(key) ?? {
      value: new Prisma.Decimal(0),
      tax: new Prisma.Decimal(0),
    }
    totals.set(key, {
      value: existing.value.plus(item ? item.lineValue : line.amount),
      tax: existing.tax.plus(item ? item.taxAmount : line.tax),
    })
  }
  return Object.keys(TREATMENT_LABELS)
    .filter((key) => totals.has(key))
    .map((key) => [key, totals.get(key)!])
}

/** One branch's share of an invoice. */
interface SiteTotal {
  readonly siteCode: string
  readonly siteName: string
  orders: number
  amount: Prisma.Decimal
  tax: Prisma.Decimal
}

/** The per-branch grouping every export shows. */
function bySite(invoice: FullInvoice): SiteTotal[] {
  const sites = new Map<string, SiteTotal>()

  for (const line of invoice.lines) {
    const existing = sites.get(line.siteId)
    if (existing) {
      existing.orders += 1
      existing.amount = existing.amount.plus(line.amount)
      existing.tax = existing.tax.plus(line.tax)
    } else {
      sites.set(line.siteId, {
        siteCode: line.siteCode,
        siteName: line.siteName,
        orders: 1,
        amount: new Prisma.Decimal(line.amount),
        tax: new Prisma.Decimal(line.tax),
      })
    }
  }

  return [...sites.values()].sort((a, b) =>
    a.siteCode.localeCompare(b.siteCode)
  )
}
