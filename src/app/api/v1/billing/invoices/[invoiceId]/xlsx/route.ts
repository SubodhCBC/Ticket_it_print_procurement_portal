import { Permission } from '@/server/auth/permissions'
import { attachmentHeader } from '@/server/billing/attachment'
import { findInvoiceById } from '@/server/billing/billing.service'
import { toXlsx } from '@/server/billing/invoice-export.service'
import { route } from '@/server/middleware/auth.middleware'
import { REQUEST_ID_HEADER } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { invoiceId: string }

const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/**
 * GET /api/v1/billing/invoices/:invoiceId/xlsx
 *
 * Two sheets: every order, and the per-branch summary that goes in a board pack.
 */
export const GET = route<Params>(
  { permissions: [Permission.BILLING_VIEW] },
  async ({ params, actor, requestId }) => {
    const invoice = await findInvoiceById(actor, params.invoiceId)
    const body = await toXlsx(invoice)

    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': XLSX_TYPE,
        'Content-Disposition': attachmentHeader(
          invoice.invoiceNumber,
          invoice.billingPeriod,
          'xlsx'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
