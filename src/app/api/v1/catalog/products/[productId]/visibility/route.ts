import { Permission } from '@/server/auth/permissions'
import {
  findProductVisibility,
  setProductVisibility,
} from '@/server/catalog/products.service'
import { toProductView } from '@/server/catalog/product.types'
import { SetVisibilitySchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { productId: string }

/**
 * GET /api/v1/catalog/products/:productId/visibility
 *
 * The accounts a restricted product is open to, which `PUT` replaces wholesale
 * and nothing else returns. Without it the panel that edits the allow-list had
 * nothing to pre-fill from, so every save replaced the list with whatever was
 * on screen.
 *
 * CATALOG_MANAGE rather than CATALOG_VIEW: this says which customers may buy a
 * product, which is commercial information about other tenants and not part of
 * browsing the catalogue.
 *
 * @permission CATALOG_MANAGE Always. Without it the answer is 403.
 * @error 404 NOT_FOUND No such product.
 */
export const GET = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ params, requestId }) =>
    ok(await findProductVisibility(params.productId), { requestId })
)

/**
 * PUT /api/v1/catalog/products/:productId/visibility
 *
 * Switching back to ALL_ACCOUNTS deliberately leaves the granted-account rows
 * in place: a restriction lifted for a campaign is usually reinstated, and
 * re-entering fifty account ids by hand is how it gets reinstated wrongly.
 */
export const PUT = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, SetVisibilitySchema)
    const product = await setProductVisibility(params.productId, body, actor)

    return ok(toProductView(product), { requestId })
  }
)
