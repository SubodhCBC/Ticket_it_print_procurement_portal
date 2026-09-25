import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { fetchValidatedAddresses } from '@/server/shipping/checkout-shipping.service'
import { addSiteAddress } from '@/server/sites/sites.service'
import { toSiteView } from '@/server/sites/site.types'
import { AddSiteAddressSchema } from '@/server/sites/site.validation'
import { ok } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { siteId: string }

/**
 * POST /api/v1/sites/:siteId/addresses
 *
 * Exactly one default per branch and kind: setting a new default clears the old
 * one first, so the pair can never both be default and leave the checkout
 * picker's pre-selection non-deterministic.
 *
 * Send `nzPostAddressId` from `GET /api/v1/shipping/addresses` to validate it
 * through NZ Post as it is saved: the address is stored with NZ Post's lines,
 * DPID and rural flag (SOW F-16).
 *
 * @error 404 NOT_FOUND NZ Post does not recognise `nzPostAddressId`.
 * @error 503 DEPENDENCY_UNAVAILABLE `nzPostAddressId` was sent while NZ Post is switched off or unreachable.
 */
export const POST = route<Params>(
  { permissions: [Permission.SITE_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(
      actor,
      new URL(request.url).searchParams.get('accountId') ?? undefined
    )
    const body = await parseJsonBody(request, AddSiteAddressSchema)
    const verified = await fetchValidatedAddresses([body.nzPostAddressId])

    return ok(
      toSiteView(
        await addSiteAddress(accountId, params.siteId, body, verified)
      ),
      {
        status: 201,
        requestId,
      }
    )
  }
)
