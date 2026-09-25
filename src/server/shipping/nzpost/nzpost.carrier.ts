import type {
  AddressSuggestion,
  Carrier,
  CollectionPoint,
  CollectionPointHours,
  LabelPart,
  LabelStatus,
  LabelSubmission,
  PickupResult,
  RateAddon,
  RateOption,
  RateQuery,
  TrackingEventData,
  TrackingResult,
  ValidatedAddress,
} from '../carrier.types'
import { NzPostApiError } from './nzpost.errors'
import { nzPostBinary, nzPostJson } from './nzpost.http'

/**
 * The live NZ Post adapter.
 *
 * ---------------------------------------------------------------------------
 * What the shapes here are based on
 * ---------------------------------------------------------------------------
 * The response examples in the specs downloaded from the NZ Post developer
 * portal on 2026-09-10 (`docs/*.zip`): ParcelAddress 1.0.11, ShippingOptions
 * 1.0.11, ParcelLabel 2.0.22 (API v3), ParcelPickUp 3.0.9, ParcelTrack 2.0.9 and
 * Collection Address 1.0.6. The specs type very little — most responses are an
 * example and no schema — so every field is read defensively and a missing one
 * becomes null rather than a crash.
 *
 * Paths and hosts were then checked against NZ Post's documentation pages on
 * 2026-09-11: UAT is `https://api.uat.nzpost.co.nz`, ParcelTrack is
 * `/parceltrack/3.0` with the reference in the path, and ParcelPickUp is
 * `/parcelpickup/v3/bookings`.
 *
 * None of this has been exercised against a live response yet. The first live
 * call of each kind should be watched.
 */
export const nzPostCarrier: Carrier = {
  kind: 'nzpost',

  async searchAddresses(query, count) {
    const body = await nzPostJson<unknown>({
      api: 'parcelAddress',
      path: '/domestic/addresses',
      query: { q: query, count },
      operation: 'ParcelAddress search',
      retry: 'interactive',
    })

    return arrayAt(body, 'addresses')
      .map((row): AddressSuggestion => ({
        addressId: str(row.address_id) ?? '',
        dpid: str(row.dpid),
        fullAddress: str(row.full_address) ?? '',
      }))
      .filter((row) => row.addressId.length > 0)
  },

  async getAddress(addressId) {
    const body = await nzPostJson<unknown>({
      api: 'parcelAddress',
      path: `/domestic/addresses/${encodeURIComponent(addressId)}`,
      operation: 'ParcelAddress details',
      retry: 'interactive',
    })

    const address = recordAt(body, 'address')
    if (!address) throw malformed('ParcelAddress details', 'no address')
    return toValidatedAddress(address, addressId)
  },

  async quoteDomestic(query: RateQuery) {
    const body = await nzPostJson<unknown>({
      api: 'shippingOptions',
      path: '/domestic',
      query: {
        ...(query.pickup.siteCode
          ? { pickup_site_code: query.pickup.siteCode }
          : {
              pickup_suburb: query.pickup.suburb,
              pickup_city: query.pickup.city,
              pickup_postcode: query.pickup.postcode,
            }),
        delivery_address_id: query.deliveryAddressId,
        // Kilograms as a string; centimetres as integers, rounded up so a box
        // is never quoted smaller than it is.
        weight: query.weightKg.toFixed(3),
        length: Math.ceil(query.lengthCm),
        width: Math.ceil(query.widthCm),
        height: Math.ceil(query.heightCm),
      },
      operation: 'ShippingOptions domestic',
      retry: 'interactive',
    })

    return arrayAt(body, 'services').map(toRateOption)
  },

  async collectionPoints(addressId, count) {
    const body = await nzPostJson<unknown>({
      api: 'collectionAddress',
      path: `/addresses/${encodeURIComponent(addressId)}`,
      query: { count },
      operation: 'Collection Address',
      retry: 'interactive',
    })

    const address = recordAt(body, 'address')
    const locations =
      address && Array.isArray(address.pcd_locations)
        ? address.pcd_locations.filter(isRecord)
        : []
    return locations.map(toCollectionPoint)
  },

  async submitLabel(payload) {
    const body = await nzPostJson<unknown>({
      api: 'parcelLabel',
      path: '/labels',
      method: 'POST',
      body: payload,
      operation: 'ParcelLabel request',
    })

    const record = isRecord(body) ? body : {}
    const consignmentId = str(record.consignment_id)
    if (!consignmentId) {
      throw malformed('ParcelLabel request', 'no consignment_id')
    }
    return {
      consignmentId,
      messageId: str(record.message_id),
    } satisfies LabelSubmission
  },

  async labelStatus(consignmentId) {
    const body = await nzPostJson<unknown>({
      api: 'parcelLabel',
      path: `/labels/${encodeURIComponent(consignmentId)}/status`,
      operation: 'ParcelLabel status',
      retry: 'interactive',
    })

    const record = isRecord(body) ? body : {}
    const status = str(record.consignment_status)
    const labels = (Array.isArray(record.labels) ? record.labels : [])
      .filter(isRecord)
      .map((label): LabelPart => ({
        labelId: str(label.label_id) ?? '',
        trackingReference: str(label.tracking_reference),
        status: str(label.label_generation_status),
        errors: errorStrings(label.errors),
      }))
    const errors = errorStrings(record.errors)
    const isComplete = (value: string | null) =>
      value !== null && value.toLowerCase() === 'complete'
    const isFailed = (value: string | null) =>
      value !== null && /fail|error|reject/i.test(value)

    return {
      consignmentId: str(record.consignment_id) ?? consignmentId,
      status,
      complete:
        isComplete(status) &&
        labels.length > 0 &&
        labels.every(
          (label) => isComplete(label.status) || label.status === null
        ),
      failed:
        isFailed(status) ||
        labels.some((label) => isFailed(label.status)) ||
        (errors.length > 0 && !isComplete(status)),
      expiresAt: date(record.expiry_date_utc),
      labels,
      errors,
    } satisfies LabelStatus
  },

  async downloadLabel(consignmentId) {
    const { body } = await nzPostBinary(
      {
        api: 'parcelLabel',
        path: `/labels/${encodeURIComponent(consignmentId)}`,
        query: { format: 'PDF' },
        operation: 'ParcelLabel download',
        retry: 'interactive',
      },
      'application/pdf'
    )
    return body
  },

  async bookPickup(payload) {
    const body = await nzPostJson<unknown>({
      api: 'parcelPickup',
      path: '/bookings',
      method: 'POST',
      body: payload,
      operation: 'ParcelPickUp booking',
    })

    const record = isRecord(body) ? body : {}
    const results = isRecord(record.results) ? record.results : {}
    return {
      jobId: str(results.job_id),
      jobNumber: str(results.job_number),
      responseType: str(results.response_type),
      rejectCode: str(results.reject_code),
      messageId: str(record.message_id),
    } satisfies PickupResult
  },

  /**
   * ParcelTrack 3.0, as NZ Post's "Track a Parcel" page documents it:
   * `GET /parceltrack/3.0/parcels/{tracking_reference}`, one reference per call
   * as a path segment. The downloaded 2.0.9 spec described a query string taking
   * up to ten references; the current documentation does not, so this follows
   * the documentation.
   *
   * The response is read from a `results` list when there is one (the 2.0.9
   * example's envelope) and from the body itself otherwise. A 404 is a reference
   * NZ Post has no scans for yet, not a failure of the batch.
   */
  async track(trackingReferences) {
    const results: TrackingResult[] = []

    for (const reference of trackingReferences) {
      try {
        const body = await nzPostJson<unknown>({
          api: 'parcelTrack',
          path: `/parcels/${encodeURIComponent(reference)}`,
          operation: 'ParcelTrack',
          retry: 'interactive',
        })

        const rows = arrayAt(body, 'results')
        const row =
          rows.find(
            (candidate) => str(candidate.tracking_reference) === reference
          ) ??
          rows[0] ??
          (isRecord(body) ? body : {})
        results.push(toTrackingResult(row, reference))
      } catch (error) {
        if (error instanceof NzPostApiError && error.status === 404) {
          results.push({
            trackingReference: reference,
            events: [],
            error: error.detail,
          })
          continue
        }
        throw error
      }
    }

    return results
  },
}

function toTrackingResult(
  result: Record<string, unknown>,
  requestedReference: string
): TrackingResult {
  return {
    trackingReference: str(result.tracking_reference) ?? requestedReference,
    events: (Array.isArray(result.tracking_events)
      ? result.tracking_events
      : []
    )
      .filter(isRecord)
      .map(toTrackingEvent)
      .filter((event): event is TrackingEventData => event !== null),
    error: errorStrings(result.errors)[0] ?? null,
  }
}

// --- Mapping ----------------------------------------------------------------

function toValidatedAddress(
  address: Record<string, unknown>,
  requestedId: string
): ValidatedAddress {
  const streetNumber = [str(address.street_number), str(address.street_alpha)]
    .filter(Boolean)
    .join('')
  const street = [str(address.street), str(address.street_type)]
    .filter(Boolean)
    .join(' ')
  const suburb = str(address.suburb)
  const city = str(address.city) ?? ''
  const postcode = str(address.postcode) ?? ''

  return {
    addressId: str(address.address_id) ?? requestedId,
    dpid: str(address.dpid),
    streetNumber,
    street,
    suburb,
    city,
    postcode,
    countryCode: 'NZ',
    isRural: address.is_rural_delivery === true,
    latitude: num(address.latitude),
    longitude: num(address.longitude),
    fullAddress:
      str(address.full_address) ??
      [
        [streetNumber, street].filter(Boolean).join(' '),
        suburb,
        [city, postcode].filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join(', '),
  }
}

function toRateOption(service: Record<string, unknown>): RateOption {
  const mandatoryAddons: RateAddon[] = (
    Array.isArray(service.addons) ? service.addons : []
  )
    .filter(isRecord)
    .filter((addon) => addon.mandatory === true)
    .map((addon) => ({
      code: str(addon.addon_code) ?? '',
      description: str(addon.description) ?? '',
      priceExclGst: money(addon.price_excluding_gst),
      priceInclGst: money(addon.price_including_gst),
    }))

  const priceExclGst = money(service.price_excluding_gst)
  const priceInclGst = money(service.price_including_gst)
  const sum = (base: string, key: 'priceExclGst' | 'priceInclGst') =>
    (
      mandatoryAddons.reduce(
        (total, addon) => total + Math.round(Number(addon[key]) * 100),
        Math.round(Number(base) * 100)
      ) / 100
    ).toFixed(2)

  return {
    carrier: str(service.carrier) ?? 'CourierPost',
    serviceCode: str(service.service_code) ?? '',
    description: str(service.description) ?? '',
    priceExclGst,
    priceInclGst,
    mandatoryAddons,
    totalExclGst: sum(priceExclGst, 'priceExclGst'),
    totalInclGst: sum(priceInclGst, 'priceInclGst'),
    trackingIncluded: service.tracking_included === true,
    signatureIncluded: service.signature_included === true,
  }
}

function toCollectionPoint(location: Record<string, unknown>): CollectionPoint {
  const details = isRecord(location.address_details)
    ? location.address_details
    : {}
  return {
    id: str(location.id) ?? '',
    name:
      str(location.company_name) ?? str(location.type) ?? 'Collection point',
    fullAddress:
      str(location.full_address) ?? str(details.address_line_1) ?? '',
    addressLine1: str(details.address_line_1) ?? '',
    suburb: str(details.suburb),
    city: str(details.city),
    postcode: str(details.post_code),
    phone: str(location.phone),
    partner: str(location.partner),
    distanceMetres: num(location.distance_in_m),
    latitude: num(location.lat),
    longitude: num(location.lng),
    hours: (Array.isArray(location.hours) ? location.hours : [])
      .filter(isRecord)
      .map((hour): CollectionPointHours => ({
        day: num(hour.day) ?? 0,
        ...(str(hour.open) ? { open: str(hour.open) as string } : {}),
        ...(str(hour.close) ? { close: str(hour.close) as string } : {}),
        ...(hour.closed === true ? { closed: true } : {}),
      })),
  }
}

function toTrackingEvent(
  event: Record<string, unknown>
): TrackingEventData | null {
  const occurredAt = date(event.date_time)
  if (!occurredAt) return null
  const signedBy = isRecord(event.signed_by) ? event.signed_by : {}
  return {
    occurredAt,
    status: str(event.status),
    description: str(event.description),
    edifactCode: str(event.edifact_code),
    depotName: str(event.depot_name),
    // The signature image in `signed_by.signature` is deliberately dropped: it
    // is a biometric of a member of the public and the order needs only a name.
    signedByName: str(signedBy.name),
    seqRef: str(event.seqref),
  }
}

// --- Reading loosely-typed JSON ----------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordAt(body: unknown, key: string): Record<string, unknown> | null {
  return isRecord(body) && isRecord(body[key])
    ? (body[key] as Record<string, unknown>)
    : null
}

function arrayAt(body: unknown, key: string): Record<string, unknown>[] {
  if (!isRecord(body)) return []
  const value = body[key]
  return Array.isArray(value) ? value.filter(isRecord) : []
}

function str(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function num(value: unknown): number | null {
  const parsed = typeof value === 'string' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

function money(value: unknown): string {
  const parsed = num(value)
  return (parsed === null ? 0 : Math.round(parsed * 100) / 100).toFixed(2)
}

function date(value: unknown): Date | null {
  if (typeof value !== 'string' || !value) return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function errorStrings(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((error) => {
      if (typeof error === 'string') return error
      if (!isRecord(error)) return null
      return (
        [str(error.message), str(error.details)].filter(Boolean).join(': ') ||
        null
      )
    })
    .filter((text): text is string => text !== null)
}

function malformed(operation: string, what: string): NzPostApiError {
  return new NzPostApiError(
    502,
    [{ code: null, message: `Unexpected response: ${what}`, details: null }],
    null,
    operation
  )
}
