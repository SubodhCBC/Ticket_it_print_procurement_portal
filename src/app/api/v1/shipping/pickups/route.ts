import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { bookPickup, listPickups } from '@/server/shipping/pickups.service'
import {
  BookPickupSchema,
  ListPickupsQuerySchema,
} from '@/server/shipping/shipping.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/shipping/pickups — courier pickups booked, and parcels still waiting for one.
 *
 * `bookings` is a page of past and upcoming pickups. `awaitingPickup` is every
 * labelled parcel not yet on a booking — what `POST` books when it is given no
 * shipment ids.
 */
export const GET = route(
  { permissions: [Permission.ORDER_MANAGE] },
  async ({ request, requestId }) => {
    const query = parseQuery(request, ListPickupsQuerySchema)
    return ok(await listPickups(query), { requestId })
  }
)

/**
 * POST /api/v1/shipping/pickups — book an NZ Post courier pickup at the warehouse.
 *
 * Books the named labelled shipments, or every one waiting when none are named,
 * at the configured ship-from address. Not retried automatically: a courier
 * booked twice turns up twice. A booking NZ Post rejects is recorded as
 * REJECTED with its reject code, and its parcels stay waiting.
 *
 * Resending with the same `idempotencyKey` answers 200 with the earlier booking
 * and does not call NZ Post.
 *
 * @error 422 BUSINESS_RULE_VIOLATION Nothing is waiting, or a named shipment is not labelled, is voided or is already booked (`details.notBookable`).
 * @error 503 DEPENDENCY_UNAVAILABLE Shipping is switched off, live pickups are not configured, or NZ Post could not be reached.
 */
export const POST = route(
  { permissions: [Permission.ORDER_MANAGE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, BookPickupSchema)
    const { booking, created } = await bookPickup(actor, body)

    if (!created) return ok(booking, { requestId })
    return ok(booking, { status: 201, requestId })
  }
)
