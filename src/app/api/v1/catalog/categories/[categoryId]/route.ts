import { Permission } from '@/server/auth/permissions'
import {
  deactivateCategory,
  findCategoryById,
  updateCategory,
} from '@/server/catalog/categories.service'
import { toCategoryView } from '@/server/catalog/category.types'
import { UpdateCategorySchema } from '@/server/catalog/category.validation'
import { route } from '@/server/middleware/auth.middleware'
import { noContent, ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { categoryId: string }

/**
 * GET /api/v1/catalog/categories/:categoryId
 *
 * A RESTRICTED category the caller's account is not on answers 404, the same as
 * one that does not exist (SOW AD-5).
 */
export const GET = route<Params>(
  { permissions: [Permission.CATALOG_VIEW] },
  async ({ params, actor, requestId }) => {
    return ok(
      toCategoryView(await findCategoryById(params.categoryId, actor)),
      { requestId }
    )
  }
)

/**
 * PATCH /api/v1/catalog/categories/:categoryId
 *
 * `code` cannot be changed: it appears in import files and saved URLs.
 */
export const PATCH = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, UpdateCategorySchema)
    const category = await updateCategory(
      params.categoryId,
      body,
      actor.accountId
    )

    return ok(toCategoryView(category), { requestId })
  }
)

/**
 * DELETE /api/v1/catalog/categories/:categoryId
 *
 * Deactivates rather than deletes, and is refused while products still point at
 * it — every catalogue query joins through the category, so orphaning them
 * would break the listing rather than tidy it.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ params, actor, requestId }) => {
    await deactivateCategory(params.categoryId, actor.accountId)
    return noContent(requestId)
  }
)
