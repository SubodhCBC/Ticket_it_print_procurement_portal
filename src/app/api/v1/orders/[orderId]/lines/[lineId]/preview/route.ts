import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { readLinePreview } from '@/server/orders/line-images'
import { REQUEST_ID_HEADER } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { orderId: string; lineId: string }

/**
 * GET /api/v1/orders/:orderId/lines/:lineId/preview
 *
 * The picture of a personalised design as the buyer finished it — the artwork
 * an approver is deciding on. Readable by anyone who may see the order, and by
 * an approver in its account while it has an approval request. 404 when the
 * line has no preview; the approval view's `image` says which lines do.
 *
 * Raster types only, sent with `nosniff` and a CSP that allows nothing, because
 * the bytes were supplied by a buyer.
 */
export const GET = route<Params>(
  { permissions: [Permission.ORDER_VIEW_OWN] },
  async ({ params, actor, requestId }) => {
    const preview = await readLinePreview(actor, params.orderId, params.lineId)

    return new Response(new Uint8Array(preview.body), {
      headers: {
        'Content-Type': preview.contentType,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'",
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
