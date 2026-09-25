import { Permission } from '@/server/auth/permissions'
import { removeLine, updateLine } from '@/server/cart/cart.service'
import { toCartView } from '@/server/cart/cart.types'
import { UpdateCartLineSchema } from '@/server/cart/cart.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { lineId: string }

/**
 * PATCH /api/v1/cart/lines/:lineId
 *
 * Editing the values of a line that already names a template goes through the
 * same rebuild the add did: the template is taken from the line when the request
 * is silent about it, so stripping `templateId` from the body cannot turn a
 * checked personalisation back into a free-form bag of values.
 */
export const PATCH = route<Params>(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, UpdateCartLineSchema)
    return ok(toCartView(await updateLine(actor, params.lineId, body)), {
      requestId,
    })
  }
)

/**
 * DELETE /api/v1/cart/lines/:lineId
 *
 * A line belonging to a colleague's basket answers 404, not 403 — the tenant
 * scope bounds the account, and the ownership check inside the tenant is what
 * this adds.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.ORDER_CREATE] },
  async ({ params, actor, requestId }) => {
    return ok(toCartView(await removeLine(actor, params.lineId)), { requestId })
  }
)
