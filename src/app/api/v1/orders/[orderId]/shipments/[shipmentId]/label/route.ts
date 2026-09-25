import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import { getLabelDownload } from '@/server/shipping/shipments.service'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

type Params = { orderId: string; shipmentId: string }

/**
 * GET /api/v1/orders/:orderId/shipments/:shipmentId/label — a short-lived link to the label PDF.
 *
 * A presigned URL, valid for S3_PRESIGN_EXPIRY_SECONDS. Every download is
 * recorded in the audit trail: a label carries the recipient's name, phone and
 * address. Answers 422 while the label is still being made.
 *
 * @error 422 BUSINESS_RULE_VIOLATION The label is not ready yet (`details.status`, `details.lastError`).
 */
export const GET = route<Params>(
  { permissions: [Permission.ORDER_MANAGE] },
  async ({ params, actor, requestId }) => {
    return ok(
      await getLabelDownload(actor, params.orderId, params.shipmentId),
      { requestId }
    )
  }
)
