import PDFDocument from 'pdfkit'
import type { AddressSnapshotView } from '../cart/cart.types'
import { fromJsonOr } from '../db/json-column'
import { ORDER_RESERVED_KEYS } from '../templates/template-status'
import type { FullOrder } from './orders.service'

/**
 * The fulfilment docket: one order, as the people printing and packing it need
 * to read it (SOW F-19: "order-level and line-level notes retained on the order
 * and passed to fulfilment").
 *
 * ---------------------------------------------------------------------------
 * Why a docket, and not the label
 * ---------------------------------------------------------------------------
 * The NZ Post label carries delivery instructions to a courier, and a line note
 * — "use the gloss stock", "trim the bleed to 2mm" — means nothing to a courier
 * and has no field to go in. Line notes are for the print room and the packing
 * bench, so they go on the sheet that travels with the job: every line, what
 * was chosen, the personalised wording and the note, with the order's own notes
 * and delivery instructions at the top.
 *
 * Rendered from the order's frozen rows, like the invoice, so it can be printed
 * again later and say the same thing.
 */
export async function toFulfilmentDocket(order: FullOrder): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 48 })
  const chunks: Buffer[] = []
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
  })

  const muted = '#666666'
  const ink = '#111111'
  const fact = (label: string, value: string | null | undefined) => {
    if (!value) return
    doc.fillColor(muted).text(`${label}: `, { continued: true })
    doc.fillColor(ink).text(value)
  }

  doc.fillColor(ink).fontSize(18).text(`Fulfilment docket ${order.orderNumber}`)
  doc.fontSize(9).fillColor(muted).text('Print Procurement Portal')
  doc.moveDown(0.8).fontSize(10)

  fact('Account', `${order.account.name} (${order.account.accountCode})`)
  fact('Branch', `${order.site.name} (${order.site.code})`)
  fact('Status', order.status)
  fact(
    'Placed',
    order.createdAt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  )
  fact('Ordered by', `${order.placedByName} <${order.placedByEmail}>`)
  fact('Purchase order', order.poNumber)
  fact(
    'Requested delivery',
    order.requestedDeliveryDate?.toISOString().slice(0, 10)
  )

  // --- Delivery -----------------------------------------------------------------
  doc.moveDown(0.6).fontSize(12).fillColor(ink).text('Deliver to')
  doc.fontSize(10)
  const shipTo = fromJsonOr<AddressSnapshotView | null>(
    order.shippingSnapshot,
    null
  )
  const addressLines = shipTo
    ? [
        order.recipientName ?? shipTo.recipientName,
        shipTo.label,
        shipTo.line1,
        shipTo.line2,
        [shipTo.city, shipTo.region, shipTo.postcode].filter(Boolean).join(' '),
        shipTo.country,
      ].filter((part): part is string => Boolean(part?.trim()))
    : ['No delivery address was recorded on this order.']
  doc.text([...new Set(addressLines)].join('\n'))
  if (order.recipientPhone) fact('Phone', order.recipientPhone)

  notesBlock(doc, 'Delivery instructions', order.deliveryNotes)
  notesBlock(doc, 'Order notes', order.notes)

  // --- Lines ------------------------------------------------------------------------
  doc.moveDown(0.8).fontSize(12).fillColor(ink).text('Lines')
  order.lines.forEach((line, index) => {
    if (doc.y > doc.page.height - 140) doc.addPage()
    doc.moveDown(0.5).fontSize(10).fillColor(ink)
    doc.text(
      `${index + 1}.  ${line.quantity} × ${line.uom}  ${line.sku}${line.variantSku ? ` / ${line.variantSku}` : ''}  —  ${line.name}`
    )
    doc.fontSize(9)

    const options = fromJsonOr<Record<string, string>>(line.options, {})
    const chosen = Object.entries(options)
      .map(([name, value]) => `${name}: ${value}`)
      .join(', ')
    if (chosen) indented(doc, `Options — ${chosen}`)
    if (line.packSize > 1) indented(doc, `Pack of ${line.packSize}`)

    if (line.template) {
      const version = line.templateVersion
        ? ` v${line.templateVersion.version}${line.templateVersion.label ? ` (${line.templateVersion.label})` : ''}`
        : ''
      indented(
        doc,
        `Design — ${line.template.name} [${line.template.code}]${version}`
      )
    }

    const wording = Object.entries(
      fromJsonOr<Record<string, unknown>>(line.customisation, {})
    ).filter(
      ([key, value]) =>
        !ORDER_RESERVED_KEYS.includes(key) &&
        typeof value === 'string' &&
        value.trim()
    )
    for (const [key, value] of wording) indented(doc, `${key}: ${value}`)

    if (line.notes?.trim()) {
      doc
        .fillColor('#8a4b00')
        .text(`Line note: ${line.notes.trim()}`, 72, doc.y, {
          width: doc.page.width - 120,
        })
        .fillColor(ink)
    }
    doc.x = 48
  })

  doc.end()
  return finished
}

function indented(doc: PDFKit.PDFDocument, text: string): void {
  doc.fillColor('#444444').text(text, 72, doc.y, {
    width: doc.page.width - 120,
  })
  doc.fillColor('#111111')
  doc.x = 48
}

function notesBlock(
  doc: PDFKit.PDFDocument,
  heading: string,
  notes: string | null
): void {
  if (!notes?.trim()) return
  doc.moveDown(0.6).fontSize(11).fillColor('#111111').text(heading)
  doc.fontSize(10).fillColor('#8a4b00').text(notes.trim()).fillColor('#111111')
}
