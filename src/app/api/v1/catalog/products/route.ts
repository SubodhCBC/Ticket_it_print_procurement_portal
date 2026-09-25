import { Permission } from '@/server/auth/permissions'
import {
  createProduct,
  listProducts,
  presignThumbnails,
} from '@/server/catalog/products.service'
import { toProductView } from '@/server/catalog/product.types'
import {
  CreateProductSchema,
  ListProductsQuerySchema,
} from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/catalog/products
 *
 * Scoped to what the caller may see: an administrator gets the whole catalogue
 * including drafts, everyone else gets published products that are unrestricted
 * or granted to their account.
 *
 * Asset URLs are omitted unless `withThumbnails` is set, which presigns one
 * thumbnail per row; fetch a single product for links to every asset.
 */
export const GET = route(
  { permissions: [Permission.CATALOG_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListProductsQuerySchema)
    const page = await listProducts(actor, query)
    const assetUrls = query.withThumbnails
      ? await presignThumbnails(page.items)
      : {}

    return ok(
      {
        ...page,
        items: page.items.map((product) => toProductView(product, assetUrls)),
      },
      { requestId }
    )
  }
)

/**
 * POST /api/v1/catalog/products
 *
 * Always lands in DRAFT — publishing is its own audited transition.
 */
export const POST = route(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateProductSchema)
    const product = await createProduct(body, actor)

    return ok(toProductView(product), { status: 201, requestId })
  }
)
