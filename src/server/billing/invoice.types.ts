import { Prisma } from '@prisma/client'
import type { AddressSnapshotView } from '../cart/cart.types'
import { fromJsonOr } from '../db/json-column'
import type { FullInvoice, InvoiceSummary } from './billing.service'

/**
 * An invoice as the API exposes it.
 *
 * Money is a string throughout, as everywhere else: these are NUMERIC columns
 * and a JSON number would be rounded by the client's parser.
 */
export interface InvoiceView {
  readonly id: string
  /** Null while it is a draft — a draft holds no number, by design. */
  readonly invoiceNumber: string | null
  readonly accountId: string
  readonly accountCode: string
  readonly accountName: string
  readonly billingPeriod: string
  readonly status: InvoiceSummary['status']
  readonly subtotal: string
  /** GST: the sum of every billed item's GST. */
  readonly tax: string
  /** What is payable: subtotal plus tax, or the subtotal when prices include it. */
  readonly total: string
  /**
   * The GST rate it was taxed at, as "15.00". Null for an invoice generated
   * before tax was applied, whose tax is the 0.00 it was issued with.
   */
  readonly taxRatePercent: string | null
  /** Whether the prices it bills already include GST (SOW A-08). */
  readonly pricesIncludeTax: boolean
  readonly orderCount: number
  readonly siteCount: number
  readonly issuedAt: string | null
  readonly dueAt: string | null
  readonly paidAt: string | null
  readonly paymentReference: string | null
  /** True when it is issued, past due and still unpaid. */
  readonly overdue: boolean
  readonly voidReason: string | null
  readonly notes: string | null
  readonly createdAt: string
  readonly updatedAt: string
  /** Present only on the single-invoice read. */
  readonly lines?: readonly InvoiceLineView[]
  /** The per-branch grouping the billing table shows. Single read only. */
  readonly sites?: readonly InvoiceSiteView[]
}

export interface InvoiceLineView {
  readonly id: string
  readonly orderId: string
  readonly orderNumber: string
  readonly orderedAt: string
  readonly siteId: string
  readonly siteCode: string
  readonly siteName: string
  readonly costCentre: string | null
  readonly poNumber: string | null
  readonly campaignCode: string | null
  readonly customerReference: string | null
  /**
   * Who this order was billed to (SOW F-15, B-09), as frozen on the order. Null
   * for orders placed before bill-to was captured.
   */
  readonly billingAddress: AddressSnapshotView | null
  /** Who ordered it, in which role (SOW B-04, F-13). Null before captured. */
  readonly placedByName: string | null
  readonly placedByEmail: string | null
  readonly placedByRole: string | null
  /** Where it went (SOW B-08), as frozen on the order. */
  readonly shippingAddress: AddressSnapshotView | null
  readonly recipientName: string | null
  readonly deliveryNotes: string | null
  /** SOW B-11 and B-10, as they stood when the invoice was generated. */
  readonly orderNotes: string | null
  readonly orderStatus: string | null
  readonly trackingNumber: string | null
  readonly itemCount: number
  readonly amount: string
  readonly tax: string
  /**
   * What was billed on this order, line by line, with its delivery charge.
   * Empty on an invoice generated before items were recorded.
   */
  readonly items: readonly InvoiceItemView[]
}

export interface InvoiceItemView {
  readonly id: string
  readonly sequence: number
  /** PRODUCT for an order line; DELIVERY for the order's delivery charge. */
  readonly kind: string
  readonly orderLineId: string | null
  readonly sku: string
  readonly name: string
  readonly variantSku: string | null
  readonly uom: string | null
  readonly packSize: number | null
  readonly quantity: number
  readonly unitPrice: string
  readonly lineValue: string
  readonly taxTreatment: string
  readonly taxAmount: string
  readonly notes: string | null
}

export interface InvoiceSiteView {
  readonly siteId: string
  readonly siteCode: string
  readonly siteName: string
  readonly orders: number
  readonly amount: string
  readonly tax: string
}

export function toInvoiceView(
  invoice: FullInvoice | InvoiceSummary
): InvoiceView {
  const detailed = 'lines' in invoice ? invoice : null

  return {
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    accountId: invoice.accountId,
    accountCode: invoice.account.accountCode,
    accountName: invoice.account.name,
    billingPeriod: invoice.billingPeriod,
    status: invoice.status,
    subtotal: invoice.subtotal.toFixed(2),
    tax: invoice.tax.toFixed(2),
    total: invoice.total.toFixed(2),
    taxRatePercent: invoice.taxRatePercent?.toFixed(2) ?? null,
    pricesIncludeTax: invoice.pricesIncludeTax,
    orderCount: invoice.orderCount,
    siteCount: invoice.siteCount,
    issuedAt: invoice.issuedAt?.toISOString() ?? null,
    dueAt: invoice.dueAt?.toISOString() ?? null,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    paymentReference: invoice.paymentReference,
    // Computed rather than stored: a flag would need a nightly job to flip it,
    // and an invoice that only became overdue at 3am is not a thing.
    overdue:
      invoice.status === 'ISSUED' &&
      invoice.dueAt !== null &&
      invoice.dueAt < new Date(),
    voidReason: invoice.voidReason,
    notes: invoice.notes,
    createdAt: invoice.createdAt.toISOString(),
    updatedAt: invoice.updatedAt.toISOString(),
    ...(detailed
      ? {
          lines: detailed.lines.map(toInvoiceLineView),
          sites: groupBySite(detailed),
        }
      : {}),
  }
}

function toInvoiceLineView(
  line: FullInvoice['lines'][number]
): InvoiceLineView {
  return {
    id: line.id,
    orderId: line.orderId,
    orderNumber: line.orderNumber,
    orderedAt: line.orderedAt.toISOString(),
    siteId: line.siteId,
    siteCode: line.siteCode,
    siteName: line.siteName,
    costCentre: line.costCentre,
    poNumber: line.poNumber,
    campaignCode: line.campaignCode,
    customerReference: line.customerReference,
    billingAddress: fromJsonOr<AddressSnapshotView | null>(
      line.billingSnapshot,
      null
    ),
    placedByName: line.placedByName,
    placedByEmail: line.placedByEmail,
    placedByRole: line.placedByRole,
    shippingAddress: fromJsonOr<AddressSnapshotView | null>(
      line.shippingSnapshot,
      null
    ),
    recipientName: line.recipientName,
    deliveryNotes: line.deliveryNotes,
    orderNotes: line.orderNotes,
    orderStatus: line.orderStatus,
    trackingNumber: line.trackingNumber,
    itemCount: line.itemCount,
    amount: line.amount.toFixed(2),
    tax: line.tax.toFixed(2),
    items: line.items.map((item) => ({
      id: item.id,
      sequence: item.sequence,
      kind: item.kind,
      orderLineId: item.orderLineId,
      sku: item.sku,
      name: item.name,
      variantSku: item.variantSku,
      uom: item.uom,
      packSize: item.packSize,
      quantity: item.quantity,
      unitPrice: item.unitPrice.toFixed(2),
      lineValue: item.lineValue.toFixed(2),
      taxTreatment: item.taxTreatment,
      taxAmount: item.taxAmount.toFixed(2),
      notes: item.notes,
    })),
  }
}

/**
 * The per-branch totals, derived rather than stored.
 *
 * The lines are already frozen, so this cannot drift from them — and storing it
 * would be a second copy of a number that is one reduce away.
 */
function groupBySite(invoice: FullInvoice): InvoiceSiteView[] {
  const sites = new Map<
    string,
    {
      siteId: string
      siteCode: string
      siteName: string
      orders: number
      amount: Prisma.Decimal
      tax: Prisma.Decimal
    }
  >()

  for (const line of invoice.lines) {
    const existing = sites.get(line.siteId)
    if (existing) {
      existing.orders += 1
      existing.amount = existing.amount.plus(line.amount)
      existing.tax = existing.tax.plus(line.tax)
    } else {
      sites.set(line.siteId, {
        siteId: line.siteId,
        siteCode: line.siteCode,
        siteName: line.siteName,
        orders: 1,
        amount: new Prisma.Decimal(line.amount),
        tax: new Prisma.Decimal(line.tax),
      })
    }
  }

  return [...sites.values()]
    .map((site) => ({
      siteId: site.siteId,
      siteCode: site.siteCode,
      siteName: site.siteName,
      orders: site.orders,
      amount: site.amount.toFixed(2),
      tax: site.tax.toFixed(2),
    }))
    .sort((a, b) => a.siteCode.localeCompare(b.siteCode))
}
