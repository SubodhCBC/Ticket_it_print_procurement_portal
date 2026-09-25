import { Permission } from '@/server/auth/permissions'
import {
  findRateCardById,
  removeRateCard,
  updateRateCard,
} from '@/server/pricing/rate-cards.service'
import { toRateCardView } from '@/server/pricing/rate-card.types'
import { UpdateRateCardSchema } from '@/server/pricing/rate-card.validation'
import { route } from '@/server/middleware/auth.middleware'
import { noContent, ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { rateCardId: string }

/**
 * GET /api/v1/pricing/rate-cards/:rateCardId
 *
 * A card belonging to another account is reported as missing rather than
 * forbidden: confirming that a contract exists for another company is itself a
 * disclosure.
 */
export const GET = route<Params>(
  { permissions: [Permission.PRICING_VIEW] },
  async ({ params, actor, requestId }) => {
    return ok(
      toRateCardView(await findRateCardById(actor, params.rateCardId)),
      { requestId }
    )
  }
)

/**
 * PATCH /api/v1/pricing/rate-cards/:rateCardId
 *
 * ACTIVE cards are editable on purpose — a price correction on a live contract
 * is an ordinary thing to need. ARCHIVED ones are not.
 */
export const PATCH = route<Params>(
  { permissions: [Permission.PRICING_MANAGE] },
  async ({ request, params, requestId }) => {
    const body = await parseJsonBody(request, UpdateRateCardSchema)
    return ok(toRateCardView(await updateRateCard(params.rateCardId, body)), {
      requestId,
    })
  }
)

/**
 * DELETE /api/v1/pricing/rate-cards/:rateCardId
 *
 * Soft: orders priced under this card reference it. Archiving on the way out
 * also releases its slot in the overlap constraint, so a deleted card does not
 * keep blocking its successor.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.PRICING_MANAGE] },
  async ({ params, requestId }) => {
    await removeRateCard(params.rateCardId)
    return noContent(requestId)
  }
)
