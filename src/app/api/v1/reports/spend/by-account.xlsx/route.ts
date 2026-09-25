import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { exportContext } from '@/server/reports/report-export'
import { resolveRange } from '@/server/reports/report-periods'
import {
  attachmentDisposition,
  renderXlsx,
} from '@/server/reports/report-table'
import { SPEND_BY_ACCOUNT } from '@/server/reports/report-tables'
import { ReportRangeQuerySchema } from '@/server/reports/report.validation'
import { spendByAccount } from '@/server/reports/reports.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/spend/by-account.xlsx
 *
 * Spend per customer account, across the platform.
 *
 * The same rows as `GET /api/v1/reports/spend/by-account`, with the columns declared
 * once in `report-tables.ts` for both file formats (SOW §15: "CSV and XLSX for
 * every tabular report"). Numbers as numbers — money, counts and percentages can be summed and
 * filtered without retyping — and an About sheet saying who pulled it, when,
 * and with which filters.
 *
 * @permission ACCOUNT_MANAGE Always.
 */
export const GET = route(
  { permissions: [Permission.ACCOUNT_MANAGE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ReportRangeQuerySchema)
    const rows = await spendByAccount(query)
    const context = exportContext(
      actor,
      null,
      {},
      resolveRange(query.from, query.to)
    )
    const body = await renderXlsx(SPEND_BY_ACCOUNT, rows, context)

    return new Response(body, {
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': attachmentDisposition(
          SPEND_BY_ACCOUNT,
          context,
          'xlsx'
        ),
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
