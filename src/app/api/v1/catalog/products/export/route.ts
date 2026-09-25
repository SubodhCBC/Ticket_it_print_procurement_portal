import { AuditAction } from '@/server/audit/audit.actions'
import { recordAudit } from '@/server/audit/audit.service'
import { Permission } from '@/server/auth/permissions'
import { toProductCsv } from '@/server/catalog/product-csv'
import { exportProducts } from '@/server/catalog/products.service'
import { ExportProductsQuerySchema } from '@/server/catalog/product.validation'
import { route } from '@/server/middleware/auth.middleware'
import { REQUEST_ID_HEADER } from '@/server/utils/response'
import { parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/** `products-2026-09-17.csv` — the date is what tells two downloads apart. */
function filename(now: Date): string {
  return `products-${now.toISOString().slice(0, 10)}.csv`
}

/**
 * GET /api/v1/catalog/products/export
 *
 * The filtered catalogue as CSV (SOW M-13: "bulk import and export with
 * template download"). The editable columns come first, in the importer's own
 * order, so the file can be corrected in a spreadsheet and imported back; the
 * read-only tail — status, visibility and the two stock figures — is there to be
 * read and is ignored on the way in.
 *
 * The filters are the catalogue list's, minus paging, and are applied by the
 * same function, so the file matches the screen it was exported from. Above the
 * importer's per-file maximum the answer is 422 rather than a truncated file:
 * a short catalogue export looks complete once it is open in Excel.
 *
 * Cells that begin with a formula character are prefixed with an apostrophe, and
 * the body carries a byte-order mark so Excel reads it as UTF-8 rather than as
 * the system code page.
 *
 * @permission CATALOG_MANAGE Always. Without it the answer is 403.
 * @error 422 BUSINESS_RULE_VIOLATION More products match than one export carries.
 */
export const GET = route(
  { permissions: [Permission.CATALOG_MANAGE] },
  async ({ request, actor, requestId }) => {
    const query = parseQuery(request, ExportProductsQuerySchema)
    const products = await exportProducts(actor, query)

    // Recorded because this is the one catalogue read that leaves with the
    // whole price list in it. The entity id is the request id, which is also
    // the header on the response, so an entry and a download can be matched to
    // each other; the filters are kept so a later question about what was in
    // the file has an answer that does not depend on the catalogue as it is
    // today. A failed export writes nothing — `exportProducts` throws first.
    await recordAudit({
      action: AuditAction.PRODUCT_EXPORTED,
      entityType: 'PRODUCT',
      entityId: requestId,
      entityName: `Catalogue export of ${products.length} product(s)`,
      details: { rows: products.length, filters: query },
    })

    return new Response(toProductCsv(products), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename(new Date())}"`,
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
