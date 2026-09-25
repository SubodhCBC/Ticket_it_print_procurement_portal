import { Permission } from '@/server/auth/permissions'
import {
  findRateCardSummary,
  listRateCardItems,
  setRateCardItems,
} from '@/server/pricing/rate-cards.service'
import {
  toRateCardItemView,
  toRateCardView,
} from '@/server/pricing/rate-card.types'
import {
  ListRateCardItemsQuerySchema,
  SetRateCardItemsSchema,
} from '@/server/pricing/rate-card.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { rateCardId: string }

/**
 * GET /api/v1/pricing/rate-cards/:rateCardId/items
 *
 * A negotiated price list runs to hundreds of lines, so the detail screen pages
 * through them here rather than pulling all of them on every card read.
 * `effectivePrice` is the unit price at the product's minimum order quantity,
 * and `source` says which rule produced it.
 */
export const GET = route<Params>(
  { permissions: [Permission.PRICING_VIEW] },
  async ({ request, params, actor, requestId }) => {
    const query = parseQuery(request, ListRateCardItemsQuerySchema)

    // findRateCardSummary, not findRateCardById: the latter includes every item
    // on the card, which would load the whole price list on each page of a paged
    // read.
    const card = await findRateCardSummary(actor, params.rateCardId)
    const page = await listRateCardItems(actor, params.rateCardId, query)

    return ok(
      {
        ...page,
        items: page.items.map((item) => toRateCardItemView(item, card)),
      },
      { requestId }
    )
  }
)

/**
 * POST /api/v1/pricing/rate-cards/:rateCardId/items
 *
 * Bulk editor: upserts the named products and, with `replaceAll`, removes
 * everything else. The whole payload is one transaction — half a price list is
 * worse than none, because the half that landed would start pricing orders
 * immediately.
 */
export const POST = route<Params>(
  { permissions: [Permission.PRICING_MANAGE] },
  async ({ request, params, requestId }) => {
    const body = await parseJsonBody(request, SetRateCardItemsSchema)
    const card = await setRateCardItems(params.rateCardId, body)

    return ok(toRateCardView(card), { status: 201, requestId })
  }
)
