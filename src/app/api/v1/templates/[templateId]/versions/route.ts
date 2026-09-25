import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  findTemplateById,
  listVersions,
  snapshotTemplate,
} from '@/server/templates/templates.service'
import { toVersionView } from '@/server/templates/template.types'
import { SnapshotTemplateSchema } from '@/server/templates/template.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { templateId: string }

/**
 * GET /api/v1/templates/:templateId/versions
 *
 * Every snapshot, newest first. Restoring one copies it back over the draft
 * without deleting anything in between — the point of a history is that it does
 * not lose the thing you restored from.
 */
export const GET = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ params, actor, requestId }) => {
    const [template, versions] = await Promise.all([
      findTemplateById(actor, params.templateId),
      listVersions(params.templateId, actor),
    ])

    return ok(
      versions.map((version) =>
        toVersionView(version, template.publishedVersionId)
      ),
      { requestId }
    )
  }
)

/**
 * POST /api/v1/templates/:templateId/versions
 *
 * Cuts a restore point from the current draft without publishing it. Reuses the
 * version number the draft is already on, so snapshotting twice at the same
 * version is a no-op rather than an error.
 */
export const POST = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, SnapshotTemplateSchema)
    const [versions, template] = await Promise.all([
      snapshotTemplate(params.templateId, body, actor),
      findTemplateById(actor, params.templateId),
    ])

    return ok(
      versions.map((version) =>
        toVersionView(version, template.publishedVersionId)
      ),
      { status: 201, requestId }
    )
  }
)
