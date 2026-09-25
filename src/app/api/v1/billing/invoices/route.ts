import { Permission } from '@/server/auth/permissions'
import { listInvoices } from '@/server/billing/billing.service'
import { toInvoiceView } from '@/server/billing/invoice.types'
import { ListInvoicesQuerySchema } from '@/server/billing/invoice.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/billing/invoices
 *
 * A customer sees their own; an administrator may name an account or omit it for
 * the cross-tenant list. `overdue=true` narrows to issued invoices past their
 * due date and not yet settled.
 */
export const GET = route(
  { permissions: [Permission.BILLING_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListInvoicesQuerySchema)
    const page = await listInvoices(actor, query)

    return ok({ ...page, items: page.items.map(toInvoiceView) }, { requestId })
  }
)
