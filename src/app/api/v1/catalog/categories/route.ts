import { Permission } from '@/server/auth/permissions'
import {
  createCategory,
  listCategories,
} from '@/server/catalog/categories.service'
import { toCategoryView } from '@/server/catalog/category.types'
import {
  CreateCategorySchema,
  ListCategoriesQuerySchema,
} from '@/server/catalog/category.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/catalog/categories
 *
 * Unpaginated — there are eight of these, and the navigation renders them all.
 * Readable by anyone who can see the catalogue: the category filter is the
 * first thing the shop draws.
 *
 * The answer depends on who asks: a RESTRICTED category is listed only to the
 * accounts on its allow-list (SOW AD-5). `visibility` filters the list for
 * administrators and is ignored for everyone else.
 */
export const GET = route(
  { permissions: [Permission.CATALOG_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListCategoriesQuerySchema)
    const categories = await listCategories(actor, query)

    return ok(categories.map(toCategoryView), { requestId })
  }
)

/**
 * POST /api/v1/catalog/categories
 *
 * CATALOG_MANAGE, which only ADMIN holds: the taxonomy is the platform
 * operator's, not a customer's.
 */
export const POST = route(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateCategorySchema)
    const category = await createCategory(body, actor.accountId)

    return ok(toCategoryView(category), { status: 201, requestId })
  }
)
