import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  attachTemplateAsset,
  presignTemplateAssets,
} from '@/server/templates/templates.service'
import { toTemplateDetail } from '@/server/templates/template.types'
import { AttachTemplateAssetSchema } from '@/server/templates/template.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { templateId: string }

/**
 * POST /api/v1/templates/:templateId/assets — attaches a library file.
 *
 * Names a file in the document library by `folderPath` and `fileName`; upload it
 * with `POST /api/v1/dam/files` first. The portal copies the bytes into object
 * storage and reads the filename, content type and size off the file itself, so
 * there is no key, size or type for a caller to get wrong.
 *
 * THUMBNAIL and PREVIEW replace the previous one rather than joining it — both
 * are singular by nature. The library file behind the replaced one is left
 * alone: it is the operator's own artwork, not a by-product.
 *
 * @error 404 NOT_FOUND No file of that name in that library folder.
 * @error 422 BUSINESS_RULE_VIOLATION The library gave no link to the file, or it is empty or above the 50MB copy limit.
 * @error 503 DEPENDENCY_UNAVAILABLE The library is switched off, or DAM_SERVICE_LOGIN and DAM_SERVICE_PASSWORD are not configured.
 */
export const POST = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, AttachTemplateAssetSchema)
    const template = await attachTemplateAsset(params.templateId, body, actor)

    return ok(
      toTemplateDetail(template, await presignTemplateAssets(template)),
      {
        status: 201,
        requestId,
      }
    )
  }
)
