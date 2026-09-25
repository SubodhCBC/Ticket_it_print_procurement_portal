import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { listShipments } from '@/server/shipping/shipments.service'
import { ListShipmentsQuerySchema } from '@/server/shipping/shipping.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/shipping/shipments — the fulfilment queue of NZ Post labels.
 *
 * Across every account for an administrator, newest first, with the order
 * number, branch and account alongside each. Filter to `status=FAILED` for the
 * labels waiting on a retry, `awaitingPickup=true` for parcels not yet on a
 * pickup, or `flagged=true` for labels the daily check found unscanned.
 */
export const GET = route(
  { permissions: [Permission.ORDER_MANAGE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListShipmentsQuerySchema)
    return ok(await listShipments(actor, query), { requestId })
  }
)
