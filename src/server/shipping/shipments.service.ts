import { Prisma } from '@prisma/client'
import { AuditAction } from '../audit/audit.actions'
import {
  changesBetween,
  created,
  type AuditChanges,
} from '../audit/audit-changes'
import { recordAudit, SYSTEM_ACTOR } from '../audit/audit.service'
import { getConfig } from '../config'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope, type TransactionClient } from '../db/client'
import { fromJson, fromJsonOr, toJson } from '../db/json-column'
import { findOrderById, type FullOrder } from '../orders/orders.service'
import { OrderStatus } from '../orders/order-status'
import {
  buildKey,
  presignDownload,
  put,
  StoragePrefix,
} from '../storage/storage.service'
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  DependencyUnavailableError,
  NotFoundError,
} from '../utils/errors'
import { createId } from '../utils/ids'
import { offsetPage, toSkipTake, type OffsetPage } from '../utils/pagination'
import { carrierFor } from './carrier'
import type {
  Carrier,
  CollectionPoint,
  LabelStatus,
  StructuredAddress,
} from './carrier.types'
import { buildLabelPayload } from './label-payload'
import {
  NzPostApiError,
  NzPostNotConfiguredError,
  isTransientCarrierError,
  toAppError,
} from './nzpost/nzpost.errors'
import { isShippingEnabled, shippingMode } from './nzpost/nzpost.settings'
import { enqueueLabelJob } from './shipping.queue'
import { splitStreetLine } from './shipping-rules'
import {
  toShipmentView,
  type QueuedShipmentView,
  type ShipmentView,
  type ShipmentWithParcels,
} from './shipping.types'
import type {
  CreateShipmentDto,
  ListShipmentsQueryDto,
  VoidShipmentDto,
} from './shipping.validation'

/**
 * Labels (SOW INT-04), from the fulfilment side.
 *
 * ---------------------------------------------------------------------------
 * The flow
 * ---------------------------------------------------------------------------
 * Staff open an order in production, weigh and measure the boxes, and ask for a
 * label (decisions D1 and D2). That request is recorded as a PENDING shipment
 * with the exact NZ Post request body, and a job is queued. The worker sends it,
 * waits for NZ Post to finish generating, stores the PDF and the tracking
 * references, and marks the shipment LABELLED. Dispatch then reads the label.
 *
 * ---------------------------------------------------------------------------
 * Not creating two consignments
 * ---------------------------------------------------------------------------
 * NZ Post's label endpoint takes no idempotency key, so the portal carries the
 * whole burden, in three layers:
 *
 *   1. One live shipment per order. A second request while one is PENDING,
 *      SUBMITTED or LABELLED is refused — void the first.
 *   2. An idempotency key per request, unique in the database. The same key
 *      returns the same shipment, so a double-click or a client retry is free.
 *   3. The job records the consignment id the moment NZ Post returns it, before
 *      anything else, and never sends a shipment that already has one.
 *
 * The remaining window is the one no client can close alone: NZ Post accepts the
 * request and the response is lost. A retry then makes a second consignment.
 * The first is never scanned, so never charged, and the daily check flags it
 * for void after NZPOST_UNSCANNED_LABEL_DAYS.
 */

/** Statuses that count as "this order already has a label under way". */
const LIVE_STATUSES = ['PENDING', 'SUBMITTED', 'LABELLED']

/** How many times, and how far apart, the job asks whether a label is ready. */
const STATUS_POLLS = 5
const STATUS_POLL_INTERVAL_MS = 1_500

/**
 * NZ Post refused the request in a way a retry will not fix, or the label came
 * back failed. The worker turns this into BullMQ's UnrecoverableError.
 */
export class TerminalShippingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TerminalShippingError'
  }
}

/** The label is still being generated. Transient: the job retries. */
class LabelNotReadyError extends Error {
  constructor(consignmentId: string, status: string | null) {
    super(
      `NZ Post has not finished the label for consignment ${consignmentId} (status ${status ?? 'unknown'}).`
    )
    this.name = 'LabelNotReadyError'
  }
}

// --- Reading ------------------------------------------------------------------

export async function listOrderShipments(
  actor: AuthenticatedActor,
  orderId: string
): Promise<readonly ShipmentView[]> {
  const order = await findOrderById(actor, orderId)
  return order.shipments.map(toShipmentView)
}

export async function getOrderShipment(
  actor: AuthenticatedActor,
  orderId: string,
  shipmentId: string
): Promise<ShipmentView> {
  const order = await findOrderById(actor, orderId)
  return toShipmentView(shipmentOf(order, shipmentId))
}

/**
 * The fulfilment queue: shipments across the platform, for whoever holds
 * ORDER_MANAGE. An administrator sees every account unless they filter to one;
 * anyone else is pinned to their own.
 */
export async function listShipments(
  actor: AuthenticatedActor,
  query: ListShipmentsQueryDto
): Promise<OffsetPage<QueuedShipmentView>> {
  const accountId =
    actor.role === Role.ADMIN ? (query.accountId ?? null) : actor.accountId

  const clauses: Prisma.ShipmentWhereInput[] = []
  if (accountId) clauses.push({ accountId })
  if (query.status) clauses.push({ status: query.status })
  if (query.awaitingPickup) {
    clauses.push({ status: 'LABELLED', pickupBookingId: null, voidedAt: null })
  }
  if (query.flagged) {
    clauses.push({ status: 'LABELLED', unscannedFlaggedAt: { not: null } })
  }

  const where: Prisma.ShipmentWhereInput = { AND: clauses }
  const { skip, take } = toSkipTake(query)
  const include = {
    parcels: { orderBy: { sequence: 'asc' } },
    order: {
      select: {
        orderNumber: true,
        status: true,
        site: { select: { name: true } },
        account: { select: { name: true } },
      },
    },
  } satisfies Prisma.ShipmentInclude

  const read = (client: TransactionClient | typeof prisma) =>
    Promise.all([
      client.shipment.findMany({
        where,
        include,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      client.shipment.count({ where }),
    ])

  const [rows, total] = accountId
    ? await withTenantScope(accountId, read)
    : await read(prisma)

  return offsetPage(
    rows.map((row) => ({
      ...toShipmentView(row),
      accountId: row.accountId,
      accountName: row.order.account.name,
      orderNumber: row.order.orderNumber,
      orderStatus: row.order.status,
      siteName: row.order.site.name,
    })),
    total,
    query
  )
}

// --- Requesting a label -------------------------------------------------------

export async function createShipment(
  actor: AuthenticatedActor,
  orderId: string,
  dto: CreateShipmentDto
): Promise<{ shipment: ShipmentView; created: boolean }> {
  if (!isShippingEnabled()) {
    throw new DependencyUnavailableError('NZ Post shipping')
  }

  const order = await findOrderById(actor, orderId)

  if (dto.idempotencyKey) {
    const existing = await prisma.shipment.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { parcels: true },
    })
    if (existing) {
      if (existing.orderId !== order.id) {
        throw new ConflictError(
          'That idempotency key was already used for a different order.'
        )
      }
      return { shipment: toShipmentView(existing), created: false }
    }
  }

  if (order.status !== OrderStatus.PROCESSING) {
    throw new BusinessRuleError(
      `Labels are generated while an order is in production. This order is ${order.status}.`,
      { details: { status: order.status } }
    )
  }

  const live = order.shipments.find((shipment) =>
    LIVE_STATUSES.includes(shipment.status)
  )
  if (live) {
    throw new ConflictError(
      'This order already has a label in progress or ready. Void it before requesting another.',
      { details: { shipmentId: live.id, status: live.status } }
    )
  }

  const delivery = resolveDelivery(order, dto)
  const serviceCode =
    dto.serviceCode ??
    order.shipping?.serviceCode ??
    getConfig().nzPost.defaultServiceCode
  if (!serviceCode) {
    throw new BusinessRuleError(
      'Choose a delivery service for this label — the buyer did not pick one and no default is configured.'
    )
  }

  const snapshot = fromJsonOr<Record<string, unknown>>(
    order.shippingSnapshot,
    {}
  )
  const parcels = dto.parcels.map((parcel, index) => ({
    sequence: index + 1,
    serviceCode,
    description: parcel.description ?? null,
    weightGrams: Math.max(1, Math.round(parcel.weightKg * 1000)),
    lengthMm: Math.max(1, Math.round(parcel.lengthCm * 10)),
    widthMm: Math.max(1, Math.round(parcel.widthCm * 10)),
    heightMm: Math.max(1, Math.round(parcel.heightCm * 10)),
  }))

  const built = buildLabelPayload({
    orderNumber: order.orderNumber,
    secondaryReference: order.site.code,
    receiver: {
      name:
        order.recipientName ??
        stringOf(snapshot.recipientName) ??
        order.placedByName,
      phone: order.recipientPhone ?? stringOf(snapshot.phone),
      email: order.recipientEmail ?? order.placedByEmail,
    },
    delivery: delivery.address,
    isCollection: delivery.isCollection,
    instructions: dto.instructions ?? order.deliveryNotes ?? null,
    parcels,
  })

  if (built.addressGaps.length > 0) {
    throw new BusinessRuleError(
      'The delivery address is missing parts NZ Post needs for a label.',
      { details: { missing: built.addressGaps } }
    )
  }
  if (shippingMode() === 'live' && built.configurationGaps.length > 0) {
    throw toAppError(
      new NzPostNotConfiguredError('label', built.configurationGaps),
      'labels'
    )
  }

  const shipmentId = createId('shp')
  const actorName = actor.email

  await withTenantScope(order.accountId, async (tx) => {
    await tx.shipment.create({
      data: {
        id: shipmentId,
        accountId: order.accountId,
        orderId: order.id,
        status: 'PENDING',
        serviceCode,
        idempotencyKey: dto.idempotencyKey ?? `auto-${shipmentId}`,
        requestPayload: toJson(built.payload),
        requestedById:
          actor.accountId === order.accountId ? actor.userId : null,
        requestedByName: actorName,
      },
    })
    await tx.shipmentParcel.createMany({
      data: parcels.map((parcel) => ({
        id: createId('spc'),
        accountId: order.accountId,
        shipmentId,
        ...parcel,
      })),
    })
  })

  await recordAudit({
    action: AuditAction.SHIPMENT_LABEL_REQUESTED,
    entityType: 'ORDER',
    entityId: order.id,
    entityName: order.orderNumber,
    accountId: order.accountId,
    changes: shipmentCreated(shipmentId, {
      status: 'PENDING',
      serviceCode,
      parcelCount: parcels.length,
      isCollection: delivery.isCollection,
    }),
    details: { mode: shippingMode() },
  })

  await dispatchLabelJob(shipmentId, 'initial')

  const created = await loadShipment(order.accountId, shipmentId)
  return { shipment: toShipmentView(created), created: true }
}

// --- The label job ------------------------------------------------------------

/**
 * Sends one shipment's label request and stores the result. Run by the worker;
 * run inline when there is no queue.
 *
 * Returns the shipment's status afterwards. Throws a transient error for the
 * queue to retry, or `TerminalShippingError` when retrying cannot help. Marks the
 * shipment FAILED itself on a terminal error or on the last attempt, so the
 * portal shows the failure without anyone reading Redis.
 */
export async function processLabelJob(
  shipmentId: string,
  attempt: { readonly number: number; readonly max: number }
): Promise<string> {
  const shipment = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    include: {
      parcels: { orderBy: { sequence: 'asc' } },
      order: { select: { orderNumber: true } },
    },
  })
  if (!shipment) return 'MISSING'
  if (shipment.status === 'LABELLED' || shipment.status === 'VOIDED') {
    return shipment.status
  }

  try {
    const carrier = carrierFor('label')

    await withTenantScope(shipment.accountId, (tx) =>
      tx.shipment.update({
        where: { id: shipmentId },
        data: { attempts: { increment: 1 } },
      })
    )

    let consignmentId = shipment.consignmentId
    if (!consignmentId) {
      const submission = await carrier.submitLabel(
        fromJson<Record<string, unknown>>(
          shipment.requestPayload,
          'shipments.requestPayload'
        )
      )
      consignmentId = submission.consignmentId

      // Recorded before anything else can fail. This row is what stops a retry
      // sending the request a second time.
      await withTenantScope(shipment.accountId, async (tx) => {
        const current = await tx.shipment.findUniqueOrThrow({
          where: { id: shipmentId },
          select: { status: true },
        })
        await tx.shipment.update({
          where: { id: shipmentId },
          data: {
            consignmentId: submission.consignmentId,
            messageId: submission.messageId,
            lastError: null,
            ...(current.status === 'VOIDED' ? {} : { status: 'SUBMITTED' }),
          },
        })
      })
    }

    const status = await waitForLabel(carrier, consignmentId)
    if (status.failed) {
      throw new TerminalShippingError(
        status.errors.join('; ') ||
          status.labels.flatMap((label) => label.errors).join('; ') ||
          `NZ Post reported the label as ${status.status ?? 'failed'}.`
      )
    }
    if (!status.complete)
      throw new LabelNotReadyError(consignmentId, status.status)

    const pdf = await carrier.downloadLabel(consignmentId)
    const key = buildKey(
      StoragePrefix.SHIPPING_LABEL,
      shipment.accountId,
      `${shipment.id}-${consignmentId}.pdf`
    )
    await put(key, pdf, {
      contentType: 'application/pdf',
      downloadFilename: labelFilename(
        shipment.order.orderNumber,
        consignmentId
      ),
    })

    // Read inside the transaction below, before it writes, so the audit entry
    // records the status this label actually moved the shipment from.
    let statusBeforeLabel: string | null = null
    const finalStatus = await withTenantScope(
      shipment.accountId,
      async (tx) => {
        const labels = [...status.labels].sort(
          (a, b) => labelSequence(a.labelId) - labelSequence(b.labelId)
        )
        for (const [index, parcel] of shipment.parcels.entries()) {
          const label = labels[index]
          if (!label) continue
          await tx.shipmentParcel.update({
            where: { id: parcel.id },
            data: {
              labelId: label.labelId || null,
              trackingReference: label.trackingReference,
            },
          })
        }

        const current = await tx.shipment.findUniqueOrThrow({
          where: { id: shipmentId },
          select: { status: true },
        })
        statusBeforeLabel = current.status
        const voided = current.status === 'VOIDED'
        await tx.shipment.update({
          where: { id: shipmentId },
          data: {
            labelFileKey: key,
            labelExpiresAt: status.expiresAt,
            lastError: null,
            ...(voided ? {} : { status: 'LABELLED', labelledAt: new Date() }),
          },
        })
        return voided ? 'VOIDED' : 'LABELLED'
      }
    )

    await recordAudit({
      action: AuditAction.SHIPMENT_LABELLED,
      entityType: 'ORDER',
      entityId: shipment.orderId,
      entityName: shipment.order.orderNumber,
      accountId: shipment.accountId,
      actor: SYSTEM_ACTOR(shipment.accountId),
      changes: shipmentChanges(
        shipmentId,
        {
          status: statusBeforeLabel,
          trackingReferences: shipment.parcels.map(
            (parcel) => parcel.trackingReference
          ),
        },
        {
          // A label that lands on a voided shipment is stored, but the
          // shipment stays voided — see above.
          status: finalStatus,
          trackingReferences: status.labels.map(
            (label) => label.trackingReference
          ),
        }
      ),
      details: { consignmentId },
    })

    return finalStatus
  } catch (error) {
    const terminal =
      error instanceof TerminalShippingError ||
      error instanceof NzPostNotConfiguredError ||
      (error instanceof NzPostApiError && !error.transient) ||
      (error instanceof AppError &&
        !(error instanceof DependencyUnavailableError))
    const lastAttempt = attempt.number >= attempt.max
    const message = describeFailure(error)

    await recordFailure(shipment, message, terminal || lastAttempt)

    if (terminal) {
      throw error instanceof TerminalShippingError
        ? error
        : new TerminalShippingError(message)
    }
    throw error
  }
}

// --- Acting on a shipment -----------------------------------------------------

/**
 * A short-lived link to the label PDF, recorded in the audit trail: a label
 * carries the recipient's name, phone and address.
 */
export async function getLabelDownload(
  actor: AuthenticatedActor,
  orderId: string,
  shipmentId: string
): Promise<{
  url: string
  filename: string
  expiresInSeconds: number
  consignmentId: string | null
}> {
  const order = await findOrderById(actor, orderId)
  const shipment = shipmentOf(order, shipmentId)

  if (!shipment.labelFileKey) {
    throw new BusinessRuleError('The label is not ready yet.', {
      details: { status: shipment.status, lastError: shipment.lastError },
    })
  }

  const filename = labelFilename(
    order.orderNumber,
    shipment.consignmentId ?? shipment.id
  )
  const url = await presignDownload(shipment.labelFileKey, filename)

  await recordAudit({
    action: AuditAction.SHIPMENT_LABEL_DOWNLOADED,
    entityType: 'ORDER',
    entityId: order.id,
    entityName: order.orderNumber,
    accountId: order.accountId,
    details: { shipmentId, consignmentId: shipment.consignmentId },
  })

  return {
    url,
    filename,
    expiresInSeconds: getConfig().storage.presignExpirySeconds,
    consignmentId: shipment.consignmentId,
  }
}

/**
 * Withdraws a label in the portal.
 *
 * NZ Post has no void endpoint in any of its specs. Voiding here means the
 * portal stops treating the label as live — dispatch will not use it, a pickup
 * will not include it — and whoever holds the printed copy discards it. A label
 * nobody scans is never charged.
 *
 * Refused once the order has been dispatched on this label: the parcel is with
 * the courier, and voiding the record would not bring it back.
 */
export async function voidShipment(
  actor: AuthenticatedActor,
  orderId: string,
  shipmentId: string,
  dto: VoidShipmentDto
): Promise<ShipmentView> {
  const order = await findOrderById(actor, orderId)
  const shipment = shipmentOf(order, shipmentId)

  if (shipment.status === 'VOIDED') return toShipmentView(shipment)

  const dispatched =
    order.status === OrderStatus.DISPATCHED ||
    order.status === OrderStatus.DELIVERED
  if (dispatched && shipment.status === 'LABELLED') {
    throw new BusinessRuleError(
      'This order has already been dispatched on this label. The parcel is with the courier.',
      { details: { orderStatus: order.status } }
    )
  }

  const voided = await withTenantScope(order.accountId, (tx) =>
    tx.shipment.update({
      where: { id: shipmentId },
      data: { status: 'VOIDED', voidedAt: new Date(), voidReason: dto.reason },
    })
  )

  await recordAudit({
    action: AuditAction.SHIPMENT_VOIDED,
    entityType: 'ORDER',
    entityId: order.id,
    entityName: order.orderNumber,
    accountId: order.accountId,
    changes: shipmentChanges(shipmentId, shipment, voided, [
      'status',
      'voidedAt',
      'voidReason',
    ]),
    details: { consignmentId: shipment.consignmentId },
  })

  return toShipmentView(await loadShipment(order.accountId, shipmentId))
}

/**
 * Replays a failed label request (SOW §7.2: administrator replay).
 *
 * The same stored request body, and the same row: a shipment that already has a
 * consignment id resumes from fetching the label rather than asking NZ Post for
 * a new one.
 */
export async function retryShipment(
  actor: AuthenticatedActor,
  orderId: string,
  shipmentId: string
): Promise<ShipmentView> {
  const order = await findOrderById(actor, orderId)
  const shipment = shipmentOf(order, shipmentId)

  if (shipment.status !== 'FAILED') {
    throw new BusinessRuleError('Only a failed label request can be retried.', {
      details: { status: shipment.status },
    })
  }
  if (order.status !== OrderStatus.PROCESSING) {
    throw new BusinessRuleError(
      `Labels are generated while an order is in production. This order is ${order.status}.`
    )
  }

  const retried = await withTenantScope(order.accountId, (tx) =>
    tx.shipment.update({
      where: { id: shipmentId },
      data: {
        status: shipment.consignmentId ? 'SUBMITTED' : 'PENDING',
        lastError: null,
      },
    })
  )

  await recordAudit({
    action: AuditAction.SHIPMENT_RETRIED,
    entityType: 'ORDER',
    entityId: order.id,
    entityName: order.orderNumber,
    accountId: order.accountId,
    changes: shipmentChanges(shipmentId, shipment, retried, [
      'status',
      'lastError',
    ]),
    details: { consignmentId: shipment.consignmentId },
  })

  await dispatchLabelJob(shipmentId, `retry-${Date.now()}`)
  return toShipmentView(await loadShipment(order.accountId, shipmentId))
}

// --- Audit ------------------------------------------------------------------

/**
 * A shipment's change, filed under its order.
 *
 * Shipment entries belong to the ORDER entity — that is where anyone looking
 * for "what happened to this delivery" starts — so each field is prefixed with
 * the shipment it belongs to, `shipments.<id>.status`, and an order with two
 * consignments cannot have their changes read as one.
 */
function shipmentChanges<T extends object>(
  shipmentId: string,
  before: T,
  after: T,
  fields: readonly (keyof T & string)[] = Object.keys(after) as (keyof T &
    string)[]
): AuditChanges {
  const diff = changesBetween(before, after, fields)
  const prefix = (side: Readonly<Record<string, unknown>>) =>
    Object.fromEntries(
      Object.entries(side).map(([field, value]) => [
        `shipments.${shipmentId}.${field}`,
        value,
      ])
    )
  return { before: prefix(diff.before), after: prefix(diff.after) }
}

function shipmentCreated(
  shipmentId: string,
  values: Record<string, unknown>
): AuditChanges {
  const made = created(values, Object.keys(values))
  return {
    before: {},
    after: Object.fromEntries(
      Object.entries(made.after).map(([field, value]) => [
        `shipments.${shipmentId}.${field}`,
        value,
      ])
    ),
  }
}

// --- Internals ----------------------------------------------------------------

/** Queues the job, or runs it now when there is no queue to put it on. */
async function dispatchLabelJob(
  shipmentId: string,
  attemptKey: string
): Promise<void> {
  if (await enqueueLabelJob(shipmentId, attemptKey)) return

  // No retries on this path, as with mail: a small single-process deployment
  // is supported, and a label that fails once shows as FAILED with a retry
  // button rather than silently never happening.
  void processLabelJob(shipmentId, { number: 1, max: 1 }).catch(
    (error: unknown) => {
      console.error(
        `Inline label job for shipment ${shipmentId} failed: ` +
          (error instanceof Error ? error.message : String(error))
      )
    }
  )
}

function shipmentOf(order: FullOrder, shipmentId: string): ShipmentWithParcels {
  const shipment = order.shipments.find((row) => row.id === shipmentId)
  if (!shipment) throw new NotFoundError('Shipment')
  return shipment
}

async function loadShipment(
  accountId: string,
  shipmentId: string
): Promise<ShipmentWithParcels> {
  return withTenantScope(accountId, (tx) =>
    tx.shipment.findUniqueOrThrow({
      where: { id: shipmentId },
      include: { parcels: { orderBy: { sequence: 'asc' } } },
    })
  )
}

/**
 * Where the label goes: an address staff typed, the buyer's collection point,
 * or the buyer's validated address — in that order.
 */
function resolveDelivery(
  order: FullOrder,
  dto: CreateShipmentDto
): { address: StructuredAddress; isCollection: boolean } {
  if (dto.deliveryAddress) {
    return {
      address: {
        ...dto.deliveryAddress,
        companyName: dto.deliveryAddress.companyName ?? order.site.name,
      },
      isCollection: false,
    }
  }

  const shipping = order.shipping
  if (shipping?.deliveryKind === 'COLLECTION' && shipping.collectionPoint) {
    const point = fromJson<CollectionPoint>(
      shipping.collectionPoint,
      'order_shipping.collectionPoint'
    )
    const { streetNumber, street } = splitStreetLine(point.addressLine1)
    return {
      address: {
        companyName: point.name,
        streetNumber,
        street,
        suburb: point.suburb,
        city: point.city ?? '',
        postcode: point.postcode ?? '',
        countryCode: 'NZ',
      },
      isCollection: true,
    }
  }

  const structured = fromJsonOr<StructuredAddress | null>(
    shipping?.deliveryAddress,
    null
  )
  if (structured) {
    return {
      address: {
        ...structured,
        companyName: structured.companyName ?? order.site.name,
      },
      isCollection: false,
    }
  }

  throw new BusinessRuleError(
    'This order has no NZ Post-validated delivery address. Send deliveryAddress with the ' +
      'street number, street, suburb, city and postcode.',
    {
      details: {
        orderAddress: fromJsonOr<unknown>(order.shippingSnapshot, null),
      },
    }
  )
}

async function waitForLabel(
  carrier: Carrier,
  consignmentId: string
): Promise<LabelStatus> {
  let status = await carrier.labelStatus(consignmentId)
  for (
    let poll = 1;
    poll < STATUS_POLLS && !status.complete && !status.failed;
    poll += 1
  ) {
    await new Promise((resolve) => setTimeout(resolve, STATUS_POLL_INTERVAL_MS))
    status = await carrier.labelStatus(consignmentId)
  }
  return status
}

async function recordFailure(
  shipment: {
    id: string
    accountId: string
    orderId: string
    order: { orderNumber: string }
  },
  message: string,
  final: boolean
): Promise<void> {
  try {
    let statusBeforeFailure: string | null = null
    const failedNow = await withTenantScope(shipment.accountId, async (tx) => {
      const current = await tx.shipment.findUnique({
        where: { id: shipment.id },
        select: { status: true },
      })
      statusBeforeFailure = current?.status ?? null
      if (
        !current ||
        current.status === 'VOIDED' ||
        current.status === 'LABELLED'
      ) {
        return false
      }
      await tx.shipment.update({
        where: { id: shipment.id },
        data: {
          lastError: message.slice(0, 2000),
          ...(final ? { status: 'FAILED' } : {}),
        },
      })
      return final
    })

    if (failedNow) {
      await recordAudit({
        action: AuditAction.SHIPMENT_LABEL_FAILED,
        entityType: 'ORDER',
        entityId: shipment.orderId,
        entityName: shipment.order.orderNumber,
        accountId: shipment.accountId,
        actor: SYSTEM_ACTOR(shipment.accountId),
        changes: shipmentChanges(
          shipment.id,
          { status: statusBeforeFailure },
          { status: 'FAILED' }
        ),
        details: { error: message.slice(0, 500) },
      })
    }
  } catch (error) {
    console.error(
      `Could not record the failure of shipment ${shipment.id}: ` +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof NzPostApiError) {
    return `${error.operation}: ${error.detail} (HTTP ${error.status}${
      error.messageId ? `, message ${error.messageId}` : ''
    })`
  }
  if (error instanceof Error) {
    return isTransientCarrierError(error)
      ? `${error.message} — will retry`
      : error.message
  }
  return String(error)
}

/** `X63CC2-3` is the third label; anything unparseable sorts last. */
function labelSequence(labelId: string): number {
  const match = /-(\d+)$/.exec(labelId)
  return match?.[1] ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

function labelFilename(orderNumber: string, consignmentId: string): string {
  return `label-${orderNumber}-${consignmentId}.pdf`
}

function stringOf(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}
