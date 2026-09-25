import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  presignTemplateAssets,
  restoreVersion,
} from '@/server/templates/templates.service'
import { toTemplateDetail } from '@/server/templates/template.types'
import { RestoreVersionSchema } from '@/server/templates/template.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { templateId: string }

/**
 * POST /api/v1/templates/:templateId/versions/restore
 *
 * Copies an old version back over the draft. The restore is itself a save, so
 * it bumps `version` and can be undone by restoring the version it replaced.
 */
export const POST = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, RestoreVersionSchema)
    const template = await restoreVersion(params.templateId, body, actor)

    return ok(
      toTemplateDetail(template, await presignTemplateAssets(template)),
      { status: 201, requestId }
    )
  }
)
