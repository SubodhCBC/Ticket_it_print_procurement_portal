import { Permission } from '@/server/auth/permissions'
import { voidInvoice } from '@/server/billing/billing.service'
import { toInvoiceView } from '@/server/billing/invoice.types'
import { VoidInvoiceSchema } from '@/server/billing/invoice.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { invoiceId: string }

/**
 * POST /api/v1/billing/invoices/:invoiceId/void
 *
 * Cancels an issued invoice and keeps its number. An invoice number that simply
 * disappears is exactly what a tax audit asks about — "voided" is an answer,
 * "missing" is not.
 *
 * Voiding frees the orders to be billed again, which is how a corrected invoice
 * is produced: void, regenerate, reissue.
 */
export const POST = route<Params>(
  { permissions: [Permission.BILLING_MANAGE] },
  async ({ request, params, actor, requestId }) => {
    const body = await parseJsonBody(request, VoidInvoiceSchema)
    return ok(toInvoiceView(await voidInvoice(actor, params.invoiceId, body)), {
      status: 201,
      requestId,
    })
  }
)
