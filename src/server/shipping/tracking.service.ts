import { Prisma } from '@prisma/client'
import { getConfig } from '../config'
import type { AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope } from '../db/client'
import {
  confirmDeliveryByCarrier,
  findOrderById,
} from '../orders/orders.service'
import { OrderStatus } from '../orders/order-status'
import { createId } from '../utils/ids'
import { carrierFor } from './carrier'
import type { TrackingResult } from './carrier.types'
import { NzPostNotConfiguredError, toAppError } from './nzpost/nzpost.errors'
import { isShippingEnabled } from './nzpost/nzpost.settings'
import { enqueueTrackingRefresh } from './shipping.queue'
import { isDeliveredEvent, trackingDedupeKey } from './shipping-rules'
import { toTrackingEventView, type OrderTrackingView } from './shipping.types'

/**
 * Tracking (SOW INT-06) and the order following it (decision D5).
 *
 * ---------------------------------------------------------------------------
 * Stored, not fetched per page view
 * ---------------------------------------------------------------------------
 * A worker polls ParcelTrack on a schedule and keeps the events. The order page
 * reads what is held, so it is fast whether NZ Post is or not, and asks for a
 * refresh in the background when what is held is getting old. NZ Post sees a
 * poll per parcel per interval, not a call per page view.
 *
 * ---------------------------------------------------------------------------
 * Delivered
 * ---------------------------------------------------------------------------
 * A shipment is delivered when every one of its parcels has a delivered event,
 * and an order when every live labelled shipment is. Then the order moves to
 * DELIVERED on NZ Post's timestamp. `isDeliveredEvent` decides what counts, and
 * its note says why it is strict and what still needs checking against real
 * responses.
 */

/** A held tracking picture older than this prompts a background refresh. */
const REFRESH_AFTER_MS = 30 * 60_000

/**
 * References handed to the carrier at a time. ParcelTrack 3.0 answers one per
 * call, so this bounds how much one failure can skip rather than batching the
 * HTTP requests: a chunk that throws is logged and comes round on the next poll.
 */
const REFERENCES_PER_CALL = 10

/** Shipments looked at per scheduled poll. The rest wait for the next one. */
const POLL_BATCH = 100

const TRACKABLE_SHIPMENT = Prisma.validator<Prisma.ShipmentInclude>()({
  parcels: { orderBy: { sequence: 'asc' } },
})

type TrackableShipment = Prisma.ShipmentGetPayload<{
  include: typeof TRACKABLE_SHIPMENT
}>

export interface TrackingRunResult {
  readonly shipments: number
  readonly newEvents: number
  readonly shipmentsDelivered: number
  readonly ordersDelivered: number
}

// --- Reading ------------------------------------------------------------------

export async function getOrderTracking(
  actor: AuthenticatedActor,
  orderId: string
): Promise<OrderTrackingView> {
  const order = await findOrderById(actor, orderId)
  const shipmentIds = order.shipments.map((shipment) => shipment.id)

  const events = shipmentIds.length
    ? await withTenantScope(order.accountId, (tx) =>
        tx.shipmentTrackingEvent.findMany({
          where: { shipmentId: { in: shipmentIds } },
          orderBy: { occurredAt: 'desc' },
        })
      )
    : []

  const stale = order.shipments.some(
    (shipment) =>
      shipment.status === 'LABELLED' &&
      shipment.deliveredAt === null &&
      (shipment.lastTrackedAt === null ||
        Date.now() - shipment.lastTrackedAt.getTime() > REFRESH_AFTER_MS)
  )
  const refreshQueued =
    stale && order.status === OrderStatus.DISPATCHED && isShippingEnabled()
      ? await enqueueTrackingRefresh(order.id)
      : false

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderStatus: order.status,
    carrier: order.carrier,
    trackingNumber: order.trackingNumber,
    shipments: order.shipments
      .filter((shipment) => shipment.status !== 'VOIDED')
      .map((shipment) => ({
        id: shipment.id,
        status: shipment.status,
        consignmentId: shipment.consignmentId,
        trackingReferences: shipment.parcels
          .map((parcel) => parcel.trackingReference)
          .filter((reference): reference is string => Boolean(reference)),
        lastTrackedAt: shipment.lastTrackedAt?.toISOString() ?? null,
        deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
      })),
    events: events.map(toTrackingEventView),
    refreshQueued,
  }
}

/**
 * Refreshes one order's tracking now, for an operator. Runs inline so the
 * response carries the result; the scheduled poll is what keeps everything else
 * current.
 */
export async function refreshTrackingNow(
  actor: AuthenticatedActor,
  orderId: string
): Promise<TrackingRunResult> {
  const order = await findOrderById(actor, orderId)
  try {
    return await refreshOrderTracking(order.id)
  } catch (error) {
    throw toAppError(error, 'tracking')
  }
}

// --- Worker entry points ------------------------------------------------------

/** Every live labelled shipment on one order. */
export async function refreshOrderTracking(
  orderId: string
): Promise<TrackingRunResult> {
  const shipments = await prisma.shipment.findMany({
    where: { orderId, status: 'LABELLED', voidedAt: null },
    include: TRACKABLE_SHIPMENT,
  })
  return applyTracking(shipments, carrierFor('tracking'))
}

/**
 * The scheduled poll: dispatched orders' shipments that have not been looked at
 * for a poll interval, oldest first.
 */
export async function pollDueTracking(): Promise<TrackingRunResult | null> {
  if (!isShippingEnabled()) return null

  let carrier
  try {
    carrier = carrierFor('tracking')
  } catch (error) {
    if (error instanceof NzPostNotConfiguredError) {
      console.warn(`Tracking poll skipped: ${error.message}`)
      return null
    }
    throw error
  }

  const cutoff = new Date(
    Date.now() - getConfig().nzPost.trackingPollMinutes * 60_000
  )
  const shipments = await prisma.shipment.findMany({
    where: {
      status: 'LABELLED',
      voidedAt: null,
      deliveredAt: null,
      order: { status: OrderStatus.DISPATCHED },
      OR: [{ lastTrackedAt: null }, { lastTrackedAt: { lt: cutoff } }],
    },
    include: TRACKABLE_SHIPMENT,
    orderBy: { lastTrackedAt: 'asc' },
    take: POLL_BATCH,
  })

  return applyTracking(shipments, carrier)
}

/**
 * The daily reconciliation (SOW §7.2): labels that have been LABELLED for the
 * configured number of days and have no tracking event at all were probably
 * never used. They are flagged, not voided — staff decide, because a label can
 * be on a parcel that is simply sitting at a depot unscanned.
 */
export async function flagUnscannedLabels(): Promise<number> {
  const runId = createId('rcn')
  const startedAt = new Date()

  if (!isShippingEnabled()) {
    await recordReconciliation(runId, startedAt, {
      outcome: 'SKIPPED',
      message: 'NZ Post shipping is switched off.',
    })
    return 0
  }

  const days = getConfig().nzPost.unscannedLabelDays
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60_000)
  const candidates = {
    status: 'LABELLED',
    voidedAt: null,
    labelledAt: { lt: cutoff },
    trackingEvents: { none: {} },
  } satisfies Prisma.ShipmentWhereInput

  try {
    const [examined, result] = await Promise.all([
      prisma.shipment.count({
        where: { status: 'LABELLED', voidedAt: null },
      }),
      prisma.shipment.updateMany({
        where: { ...candidates, unscannedFlaggedAt: null },
        data: { unscannedFlaggedAt: new Date() },
      }),
    ])
    // Everything flagged and still sitting unscanned, not only this run's new
    // flags: "zero new" with forty outstanding is not a clean result.
    const outstanding = await prisma.shipment.count({
      where: {
        status: 'LABELLED',
        voidedAt: null,
        unscannedFlaggedAt: { not: null },
      },
    })

    await recordReconciliation(runId, startedAt, {
      outcome: 'SUCCEEDED',
      examined,
      flagged: result.count,
      outstanding,
      message:
        outstanding === 0
          ? 'Every live label has been scanned or is within its window.'
          : `${outstanding} label(s) unscanned for more than ${days} days await a decision.`,
    })

    if (result.count > 0) {
      console.info(
        `Flagged ${result.count} label(s) unscanned for ${days} days.`
      )
    }
    return result.count
  } catch (error) {
    await recordReconciliation(runId, startedAt, {
      outcome: 'FAILED',
      message: (error instanceof Error ? error.message : String(error)).slice(
        0,
        1000
      ),
    })
    throw error
  }
}

/**
 * Keeps the result of a reconciliation run for integration health (SOW §15:
 * "last reconciliation result"). A failure to keep it is logged, not thrown: the
 * sweep itself has already done its work.
 */
async function recordReconciliation(
  id: string,
  startedAt: Date,
  result: {
    outcome: 'SUCCEEDED' | 'FAILED' | 'SKIPPED'
    examined?: number
    flagged?: number
    outstanding?: number
    message?: string
  }
): Promise<void> {
  try {
    await prisma.reconciliationRun.create({
      data: {
        id,
        kind: 'UNSCANNED_LABELS',
        startedAt,
        finishedAt: new Date(),
        ...result,
      },
    })
  } catch (error) {
    console.warn(
      'Reconciliation run not recorded: ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

// --- Internals ----------------------------------------------------------------

async function applyTracking(
  shipments: readonly TrackableShipment[],
  carrier: ReturnType<typeof carrierFor>
): Promise<TrackingRunResult> {
  const references = shipments.flatMap((shipment) =>
    shipment.parcels
      .map((parcel) => parcel.trackingReference)
      .filter((reference): reference is string => Boolean(reference))
  )

  const results = new Map<string, TrackingResult>()
  for (let start = 0; start < references.length; start += REFERENCES_PER_CALL) {
    const chunk = references.slice(start, start + REFERENCES_PER_CALL)
    try {
      for (const result of await carrier.track(chunk)) {
        results.set(result.trackingReference, result)
      }
    } catch (error) {
      // One bad batch must not stop the rest. These shipments keep their old
      // `lastTrackedAt` and come round again on the next poll.
      console.warn(
        `ParcelTrack failed for ${chunk.length} reference(s): ` +
          (error instanceof Error ? error.message : String(error))
      )
    }
  }

  let newEvents = 0
  let shipmentsDelivered = 0
  const ordersToCheck = new Set<string>()

  for (const shipment of shipments) {
    const shipmentReferences = shipment.parcels
      .map((parcel) => parcel.trackingReference)
      .filter((reference): reference is string => Boolean(reference))
    const answered = shipmentReferences.filter((reference) =>
      results.has(reference)
    )
    if (answered.length === 0) continue

    const outcome = await withTenantScope(shipment.accountId, async (tx) => {
      const existing = new Set(
        (
          await tx.shipmentTrackingEvent.findMany({
            where: { shipmentId: shipment.id },
            select: { dedupeKey: true },
          })
        ).map((row) => row.dedupeKey)
      )

      let inserted = 0
      for (const reference of answered) {
        for (const event of results.get(reference)?.events ?? []) {
          const dedupeKey = trackingDedupeKey(reference, event)
          if (existing.has(dedupeKey)) continue
          existing.add(dedupeKey)

          await tx.shipmentTrackingEvent.create({
            data: {
              id: createId('ste'),
              accountId: shipment.accountId,
              shipmentId: shipment.id,
              trackingReference: reference,
              dedupeKey,
              occurredAt: event.occurredAt,
              status: event.status?.slice(0, 255) ?? null,
              description: event.description?.slice(0, 1000) ?? null,
              edifactCode: event.edifactCode?.slice(0, 32) ?? null,
              depotName: event.depotName?.slice(0, 255) ?? null,
              signedByName: event.signedByName?.slice(0, 255) ?? null,
              isDelivered: isDeliveredEvent(event),
            },
          })
          inserted += 1
        }
      }

      const delivered = await tx.shipmentTrackingEvent.findMany({
        where: { shipmentId: shipment.id, isDelivered: true },
        select: { trackingReference: true, occurredAt: true },
      })
      const deliveredReferences = new Set(
        delivered.map((row) => row.trackingReference)
      )
      const allDelivered =
        shipmentReferences.length > 0 &&
        shipmentReferences.every((reference) =>
          deliveredReferences.has(reference)
        )
      const deliveredAt = allDelivered
        ? new Date(
            Math.max(...delivered.map((row) => row.occurredAt.getTime()))
          )
        : null

      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          lastTrackedAt: new Date(),
          ...(deliveredAt && !shipment.deliveredAt ? { deliveredAt } : {}),
        },
      })

      return {
        inserted,
        newlyDelivered: Boolean(deliveredAt && !shipment.deliveredAt),
      }
    })

    newEvents += outcome.inserted
    if (outcome.newlyDelivered) {
      shipmentsDelivered += 1
      ordersToCheck.add(shipment.orderId)
    }
  }

  let ordersDelivered = 0
  for (const orderId of ordersToCheck) {
    if (await confirmOrderIfAllDelivered(orderId)) ordersDelivered += 1
  }

  return {
    shipments: shipments.length,
    newEvents,
    shipmentsDelivered,
    ordersDelivered,
  }
}

/**
 * Moves the order on only when every live labelled shipment is delivered. An
 * order that went out in two consignments is not delivered when one arrives.
 */
async function confirmOrderIfAllDelivered(orderId: string): Promise<boolean> {
  const shipments = await prisma.shipment.findMany({
    where: { orderId, status: 'LABELLED', voidedAt: null },
    select: {
      deliveredAt: true,
      parcels: { select: { trackingReference: true } },
    },
  })
  if (shipments.length === 0) return false
  if (shipments.some((shipment) => shipment.deliveredAt === null)) return false

  const deliveredAt = new Date(
    Math.max(
      ...shipments.map((shipment) => shipment.deliveredAt?.getTime() ?? 0)
    )
  )
  const references = shipments
    .flatMap((shipment) =>
      shipment.parcels.map((parcel) => parcel.trackingReference)
    )
    .filter((reference): reference is string => Boolean(reference))

  return confirmDeliveryByCarrier(orderId, deliveredAt, references)
}
