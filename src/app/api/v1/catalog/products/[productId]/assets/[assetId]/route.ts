import { Permission } from '@/server/auth/permissions'
import { removeAsset } from '@/server/catalog/products.service'
import { route } from '@/server/middleware/auth.middleware'
import { noContent } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { productId: string; assetId: string }

/**
 * DELETE /api/v1/catalog/products/:productId/assets/:assetId
 *
 * Removes the row first and the objects after. A failed object delete leaves an
 * orphan for a sweeper to collect, which is strictly better than a row pointing
 * at a file that no longer exists.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ params, actor, requestId }) => {
    await removeAsset(params.productId, params.assetId, actor)
    return noContent(requestId)
  }
)
