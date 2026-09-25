import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  deactivateSite,
  findSiteById,
  updateSite,
} from '@/server/sites/sites.service'
import { toSiteView } from '@/server/sites/site.types'
import { UpdateSiteSchema } from '@/server/sites/site.validation'
import { noContent, ok } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { siteId: string }

function requestedAccount(request: Request): string | undefined {
  return new URL(request.url).searchParams.get('accountId') ?? undefined
}

/** GET /api/v1/sites/:siteId */
export const GET = route<Params>(
  { permissions: [Permission.APPLICATION_VIEW] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    return ok(toSiteView(await findSiteById(accountId, params.siteId)), {
      requestId,
    })
  }
)

/**
 * PATCH /api/v1/sites/:siteId
 *
 * `monthlyBudget` distinguishes omitted from explicitly null: the first leaves
 * the cap alone, the second removes it. Collapsing them would make an uncapped
 * branch unreachable.
 */
export const PATCH = route<Params>(
  { permissions: [Permission.SITE_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    const body = await parseJsonBody(request, UpdateSiteSchema)

    return ok(toSiteView(await updateSite(accountId, params.siteId, body)), {
      requestId,
    })
  }
)

/**
 * DELETE /api/v1/sites/:siteId
 *
 * Soft: historical orders and invoices reference the branch. Deactivating is
 * what stops new orders being placed against it.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.SITE_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    await deactivateSite(accountId, params.siteId)

    return noContent(requestId)
  }
)
