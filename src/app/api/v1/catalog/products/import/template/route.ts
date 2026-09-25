import { Permission } from '@/server/auth/permissions'
import { importTemplateCsv } from '@/server/catalog/product-csv'
import { route } from '@/server/middleware/auth.middleware'
import { REQUEST_ID_HEADER } from '@/server/utils/response'

export const runtime = 'nodejs'

/**
 * GET /api/v1/catalog/products/import/template
 *
 * The blank import file, with two worked rows (SOW M-13: "template download").
 * Its columns are `IMPORT_COLUMNS`, the same list the export writes first and
 * `ImportRowSchema` reads, so the three cannot drift apart into a file the
 * importer half understands.
 *
 * Served rather than kept as a static asset so it is built from that list at
 * request time: a template checked into `public/` is a copy that goes stale the
 * first time a column is added.
 *
 * @permission CATALOG_MANAGE Always. Without it the answer is 403.
 */
export const GET = route(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ requestId }) =>
    new Response(importTemplateCsv(), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="product-import-template.csv"',
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
)
