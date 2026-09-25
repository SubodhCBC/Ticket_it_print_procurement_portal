import { z } from 'zod'
import { SHIPPING_RETRY, STANDARD_RETRY } from '../queue/job-options'
import { enqueue } from '../queue/producer'
import { QueueName } from '../queue/queue-names'

/**
 * The producer side of the `shipping` queue. The worker's side is
 * `shipping.worker.ts`; the two are split so a service can enqueue without
 * importing the processors, which import the services back.
 */

export const ShippingJob = {
  /** Send one shipment's label request and store the PDF. */
  LABEL: 'label.create',
  /** Poll ParcelTrack for one order's parcels, now. */
  TRACK_ORDER: 'tracking.order',
  /** Scheduled: poll every dispatched shipment that is due. */
  TRACK_POLL: 'tracking.poll',
  /** Scheduled daily: flag labels that have gone unscanned too long. */
  RECONCILE_LABELS: 'labels.reconcile',
} as const

export const LabelJobSchema = z.object({ shipmentId: z.string().min(1) })
export const TrackOrderJobSchema = z.object({ orderId: z.string().min(1) })

/**
 * Queues a label job. Returns false when there is no queue, and the caller then
 * runs the job inline.
 *
 * `attemptKey` makes the BullMQ job id unique per replay. A failed job is kept
 * in Redis (SHIPPING_RETRY does not remove it), and BullMQ silently ignores an
 * add whose id already exists — so a replay under the original id would do
 * nothing at all.
 */
export async function enqueueLabelJob(
  shipmentId: string,
  attemptKey: string
): Promise<boolean> {
  try {
    return await enqueue(
      QueueName.SHIPPING,
      ShippingJob.LABEL,
      { shipmentId },
      { ...SHIPPING_RETRY, jobId: `label-${shipmentId}-${attemptKey}` }
    )
  } catch (error) {
    console.warn(
      `Could not queue the label job for shipment ${shipmentId}; running it inline instead. ` +
        (error instanceof Error ? error.message : String(error))
    )
    return false
  }
}

/**
 * Queues a tracking refresh for one order, at most once per ten minutes: the
 * job id carries the ten-minute bucket, and BullMQ ignores a second add with an
 * id it already holds. That is what lets an order page ask for a refresh on
 * every view without a busy page flooding NZ Post.
 */
export async function enqueueTrackingRefresh(
  orderId: string
): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 600_000)
  try {
    return await enqueue(
      QueueName.SHIPPING,
      ShippingJob.TRACK_ORDER,
      { orderId },
      { ...STANDARD_RETRY, jobId: `track-${orderId}-${bucket}` }
    )
  } catch (error) {
    console.warn(
      `Could not queue a tracking refresh for order ${orderId}. ` +
        (error instanceof Error ? error.message : String(error))
    )
    return false
  }
}
