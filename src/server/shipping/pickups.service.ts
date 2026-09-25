import { AuditAction } from '../audit/audit.actions'
import { created, fieldChange, mergeChanges } from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import { getConfig } from '../config'
import type { AuthenticatedActor } from '../context/request-context'
import { prisma } from '../db/client'
import { OrderStatus } from '../orders/order-status'
import { BusinessRuleError, DependencyUnavailableError } from '../utils/errors'
import { createId } from '../utils/ids'
import { offsetPage, toSkipTake, type OffsetPage } from '../utils/pagination'
import { carrierFor } from './carrier'
import { NzPostNotConfiguredError, toAppError } from './nzpost/nzpost.errors'
import {
  isShippingEnabled,
  pickupStreetGaps,
  senderGaps,
  shippingMode,
} from './nzpost/nzpost.settings'
import {
  toPickupView,
  toShipmentView,
  type PickupView,
  type ShipmentView,
} from './shipping.types'
import type { BookPickupDto, ListPickupsQueryDto } from './shipping.validation'

/**
 * Courier pickups (SOW INT-05).
 *
 * ---------------------------------------------------------------------------
 * Platform data
 * ---------------------------------------------------------------------------
 * One courier visit collects parcels for many customers from the one warehouse
 * (decision D3), so a booking belongs to the operator. The rows are read and
 * written outside any tenant scope, which RLS permits by design when no tenant
 * is set, and only ORDER_MANAGE — an operator permission — reaches this module.
 *
 * ---------------------------------------------------------------------------
 * Not retried
 * ---------------------------------------------------------------------------
 * `POST /bookings` has no idempotency key on NZ Post's side, and a courier
 * turning up twice is a real cost. A failed booking is reported to the operator,
 * who can look at what NZ Post holds before booking again. A booking made with
 * an idempotency key the portal has already seen returns the earlier booking
 * without calling NZ Post.
 */

export interface PickupsOverview {
  readonly bookings: OffsetPage<PickupView>
  /** Labelled, not voided, not on a booking, and still with the operator. */
  readonly awaitingPickup: readonly ShipmentView[]
}

export async function listPickups(
  query: ListPickupsQueryDto
): Promise<PickupsOverview> {
  const { skip, take } = toSkipTake(query)
  const [rows, total, awaiting] = await Promise.all([
    prisma.pickupBooking.findMany({
      include: { shipments: { select: { id: true } } },
      orderBy: [{ pickupAt: 'desc' }, { id: 'desc' }],
      skip,
      take,
    }),
    prisma.pickupBooking.count(),
    awaitingPickup(),
  ])

  return {
    bookings: offsetPage(rows.map(toPickupView), total, query),
    awaitingPickup: awaiting.map(toShipmentView),
  }
}

export async function bookPickup(
  actor: AuthenticatedActor,
  dto: BookPickupDto
): Promise<{ booking: PickupView; created: boolean }> {
  if (!isShippingEnabled()) {
    throw new DependencyUnavailableError('NZ Post shipping')
  }

  if (dto.idempotencyKey) {
    const existing = await prisma.pickupBooking.findUnique({
      where: { idempotencyKey: dto.idempotencyKey },
      include: { shipments: { select: { id: true } } },
    })
    if (existing) return { booking: toPickupView(existing), created: false }
  }

  const shipments = dto.shipmentIds
    ? await prisma.shipment.findMany({
        where: { id: { in: dto.shipmentIds } },
        include: { parcels: true },
      })
    : await awaitingPickup()

  if (shipments.length === 0) {
    throw new BusinessRuleError(
      'There are no labelled parcels waiting for a pickup.'
    )
  }

  const unusable = shipments.filter(
    (shipment) =>
      shipment.status !== 'LABELLED' ||
      shipment.voidedAt !== null ||
      shipment.pickupBookingId !== null
  )
  const missing = dto.shipmentIds
    ? dto.shipmentIds.filter(
        (id) => !shipments.some((shipment) => shipment.id === id)
      )
    : []
  if (unusable.length > 0 || missing.length > 0) {
    throw new BusinessRuleError(
      'Only labelled shipments that are not already on a pickup can be booked.',
      {
        details: {
          notFound: missing,
          notBookable: unusable.map((shipment) => ({
            id: shipment.id,
            status: shipment.status,
            pickupBookingId: shipment.pickupBookingId,
          })),
        },
      }
    )
  }

  const parcels = shipments.flatMap((shipment) => shipment.parcels)
  const weightGrams = parcels.reduce(
    (total, parcel) => total + parcel.weightGrams,
    0
  )
  const payload = buildPickupPayload({
    caller: actor.email,
    pickupAt: dto.pickupAt,
    parcelQuantity: parcels.length,
    weightGrams,
    trackingReferences: parcels
      .map((parcel) => parcel.trackingReference)
      .filter((reference): reference is string => Boolean(reference)),
    instructions: dto.instructions ?? null,
  })

  if (shippingMode() === 'live' && payload.gaps.length > 0) {
    throw toAppError(
      new NzPostNotConfiguredError('pickup', payload.gaps),
      'pickups'
    )
  }

  let result
  try {
    result = await carrierFor('pickup').bookPickup(payload.body)
  } catch (error) {
    throw toAppError(error, 'pickup booking')
  }

  // Anything but reject code 0 is treated as a refusal. The example response
  // shows "0" alongside a job id; what the other codes mean is not documented,
  // so the code is kept on the row for whoever has to ask NZ Post.
  const rejected = result.rejectCode !== null && result.rejectCode !== '0'
  const bookingId = createId('pkb')

  const booking = await prisma.$transaction(async (tx) => {
    await tx.pickupBooking.create({
      data: {
        id: bookingId,
        status: rejected ? 'REJECTED' : 'BOOKED',
        idempotencyKey: dto.idempotencyKey ?? `auto-${bookingId}`,
        pickupAt: dto.pickupAt,
        parcelQuantity: parcels.length,
        estimatedWeightGrams: weightGrams,
        instructions: dto.instructions ?? null,
        carrierJobId: result.jobId,
        carrierJobNumber: result.jobNumber,
        responseType: result.responseType,
        rejectCode: result.rejectCode,
        messageId: result.messageId,
        requestedById: null,
        requestedByName: actor.email,
      },
    })

    if (!rejected) {
      await tx.shipment.updateMany({
        where: { id: { in: shipments.map((shipment) => shipment.id) } },
        data: { pickupBookingId: bookingId },
      })
    }

    return tx.pickupBooking.findUniqueOrThrow({
      where: { id: bookingId },
      include: { shipments: { select: { id: true } } },
    })
  })

  await recordAudit({
    action: AuditAction.PICKUP_BOOKED,
    entityType: 'INTEGRATION',
    entityId: bookingId,
    entityName: `Pickup ${dto.pickupAt.toISOString()}`,
    changes: mergeChanges(
      created(booking, [
        'status',
        'pickupAt',
        'parcelQuantity',
        'estimatedWeightGrams',
        'instructions',
        'carrierJobId',
        'carrierJobNumber',
        'responseType',
        'rejectCode',
      ]),
      // The shipments it collects now point at it; a rejected booking claims
      // none, and records so.
      fieldChange(
        'shipmentIds',
        [],
        booking.shipments.map((shipment) => shipment.id).sort()
      )
    ),
    details: { mode: shippingMode() },
  })

  return { booking: toPickupView(booking), created: true }
}

// --- Internals ----------------------------------------------------------------

async function awaitingPickup() {
  return prisma.shipment.findMany({
    where: {
      status: 'LABELLED',
      voidedAt: null,
      pickupBookingId: null,
      order: {
        status: { in: [OrderStatus.PROCESSING, OrderStatus.DISPATCHED] },
      },
    },
    include: { parcels: { orderBy: { sequence: 'asc' } } },
    orderBy: { labelledAt: 'asc' },
    take: 200,
  })
}

const PLACEHOLDER = 'NOT CONFIGURED'

/**
 * The ParcelPickUp 3.0.9 booking body. Unlike ParcelLabel, its address takes
 * the number and street as one `street` field, and a site code on its own is
 * enough when the account has one.
 */
function buildPickupPayload(input: {
  caller: string
  pickupAt: Date
  parcelQuantity: number
  weightGrams: number
  trackingReferences: readonly string[]
  instructions: string | null
}): { body: Record<string, unknown>; gaps: string[] } {
  const nz = getConfig().nzPost
  const sender = nz.sender
  const pickup = nz.pickupAddress

  const contact = {
    name: sender.name ?? PLACEHOLDER,
    phone: sender.phone ?? PLACEHOLDER,
    ...(sender.email ? { email: sender.email } : {}),
    ...(sender.company ? { company_name: sender.company } : {}),
  }

  const address = nz.siteCode
    ? { ...contact, site_code: nz.siteCode }
    : {
        ...contact,
        ...(pickup.buildingName ? { building_name: pickup.buildingName } : {}),
        ...(pickup.unitType ? { unit_type: pickup.unitType } : {}),
        ...(pickup.unitValue ? { unit_value: pickup.unitValue } : {}),
        ...(pickup.floor ? { floor: pickup.floor } : {}),
        street:
          [pickup.streetNumber, pickup.street].filter(Boolean).join(' ') ||
          PLACEHOLDER,
        suburb: pickup.suburb ?? PLACEHOLDER,
        city: pickup.city ?? PLACEHOLDER,
        postcode: pickup.postcode ?? PLACEHOLDER,
      }

  return {
    body: {
      carrier: 'COURIERPOST',
      caller: input.caller.slice(0, 100),
      ...contact,
      pickup_date_time: input.pickupAt.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      parcel_quantity: input.parcelQuantity,
      estimated_weight_kg: Math.round(input.weightGrams) / 1000,
      ...(input.trackingReferences.length > 0
        ? { tracking_references: input.trackingReferences }
        : {}),
      pickup_address: {
        ...address,
        ...(pickup.instructions ? { instructions: pickup.instructions } : {}),
      },
      ...(input.instructions ? { instructions: input.instructions } : {}),
      ...(sender.email
        ? {
            is_booking_confirm_required: true,
            confirmation_email: sender.email,
          }
        : {}),
    },
    gaps: [...senderGaps(), ...(nz.siteCode ? [] : pickupStreetGaps())],
  }
}
