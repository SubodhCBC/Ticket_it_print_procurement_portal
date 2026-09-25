import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  customiseTemplate,
  getCustomisable,
  presignShowcase,
} from '@/server/templates/templates.service'
import { toCustomisableView } from '@/server/templates/template.types'
import { CustomiseTemplateSchema } from '@/server/templates/template.validation'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { templateId: string }

/**
 * GET /api/v1/templates/:templateId/customise
 *
 * What the buyer personalises: the **published snapshot**, not the draft. A
 * template whose draft has moved on since publication still hands the buyer the
 * artwork that was published.
 *
 * A template that does not exist and one not published to this account answer
 * identically, so the library cannot be enumerated by watching which ids differ.
 */
export const GET = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ params, actor, requestId }) => {
    const { template, version } = await getCustomisable(
      actor,
      params.templateId
    )
    return ok(
      toCustomisableView(template, version, await presignShowcase(template)),
      {
        requestId,
      }
    )
  }
)

/**
 * POST /api/v1/templates/:templateId/customise
 *
 * Checks a personalisation before it goes in the basket, and returns the
 * accepted set together with the version it was checked against — which is what
 * a cart line stores, so the basket records the artwork the buyer actually saw.
 *
 * A value aimed at a layer the designer locked is **refused**, not dropped:
 * silently discarding it is a buyer who thinks they set their phone number and
 * receives five hundred flyers without it. Unknown keys are refused for the
 * same reason.
 */
export const POST = route<Params>(
  { permissions: [Permission.TEMPLATE_USE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, CustomiseTemplateSchema)
    return ok(await customiseTemplate(actor, params.templateId, body), {
      requestId,
    })
  }
)
