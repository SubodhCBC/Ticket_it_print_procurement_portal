import { Permission } from '@/server/auth/permissions'
import { findInvoiceById } from '@/server/billing/billing.service'
import { toInvoiceView } from '@/server/billing/invoice.types'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { invoiceId: string }

/**
 * GET /api/v1/billing/invoices/:invoiceId
 *
 * One invoice with every line. Another account's invoice answers 404:
 * confirming that an invoice number belongs to somebody discloses that they are
 * a customer.
 */
export const GET = route<Params>(
  { permissions: [Permission.BILLING_VIEW] },
  async ({ params, actor, requestId }) => {
    return ok(toInvoiceView(await findInvoiceById(actor, params.invoiceId)), {
      requestId,
    })
  }
)
