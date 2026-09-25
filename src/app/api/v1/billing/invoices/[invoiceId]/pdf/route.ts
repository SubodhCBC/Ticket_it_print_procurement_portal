import { Permission } from '@/server/auth/permissions'
import { attachmentHeader } from '@/server/billing/attachment'
import { findInvoiceById } from '@/server/billing/billing.service'
import { toPdf } from '@/server/billing/invoice-export.service'
import { route } from '@/server/middleware/auth.middleware'
import { REQUEST_ID_HEADER } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { invoiceId: string }

/**
 * GET /api/v1/billing/invoices/:invoiceId/pdf
 *
 * Rendered on demand from the invoice's own frozen rows, and deliberately not
 * stored: a saved PDF would be a second copy of the truth, and the two would
 * eventually disagree.
 */
export const GET = route<Params>(
  { permissions: [Permission.BILLING_VIEW] },
  async ({ params, actor, requestId }) => {
    const invoice = await findInvoiceById(actor, params.invoiceId)
    const body = await toPdf(invoice)

    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': attachmentHeader(
          invoice.invoiceNumber,
          invoice.billingPeriod,
          'pdf'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
