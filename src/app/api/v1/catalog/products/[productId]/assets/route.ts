import { Permission } from '@/server/auth/permissions'
import { attachAsset, presignAssets } from '@/server/catalog/products.service'
import { toProductView } from '@/server/catalog/product.types'
import { AttachAssetSchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { productId: string }

/**
 * POST /api/v1/catalog/products/:productId/assets — attaches a library file.
 *
 * Names a file in the document library by `folderPath` and `fileName`; upload it
 * with `POST /api/v1/dam/files` first. The portal copies the bytes into object
 * storage and reads the filename, content type and size off the file itself, so
 * there is no key, size or type for a caller to get wrong.
 *
 * An IMAGE is recorded as PENDING a resize; until the worker writes the
 * derivatives, reads serve the original in place of a thumbnail.
 *
 * @error 404 NOT_FOUND No file of that name in that library folder.
 * @error 422 BUSINESS_RULE_VIOLATION The library gave no link to the file, or it is empty or above the 50MB copy limit.
 * @error 503 DEPENDENCY_UNAVAILABLE The library is switched off, or DAM_SERVICE_LOGIN and DAM_SERVICE_PASSWORD are not configured.
 */
export const POST = route<Params>(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, AttachAssetSchema)
    const product = await attachAsset(params.productId, body, actor)

    return ok(toProductView(product, await presignAssets(product, actor)), {
      status: 201,
      requestId,
    })
  }
)
