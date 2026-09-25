import { Permission } from '@/server/auth/permissions'
import {
  findCategoryVisibility,
  setCategoryVisibility,
} from '@/server/catalog/categories.service'
import { toCategoryView } from '@/server/catalog/category.types'
import { SetCategoryVisibilitySchema } from '@/server/catalog/category.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { categoryId: string }

/**
 * GET /api/v1/catalog/categories/:categoryId/visibility
 *
 * The accounts a restricted category is open to (SOW AD-5), which `PUT`
 * replaces wholesale and nothing else returns — the panel that edits the list
 * pre-fills from this.
 *
 * CATALOG_MANAGE rather than CATALOG_VIEW: it says which customers hold a
 * contract category, which is commercial information about other tenants.
 *
 * @permission CATALOG_MANAGE Always. Without it the answer is 403.
 * @error 404 NOT_FOUND No such category.
 */
export const GET = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ params, requestId }) =>
    ok(await findCategoryVisibility(params.categoryId), { requestId })
)

/**
 * PUT /api/v1/catalog/categories/:categoryId/visibility
 *
 * RESTRICTED hides the category, and every product in it, from any account not
 * in `accountIds` — on top of each product's own visibility, which still
 * applies. ALL_ACCOUNTS lifts it and keeps the saved list for next time.
 *
 * @permission CATALOG_MANAGE Always. Without it the answer is 403.
 * @error 400 VALIDATION_FAILED RESTRICTED with no accounts, or more than 500.
 * @error 404 NOT_FOUND No such category.
 * @error 422 BUSINESS_RULE_VIOLATION One of the accounts does not exist.
 */
export const PUT = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, SetCategoryVisibilitySchema)
    const category = await setCategoryVisibility(params.categoryId, body, actor)

    return ok(toCategoryView(category), { requestId })
  }
)
