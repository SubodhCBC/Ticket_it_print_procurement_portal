import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { getAddressDetails } from '@/server/shipping/checkout-shipping.service'
import { validateSiteAddress } from '@/server/sites/sites.service'
import { toSiteView } from '@/server/sites/site.types'
import { ValidateSiteAddressSchema } from '@/server/sites/site.validation'
import { ok } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { siteId: string; addressId: string }

/**
 * POST /api/v1/sites/:siteId/addresses/:addressId/nzpost
 *
 * Validates a saved branch address through NZ Post ParcelAddress (SOW F-16),
 * for an address entered before validation or without it. Send the id of the
 * matching result from `GET /api/v1/shipping/addresses`; the address takes NZ
 * Post's lines (a typed second line is kept), its DPID and its rural flag, and
 * checkout defaults to it with those from then on.
 *
 * @error 404 NOT_FOUND No such saved address on this branch, or NZ Post does not recognise `nzPostAddressId`.
 * @error 503 DEPENDENCY_UNAVAILABLE NZ Post is switched off or unreachable.
 */
export const POST = route<Params>(
  { permissions: [Permission.SITE_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(
      actor,
      new URL(request.url).searchParams.get('accountId') ?? undefined
    )
    const body = await parseJsonBody(request, ValidateSiteAddressSchema)
    const verified = await getAddressDetails(body.nzPostAddressId)

    return ok(
      toSiteView(
        await validateSiteAddress(
          accountId,
          params.siteId,
          params.addressId,
          verified
        )
      ),
      { requestId }
    )
  }
)
