import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { fetchValidatedAddresses } from '@/server/shipping/checkout-shipping.service'
import { createSite, listSites } from '@/server/sites/sites.service'
import { toSiteView } from '@/server/sites/site.types'
import {
  CreateSiteSchema,
  ListSitesQuerySchema,
} from '@/server/sites/site.validation'
import { ok } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/sites
 *
 * Cursor-paginated: a branch list is scrolled, and offset pagination on a
 * growing table skips or repeats rows when data shifts between pages.
 *
 * APPLICATION_VIEW, not SITE_MANAGE — every signed-in user needs to know which
 * branches exist to pick a delivery address. Editing them is the stricter
 * permission below.
 */
export const GET = route(
  { permissions: [Permission.APPLICATION_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListSitesQuerySchema)
    const page = await listSites(
      resolveAccountId(actor, query.accountId),
      query
    )

    return ok({ ...page, items: page.items.map(toSiteView) }, { requestId })
  }
)

/** POST /api/v1/sites — a branch, with at least one address. */
export const POST = route(
  { permissions: [Permission.SITE_MANAGE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateSiteSchema)
    const accountId = resolveAccountId(actor, body.accountId)
    // Addresses sent with an NZ Post id are validated before the site is made.
    const verified = await fetchValidatedAddresses(
      body.addresses.map((address) => address.nzPostAddressId)
    )
    const site = await createSite(accountId, body, verified)

    return ok(toSiteView(site), { status: 201, requestId })
  }
)
