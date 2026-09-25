import { Permission } from '@/server/auth/permissions'
import { attachmentHeader } from '@/server/billing/attachment'
import { findInvoiceById } from '@/server/billing/billing.service'
import { toCsv } from '@/server/billing/invoice-export.service'
import { route } from '@/server/middleware/auth.middleware'
import { REQUEST_ID_HEADER } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { invoiceId: string }

/**
 * GET /api/v1/billing/invoices/:invoiceId/csv
 *
 * The transaction-level backing file (SOW O-6, §15): one row per billed item,
 * every order line and each order's delivery charge, with the order, site,
 * buyer, delivery and status columns B-01 to B-11 list. `Line value` sums to
 * the subtotal and `Line total payable` to the total.
 *
 * Cells that begin with a formula character are prefixed with an apostrophe: an
 * export like this is opened on a machine with access to the ledger, which is
 * the worst possible place for a spreadsheet injection.
 */
export const GET = route<Params>(
  { permissions: [Permission.BILLING_VIEW] },
  async ({ params, actor, requestId }) => {
    const invoice = await findInvoiceById(actor, params.invoiceId)

    return new Response(toCsv(invoice), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': attachmentHeader(
          invoice.invoiceNumber,
          invoice.billingPeriod,
          'csv'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
