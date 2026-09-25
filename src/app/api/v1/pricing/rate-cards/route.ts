import { Permission } from '@/server/auth/permissions'
import {
  createRateCard,
  listRateCards,
} from '@/server/pricing/rate-cards.service'
import { toRateCardView } from '@/server/pricing/rate-card.types'
import {
  CreateRateCardSchema,
  ListRateCardsQuerySchema,
} from '@/server/pricing/rate-card.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/pricing/rate-cards
 *
 * PRICING_VIEW, so a customer can see their own contracts. A customer is pinned
 * to their own account before the query is built; only an administrator gets
 * the cross-tenant list the pricing admin screen needs.
 */
export const GET = route(
  { permissions: [Permission.PRICING_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListRateCardsQuerySchema)
    const page = await listRateCards(actor, query)

    return ok(
      { ...page, items: page.items.map((card) => toRateCardView(card)) },
      { requestId }
    )
  }
)

/**
 * POST /api/v1/pricing/rate-cards
 *
 * Always lands in DRAFT. Activation is its own transition, and it is there that
 * the "one active card per account per period" rule is arbitrated.
 */
export const POST = route(
  { permissions: [Permission.PRICING_MANAGE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateRateCardSchema)
    const card = await createRateCard(body, actor)

    return ok(toRateCardView(card), { status: 201, requestId })
  }
)
