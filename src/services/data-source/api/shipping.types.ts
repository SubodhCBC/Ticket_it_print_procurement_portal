/**
 * NZ Post fulfilment, exactly as the API returns it.
 *
 * Mirrors `server/shipping/shipping.types.ts`, `shipping-status.service.ts` and
 * `pickups.service.ts`. The checkout half — address, rates, collection points —
 * lives in `cart.types.ts`; this is what happens after the order is placed:
 * labels, pickups and tracking. Weights are kilograms and sizes centimetres
 * throughout, the units on the scale and the tape measure.
 */

import type { ApiDeliveryAddressParts } from './cart.types'
import type { ApiOffsetPage } from './catalog.types'

/**
 * PENDING and SUBMITTED are the label being made in the background; LABELLED
 * is printable; FAILED says why in `lastError`; VOIDED was withdrawn.
 */
export type ApiShipmentStatus =
  'PENDING' | 'SUBMITTED' | 'LABELLED' | 'FAILED' | 'VOIDED'

export interface ApiShipmentParcel {
  sequence: number
  serviceCode: string
  description: string | null
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
  labelId: string | null
  trackingReference: string | null
}

export interface ApiShipment {
  id: string
  orderId: string
  status: ApiShipmentStatus
  carrier: string
  serviceCode: string
  consignmentId: string | null
  /** True once the PDF is stored and can be downloaded. */
  labelReady: boolean
  labelExpiresAt: string | null
  attempts: number
  lastError: string | null
  requestedByName: string
  pickupBookingId: string | null
  labelledAt: string | null
  lastTrackedAt: string | null
  deliveredAt: string | null
  /** Set by the daily check when a label was never scanned by NZ Post. */
  unscannedFlaggedAt: string | null
  voidedAt: string | null
  voidReason: string | null
  createdAt: string
  parcels: ApiShipmentParcel[]
}

/** A shipment in the fulfilment queue, with enough of its order to act on. */
export interface ApiQueuedShipment extends ApiShipment {
  accountId: string
  accountName: string
  orderNumber: string
  orderStatus: string
  siteName: string
}

/** One box as measured by whoever packed it. */
export interface ParcelInput {
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
  description?: string
}

/** The body of `POST /orders/:orderId/shipments`. */
export interface CreateShipmentInput {
  parcels: ParcelInput[]
  /** Defaults server-side to the service the buyer chose. */
  serviceCode?: string
  /** Only for an order whose checkout did not validate an NZ Post address. */
  deliveryAddress?: Omit<ApiDeliveryAddressParts, 'countryCode'> & {
    countryCode?: 'NZ'
  }
  /** Defaults server-side to the order's delivery instructions. */
  instructions?: string
  /** Sending the same key again returns the same shipment. */
  idempotencyKey?: string
}

export interface ApiLabelLink {
  /** A presigned, short-lived URL to the PDF. */
  url: string
  filename: string
  expiresInSeconds: number
  consignmentId: string | null
}

export interface ApiTrackingEvent {
  trackingReference: string
  occurredAt: string
  status: string | null
  description: string | null
  depotName: string | null
  signedByName: string | null
  isDelivered: boolean
}

export interface ApiOrderTracking {
  orderId: string
  orderNumber: string
  orderStatus: string
  carrier: string | null
  trackingNumber: string | null
  shipments: {
    id: string
    status: ApiShipmentStatus
    consignmentId: string | null
    trackingReferences: string[]
    lastTrackedAt: string | null
    deliveredAt: string | null
  }[]
  /** Newest first. */
  events: ApiTrackingEvent[]
  /** What is held was stale, and a refresh has been queued in the background. */
  refreshQueued: boolean
}

/** What `POST /orders/:orderId/tracking/refresh` reports. */
export interface ApiTrackingRun {
  shipments: number
  newEvents: number
  shipmentsDelivered: number
  ordersDelivered: number
}

export interface ApiPickup {
  id: string
  status: string
  pickupAt: string
  parcelQuantity: number
  estimatedWeightKg: number
  instructions: string | null
  carrierJobId: string | null
  carrierJobNumber: string | null
  responseType: string | null
  rejectCode: string | null
  requestedByName: string
  shipmentIds: string[]
  createdAt: string
}

export interface ApiPickupsOverview {
  bookings: ApiOffsetPage<ApiPickup>
  /** Labelled, not voided and not yet on a booking. */
  awaitingPickup: ApiShipment[]
}

export interface BookPickupInput {
  /** ISO 8601 with an offset. Must not be in the past. */
  pickupAt: string
  /** Defaults server-side to every labelled shipment waiting. */
  shipmentIds?: string[]
  instructions?: string
  idempotencyKey?: string
}

export type ApiShippingCapability =
  'address' | 'rates' | 'collection' | 'label' | 'pickup' | 'tracking'

/** NZ Post call metrics over one window (SOW §15 integration health). */
export interface ApiIntegrationCallWindow {
  window: '24h' | '7d'
  calls: number
  succeeded: number
  failed: number
  successRatePercent: number | null
  latencyMs: { average: number; p50: number; p95: number; max: number } | null
  /** Calls made as a retry of a queued job. */
  retries: number
  mockCalls: number
  byOperation: {
    operation: string
    calls: number
    failed: number
    averageMs: number
  }[]
}

export interface ApiReconciliationRun {
  kind: string
  outcome: string
  startedAt: string
  finishedAt: string | null
  examined: number | null
  flagged: number | null
  outstanding: number | null
  message: string | null
}

export interface ApiShippingStatus {
  mode: 'disabled' | 'mock' | 'live'
  apiHost: string | null
  credentialsConfigured: boolean
  capabilities: {
    capability: ApiShippingCapability
    liveReady: boolean
    /** Environment variable names still to set. Never values. */
    missing: string[]
  }[]
  token:
    { ok: true; expiresInSeconds: number } | { ok: false; error: string } | null
  shipments: {
    byStatus: Record<string, number>
    failed: number
    awaitingPickup: number
    flaggedUnscanned: number
    lastTrackedAt: string | null
  }
  /** Absent from an API build before integration metrics. */
  calls?: ApiIntegrationCallWindow[]
  lastReconciliation?: ApiReconciliationRun | null
  settings: {
    trackingPollMinutes: number
    unscannedLabelDays: number
    flatRateConfigured: boolean
    defaultServiceCode: string | null
  }
}
