import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  createTemplate,
  listTemplates,
  presignTemplateThumbnails,
} from '@/server/templates/templates.service'
import { toTemplateSummary } from '@/server/templates/template.types'
import {
  CreateTemplateSchema,
  ListTemplatesQuerySchema,
} from '@/server/templates/template.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/templates
 *
 * The gallery. TEMPLATE_USE, which every customer role holds — browsing the
 * library is the point of it. An administrator additionally sees drafts;
 * everyone else sees published templates that are unrestricted or granted to
 * their account.
 */
export const GET = route(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListTemplatesQuerySchema)
    const page = await listTemplates(actor, query)
    const thumbnails = query.withThumbnails
      ? await presignTemplateThumbnails(page.items)
      : {}

    return ok(
      {
        ...page,
        items: page.items.map((template) =>
          toTemplateSummary(template, thumbnails[template.id])
        ),
      },
      { requestId }
    )
  }
)

/** POST /api/v1/templates — a new draft. */
export const POST = route(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateTemplateSchema)
    const template = await createTemplate(body, actor)

    return ok(toTemplateSummary(template), { status: 201, requestId })
  }
)
