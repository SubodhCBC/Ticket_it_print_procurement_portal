import type {
  CartShippingSelection,
  OrderShipping,
  PickupBooking,
  Shipment,
  ShipmentParcel,
  ShipmentTrackingEvent,
} from '@prisma/client'
import { fromJsonOr } from '../db/json-column'
import type {
  CollectionPoint,
  RateOption,
  StructuredAddress,
} from './carrier.types'
import type { ParcelEstimate } from './shipping-rules'

/**
 * Shipping as the API exposes it.
 *
 * Pure mappers with no service imports, so the order view can use them without
 * the orders module depending on the shipping services.
 */

// --- Delivery choice ----------------------------------------------------------

export interface DeliveryChoiceView {
  readonly deliveryKind: 'ADDRESS' | 'COLLECTION'
  readonly nzPostAddressId: string | null
  readonly dpid: string | null
  readonly isRural: boolean | null
  readonly fullAddress: string | null
  readonly deliveryAddress: StructuredAddress | null
  readonly collectionPoint: CollectionPoint | null
  readonly service: {
    readonly code: string
    readonly description: string | null
    readonly quoteSource: 'NZPOST' | 'FLAT_RATE' | null
    readonly priceExclGst: string | null
    readonly priceInclGst: string | null
    readonly quotedAt: string | null
  } | null
  readonly parcelEstimate: ParcelEstimate | null
  /**
   * Always false. Freight is recorded for reconciliation and never added to
   * the order total, the branch budget or the invoice (decision D4). Stated in
   * the payload so no client has to know that from a document.
   */
  readonly freightBilled: false
}

type DeliveryChoiceRow = CartShippingSelection | OrderShipping

export function toDeliveryChoiceView(
  row: DeliveryChoiceRow
): DeliveryChoiceView {
  return {
    deliveryKind: row.deliveryKind === 'COLLECTION' ? 'COLLECTION' : 'ADDRESS',
    nzPostAddressId: row.nzPostAddressId,
    dpid: row.dpid,
    isRural: row.isRural,
    fullAddress: row.fullAddress,
    deliveryAddress: fromJsonOr<StructuredAddress | null>(
      row.deliveryAddress,
      null
    ),
    collectionPoint: fromJsonOr<CollectionPoint | null>(
      row.collectionPoint,
      null
    ),
    service: row.serviceCode
      ? {
          code: row.serviceCode,
          description: row.serviceDescription,
          quoteSource:
            row.quoteSource === 'NZPOST' || row.quoteSource === 'FLAT_RATE'
              ? row.quoteSource
              : null,
          priceExclGst: row.quotedPriceExclGst?.toFixed(2) ?? null,
          priceInclGst: row.quotedPriceInclGst?.toFixed(2) ?? null,
          quotedAt: row.quotedAt?.toISOString() ?? null,
        }
      : null,
    parcelEstimate: fromJsonOr<ParcelEstimate | null>(row.parcelEstimate, null),
    freightBilled: false,
  }
}

export interface CartShippingView {
  readonly cartId: string
  readonly siteId: string | null
  /** Null until the buyer picks an address from the type-ahead. */
  readonly selection: DeliveryChoiceView | null
  /**
   * Whether the NZ Post address is the saved delivery address chosen in the
   * checkout details: by DPID when that address has been validated, otherwise
   * by postcode. Null when either is missing. A false is worth showing the
   * buyer: they may have validated the wrong place.
   */
  readonly matchesSavedAddress: boolean | null
}

export interface ShippingOptionsView {
  /**
   * NZPOST: live rates. FLAT_RATE: NZ Post could not be asked or answered with
   * nothing, and the configured flat rate is offered instead (SOW §7.2).
   * UNAVAILABLE: neither — checkout carries on without a quote.
   */
  readonly source: 'NZPOST' | 'FLAT_RATE' | 'UNAVAILABLE'
  readonly options: readonly RateOption[]
  readonly parcelEstimate: ParcelEstimate
  readonly message: string | null
  readonly freightBilled: false
}

// --- Shipments ----------------------------------------------------------------

export type ShipmentWithParcels = Shipment & { parcels: ShipmentParcel[] }

export interface ShipmentParcelView {
  readonly sequence: number
  readonly serviceCode: string
  readonly description: string | null
  readonly weightKg: number
  readonly lengthCm: number
  readonly widthCm: number
  readonly heightCm: number
  readonly labelId: string | null
  readonly trackingReference: string | null
}

export interface ShipmentView {
  readonly id: string
  readonly orderId: string
  readonly status: string
  readonly carrier: string
  readonly serviceCode: string
  readonly consignmentId: string | null
  /** True once the PDF is stored and can be downloaded. */
  readonly labelReady: boolean
  readonly labelExpiresAt: string | null
  readonly attempts: number
  readonly lastError: string | null
  readonly requestedByName: string
  readonly pickupBookingId: string | null
  readonly labelledAt: string | null
  readonly lastTrackedAt: string | null
  readonly deliveredAt: string | null
  readonly unscannedFlaggedAt: string | null
  readonly voidedAt: string | null
  readonly voidReason: string | null
  readonly createdAt: string
  readonly parcels: readonly ShipmentParcelView[]
}

export function toShipmentView(shipment: ShipmentWithParcels): ShipmentView {
  return {
    id: shipment.id,
    orderId: shipment.orderId,
    status: shipment.status,
    carrier: shipment.carrier,
    serviceCode: shipment.serviceCode,
    consignmentId: shipment.consignmentId,
    labelReady: shipment.labelFileKey !== null,
    labelExpiresAt: shipment.labelExpiresAt?.toISOString() ?? null,
    attempts: shipment.attempts,
    lastError: shipment.lastError,
    requestedByName: shipment.requestedByName,
    pickupBookingId: shipment.pickupBookingId,
    labelledAt: shipment.labelledAt?.toISOString() ?? null,
    lastTrackedAt: shipment.lastTrackedAt?.toISOString() ?? null,
    deliveredAt: shipment.deliveredAt?.toISOString() ?? null,
    unscannedFlaggedAt: shipment.unscannedFlaggedAt?.toISOString() ?? null,
    voidedAt: shipment.voidedAt?.toISOString() ?? null,
    voidReason: shipment.voidReason,
    createdAt: shipment.createdAt.toISOString(),
    parcels: [...shipment.parcels]
      .sort((a, b) => a.sequence - b.sequence)
      .map((parcel) => ({
        sequence: parcel.sequence,
        serviceCode: parcel.serviceCode,
        description: parcel.description,
        weightKg: parcel.weightGrams / 1000,
        lengthCm: parcel.lengthMm / 10,
        widthCm: parcel.widthMm / 10,
        heightCm: parcel.heightMm / 10,
        labelId: parcel.labelId,
        trackingReference: parcel.trackingReference,
      })),
  }
}

/** A shipment in the fulfilment queue, with enough of its order to act on. */
export interface QueuedShipmentView extends ShipmentView {
  readonly accountId: string
  readonly accountName: string
  readonly orderNumber: string
  readonly orderStatus: string
  readonly siteName: string
}

/**
 * The label that dispatch would use: the most recently labelled shipment that
 * has not been voided. Null when there is none.
 */
export function dispatchLabelFrom(
  shipments: readonly ShipmentWithParcels[]
): { shipmentId: string; carrier: string; trackingNumber: string } | null {
  const labelled = shipments
    .filter(
      (shipment) => shipment.status === 'LABELLED' && shipment.voidedAt === null
    )
    .sort(
      (a, b) => (b.labelledAt?.getTime() ?? 0) - (a.labelledAt?.getTime() ?? 0)
    )[0]
  if (!labelled) return null

  const references = [...labelled.parcels]
    .sort((a, b) => a.sequence - b.sequence)
    .map((parcel) => parcel.trackingReference)
    .filter((reference): reference is string => Boolean(reference))

  return {
    shipmentId: labelled.id,
    carrier: 'NZ Post (CourierPost)',
    // `orders.trackingNumber` is NVARCHAR(500); a twenty-parcel consignment of
    // twenty-character references still fits with its separators.
    trackingNumber: (references.length > 0
      ? references.join(', ')
      : (labelled.consignmentId ?? '')
    ).slice(0, 500),
  }
}

// --- Tracking -----------------------------------------------------------------

export interface TrackingEventView {
  readonly trackingReference: string
  readonly occurredAt: string
  readonly status: string | null
  readonly description: string | null
  readonly depotName: string | null
  readonly signedByName: string | null
  readonly isDelivered: boolean
}

export function toTrackingEventView(
  event: ShipmentTrackingEvent
): TrackingEventView {
  return {
    trackingReference: event.trackingReference,
    occurredAt: event.occurredAt.toISOString(),
    status: event.status,
    description: event.description,
    depotName: event.depotName,
    signedByName: event.signedByName,
    isDelivered: event.isDelivered,
  }
}

export interface OrderTrackingView {
  readonly orderId: string
  readonly orderNumber: string
  readonly orderStatus: string
  readonly carrier: string | null
  readonly trackingNumber: string | null
  readonly shipments: ReadonlyArray<{
    readonly id: string
    readonly status: string
    readonly consignmentId: string | null
    readonly trackingReferences: readonly string[]
    readonly lastTrackedAt: string | null
    readonly deliveredAt: string | null
  }>
  /** Newest first. */
  readonly events: readonly TrackingEventView[]
  /** A refresh was queued because what is held is older than the refresh window. */
  readonly refreshQueued: boolean
}

// --- Pickups ------------------------------------------------------------------

export interface PickupView {
  readonly id: string
  readonly status: string
  readonly pickupAt: string
  readonly parcelQuantity: number
  readonly estimatedWeightKg: number
  readonly instructions: string | null
  readonly carrierJobId: string | null
  readonly carrierJobNumber: string | null
  readonly responseType: string | null
  readonly rejectCode: string | null
  readonly requestedByName: string
  readonly shipmentIds: readonly string[]
  readonly createdAt: string
}

export function toPickupView(
  booking: PickupBooking & { shipments: ReadonlyArray<{ id: string }> }
): PickupView {
  return {
    id: booking.id,
    status: booking.status,
    pickupAt: booking.pickupAt.toISOString(),
    parcelQuantity: booking.parcelQuantity,
    estimatedWeightKg: booking.estimatedWeightGrams / 1000,
    instructions: booking.instructions,
    carrierJobId: booking.carrierJobId,
    carrierJobNumber: booking.carrierJobNumber,
    responseType: booking.responseType,
    rejectCode: booking.rejectCode,
    requestedByName: booking.requestedByName,
    shipmentIds: booking.shipments.map((shipment) => shipment.id),
    createdAt: booking.createdAt.toISOString(),
  }
}
