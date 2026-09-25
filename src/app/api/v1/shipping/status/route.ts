import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { getShippingStatus } from '@/server/shipping/shipping-status.service'
import { ShippingStatusQuerySchema } from '@/server/shipping/shipping.validation'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/shipping/status — NZ Post integration health and configuration.
 *
 * The mode (disabled, mock or live), which capabilities could make live calls
 * and which environment variables each still needs, and counts of labels by
 * status — FAILED is the list waiting on a replay. With `probe=true` it also
 * obtains an OAuth token, to prove the credentials work; the token itself is
 * never returned.
 */
export const GET = route(
  { permissions: [Permission.INTEGRATION_MANAGE] },
  async ({ request, requestId }) => {
    const query = parseQuery(request, ShippingStatusQuerySchema)
    return ok(await getShippingStatus(query.probe), { requestId })
  }
)
