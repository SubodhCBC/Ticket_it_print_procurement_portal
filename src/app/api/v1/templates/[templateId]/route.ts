import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  findTemplateById,
  presignTemplateAssets,
  removeTemplate,
  updateTemplate,
} from '@/server/templates/templates.service'
import { toTemplateDetail } from '@/server/templates/template.types'
import { UpdateTemplateSchema } from '@/server/templates/template.validation'
import { noContent, ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { templateId: string }

/**
 * GET /api/v1/templates/:templateId
 *
 * What the builder opens: the draft, its design document, its assets and its
 * version history.
 *
 * This is **not** what a buyer personalises — see `/customise`, which returns
 * the published snapshot instead. A designer mid-rework must not change the
 * artwork somebody is halfway through ordering.
 */
export const GET = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ params, actor, requestId }) => {
    const template = await findTemplateById(actor, params.templateId)
    return ok(
      toTemplateDetail(template, await presignTemplateAssets(template)),
      { requestId }
    )
  }
)

/**
 * PATCH /api/v1/templates/:templateId
 *
 * A save from the builder, autosave included. Send `expectedVersion` and a
 * concurrent save by another designer comes back as 409 rather than silently
 * overwriting them.
 */
export const PATCH = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, UpdateTemplateSchema)
    const template = await updateTemplate(params.templateId, body, actor)

    return ok(
      toTemplateDetail(template, await presignTemplateAssets(template)),
      { requestId }
    )
  }
)

/** DELETE /api/v1/templates/:templateId — soft; published versions survive. */
export const DELETE = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ params, actor, requestId }) => {
    await removeTemplate(params.templateId, actor)
    return noContent(requestId)
  }
)
