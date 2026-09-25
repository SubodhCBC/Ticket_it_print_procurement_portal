import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  presignTemplateAssets,
  setTemplateVisibility,
} from '@/server/templates/templates.service'
import { toTemplateDetail } from '@/server/templates/template.types'
import { SetTemplateVisibilitySchema } from '@/server/templates/template.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { templateId: string }

/**
 * POST /api/v1/templates/:templateId/visibility
 *
 * The granted-account list is replaced wholesale rather than diffed: it is
 * short, the operation is rare, and a diff is a place for a stale grant to
 * survive.
 */
export const POST = route<Params>(
  { permissions: [Permission.TEMPLATE_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, SetTemplateVisibilitySchema)
    const template = await setTemplateVisibility(params.templateId, body, actor)

    return ok(
      toTemplateDetail(template, await presignTemplateAssets(template)),
      { status: 201, requestId }
    )
  }
)
