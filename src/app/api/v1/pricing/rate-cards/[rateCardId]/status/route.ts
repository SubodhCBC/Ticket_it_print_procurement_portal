import { Permission } from '@/server/auth/permissions'
import { changeRateCardStatus } from '@/server/pricing/rate-cards.service'
import { toRateCardView } from '@/server/pricing/rate-card.types'
import { ChangeRateCardStatusSchema } from '@/server/pricing/rate-card.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { rateCardId: string }

/**
 * POST /api/v1/pricing/rate-cards/:rateCardId/status
 *
 * DRAFT → ACTIVE → ARCHIVED, and DRAFT → ARCHIVED for a card that was never
 * signed. Activating is the interesting one: a database EXCLUDE constraint
 * refuses a second card whose window overlaps an already-active one for the
 * same account, and that rejection comes back as a 409 explaining it rather
 * than as a 500.
 */
export const POST = route<Params>(
  { permissions: [Permission.PRICING_MANAGE] },
  async ({ request, params, requestId }) => {
    const body = await parseJsonBody(request, ChangeRateCardStatusSchema)
    const card = await changeRateCardStatus(params.rateCardId, body)

    return ok(toRateCardView(card), { status: 201, requestId })
  }
)
