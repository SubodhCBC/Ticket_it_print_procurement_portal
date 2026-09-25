import { Permission } from '@/server/auth/permissions'
import { markInvoicePaid } from '@/server/billing/billing.service'
import { toInvoiceView } from '@/server/billing/invoice.types'
import { MarkInvoicePaidSchema } from '@/server/billing/invoice.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { invoiceId: string }

/** POST /api/v1/billing/invoices/:invoiceId/paid — settles an issued invoice. */
export const POST = route<Params>(
  { permissions: [Permission.BILLING_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, MarkInvoicePaidSchema)
    return ok(
      toInvoiceView(await markInvoicePaid(actor, params.invoiceId, body)),
      { status: 201, requestId }
    )
  }
)
