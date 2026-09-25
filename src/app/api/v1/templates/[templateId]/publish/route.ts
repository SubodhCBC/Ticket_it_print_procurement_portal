import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  presignTemplateAssets,
  publishTemplate,
} from '@/server/templates/templates.service'
import { toTemplateDetail } from '@/server/templates/template.types'
import { PublishTemplateSchema } from '@/server/templates/template.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { templateId: string }

/**
 * POST /api/v1/templates/:templateId/publish
 *
 * Freezes the current draft as a version and points the storefront at it.
 * Republishing is the same operation — it cuts a new version and moves the
 * pointer — which is why this is its own endpoint rather than a status change.
 */
export const POST = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, PublishTemplateSchema)
    const template = await publishTemplate(params.templateId, body, actor)

    return ok(
      toTemplateDetail(template, await presignTemplateAssets(template)),
      { status: 201, requestId }
    )
  }
)
