import type { FullOrder, OrderSummary } from './orders.service'
import type { AddressSnapshotView } from '../cart/cart.types'
import { fromJsonOr } from '../db/json-column'
import {
  toDeliveryChoiceView,
  toShipmentView,
  type DeliveryChoiceView,
  type ShipmentView,
} from '../shipping/shipping.types'
import { findShippingMethod } from '../cart/shipping-methods'

/** "CourierPost Express (Next Day)", or null for an order with no method. */
function shippingMethodLabel(code: string | null): string | null {
  const method = findShippingMethod(code)
  return method ? `${method.label} (${method.eta})` : null
}

/**
 * An order as the API exposes it.
 *
 * Matches the reference portal's `Order` shape, with money as strings for the
 * reason it is everywhere else in this codebase: these are NUMERIC columns and
 * a JSON number would be rounded by the client's parser.
 *
 * Every snapshotted field is returned from the snapshot, never from a join —
 * `sku`, `name`, `unitPrice` and the delivery address all come from the order's
 * own copy, so what the customer sees is what they bought.
 */
export interface OrderView {
  readonly id: string
  readonly orderNumber: string
  readonly accountId: string
  readonly accountName: string
  readonly siteId: string
  readonly siteCode: string
  readonly siteName: string
  readonly costCentre: string | null
  readonly placedById: string
  readonly placedByName: string
  readonly placedByEmail: string
  /**
   * The role they held when they placed it (SOW F-13). Null for orders placed
   * before it was captured.
   */
  readonly placedByRole: string | null
  readonly status: FullOrder['status']
  readonly paymentStatus: FullOrder['paymentStatus']
  /**
   * Whether this order is holding warehouse stock, has consumed it, or has let
   * it go. The fulfilment screen needs it: an order showing APPROVED with
   * nothing reserved is one that will not ship.
   */
  readonly stockState: FullOrder['stockState']
  readonly paymentMethod: FullOrder['paymentMethod']
  readonly paymentReference: string | null
  readonly paidAt: string | null
  readonly poNumber: string | null
  readonly campaignCode: string | null
  readonly projectCode: string | null
  /** Free text from the buyer at checkout (SOW F-14). */
  readonly customerReference: string | null
  readonly requiresApproval: boolean
  readonly approvedById: string | null
  readonly approvedAt: string | null
  readonly rejectionReason: string | null
  readonly changeRequestNote: string | null
  readonly subtotal: string
  /** The same order at catalogue prices, for the "you saved" figure. */
  readonly catalogSubtotal: string
  readonly saving: string
  /** How it travels: a code from `SHIPPING_METHODS`, or null on older orders. */
  readonly shippingMethod: string | null
  /** "CourierPost Express (Next Day)", for screens that print the choice. */
  readonly shippingMethodLabel: string | null
  /** What delivery added, frozen at placement. "0.00" on older orders. */
  readonly shippingCost: string
  /** Subtotal plus shipping. */
  readonly total: string
  readonly rateCardId: string | null
  readonly rateCardName: string | null
  readonly billingPeriod: string
  readonly itemCount: number
  readonly lineCount: number
  readonly shippingAddressId: string | null
  /** What actually shipped, frozen at placement. */
  readonly shippingAddress: unknown
  readonly billingAddressId: string | null
  /**
   * Who it was billed to, frozen at placement (SOW F-15). Null on orders placed
   * before bill-to was captured, and where none was on file.
   */
  readonly billingAddress: AddressSnapshotView | null
  readonly recipientName: string | null
  readonly recipientPhone: string | null
  readonly recipientEmail: string | null
  readonly requestedDeliveryDate: string | null
  readonly carrier: string | null
  readonly trackingNumber: string | null
  readonly deliveryNotes: string | null
  readonly dispatchedAt: string | null
  readonly deliveredAt: string | null
  readonly cancelledAt: string | null
  readonly notes: string | null
  readonly createdAt: string
  readonly updatedAt: string
  /** Present only on the single-order read. */
  readonly lines?: readonly OrderLineView[]
  readonly history?: readonly OrderEventView[]
  /**
   * The NZ Post delivery choice frozen at placement — null when checkout did
   * not use it. The quote in it is a record, never part of `total`.
   * Single-order read only.
   */
  readonly shipping?: DeliveryChoiceView | null
  /** Labels made for this order, voided ones included. Single-order read only. */
  readonly shipments?: readonly ShipmentView[]
}

export interface OrderLineView {
  readonly id: string
  readonly productId: string
  readonly variantId: string | null
  readonly sku: string
  readonly name: string
  readonly variantSku: string | null
  readonly uom: FullOrder['lines'][number]['uom']
  readonly packSize: number
  readonly quantity: number
  readonly unitPrice: string
  readonly lineTotal: string
  /** STANDARD, ZERO_RATED or EXEMPT, as frozen at placement. */
  readonly taxTreatment: string
  readonly catalogUnitPrice: string
  readonly discountPercent: string
  /** Which pricing rule produced the unit price. */
  readonly priceSource: string
  /**
   * The artwork this line was personalised from, when it was.
   *
   * Null for a line with no template — a box of envelopes. Present, it is what
   * lets an operator reconstruct what to print: the version is immutable, so
   * `templateVersion.version` names artwork that cannot have moved since the
   * order was placed.
   */
  readonly template: {
    readonly id: string
    readonly code: string
    readonly name: string
    readonly status: string
    readonly versionId: string
    readonly version: number
    readonly versionLabel: string | null
    readonly publishedAt: string
  } | null
  readonly customisation: unknown
  /**
   * The configuration as it was ordered — {"Finish": "Gloss Laminate"} —
   * frozen at placement. Null for a line with no options.
   */
  readonly options: Readonly<Record<string, string>> | null
  readonly notes: string | null
}

export interface OrderEventView {
  readonly fromStatus: FullOrder['status'] | null
  readonly toStatus: FullOrder['status']
  readonly actorId: string | null
  readonly actorName: string
  readonly actorRole: FullOrder['history'][number]['actorRole']
  readonly comment: string | null
  readonly at: string
}

export function toOrderView(order: FullOrder | OrderSummary): OrderView {
  const detailed = 'lines' in order ? order : null
  const lineCount = detailed
    ? detailed.lines.length
    : (order as OrderSummary)._count.lines

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    accountId: order.accountId,
    accountName: order.account.name,
    siteId: order.siteId,
    siteCode: order.site.code,
    siteName: order.site.name,
    costCentre: order.site.costCentre,
    placedById: order.placedById,
    placedByName: order.placedByName,
    placedByEmail: order.placedByEmail,
    placedByRole: order.placedByRole,
    status: order.status,
    paymentStatus: order.paymentStatus,
    stockState: order.stockState,
    paymentMethod: order.paymentMethod,
    paymentReference: order.paymentReference,
    paidAt: order.paidAt?.toISOString() ?? null,
    poNumber: order.poNumber,
    campaignCode: order.campaignCode,
    projectCode: order.projectCode,
    customerReference: order.customerReference,
    requiresApproval: order.requiresApproval,
    approvedById: order.approvedById,
    approvedAt: order.approvedAt?.toISOString() ?? null,
    rejectionReason: order.rejectionReason,
    changeRequestNote: order.changeRequestNote,
    subtotal: order.subtotal.toFixed(2),
    catalogSubtotal: order.catalogSubtotal.toFixed(2),
    saving: order.catalogSubtotal.minus(order.subtotal).toFixed(2),
    shippingMethod: order.shippingMethod,
    shippingMethodLabel: shippingMethodLabel(order.shippingMethod),
    shippingCost: order.shippingCost.toFixed(2),
    total: order.total.toFixed(2),
    rateCardId: order.rateCardId,
    rateCardName: order.rateCardName,
    billingPeriod: order.billingPeriod,
    itemCount: detailed
      ? detailed.lines.reduce((sum, line) => sum + line.quantity, 0)
      : lineCount,
    lineCount,
    shippingAddressId: order.shippingAddressId,
    shippingAddress: fromJsonOr<Record<string, unknown> | null>(
      order.shippingSnapshot,
      null
    ),
    billingAddressId: order.billingAddressId,
    billingAddress: fromJsonOr<AddressSnapshotView | null>(
      order.billingSnapshot,
      null
    ),
    recipientName: order.recipientName,
    recipientPhone: order.recipientPhone,
    recipientEmail: order.recipientEmail,
    requestedDeliveryDate: order.requestedDeliveryDate?.toISOString() ?? null,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    deliveryNotes: order.deliveryNotes,
    dispatchedAt: order.dispatchedAt?.toISOString() ?? null,
    deliveredAt: order.deliveredAt?.toISOString() ?? null,
    cancelledAt: order.cancelledAt?.toISOString() ?? null,
    notes: order.notes,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    ...(detailed
      ? {
          lines: detailed.lines.map(toOrderLineView),
          history: detailed.history.map(toOrderEventView),
          shipping: detailed.shipping
            ? toDeliveryChoiceView(detailed.shipping)
            : null,
          shipments: detailed.shipments.map(toShipmentView),
        }
      : {}),
  }
}

function toOrderLineView(line: FullOrder['lines'][number]): OrderLineView {
  return {
    id: line.id,
    productId: line.productId,
    variantId: line.variantId,
    sku: line.sku,
    name: line.name,
    variantSku: line.variantSku,
    uom: line.uom,
    packSize: line.packSize,
    quantity: line.quantity,
    unitPrice: line.unitPrice.toFixed(2),
    lineTotal: line.lineTotal.toFixed(2),
    taxTreatment: line.taxTreatment,
    catalogUnitPrice: line.catalogUnitPrice.toFixed(2),
    discountPercent: line.discountPercent.toFixed(2),
    priceSource: line.priceSource,
    template:
      line.template && line.templateVersion
        ? {
            id: line.template.id,
            code: line.template.code,
            name: line.template.name,
            status: line.template.status,
            versionId: line.templateVersion.id,
            version: line.templateVersion.version,
            versionLabel: line.templateVersion.label,
            publishedAt: line.templateVersion.createdAt.toISOString(),
          }
        : null,
    customisation: fromJsonOr<unknown>(line.customisation, null),
    options: fromJsonOr<Record<string, string> | null>(line.options, null),
    notes: line.notes,
  }
}

function toOrderEventView(event: FullOrder['history'][number]): OrderEventView {
  return {
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    actorId: event.actorId,
    actorName: event.actorName,
    actorRole: event.actorRole,
    comment: event.comment,
    at: event.createdAt.toISOString(),
  }
}
