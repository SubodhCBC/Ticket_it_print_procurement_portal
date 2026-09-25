import { Permission } from '@/server/auth/permissions'
import { matchImageFilenames } from '@/server/catalog/products.service'
import { MatchImageFilenamesSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/catalog/products/image-matches
 *
 * Says which product each image file name is for, by SKU, before a bulk image
 * upload. Nothing is written. The name is tried whole, then with up to three
 * trailing segments cut off (`BC-001_2.jpg`, `BC-001-back.png`), and the longest
 * SKU that exists wins. A `sku` sent with a file overrides its name.
 *
 * Returns one entry per file, in the order sent, with `product: null` for a
 * file that matched nothing. Upload each matched file with
 * `POST /api/v1/dam/files` and attach it with
 * `POST /api/v1/catalog/products/:productId/assets`, using `nextImageSortOrder`.
 */
export const POST = route(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, requestId }) => {
    const body = await parseJsonBody(request, MatchImageFilenamesSchema)
    const matches = await matchImageFilenames(body)

    return ok({ matches }, { requestId })
  }
)
