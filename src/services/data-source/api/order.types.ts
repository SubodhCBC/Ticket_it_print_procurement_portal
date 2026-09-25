/**
 * Orders exactly as the API returns them.
 *
 * Mirrors `modules/orders/dto/order-response.ts`. Every line is frozen at the
 * moment of placement — the product name, SKU, unit price and the rule that
 * produced it are copied onto the order rather than joined, so a product
 * renamed or repriced next year cannot alter what an invoice from this year
 * says. The client must never re-derive any of it.
 */

import type { ApiCartShipping } from './cart.types'

export type ApiOrderStatus =
  | 'DRAFT'
  | 'PENDING_APPROVAL'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PROCESSING'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED'

export type ApiPaymentStatus =
  'UNPAID' | 'PAYMENT_PENDING' | 'PAID' | 'REFUNDED'

/** What the order has done to the warehouse. Independent of its status. */
export type ApiStockState = 'NONE' | 'RESERVED' | 'CONSUMED' | 'RELEASED'

export interface ApiOrderLine {
  id: string
  productId: string
  variantId: string | null
  sku: string
  name: string
  variantSku: string | null
  uom: string
  packSize: number
  quantity: number
  unitPrice: string
  lineTotal: string
  catalogUnitPrice: string
  discountPercent: string
  priceSource: string
  /**
   * The design this line was personalised from, and the exact version. Null
   * for a line with no template.
   */
  template: {
    id: string
    code: string
    name: string
    status: string
    versionId: string
    version: number
    versionLabel: string | null
    publishedAt: string
  } | null
  customisation: unknown
  /**
   * The configuration as it was ordered — `{"Finish": "Gloss Laminate"}` —
   * frozen at placement. Null for a line with no options.
   */
  options: Record<string, string> | null
  notes: string | null
}

export interface ApiOrderEvent {
  fromStatus: ApiOrderStatus | null
  toStatus: ApiOrderStatus
  actorId: string | null
  actorName: string
  actorRole: string
  comment: string | null
  at: string
}

/** The shipping address as it was when the order shipped, not as it is now. */
export interface ApiShippingSnapshot {
  line1?: string
  line2?: string | null
  city?: string
  region?: string | null
  postcode?: string
  country?: string
  label?: string | null
  recipientName?: string | null
  phone?: string | null
}

export interface ApiOrder {
  id: string
  orderNumber: string
  accountId: string
  accountName: string
  siteId: string
  siteCode: string
  siteName: string
  costCentre: string | null
  placedById: string
  placedByName: string
  placedByEmail: string
  /** The role they ordered in, frozen at placement. Absent from older builds. */
  placedByRole?: string | null
  status: ApiOrderStatus
  paymentStatus: ApiPaymentStatus
  stockState: ApiStockState
  paymentMethod: 'NET_30_INVOICE' | 'P_CARD' | 'ACH' | null
  paymentReference: string | null
  paidAt: string | null
  poNumber: string | null
  campaignCode: string | null
  projectCode: string | null
  /** Absent from an API build before F-14. */
  customerReference?: string | null
  requiresApproval: boolean
  approvedById: string | null
  approvedAt: string | null
  rejectionReason: string | null
  changeRequestNote: string | null
  subtotal: string
  catalogSubtotal: string
  saving: string
  /** How the parcel travels: a shipping method code, or null on older orders. */
  shippingMethod: 'COURIERPOST_EXPRESS' | 'STANDARD_PARCEL' | null
  /** "CourierPost Express (Next Day)", or null. */
  shippingMethodLabel: string | null
  /** What delivery added, frozen at placement. "0.00" on older orders. */
  shippingCost: string
  /** Subtotal plus shipping. */
  total: string
  rateCardId: string | null
  rateCardName: string | null
  billingPeriod: string
  itemCount: number
  lineCount: number
  shippingAddressId: string | null
  shippingAddress: ApiShippingSnapshot | null
  /** Absent from an API build before F-15; null on older orders. */
  billingAddressId?: string | null
  billingAddress?: ApiShippingSnapshot | null
  recipientName: string | null
  recipientPhone: string | null
  recipientEmail: string | null
  requestedDeliveryDate: string | null
  carrier: string | null
  trackingNumber: string | null
  deliveryNotes: string | null
  dispatchedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  /** Present only on the single-order read. */
  lines?: ApiOrderLine[]
  history?: ApiOrderEvent[]
  /**
   * The NZ Post delivery choice frozen at placement, or null when checkout did
   * not use it. Recorded for dispatch, never part of `total`. Single-order read
   * only.
   */
  shipping?: ApiCartShipping['selection']
}
