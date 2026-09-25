import { Permission } from '@/server/auth/permissions'
import { removeRateCardItem } from '@/server/pricing/rate-cards.service'
import { route } from '@/server/middleware/auth.middleware'
import { noContent } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { rateCardId: string; productId: string }

/**
 * DELETE /api/v1/pricing/rate-cards/:rateCardId/items/:productId
 *
 * Removes one negotiated line, so the product falls back to the card's default
 * discount — or to the catalogue price when the card sets none.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.PRICING_MANAGE] },
  async ({ params, requestId }) => {
    await removeRateCardItem(params.rateCardId, params.productId)
    return noContent(requestId)
  }
)
