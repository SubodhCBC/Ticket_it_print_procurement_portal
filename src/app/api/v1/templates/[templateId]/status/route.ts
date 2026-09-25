import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  changeTemplateStatus,
  presignTemplateAssets,
} from '@/server/templates/templates.service'
import { toTemplateDetail } from '@/server/templates/template.types'
import { ChangeTemplateStatusSchema } from '@/server/templates/template.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { templateId: string }

/**
 * POST /api/v1/templates/:templateId/status
 *
 * DRAFT, PUBLISHED and ARCHIVED. Publishing is deliberately *not* reachable
 * here — it has to cut a version, and a status change that silently did that
 * would hide the one act with a lasting consequence behind the one without.
 */
export const POST = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, ChangeTemplateStatusSchema)
    const template = await changeTemplateStatus(params.templateId, body, actor)

    return ok(
      toTemplateDetail(template, await presignTemplateAssets(template)),
      { status: 201, requestId }
    )
  }
)
