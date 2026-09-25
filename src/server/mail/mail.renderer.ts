import { getConfig } from '../config'
import {
  ApprovalDecidedJobSchema,
  ApprovalPendingJobSchema,
  InvitationJobSchema,
  LowStockJobSchema,
  MailJob,
  OrderDispatchedJobSchema,
  OrderPlacedJobSchema,
  PasswordResetJobSchema,
  WelcomeJobSchema,
} from './mail.job'
import {
  renderApprovalDecidedMail,
  renderApprovalPendingMail,
  renderInvitationMail,
  renderLowStockMail,
  renderOrderDispatchedMail,
  renderOrderPlacedMail,
  renderPasswordResetMail,
  renderWelcomeMail,
  type RenderedMail,
} from './mail.templates'

/**
 * Turns a job name and its payload into a subject and a body.
 *
 * Shared by the worker, which is the normal path, and by the dispatcher's direct
 * fallback for deployments with no queue. One switch rather than two: the two
 * paths must produce identical mail, and a second copy is how they stop doing
 * that six months later.
 *
 * Payloads are validated on the way *out* of the queue as well as in. A job that
 * has been sitting in Redis since before the last deploy can carry a shape this
 * build no longer understands, and that should be a clean parse failure rather
 * than a TypeError halfway through rendering.
 */
export function renderMailJob(name: string, data: unknown): RenderedMail {
  const base = getConfig().app.portalBaseUrl

  switch (name) {
    case MailJob.INVITATION: {
      const job = InvitationJobSchema.parse(data)
      return renderInvitationMail({
        firstName: job.firstName,
        accountName: job.accountName,
        ...(job.inviterName ? { inviterName: job.inviterName } : {}),
        acceptUrl: `${base}/invitations/accept?token=${encodeURIComponent(job.token)}`,
        expiresAt: job.expiresAt,
        isExternal: job.isExternal,
      })
    }

    case MailJob.PASSWORD_RESET: {
      const job = PasswordResetJobSchema.parse(data)
      return renderPasswordResetMail({
        firstName: job.firstName,
        resetUrl: `${base}/password/reset?token=${encodeURIComponent(job.token)}`,
        expiresAt: job.expiresAt,
      })
    }

    case MailJob.WELCOME: {
      const job = WelcomeJobSchema.parse(data)
      return renderWelcomeMail({
        firstName: job.firstName,
        accountName: job.accountName,
        portalUrl: `${base}/login`,
      })
    }

    // --- Order notifications (SOW BE-08) -------------------------------------
    //
    // Each of these describes its order from the job payload rather than by
    // reading the database. A message must say what was true when the event
    // happened: re-reading now would let a job that ran after an amendment
    // announce the new order while claiming to be the old one's receipt.

    case MailJob.ORDER_PLACED: {
      const job = OrderPlacedJobSchema.parse(data)
      return renderOrderPlacedMail({
        firstName: job.firstName,
        order: job.order,
        awaitingApproval: job.awaitingApproval,
        orderUrl: `${base}/orders/${encodeURIComponent(job.order.orderId)}`,
      })
    }

    case MailJob.APPROVAL_PENDING: {
      const job = ApprovalPendingJobSchema.parse(data)
      return renderApprovalPendingMail({
        firstName: job.firstName,
        order: job.order,
        tier: job.tier,
        approvalsUrl: `${base}/approvals`,
      })
    }

    case MailJob.APPROVAL_DECIDED: {
      const job = ApprovalDecidedJobSchema.parse(data)
      return renderApprovalDecidedMail({
        firstName: job.firstName,
        order: job.order,
        decision: job.decision,
        decidedByName: job.decidedByName,
        comment: job.comment,
        interim: job.interim ?? null,
        orderUrl: `${base}/orders/${encodeURIComponent(job.order.orderId)}`,
      })
    }

    case MailJob.ORDER_DISPATCHED: {
      const job = OrderDispatchedJobSchema.parse(data)
      return renderOrderDispatchedMail({
        firstName: job.firstName,
        order: job.order,
        carrier: job.carrier,
        trackingNumber: job.trackingNumber,
        orderUrl: `${base}/orders/${encodeURIComponent(job.order.orderId)}`,
      })
    }

    case MailJob.LOW_STOCK: {
      const job = LowStockJobSchema.parse(data)
      return renderLowStockMail({
        firstName: job.firstName,
        items: job.items,
        inventoryUrl: `${base}/admin/inventory`,
      })
    }

    default:
      // An unknown name is a deploy-ordering problem, not a transient one. It
      // still consumes the retry budget and then dead-letters, which is where it
      // becomes visible.
      throw new Error(`No renderer for email job "${name}".`)
  }
}

/** The recipient, read before any parsing so a failure names the real problem. */
export function recipientOf(data: unknown): string {
  const to = (data as { to?: unknown } | null)?.to
  if (typeof to !== 'string' || to.length === 0) {
    throw new Error('Email job has no recipient.')
  }
  return to
}
