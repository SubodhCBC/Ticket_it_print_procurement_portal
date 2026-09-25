import { getConfig } from '../config'
import type { StructuredAddress } from './carrier.types'
import { pickupStreetGaps, senderGaps } from './nzpost/nzpost.settings'
import { structuredAddressGaps } from './shipping-rules'

/**
 * Builds the body for ParcelLabel's `POST /labels`, following the example in
 * ParcelLabel 2.0.22 (API v3) field for field.
 *
 * Built once, when staff request the label, and stored on the shipment. Every
 * retry and every replay then sends the same bytes — which is what makes it
 * safe to reason about whether a replay could have produced something new.
 *
 * Fields the example shows but the portal has no use for are left out:
 * `logo_id_`, `job_number`, `notification_endpoint` (tracking is polled, and a
 * callback URL would need an inbound route NZ Post can reach) and the paper and
 * label dimensions, which default on NZ Post's side.
 */

export interface LabelParcelInput {
  readonly serviceCode: string
  readonly description: string | null
  readonly weightGrams: number
  readonly lengthMm: number
  readonly widthMm: number
  readonly heightMm: number
}

export interface LabelPayloadInput {
  readonly orderNumber: string
  /** Site code, or a short reference of staff's choosing. */
  readonly secondaryReference: string | null
  readonly receiver: {
    readonly name: string
    readonly phone: string | null
    readonly email: string | null
  }
  readonly delivery: StructuredAddress
  readonly isCollection: boolean
  readonly instructions: string | null
  readonly parcels: readonly LabelParcelInput[]
}

export interface BuiltLabelPayload {
  readonly payload: Record<string, unknown>
  /**
   * What is missing for a real label: sender configuration, or parts of the
   * delivery address. Mock mode fills configuration gaps with placeholders so
   * the flow can be exercised; live mode refuses.
   */
  readonly configurationGaps: readonly string[]
  readonly addressGaps: readonly string[]
}

const PLACEHOLDER = 'NOT CONFIGURED'

export function buildLabelPayload(input: LabelPayloadInput): BuiltLabelPayload {
  const nz = getConfig().nzPost
  const sender = nz.sender
  const pickup = nz.pickupAddress

  const payload: Record<string, unknown> = {
    carrier: 'COURIERPOST',
    format: 'PDF',
    ...(nz.accountNumber ? { account_number: nz.accountNumber } : {}),
    sender_reference_1: input.orderNumber,
    ...(input.secondaryReference
      ? { sender_reference_2: input.secondaryReference.slice(0, 20) }
      : {}),
    sender_details: compact({
      name: sender.name ?? PLACEHOLDER,
      phone: sender.phone ?? PLACEHOLDER,
      email: sender.email ?? PLACEHOLDER,
      company_name: sender.company,
      // The example sends a number; a site code is numeric in every sample.
      site_code: nz.siteCode
        ? /^\d+$/.test(nz.siteCode)
          ? Number(nz.siteCode)
          : nz.siteCode
        : undefined,
    }),
    pickup_address: compact({
      company_name: sender.company,
      building_name: pickup.buildingName,
      unit_type: pickup.unitType,
      unit_value: pickup.unitValue,
      floor: pickup.floor,
      street_number: pickup.streetNumber ?? PLACEHOLDER,
      street: pickup.street ?? PLACEHOLDER,
      suburb: pickup.suburb ?? PLACEHOLDER,
      city: pickup.city ?? PLACEHOLDER,
      country_code: 'NZ',
      postcode: pickup.postcode ?? PLACEHOLDER,
    }),
    receiver_details: compact({
      name: input.receiver.name,
      phone: input.receiver.phone,
      email: input.receiver.email,
    }),
    delivery_address: compact({
      is_collection: input.isCollection,
      company_name: input.delivery.companyName,
      building_name: input.delivery.buildingName,
      unit_type: input.delivery.unitType,
      unit_value: input.delivery.unitValue,
      floor: input.delivery.floor,
      street_number: input.delivery.streetNumber,
      street: input.delivery.street,
      suburb: input.delivery.suburb,
      city: input.delivery.city,
      country_code: input.delivery.countryCode,
      postcode: input.delivery.postcode,
      instructions: input.instructions?.slice(0, 500),
    }),
    parcel_details: input.parcels.map((parcel) =>
      compact({
        service_code: parcel.serviceCode,
        return_indicator: 'OUTBOUND',
        description: parcel.description,
        dimensions: {
          length_cm: mmToCm(parcel.lengthMm),
          width_cm: mmToCm(parcel.widthMm),
          height_cm: mmToCm(parcel.heightMm),
          weight_kg: Math.round(parcel.weightGrams) / 1000,
        },
      })
    ),
  }

  return {
    payload,
    configurationGaps: [...senderGaps(), ...pickupStreetGaps()],
    addressGaps: structuredAddressGaps(input.delivery),
  }
}

/** Drops keys whose value is absent, so the body carries no `null`s NZ Post may reject. */
function compact(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== undefined && value !== null && value !== ''
    )
  )
}

function mmToCm(mm: number): number {
  return Math.round(mm) / 10
}
