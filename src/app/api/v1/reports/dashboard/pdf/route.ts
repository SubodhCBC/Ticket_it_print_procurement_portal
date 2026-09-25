import { Permission } from '@/server/auth/permissions'
import { prisma } from '@/server/db/client'
import { route } from '@/server/middleware/auth.middleware'
import { toDashboardPdf } from '@/server/reports/dashboard-pdf'
import { dashboard } from '@/server/reports/reports.service'
import { DashboardQuerySchema } from '@/server/reports/report.validation'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/reports/dashboard/pdf
 *
 * The executive spend dashboard as a PDF (SOW §15: "PDF for the consolidated
 * billing summary and executive dashboards"; the billing summary is the invoice
 * PDF). Takes the same filters as `GET /reports/dashboard` and renders that
 * response as it is — headline figures with the comparison period, the spend
 * trend, orders by status, the work-in-progress snapshot and the top branches —
 * so it carries the figures the screen shows and no others.
 *
 * `scope=platform` is administrator-only, refused in the service as on the JSON
 * route.
 *
 * @permission REPORT_VIEW Always.
 * @error 403 FORBIDDEN `scope=platform` from anyone but an administrator.
 */
export const GET = route(
  { permissions: [Permission.REPORT_VIEW] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, DashboardQuerySchema)
    const report = await dashboard(actor, query)

    // The name, for the heading. Read by id rather than from the report, which
    // carries the id only; a platform report has no one account to name.
    const account = report.accountId
      ? await prisma.account.findUnique({
          where: { id: report.accountId },
          select: { name: true },
        })
      : null

    const pdf = await toDashboardPdf(report, {
      accountName: account?.name ?? null,
      generatedBy: actor.email,
      generatedAt: new Date(),
    })
    const lastDay = new Date(new Date(report.to).getTime() - 1)
      .toISOString()
      .slice(0, 10)

    return new Response(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="dashboard-${report.from.slice(0, 10)}-to-${lastDay}.pdf"`,
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
