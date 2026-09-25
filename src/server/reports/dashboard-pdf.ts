import PDFDocument from 'pdfkit'
import type { DashboardReport } from './reports.service'

/**
 * The executive dashboard as a PDF (SOW §15: "PDF for the consolidated billing
 * summary and executive dashboards").
 *
 * The billing half already exists — the monthly invoice PDF is the consolidated
 * summary — so this is the dashboard half.
 *
 * ---------------------------------------------------------------------------
 * Same figures, not recomputed
 * ---------------------------------------------------------------------------
 * It renders a `DashboardReport` exactly as `GET /reports/dashboard` returns it
 * for the same filters, strings and all. It computes nothing of its own beyond
 * the heights of the trend bars, so the PDF cannot show a total the screen does
 * not (§10.5: "exports to PDF, CSV and XLSX contain the same figures as the
 * on-screen view").
 *
 * Laid out by hand, like the invoice: one fixed document, compiled with the
 * application, where a template engine would turn a typo into a production
 * failure instead of a build error.
 */

export interface DashboardPdfMeta {
  /** The account's name, or null for the platform-wide dashboard. */
  readonly accountName: string | null
  readonly generatedBy: string
  readonly generatedAt: Date
}

const MARGIN = 48
const INK = '#111111'
const MUTED = '#666666'
const RULE = '#dddddd'
const BAR = '#2f6f5e'

export async function toDashboardPdf(
  report: DashboardReport,
  meta: DashboardPdfMeta
): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN })
  const chunks: Buffer[] = []
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const width = doc.page.width - MARGIN * 2
  const lastDay = new Date(new Date(report.to).getTime() - 1)
    .toISOString()
    .slice(0, 10)

  // --- Heading --------------------------------------------------------------
  doc.fillColor(INK).fontSize(20).text('Print Procurement Portal')
  doc.moveDown(1)
  doc.fillColor(INK).fontSize(16).text('Executive spend dashboard')
  doc.moveDown(0.3).fontSize(10)

  const facts: [string, string][] = [
    [
      'Account',
      report.scope === 'platform'
        ? 'Every account (platform-wide)'
        : (meta.accountName ?? report.accountId ?? '—'),
    ],
    ['Period', `${report.from.slice(0, 10)} to ${lastDay}`],
    ['Grouped by', report.granularity],
    [
      'Generated',
      `${meta.generatedAt.toISOString().replace('T', ' ').slice(0, 16)} UTC by ${meta.generatedBy}`,
    ],
  ]
  for (const [label, value] of facts) {
    doc.fillColor(MUTED).text(`${label}: `, { continued: true })
    doc.fillColor(INK).text(value)
  }

  // --- Headline figures -----------------------------------------------------
  section(doc, 'Headline')
  const cards: [string, string, string | null][] = [
    ['Spend', report.spend.totalSpend, growth(report.spend.spendGrowthPercent)],
    [
      'Orders',
      String(report.spend.orderCount),
      growth(report.spend.orderGrowthPercent),
    ],
    ['Average order', report.spend.averageOrderValue, null],
    ['Branches ordering', String(report.spend.siteCount), null],
  ]
  const cardWidth = (width - 3 * 10) / 4
  const top = doc.y
  cards.forEach(([label, value, note], index) => {
    const x = MARGIN + index * (cardWidth + 10)
    doc.rect(x, top, cardWidth, 58).strokeColor(RULE).stroke()
    doc
      .fillColor(MUTED)
      .fontSize(8)
      .text(label, x + 8, top + 8, { width: cardWidth - 16 })
    doc
      .fillColor(INK)
      .fontSize(14)
      .text(value, x + 8, top + 21, { width: cardWidth - 16 })
    if (note) {
      doc
        .fillColor(MUTED)
        .fontSize(7)
        .text(note, x + 8, top + 42, { width: cardWidth - 16 })
    }
  })
  doc.x = MARGIN
  doc.y = top + 66
  doc
    .fillColor(MUTED)
    .fontSize(8)
    .text(
      `Previous period of the same length: ${report.spend.previous.totalSpend} across ` +
        `${report.spend.previous.orderCount} orders. ` +
        `Pace: ${report.pace.ordersPerDay} orders a day` +
        (report.pace.busiestBucket
          ? `; busiest ${report.pace.busiestBucket} (${report.pace.busiestBucketOrders} orders).`
          : '.'),
      MARGIN,
      doc.y,
      { width }
    )

  // --- Trend ----------------------------------------------------------------
  section(doc, 'Spend over the period')
  const maxSpend = Math.max(0, ...report.trend.map((b) => Number(b.spend)))
  const chartHeight = 90
  ensureSpace(doc, chartHeight + 30)
  const chartTop = doc.y
  const slot = report.trend.length ? width / report.trend.length : width
  report.trend.forEach((bucket, index) => {
    const height =
      maxSpend > 0 ? (Number(bucket.spend) / maxSpend) * chartHeight : 0
    const x = MARGIN + index * slot + slot * 0.15
    doc
      .rect(x, chartTop + chartHeight - height, Math.max(1, slot * 0.7), height)
      .fillColor(BAR)
      .fill()
  })
  doc
    .moveTo(MARGIN, chartTop + chartHeight)
    .lineTo(MARGIN + width, chartTop + chartHeight)
    .strokeColor(RULE)
    .stroke()
  doc.x = MARGIN
  doc.y = chartTop + chartHeight + 6
  table(
    doc,
    ['Period', 'Orders', 'Spend'],
    [0.5, 0.2, 0.3],
    report.trend.map((b) => [b.bucket, String(b.orders), b.spend])
  )

  // --- Pipeline ---------------------------------------------------------------
  section(doc, 'Orders by status', report.byStatus.length)
  table(
    doc,
    ['Status', 'Orders', 'Value', 'Share %'],
    [0.4, 0.2, 0.25, 0.15],
    report.byStatus.map((row) => [
      row.status,
      String(row.orders),
      row.value,
      String(row.sharePercent),
    ])
  )

  section(doc, 'Work in progress, as of now', 5)
  table(
    doc,
    ['Queue', 'Orders'],
    [0.7, 0.3],
    [
      ['Open', String(report.queue.open)],
      ['Awaiting approval', String(report.queue.awaitingApproval)],
      ['In fulfilment', String(report.queue.inFulfilment)],
      ['Awaiting dispatch', String(report.queue.awaitingDispatch)],
      ['In transit', String(report.queue.inTransit)],
    ]
  )

  // --- Branches ---------------------------------------------------------------
  section(doc, 'Top branches', report.topSites.length)
  table(
    doc,
    ['Code', 'Branch', 'Orders', 'Spend', 'Share %'],
    [0.14, 0.4, 0.12, 0.2, 0.14],
    report.topSites.map((site) => [
      site.sublabel ?? '',
      site.label,
      String(site.orders),
      site.spend,
      String(site.sharePercent),
    ]),
    // Code and name are words; only the three after them are figures.
    2
  )

  doc.moveDown(1)
  doc
    .fillColor(MUTED)
    .fontSize(7)
    .text(
      'Spend counts committed orders — awaiting approval through delivered — the ' +
        'same definition as branch budgets. Times are UTC. Figures are those of the ' +
        'on-screen dashboard for the same filters.',
      MARGIN,
      doc.y,
      { width }
    )

  doc.end()
  return finished
}

function growth(percent: number | null): string {
  if (percent === null) return 'No previous period to compare'
  const sign = percent > 0 ? '+' : ''
  return `${sign}${percent}% on the previous period`
}

/**
 * A heading, kept on the same page as the table under it.
 *
 * A short table moves to the next page whole rather than leaving its last rows
 * stranded over the page break; one too long for a page starts where it is and
 * flows on.
 */
function section(doc: PDFKit.PDFDocument, title: string, rows = 0): void {
  const whole = 40 + (rows + 1) * ROW_HEIGHT
  const usable = doc.page.height - MARGIN * 2
  ensureSpace(doc, whole < usable * 0.6 ? whole : 60)
  doc.moveDown(1)
  doc.x = MARGIN
  doc.fillColor(INK).fontSize(12).text(title)
  doc.moveDown(0.3)
}

/** A new page when fewer than `needed` points remain above the bottom margin. */
function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > doc.page.height - MARGIN) {
    doc.addPage()
    doc.x = MARGIN
    doc.y = MARGIN
  }
}

const ROW_HEIGHT = 13

/**
 * Rows of text in fixed column shares of the page.
 *
 * The first `textColumns` are words and read left to right; the rest are figures
 * and are right-aligned, so a column of money reads down its decimal points.
 */
function table(
  doc: PDFKit.PDFDocument,
  headers: readonly string[],
  shares: readonly number[],
  rows: readonly (readonly string[])[],
  textColumns = 1
): void {
  const width = doc.page.width - MARGIN * 2
  const draw = (cells: readonly string[], bold: boolean) => {
    ensureSpace(doc, 16)
    const y = doc.y
    let x = MARGIN
    cells.forEach((cell, index) => {
      const columnWidth = width * (shares[index] ?? 0)
      doc
        .fillColor(bold ? MUTED : INK)
        .fontSize(8)
        .text(cell, x, y, {
          width: columnWidth - 6,
          align: index < textColumns ? 'left' : 'right',
          lineBreak: false,
          ellipsis: true,
        })
      x += columnWidth
    })
    doc.x = MARGIN
    doc.y = y + ROW_HEIGHT
  }

  draw(headers, true)
  if (rows.length === 0) {
    doc.fillColor(MUTED).fontSize(8).text('Nothing in this period.', MARGIN)
    return
  }
  for (const row of rows) draw(row, false)
}
