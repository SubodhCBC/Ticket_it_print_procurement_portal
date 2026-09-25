import { apiClient } from '@/services/api.service'
import type { ApiOffsetPage } from './catalog.types'
import type {
  ApiLabelLink,
  ApiOrderTracking,
  ApiPickup,
  ApiPickupsOverview,
  ApiQueuedShipment,
  ApiShipment,
  ApiShipmentStatus,
  ApiShippingStatus,
  ApiTrackingRun,
  BookPickupInput,
  CreateShipmentInput,
} from './shipping.types'

/**
 * NZ Post fulfilment, served by `/orders/:orderId/shipments`,
 * `/orders/:orderId/tracking` and `/shipping/*`.
 *
 * The staff half of the integration: the label made for a packed order, the
 * courier pickup that collects it, and the tracking that follows. Everything
 * here needs ORDER_MANAGE except tracking, which anyone who may see the order
 * can read, and the integration status, which needs INTEGRATION_MANAGE.
 *
 * Labels are made in the background. Creating one answers with the shipment
 * PENDING; it becomes LABELLED, or FAILED with the reason, a few seconds later,
 * so a screen polls `listOrderShipments` until it settles.
 */

const orderPath = (orderId: string) => `/orders/${encodeURIComponent(orderId)}`
const shipmentPath = (orderId: string, shipmentId: string) =>
  `${orderPath(orderId)}/shipments/${encodeURIComponent(shipmentId)}`

// --- Labels --------------------------------------------------------------------

/** Every label made for the order, voided and failed ones included, oldest first. */
export async function listOrderShipments(
  orderId: string
): Promise<ApiShipment[]> {
  const result: { items: ApiShipment[] } = await apiClient.get(
    `${orderPath(orderId)}/shipments`
  )
  return result.items
}

/**
 * Requests a label. The order must be PROCESSING and have no live label.
 * Blank optional fields are left out rather than sent empty.
 */
export async function createShipment(
  orderId: string,
  input: CreateShipmentInput
): Promise<ApiShipment> {
  const body: CreateShipmentInput = {
    parcels: input.parcels.map((parcel) => ({
      weightKg: parcel.weightKg,
      lengthCm: parcel.lengthCm,
      widthCm: parcel.widthCm,
      heightCm: parcel.heightCm,
      ...(parcel.description?.trim()
        ? { description: parcel.description.trim() }
        : {}),
    })),
    ...(input.serviceCode?.trim()
      ? { serviceCode: input.serviceCode.trim() }
      : {}),
    ...(input.deliveryAddress
      ? { deliveryAddress: input.deliveryAddress }
      : {}),
    ...(input.instructions?.trim()
      ? { instructions: input.instructions.trim() }
      : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  }
  return apiClient.post(`${orderPath(orderId)}/shipments`, body)
}

/** A short-lived link to the label PDF. Refused with 422 until `labelReady`. */
export async function getLabelLink(
  orderId: string,
  shipmentId: string
): Promise<ApiLabelLink> {
  return apiClient.get(`${shipmentPath(orderId, shipmentId)}/label`)
}

/** Withdraws a label in the portal. Refused once the order dispatched on it. */
export async function voidShipment(
  orderId: string,
  shipmentId: string,
  reason: string
): Promise<ApiShipment> {
  return apiClient.post(`${shipmentPath(orderId, shipmentId)}/void`, {
    reason,
  })
}

/** Replays a FAILED label request while the order is still in production. */
export async function retryShipment(
  orderId: string,
  shipmentId: string
): Promise<ApiShipment> {
  return apiClient.post(`${shipmentPath(orderId, shipmentId)}/retry`)
}

// --- Tracking ------------------------------------------------------------------

/** What the portal holds from NZ Post, newest event first. Never waits on NZ Post. */
export async function getOrderTracking(
  orderId: string
): Promise<ApiOrderTracking> {
  return apiClient.get(`${orderPath(orderId)}/tracking`)
}

/** Polls NZ Post for this order now and waits for the answer. */
export async function refreshOrderTracking(
  orderId: string
): Promise<ApiTrackingRun> {
  return apiClient.post(`${orderPath(orderId)}/tracking/refresh`)
}

// --- Fulfilment queue and pickups ----------------------------------------------

export interface ShipmentQueueParams {
  status?: ApiShipmentStatus
  /** Labelled, not voided, not yet on a pickup. */
  awaitingPickup?: boolean
  /** Labelled and never scanned by NZ Post in time. */
  flagged?: boolean
  page?: number
  pageSize?: number
}

export async function listShipmentQueue(
  params: ShipmentQueueParams = {}
): Promise<ApiOffsetPage<ApiQueuedShipment>> {
  return apiClient.get('/shipping/shipments', {
    params: {
      ...(params.status ? { status: params.status } : {}),
      ...(params.awaitingPickup ? { awaitingPickup: true } : {}),
      ...(params.flagged ? { flagged: true } : {}),
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 25,
    },
  })
}

export async function listPickups(
  page = 1,
  pageSize = 25
): Promise<ApiPickupsOverview> {
  return apiClient.get('/shipping/pickups', { params: { page, pageSize } })
}

/**
 * Books a courier. Not retried by the server — a courier booked twice comes
 * twice — so a screen sends an idempotency key and reuses it on a retry.
 */
export async function bookPickup(input: BookPickupInput): Promise<ApiPickup> {
  return apiClient.post('/shipping/pickups', {
    pickupAt: input.pickupAt,
    ...(input.shipmentIds?.length ? { shipmentIds: input.shipmentIds } : {}),
    ...(input.instructions?.trim()
      ? { instructions: input.instructions.trim() }
      : {}),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
  })
}

// --- Integration -----------------------------------------------------------------

/** Mode, what is configured, and label counts. `probe` also proves the credentials. */
export async function getShippingStatus(
  probe = false
): Promise<ApiShippingStatus> {
  return apiClient.get('/shipping/status', {
    params: probe ? { probe: true } : {},
  })
}
