// src/services/orders.service.ts
import { getDataSource } from '@/services/data-source'
import type {
  PlaceOrderInput,
  StatusChangeExtra,
} from '@/services/data-source/api/api-orders.adapter'
import type { Order, OrderStatus, PaginatedResult } from '@/types'

/**
 * Orders.
 *
 * Thin over the API, and deliberately so. Two habits from the fixture era are
 * gone:
 *
 *  - **No client-side audit writes.** The API records every transition against
 *    the authenticated actor; a copy here would invent one.
 *  - **No client-supplied actor.** The `approverName` / `paidBy` arguments are
 *    still accepted so the screens that pass them keep compiling, but they are
 *    not sent: who approved an order is decided by the bearer token, not by the
 *    browser. Accepting a name from the client is how an approval ends up
 *    attributed to whoever the page felt like naming.
 */

export async function getOrders(params?: {
  page?: number
  pageSize?: number
  status?: OrderStatus | 'ALL'
  siteId?: string
  accountId?: string
  search?: string
  startDate?: string
  endDate?: string
}): Promise<PaginatedResult<Order>> {
  const ds = getDataSource()

  // 'ALL' is the UI's token for "no filter"; sending it would be rejected.
  const { status, startDate, endDate, ...rest } = params ?? {}

  return ds.orders.list({
    ...rest,
    ...(status && status !== 'ALL' ? { status } : {}),
    ...(startDate ? { from: startDate } : {}),
    ...(endDate ? { to: endDate } : {}),
  })
}

export async function getOrderById(id: string): Promise<Order | null> {
  const ds = getDataSource()
  return ds.orders.getById(id)
}

/**
 * Places the basket the server is holding.
 *
 * The lines, prices, totals and billing period all come from the validated
 * cart; only the recipient and the project code are supplied here. See the note
 * on the adapter's `create`.
 */
export async function createOrder(input: Partial<Order>): Promise<Order> {
  const ds = getDataSource()
  return ds.orders.create(input)
}

/**
 * Places the basket the buyer reviewed. Safe to repeat with the same `cartId`:
 * an order already written from that basket is returned rather than a second
 * one placed. Use `placeReviewedOrder` in `checkout.service.ts` from a screen —
 * it adds the retry and the failure handling checkout needs.
 */
export async function placeOrder(input: PlaceOrderInput): Promise<Order> {
  const ds = getDataSource()
  return ds.orders.place(input)
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
  extra?: StatusChangeExtra
): Promise<Order> {
  const ds = getDataSource()
  return ds.orders.updateStatus(id, status, extra)
}

/** Placed orders are immutable apart from status and payment. */
export async function updateOrderDetails(): Promise<Order> {
  const ds = getDataSource()
  return ds.orders.updateDetails()
}

export async function approveOrder(
  id: string,
  _approverName?: string,
  notes?: string
): Promise<Order> {
  const ds = getDataSource()
  return ds.orders.approveOrder(id, notes)
}

export async function requestChanges(
  id: string,
  _approverName: string,
  notes: string
): Promise<Order> {
  const ds = getDataSource()
  return ds.orders.requestChanges(id, notes)
}

export async function rejectOrder(
  id: string,
  _approverName: string,
  reason: string
): Promise<Order> {
  const ds = getDataSource()
  return ds.orders.rejectOrder(id, reason)
}

export async function payOrder(
  id: string,
  paymentMethod: Order['paymentMethod'] = 'CORPORATE_INVOICE',
  paymentRef?: string
): Promise<Order> {
  const ds = getDataSource()
  return ds.orders.payOrder(id, {
    ...(paymentMethod ? { method: paymentMethod } : {}),
    ...(paymentRef ? { reference: paymentRef } : {}),
  })
}

/**
 * The approvals queue.
 *
 * Asks the API for orders awaiting a decision rather than fetching a page and
 * filtering it: a client-side filter only ever searches the page it happens to
 * have loaded, so a busy queue would quietly lose its tail.
 */
export async function getPendingApprovals(
  accountId?: string
): Promise<Order[]> {
  const ds = getDataSource()
  return ds.orders.listPendingApprovals(accountId)
}

/**
 * The fulfilment board, one column per status.
 *
 * Fetched per column so each is complete. The API has no `RECEIVED` state — an
 * order that has been approved and is waiting to go into production is
 * `APPROVED` — so that column is fed by the approved set.
 */
export async function getFulfilmentQueue(): Promise<{
  received: Order[]
  processing: Order[]
  dispatched: Order[]
  delivered: Order[]
}> {
  const ds = getDataSource()

  const [received, processing, dispatched, delivered] = await Promise.all([
    ds.orders.list({ status: 'APPROVED', pageSize: 100 }),
    ds.orders.list({ status: 'PROCESSING', pageSize: 100 }),
    ds.orders.list({ status: 'DISPATCHED', pageSize: 100 }),
    ds.orders.list({ status: 'DELIVERED', pageSize: 100 }),
  ])

  return {
    received: received.items,
    processing: processing.items,
    dispatched: dispatched.items,
    delivered: delivered.items,
  }
}

/**
 * One-click re-order (SOW M-08).
 *
 * Resolves with a row per original line either way: when nothing could go back
 * in, the API refuses with 422 and puts the same rows in `details.lines`, which
 * a screen wants to show just as much as a partial success.
 */
export async function reorderOrder(orderId: string): Promise<{
  lines: import('@/services/data-source/api/governance.types').ApiReorderLine[]
}> {
  try {
    return await getDataSource().orders.reorder(orderId)
  } catch (error) {
    const { toApiError } = await import('@/services/api.service')
    const apiError = toApiError(error)
    const lines = apiError.details?.lines
    if (apiError.status === 422 && Array.isArray(lines)) {
      return {
        lines:
          lines as import('@/services/data-source/api/governance.types').ApiReorderLine[],
      }
    }
    throw error
  }
}
