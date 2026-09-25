import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { listOrders, placeOrder } from '@/server/orders/orders.service'
import { toOrderView } from '@/server/orders/order.types'
import {
  ListOrdersQuerySchema,
  PlaceOrderSchema,
} from '@/server/orders/order.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/orders
 *
 * Turns a validated basket into an order. The basket is re-validated here rather
 * than trusted from an earlier call: a product can be unpublished, a rate card
 * can expire and a budget can be consumed by a colleague between the review step
 * and the submit, and the check that matters is the last one.
 *
 * Everything commits together — the order number, the lines, the stock
 * reservation, the approval request and the basket closing.
 *
 * Safe to repeat. Send `cartId` (the `cart.id` the buyer reviewed): if that
 * basket has already become an order — an earlier submit that succeeded, or one
 * racing this one — that order is returned with 200 and nothing new is written.
 * A 201 is a new order.
 *
 * @error 409 CONFLICT The buyer's open basket is no longer the `cartId` sent — review it again.
 * @error 422 BUSINESS_RULE_VIOLATION The basket is not ready (`details.issues`), or delivery instructions are required (`DELIVERY_NOTES_REQUIRED`).
 * @error 503 TRANSACTION_ABORTED The placement ran out of time and was rolled back; nothing was saved. Retry, ideally with `cartId`.
 */
export const POST = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, PlaceOrderSchema)
    const { order, replayed } = await placeOrder(actor, body)

    if (replayed) return ok(toOrderView(order), { requestId })
    return ok(toOrderView(order), { status: 201, requestId })
  }
)

/**
 * GET /api/v1/orders
 *
 * Scoped by the widest order permission the caller holds: ORDER_VIEW_ACCOUNT
 * sees the whole tenant, ORDER_VIEW_SITE their branches, ORDER_VIEW_OWN only
 * what they placed. An actor with none sees nothing — the filter fails closed.
 */
export const GET = route(
  { permissions: [Permission.ORDER_VIEW_OWN] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListOrdersQuerySchema)
    const page = await listOrders(actor, query)

    return ok({ ...page, items: page.items.map(toOrderView) }, { requestId })
  }
)
