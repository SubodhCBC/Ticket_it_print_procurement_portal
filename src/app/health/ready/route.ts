import { readiness } from '@/server/health/health.service'
import { publicRoute } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /health/ready — readiness probe.
 *
 * 503 when anything it checks is down, which tells the load balancer to stop
 * sending traffic. It deliberately does not say "restart me": the database may
 * simply be failing over, and restarting every replica over a ten-second
 * failover turns a blip into an outage.
 *
 * The legacy database is absent on purpose — it is not required to serve
 * traffic. See `/health/dependencies` for its status.
 */
export const GET = publicRoute(async ({ requestId }) => {
  const report = await readiness()

  return ok(report, {
    status: report.status === 'ok' ? 200 : 503,
    requestId,
  })
})
