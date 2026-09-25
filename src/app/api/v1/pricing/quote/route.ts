import { Permission } from '@/server/auth/permissions'
import { quote } from '@/server/pricing/pricing.service'
import { toQuotedLineView } from '@/server/pricing/rate-card.types'
import { QuoteSchema } from '@/server/pricing/rate-card.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/pricing/quote
 *
 * Prices a batch of lines for this account. Batched because a product grid
 * needs every tile priced at once. Each line comes back with the contract
 * price, the catalogue price it is measured against, the rule that produced it
 * (`source`) and the ladder as this account sees it. Products the caller may
 * not see are omitted rather than raising, so one unpublished SKU cannot blank
 * a page.
 *
 * `at` and `accountId` are administrator-only and enforced in the service: a
 * customer is always quoted against their own account, as of now.
 *
 * A quote writes nothing. POST because the request carries a list of lines that
 * would not survive a query string, and 200 rather than 201 because nothing was
 * created.
 */
export const POST = route(
  { permissions: [Permission.PRICING_VIEW] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, QuoteSchema)
    const lines = await quote(actor, body)

    return ok({ lines: lines.map(toQuotedLineView) }, { requestId })
  }
)
