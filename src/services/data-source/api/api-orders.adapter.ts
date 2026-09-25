import { apiClient } from '@/services/api.service'
import type {
  Address,
  Order,
  OrderLineItem,
  OrderStatus,
  PaginatedResult,
} from '@/types'
import type { ApiOffsetPage } from './catalog.types'
import { fromApiPaymentMethod } from './api-cart.adapter'
import type {
  ApiOrder,
  ApiOrderEvent,
  ApiOrderLine,
  ApiShippingSnapshot,
} from './order.types'

/**
 * Orders, served by `/orders` and `/approvals`.
 *
 * Same function signatures as the mock adapter it replaces.
 *
 * The one that changes shape is `create`: an order is not assembled by the
 * client and posted. It is written from the basket the server already holds, so
 * `POST /orders` takes only what is not already on the cart — the recipient and
 * the project code — and the lines, prices, totals and billing period all come
 * from the validated basket. That is the whole point of the cart module: a
 * client that could name its own line prices could name its own discount.
 */

const ORDERS = '/orders'

/**
 * One-click re-order (SOW M-08): the order's lines back in the basket, with a
 * row per line saying whether it went in and, if not, why.
 */
export async function reorder(
  orderId: string
): Promise<{ lines: import('./governance.types').ApiReorderLine[] }> {
  const result: { lines: import('./governance.types').ApiReorderLine[] } =
    await apiClient.post(`${ORDERS}/${encodeURIComponent(orderId)}/reorder`)
  return { lines: result.lines }
}

interface ListParams {
  status?: OrderStatus
  siteId?: string
  accountId?: string
  search?: string
  /** ISO dates. The API filters on placement time. */
  from?: string
  to?: string
  page?: number
  pageSize?: number
  awaitingApproval?: boolean
}

/**
 * Statuses the UI knows but the API does not.
 *
 * The front end's union carries four extra values (`PAID`, `ORDER_PLACED`,
 * `IN_PRODUCTION`, `RECEIVED`) that were display states in the fixtures. The
 * API models payment on its own axis and production as `PROCESSING`, so a
 * filter naming one of these is translated rather than sent and rejected.
 */
const STATUS_ALIASES: Partial<Record<OrderStatus, OrderStatus>> = {
  ORDER_PLACED: 'APPROVED',
  IN_PRODUCTION: 'PROCESSING',
  RECEIVED: 'PROCESSING',
}

function toApiStatus(status?: OrderStatus): OrderStatus | undefined {
  if (!status) return undefined
  // PAID is a payment state, not a lifecycle one — there is nothing to filter
  // the lifecycle by, so it is dropped rather than mistranslated.
  if (status === 'PAID') return undefined
  return STATUS_ALIASES[status] ?? status
}

function toQuery(params?: ListParams): Record<string, unknown> {
  const query: Record<string, unknown> = {
    page: params?.page ?? 1,
    pageSize: params?.pageSize ?? 25,
  }

  const status = toApiStatus(params?.status)
  if (status) query.status = status
  if (params?.siteId) query.siteId = params.siteId
  if (params?.accountId) query.accountId = params.accountId
  if (params?.search?.trim()) query.search = params.search.trim()
  if (params?.from) query.from = params.from
  if (params?.to) query.to = params.to
  if (params?.awaitingApproval) query.awaitingApproval = true

  return query
}

export async function list(
  params?: ListParams
): Promise<PaginatedResult<Order>> {
  const page: ApiOffsetPage<ApiOrder> = await apiClient.get(ORDERS, {
    params: toQuery(params),
  })

  return {
    items: page.items.map(toOrder),
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
  }
}

export async function getById(id: string): Promise<Order | null> {
  try {
    const order: ApiOrder = await apiClient.get(
      `${ORDERS}/${encodeURIComponent(id)}`
    )
    return toOrder(order)
  } catch (error) {
    if (isNotFound(error)) return null
    throw error
  }
}

/**
 * Places the basket the server already holds.
 *
 * Everything about the order except the recipient and the project code is
 * already on the cart, so this deliberately ignores the line items, totals and
 * addresses the caller passes: taking them would mean trusting a browser for
 * what a customer is charged. The cart's checkout details are set by the
 * stepper through `PATCH /cart/checkout-details`.
 */
export async function create(input: Partial<Order>): Promise<Order> {
  const created: ApiOrder = await apiClient.post(ORDERS, {
    ...(input.siteId ? { siteId: input.siteId } : {}),
    ...(input.recipientContact?.name
      ? { recipientName: input.recipientContact.name }
      : {}),
    ...(input.recipientContact?.phone
      ? { recipientPhone: input.recipientContact.phone }
      : {}),
    ...(input.recipientContact?.email
      ? { recipientEmail: input.recipientContact.email }
      : {}),
    ...(input.projectCode ? { projectCode: input.projectCode } : {}),
  })

  return toOrder(created)
}

/** The body of `POST /orders`; see `PlaceOrderSchema` on the server. */
export interface PlaceOrderInput {
  /**
   * The basket the buyer reviewed — `cart.id` from `POST /cart/validate`.
   * Makes the submit safe to repeat: if that basket already became an order,
   * the same order comes back (200) instead of a second one being written.
   */
  cartId: string
  /** Which branch's basket. A site user's own is the default. */
  siteId?: string
  /** For whoever delivers. Up to 500 characters; required by some accounts. */
  deliveryNotes?: string
  recipientName?: string
  recipientPhone?: string
  recipientEmail?: string
  projectCode?: string
}

/**
 * Places the basket the server holds, by the id the buyer reviewed.
 *
 * The replacement for `create` in checkout: it sends the basket id, which
 * makes a retry after a timeout or a double click answer with the order the
 * first attempt wrote, and the delivery instructions, which `create` had no
 * field for. Blank optional fields are left out rather than sent empty.
 */
export async function place(input: PlaceOrderInput): Promise<Order> {
  const optional = (value: string | undefined) => value?.trim() || undefined

  const body = {
    cartId: input.cartId,
    siteId: optional(input.siteId),
    deliveryNotes: optional(input.deliveryNotes),
    recipientName: optional(input.recipientName),
    recipientPhone: optional(input.recipientPhone),
    recipientEmail: optional(input.recipientEmail),
    projectCode: optional(input.projectCode),
  }

  const placed: ApiOrder = await apiClient.post(
    ORDERS,
    Object.fromEntries(
      Object.entries(body).filter(([, value]) => value !== undefined)
    )
  )

  return toOrder(placed)
}

/**
 * Orders are immutable once placed, apart from their status and payment.
 *
 * There is no update endpoint, and rightly so: the lines and prices are a
 * snapshot an invoice is drawn from. A screen that needs to change something
 * moves the status or records a payment instead.
 */
export async function updateDetails(): Promise<Order> {
  throw new Error(
    'A placed order cannot be edited. Change its status, record a payment, or cancel it.'
  )
}

/** What can travel with a status change. */
export interface StatusChangeExtra {
  reason?: string
  /**
   * Both or neither for a dispatch that is not on an NZ Post label. Leave both
   * out to dispatch on the label: the server takes the carrier and tracking
   * references from it, and a carrier sent alone would replace the label's.
   */
  carrier?: string
  trackingNumber?: string
  /** Replaces the order's delivery instructions. An empty string clears them. */
  deliveryNotes?: string
}

export async function updateStatus(
  id: string,
  status: OrderStatus,
  extra?: StatusChangeExtra
): Promise<Order> {
  const target = toApiStatus(status) ?? status

  const updated: ApiOrder = await apiClient.post(
    `${ORDERS}/${encodeURIComponent(id)}/status`,
    {
      status: target,
      ...(extra?.reason ? { reason: extra.reason } : {}),
      ...(extra?.carrier?.trim() ? { carrier: extra.carrier.trim() } : {}),
      ...(extra?.trackingNumber?.trim()
        ? { trackingNumber: extra.trackingNumber.trim() }
        : {}),
      ...(extra?.deliveryNotes !== undefined
        ? { deliveryNotes: extra.deliveryNotes.trim() }
        : {}),
    }
  )

  return toOrder(updated)
}

export async function approveOrder(id: string, note?: string): Promise<Order> {
  return updateStatus(id, 'APPROVED', note ? { reason: note } : {})
}

export async function rejectOrder(id: string, reason: string): Promise<Order> {
  // The API refuses a rejection with no reason, and the database enforces it
  // too — so there is no path to a rejected order that does not say why.
  return updateStatus(id, 'REJECTED', { reason })
}

export async function requestChanges(id: string, note: string): Promise<Order> {
  return updateStatus(id, 'CHANGES_REQUESTED', { reason: note })
}

/**
 * Payment is its own axis — an order can be delivered and unpaid on Net 30
 * terms — so it moves through its own endpoint rather than the lifecycle one.
 *
 * The body is `{ paymentStatus, paymentReference }`. It used to send `status`,
 * `reference` and `method`, which the API refuses with 400. The method is not
 * sent at all: it was chosen at checkout and is already on the order.
 */
export async function payOrder(
  id: string,
  input?: { reference?: string; method?: Order['paymentMethod'] }
): Promise<Order> {
  const updated: ApiOrder = await apiClient.post(
    `${ORDERS}/${encodeURIComponent(id)}/payment`,
    {
      paymentStatus: 'PAID',
      ...(input?.reference ? { paymentReference: input.reference } : {}),
    }
  )

  return toOrder(updated)
}

/** The approvals queue — orders waiting on a decision. */
export async function listPendingApprovals(
  accountId?: string
): Promise<Order[]> {
  const page = await list({
    awaitingApproval: true,
    pageSize: 100,
    ...(accountId ? { accountId } : {}),
  })
  return page.items
}

// --- Mapping -----------------------------------------------------------------

function toAddress(snapshot: ApiShippingSnapshot | null): Address | undefined {
  if (!snapshot?.line1) return undefined

  return {
    street: snapshot.line1,
    ...(snapshot.line2 ? { suite: snapshot.line2 } : {}),
    city: snapshot.city ?? '',
    state: snapshot.region ?? '',
    postalCode: snapshot.postcode ?? '',
    country: snapshot.country ?? '',
  }
}

function toLineItem(orderId: string, line: ApiOrderLine): OrderLineItem {
  return {
    id: line.id,
    orderId,
    productId: line.productId,
    productName: line.name,
    sku: line.sku,
    qty: line.quantity,
    unitPrice: Number(line.unitPrice),
    lineTotal: Number(line.lineTotal),
    packSize: String(line.packSize),
    uom: line.uom,
    // The design's name is what a buyer recognises a personalised line by.
    ...(line.template
      ? { templateId: line.template.id, templateName: line.template.name }
      : {}),
    // Personalisation is opaque to the API and to this mapper: the template
    // builder decides what a field is, and both sides only carry it.
    ...(isCustomisation(line.customisation)
      ? { customizations: line.customisation }
      : {}),
    ...(line.options ? { options: line.options } : {}),
    ...(line.notes ? { notes: line.notes } : {}),
  }
}

function isCustomisation(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toHistory(event: ApiOrderEvent) {
  return {
    status: event.toStatus as OrderStatus,
    timestamp: event.at,
    actorName: event.actorName,
    actorRole: event.actorRole,
    ...(event.comment ? { comment: event.comment } : {}),
  }
}

export function toOrder(api: ApiOrder): Order {
  const address = toAddress(api.shippingAddress)
  const billingAddress = toAddress(api.billingAddress ?? null)

  return {
    id: api.id,
    orderNumber: api.orderNumber,
    accountId: api.accountId,
    accountName: api.accountName,
    siteId: api.siteId,
    siteCode: api.siteCode,
    siteName: api.siteName,
    userId: api.placedById,
    userName: api.placedByName,
    userEmail: api.placedByEmail,
    ...(api.placedByRole ? { userRole: api.placedByRole } : {}),
    ...(api.poNumber ? { poReference: api.poNumber } : {}),
    ...(api.campaignCode ? { campaignCode: api.campaignCode } : {}),
    ...(api.projectCode ? { projectCode: api.projectCode } : {}),
    ...(api.customerReference
      ? { customerReference: api.customerReference }
      : {}),
    status: api.status,
    paymentStatus: api.paymentStatus,
    ...(fromApiPaymentMethod(api.paymentMethod)
      ? { paymentMethod: fromApiPaymentMethod(api.paymentMethod) }
      : {}),
    ...(api.paymentReference ? { paymentReference: api.paymentReference } : {}),
    ...(api.paidAt ? { paidAt: api.paidAt } : {}),
    // `total`, not `subtotal`: the lines plus delivery, and the field the UI
    // prints is the one the customer pays. Tax is not modelled yet.
    totalAmount: Number(api.total),
    subtotalAmount: Number(api.subtotal),
    shippingCost: Number(api.shippingCost ?? 0),
    ...(api.shippingMethod ? { shippingMethod: api.shippingMethod } : {}),
    ...(api.shippingMethodLabel
      ? { shippingMethodLabel: api.shippingMethodLabel }
      : {}),
    itemCount: api.itemCount,
    requiresApproval: api.requiresApproval,
    ...(api.approvedById ? { approvedBy: api.approvedById } : {}),
    ...(api.approvedAt ? { approvedAt: api.approvedAt } : {}),
    ...(api.rejectionReason ? { rejectedReason: api.rejectionReason } : {}),
    ...(api.changeRequestNote
      ? { changesRequestedNotes: api.changeRequestNote }
      : {}),
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
    ...(api.dispatchedAt ? { dispatchedAt: api.dispatchedAt } : {}),
    ...(api.deliveredAt ? { deliveredAt: api.deliveredAt } : {}),
    ...(api.deliveryNotes ? { deliveryNotes: api.deliveryNotes } : {}),
    // The buyer's instructions from checkout. `deliveryNotes` is the courier's
    // and is set at dispatch; this is what the basket's `notes` became.
    ...(api.notes ? { notes: api.notes } : {}),
    ...(api.carrier ? { carrier: api.carrier } : {}),
    ...(api.trackingNumber ? { trackingNumber: api.trackingNumber } : {}),
    ...(api.requestedDeliveryDate
      ? { requestedDeliveryDate: api.requestedDeliveryDate }
      : {}),
    ...(address ? { deliveryAddress: address } : {}),
    ...(billingAddress ? { billingAddress } : {}),
    ...(api.recipientName
      ? {
          recipientContact: {
            name: api.recipientName,
            ...(api.recipientPhone ? { phone: api.recipientPhone } : {}),
            ...(api.recipientEmail ? { email: api.recipientEmail } : {}),
          },
        }
      : {}),
    ...(api.history ? { statusHistory: api.history.map(toHistory) } : {}),
    ...(api.shipping
      ? {
          nzPostDelivery: {
            kind: api.shipping.deliveryKind,
            fullAddress: api.shipping.fullAddress,
            collectionPointName: api.shipping.collectionPoint?.name ?? null,
            serviceDescription:
              api.shipping.service?.description ??
              api.shipping.service?.code ??
              null,
            serviceCode: api.shipping.service?.code ?? null,
            addressValidated: Boolean(
              api.shipping.nzPostAddressId || api.shipping.deliveryAddress
            ),
            parcelEstimate: api.shipping.parcelEstimate
              ? {
                  weightKg: api.shipping.parcelEstimate.weightGrams / 1000,
                  lengthCm: api.shipping.parcelEstimate.lengthCm,
                  widthCm: api.shipping.parcelEstimate.widthCm,
                  heightCm: api.shipping.parcelEstimate.heightCm,
                  missingWeightSkus:
                    api.shipping.parcelEstimate.missingWeightSkus,
                }
              : null,
          },
        }
      : {}),
    lineItems: (api.lines ?? []).map((line) => toLineItem(api.id, line)),
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 404
  )
}
