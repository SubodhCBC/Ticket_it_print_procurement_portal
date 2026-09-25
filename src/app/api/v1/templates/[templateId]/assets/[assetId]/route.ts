import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { removeTemplateAsset } from '@/server/templates/templates.service'
import { noContent } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { templateId: string; assetId: string }

/**
 * DELETE /api/v1/templates/:templateId/assets/:assetId
 *
 * Detaches the asset. The stored object is deliberately left behind: a
 * published version's design may still reference it, and storage is cheap next
 * to a template that renders with a hole in it.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ params, actor, requestId }) => {
    await removeTemplateAsset(params.templateId, params.assetId, actor)
    return noContent(requestId)
  }
)
