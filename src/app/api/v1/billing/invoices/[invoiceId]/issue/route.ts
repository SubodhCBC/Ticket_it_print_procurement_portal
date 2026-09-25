import { Permission } from '@/server/auth/permissions'
import { issueInvoice } from '@/server/billing/billing.service'
import { toInvoiceView } from '@/server/billing/invoice.types'
import { IssueInvoiceSchema } from '@/server/billing/invoice.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { invoiceId: string }

/**
 * POST /api/v1/billing/invoices/:invoiceId/issue
 *
 * Numbers a draft and freezes it. After this nothing changes what the customer
 * was billed — a mistake becomes a void and a reissue.
 *
 * The number comes from a counter table rather than a sequence, because several
 * jurisdictions require invoice numbers to be unbroken and a sequence does not
 * roll back.
 */
export const POST = route<Params>(
  { permissions: [Permission.BILLING_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, IssueInvoiceSchema)
    return ok(
      toInvoiceView(await issueInvoice(actor, params.invoiceId, body)),
      { status: 201, requestId }
    )
  }
)
