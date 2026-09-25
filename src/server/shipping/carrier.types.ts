/**
 * What the portal needs from a carrier, in the portal's own words.
 *
 * Two implementations: `nzpost/nzpost.carrier.ts`, which calls NZ Post, and
 * `mock/mock.carrier.ts`, which answers from fixtures. Nothing outside
 * `shipping/` sees an NZ Post field name — the services work in these shapes,
 * and the live adapter is the one place that knows `street_number` from
 * `streetNumber`.
 *
 * Money is a string with two decimals, for the reason it is everywhere else in
 * this codebase: a JSON number is rounded by whoever parses it.
 */

/** One row of the address type-ahead. */
export interface AddressSuggestion {
  readonly addressId: string
  readonly dpid: string | null
  readonly fullAddress: string
}

/** A validated New Zealand delivery address, split the way a label wants it. */
export interface ValidatedAddress {
  readonly addressId: string
  readonly dpid: string | null
  readonly streetNumber: string
  /** Street name including its type — "Victoria Avenue", not "Victoria". */
  readonly street: string
  readonly suburb: string | null
  readonly city: string
  readonly postcode: string
  readonly countryCode: 'NZ'
  readonly isRural: boolean
  readonly latitude: number | null
  readonly longitude: number | null
  readonly fullAddress: string
}

/**
 * The structured delivery address stored on a selection and sent on a label.
 * JSON-serialised into `deliveryAddress` columns.
 */
export interface StructuredAddress {
  readonly companyName?: string | null
  readonly buildingName?: string | null
  readonly unitType?: string | null
  readonly unitValue?: string | null
  readonly floor?: string | null
  readonly streetNumber: string
  readonly street: string
  readonly suburb: string | null
  readonly city: string
  readonly postcode: string
  readonly countryCode: 'NZ'
}

/** Where the courier collects from, in whichever form the account has. */
export interface PickupReference {
  readonly siteCode?: string
  readonly suburb?: string
  readonly city?: string
  readonly postcode?: string
}

export interface RateQuery {
  readonly pickup: PickupReference
  readonly deliveryAddressId: string
  readonly weightKg: number
  readonly lengthCm: number
  readonly widthCm: number
  readonly heightCm: number
}

export interface RateAddon {
  readonly code: string
  readonly description: string
  readonly priceExclGst: string
  readonly priceInclGst: string
}

export interface RateOption {
  readonly carrier: string
  readonly serviceCode: string
  readonly description: string
  readonly priceExclGst: string
  readonly priceInclGst: string
  /** Addons NZ Post says are mandatory for this address — rural delivery, say. */
  readonly mandatoryAddons: readonly RateAddon[]
  /** The service plus its mandatory addons. What the quote is recorded as. */
  readonly totalExclGst: string
  readonly totalInclGst: string
  readonly trackingIncluded: boolean
  readonly signatureIncluded: boolean
}

export interface CollectionPointHours {
  readonly day: number
  readonly open?: string
  readonly close?: string
  readonly closed?: boolean
}

/** A parcel collection location a buyer can collect from instead. */
export interface CollectionPoint {
  readonly id: string
  readonly name: string
  readonly fullAddress: string
  readonly addressLine1: string
  readonly suburb: string | null
  readonly city: string | null
  readonly postcode: string | null
  readonly phone: string | null
  readonly partner: string | null
  readonly distanceMetres: number | null
  readonly latitude: number | null
  readonly longitude: number | null
  readonly hours: readonly CollectionPointHours[]
}

/** `POST /labels` accepted the request. */
export interface LabelSubmission {
  readonly consignmentId: string
  readonly messageId: string | null
}

export interface LabelPart {
  readonly labelId: string
  readonly trackingReference: string | null
  readonly status: string | null
  readonly errors: readonly string[]
}

export interface LabelStatus {
  readonly consignmentId: string
  readonly status: string | null
  readonly complete: boolean
  readonly failed: boolean
  readonly expiresAt: Date | null
  readonly labels: readonly LabelPart[]
  readonly errors: readonly string[]
}

export interface PickupResult {
  readonly jobId: string | null
  readonly jobNumber: string | null
  readonly responseType: string | null
  readonly rejectCode: string | null
  readonly messageId: string | null
}

export interface TrackingEventData {
  readonly occurredAt: Date
  readonly status: string | null
  readonly description: string | null
  readonly edifactCode: string | null
  readonly depotName: string | null
  readonly signedByName: string | null
  /** NZ Post's own event sequence reference, when it sends one. */
  readonly seqRef: string | null
}

export interface TrackingResult {
  readonly trackingReference: string
  readonly events: readonly TrackingEventData[]
  /** Set when NZ Post answered for this reference with an error instead. */
  readonly error: string | null
}

export interface Carrier {
  readonly kind: 'nzpost' | 'mock'
  searchAddresses(
    query: string,
    count: number
  ): Promise<readonly AddressSuggestion[]>
  getAddress(addressId: string): Promise<ValidatedAddress>
  quoteDomestic(query: RateQuery): Promise<readonly RateOption[]>
  collectionPoints(
    addressId: string,
    count: number
  ): Promise<readonly CollectionPoint[]>
  submitLabel(payload: Record<string, unknown>): Promise<LabelSubmission>
  labelStatus(consignmentId: string): Promise<LabelStatus>
  downloadLabel(consignmentId: string): Promise<Buffer>
  bookPickup(payload: Record<string, unknown>): Promise<PickupResult>
  track(
    trackingReferences: readonly string[]
  ): Promise<readonly TrackingResult[]>
}
