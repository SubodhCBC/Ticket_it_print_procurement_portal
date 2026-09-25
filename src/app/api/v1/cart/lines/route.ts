import { Permission } from '@/server/auth/permissions'
import { addLine } from '@/server/cart/cart.service'
import { toCartView } from '@/server/cart/cart.types'
import {
  AddCartLineSchema,
  CartQuerySchema,
} from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/cart/lines
 *
 * Merges into an existing line only when both are for the same product and
 * variant **and** neither carries customisation. Two personalised runs of the
 * same business card are two different things to print, and adding their
 * quantities together would silently destroy one.
 *
 * A line naming a template has its values rebuilt from that template's editable
 * layers, against the version currently published — so a value aimed at a
 * locked layer cannot survive, and a stale version is sent back rather than
 * pinned to artwork nobody can see any more.
 */
export const POST = route(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, CartQuerySchema)
    const body = await parseJsonBody(request, AddCartLineSchema)

    return ok(toCartView(await addLine(actor, body, query.siteId)), {
      status: 201,
      requestId,
    })
  }
)
