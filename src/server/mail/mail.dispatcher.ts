import { EMAIL_RETRY } from '../queue/job-options'
import { enqueue as addJob } from '../queue/producer'
import { QueueName } from '../queue/queue-names'
import {
  MailJob,
  type ApprovalDecidedJobData,
  type ApprovalPendingJobData,
  type InvitationJobData,
  type LowStockJobData,
  type OrderDispatchedJobData,
  type OrderPlacedJobData,
  type PasswordResetJobData,
  type WelcomeJobData,
} from './mail.job'
import { recipientOf, renderMailJob } from './mail.renderer'
import { sendMail } from './mail.service'

/**
 * Transactional email. The only thing feature code should call.
 *
 * ---------------------------------------------------------------------------
 * Queued, with a direct fallback
 * ---------------------------------------------------------------------------
 * Messages go on the `email` queue and the worker renders and sends them, so a
 * mail server outage delays a notification for as long as EMAIL_RETRY allows
 * (five attempts, exponential from five seconds) rather than losing it. That is
 * the whole reason the queue exists, and it closes the regression this file
 * carried while there was no worker.
 *
 * When no `REDIS_URL` is configured there is no queue, and rather than dropping
 * the message these send it directly on the spot. That path has no retry — it is
 * the old behaviour, kept because a small single-process deployment is supported
 * and an invitation that is never sent at all is worse than one that is not
 * retried.
 *
 * ---------------------------------------------------------------------------
 * Nothing is awaited by the caller, and nothing throws into it
 * ---------------------------------------------------------------------------
 * A deliberate divergence from the NestJS dispatcher, which was `async` and let
 * a Redis failure fail the request. Here an invitation that was *created* must
 * not be reported as a failure because the queue was briefly unreachable — the
 * administrator would retry and create a second invitation. So enqueueing is
 * fire-and-forget, and a failure falls back to a direct send before it is
 * finally logged.
 *
 * Every send is called *after* its transaction commits, never inside one. A
 * message announcing an order that then failed to save is not retractable.
 */

/**
 * Enqueues, or sends directly if there is no queue.
 *
 * Not awaited by callers: `void` at the call site is what keeps both a slow
 * Redis and a slow mail server off the request's critical path. The recipient is
 * logged on failure, the payload is not — invitation and reset payloads carry a
 * single-use token.
 */
function dispatch(job: MailJob, data: { to: string }): void {
  void (async () => {
    try {
      if (await addJob(QueueName.EMAIL, job, data, EMAIL_RETRY)) return
    } catch (error) {
      console.warn(
        `Could not queue the "${job}" email to ${data.to}; sending it directly instead. ` +
          (error instanceof Error ? error.message : String(error))
      )
    }

    // No queue, or the queue refused it. Rendered here rather than in the worker
    // — same function, so the message is identical either way.
    await sendMail({ to: recipientOf(data), ...renderMailJob(job, data) })
  })().catch((error: unknown) => {
    console.error(
      `Could not send the "${job}" email to ${data.to}; it will not be retried. ` +
        (error instanceof Error ? error.message : String(error))
    )
  })
}

export function sendInvitationEmail(data: InvitationJobData): void {
  dispatch(MailJob.INVITATION, data)
}

export function sendPasswordResetEmail(data: PasswordResetJobData): void {
  dispatch(MailJob.PASSWORD_RESET, data)
}

export function sendWelcomeEmail(data: WelcomeJobData): void {
  dispatch(MailJob.WELCOME, data)
}

// --- Order notifications ----------------------------------------------------
//
// Each of these describes its order from the data it was handed rather than by
// re-reading the database. A message must say what was true when the event
// happened: reading now would let a delayed send announce an amended order while
// claiming to be the original's receipt.

export function sendOrderPlacedEmail(data: OrderPlacedJobData): void {
  dispatch(MailJob.ORDER_PLACED, data)
}

export function sendApprovalPendingEmail(data: ApprovalPendingJobData): void {
  dispatch(MailJob.APPROVAL_PENDING, data)
}

export function sendApprovalDecidedEmail(data: ApprovalDecidedJobData): void {
  dispatch(MailJob.APPROVAL_DECIDED, data)
}

export function sendOrderDispatchedEmail(data: OrderDispatchedJobData): void {
  dispatch(MailJob.ORDER_DISPATCHED, data)
}

export function sendLowStockEmail(data: LowStockJobData): void {
  dispatch(MailJob.LOW_STOCK, data)
}
