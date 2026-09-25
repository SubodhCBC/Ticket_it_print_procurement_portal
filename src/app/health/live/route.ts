import { liveness } from '@/server/health/health.service'
import { publicRoute } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /health/live — liveness probe.
 *
 * Touches nothing. Failing it means the process is wedged and should be
 * restarted; a database outage must never reach this handler, which is why the
 * readiness probe is a separate path.
 *
 * Unauthenticated and unversioned, like every probe here: an orchestrator has no
 * bearer token, a 401 reads to it as "unhealthy", and a health check should not
 * need updating when the API moves from v1 to v2.
 */
export const GET = publicRoute(async ({ requestId }) =>
  ok(liveness(), { requestId })
)
