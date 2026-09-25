import { listAudit } from '@/server/audit/audit.service'
import { toAuditLogEntryView } from '@/server/audit/audit.types'
import { ListAuditLogQuerySchema } from '@/server/audit/audit.validation'
import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/audit-logs
 *
 * Read-only by design. There is no POST, PATCH or DELETE here and there should
 * never be one — an audit trail an operator can write to or edit is not
 * evidence of anything.
 *
 * Newest first, offset-paginated so the admin table can show a total and jump
 * between pages.
 */
export const GET = route(
  { permissions: [Permission.AUDIT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ListAuditLogQuerySchema)
    const page = await listAudit(
      resolveAccountId(actor, query.accountId),
      query
    )

    return ok(
      { ...page, items: page.items.map(toAuditLogEntryView) },
      { requestId }
    )
  }
)
