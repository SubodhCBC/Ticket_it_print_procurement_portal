import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { toFulfilmentDocket } from '@/server/orders/fulfilment-docket'
import { findOrderById } from '@/server/orders/orders.service'
import { REQUEST_ID_HEADER } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { orderId: string }

/**
 * GET /api/v1/orders/:orderId/docket
 *
 * The fulfilment docket as a PDF: the order's lines with their options,
 * personalised wording and line notes, and the order notes and delivery
 * instructions at the top (SOW F-19). Readable by whoever may see the order.
 */
export const GET = route<Params>(
  { permissions: [Permission.ORDER_VIEW_OWN] },
  async ({ params, actor, requestId }) => {
    const order = await findOrderById(actor, params.orderId)
    const body = await toFulfilmentDocket(order)

    return new Response(new Uint8Array(body), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="docket-${order.orderNumber}.pdf"`,
        'Cache-Control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    })
  }
)
