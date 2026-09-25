import { Permission } from '@/server/auth/permissions'
import { periodSummary } from '@/server/billing/billing.service'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { billingPeriod: string }

/**
 * GET /api/v1/billing/periods/:billingPeriod
 *
 * The KPI cards for one `YYYY-MM`. `unbilledTotal` is the number worth having:
 * orders in the period that have shipped but sit on no issued invoice. Without
 * it a month can look fully settled while a dozen orders quietly fall outside
 * every invoice.
 */
export const GET = route<Params>(
  { permissions: [Permission.BILLING_VIEW] },
  async ({ request, params, actor, requestId }) => {
    const accountId =
      new URL(request.url).searchParams.get('accountId') ?? undefined
    const summary = await periodSummary(actor, params.billingPeriod, accountId)

    return ok(summary, { requestId })
  }
)
