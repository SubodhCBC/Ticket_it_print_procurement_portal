import { Permission } from '@/server/auth/permissions'
import { generateInvoice } from '@/server/billing/billing.service'
import { toInvoiceView } from '@/server/billing/invoice.types'
import { GenerateInvoiceSchema } from '@/server/billing/invoice.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * POST /api/v1/billing/invoices/generate
 *
 * Builds or rebuilds the draft for one account and period. Rebuilding replaces
 * the lines wholesale: an order cancelled since the last run has to disappear
 * from the draft, and a merge that only added would keep billing it.
 *
 * An order already frozen onto an issued invoice is skipped, however many times
 * this runs.
 */
export const POST = route(
  { permissions: [Permission.BILLING_MANAGE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, GenerateInvoiceSchema)
    return ok(toInvoiceView(await generateInvoice(actor, body)), {
      status: 201,
      requestId,
    })
  }
)
