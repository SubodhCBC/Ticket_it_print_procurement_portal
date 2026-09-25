import { getConfig } from '@/server/config'
import { publicRoute } from '@/server/middleware/auth.middleware'
import { buildOpenApiDocument } from '@/server/openapi/openapi.document'
import { NotFoundError } from '@/server/utils/errors'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

/**
 * GET /api/docs/openapi.json
 *
 * The OpenAPI 3.1 document Swagger UI reads. Also usable on its own — by a
 * client generator, Postman or Insomnia. Answers 404 when SWAGGER_ENABLED is
 * false, and always in production.
 */
export const GET = publicRoute(({ requestId }) => {
  if (!getConfig().docs.enabled) throw new NotFoundError('Page')

  return ok(buildOpenApiDocument(), { requestId })
})
