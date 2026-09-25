import { summary } from '@/server/health/health.service'
import { publicRoute } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /health — service summary.
 *
 * For a human asking "what is actually deployed here": the release, the
 * environment and how long this instance has been up. Not a probe; it checks
 * nothing and always answers 200.
 */
export const GET = publicRoute(async ({ requestId }) =>
  ok(summary(), { requestId })
)
