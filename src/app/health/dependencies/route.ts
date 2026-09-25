import { dependencies } from '@/server/health/health.service'
import { publicRoute } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /health/dependencies — every dependency, including the non-critical ones.
 *
 * Includes the legacy database, whose outage degrades first-time logins but does
 * not make the service unready. Answers 503 if any of them is down, so it can be
 * pointed at by an uptime monitor without being wired to the load balancer.
 */
export const GET = publicRoute(async ({ requestId }) => {
  const report = await dependencies()

  return ok(report, {
    status: report.status === 'ok' ? 200 : 503,
    requestId,
  })
})
