import { Permission } from '@/server/auth/permissions'
import { myActiveCard } from '@/server/pricing/pricing.service'
import { toActiveRateCardView } from '@/server/pricing/rate-card.types'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

/**
 * GET /api/v1/pricing/active-rate-card
 *
 * The rate card pricing this account right now. Null when there is no contract
 * in force, which is the ordinary case rather than an error. Administrators may
 * pass `accountId` to ask on behalf of a customer.
 */
export const GET = route(
  { permissions: [Permission.PRICING_VIEW] },
  async ({ request, actor, requestId }) => {
    const accountId =
      new URL(request.url).searchParams.get('accountId') ?? undefined
    const card = await myActiveCard(actor, accountId)

    return ok(toActiveRateCardView(card), { requestId })
  }
)
