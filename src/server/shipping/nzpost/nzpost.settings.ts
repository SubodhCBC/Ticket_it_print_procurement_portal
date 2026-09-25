import { getConfig } from '../../config'

/**
 * Which NZ Post calls this deployment can make, and what is missing for the
 * ones it cannot.
 *
 * Capabilities rather than one on/off switch because the credentials arrive in
 * pieces. On 2026-09-10 the application had ParcelLabel, ParcelPickUp and
 * Collection and Drop Off approved and three others pending, and the base URL
 * and the account's sender details were not yet known. Each of those gaps
 * disables exactly the calls that depend on it.
 */

export type ShippingCapability =
  'address' | 'rates' | 'collection' | 'label' | 'pickup' | 'tracking'

export const SHIPPING_CAPABILITIES: readonly ShippingCapability[] = [
  'address',
  'rates',
  'collection',
  'label',
  'pickup',
  'tracking',
]

export type ShippingMode = 'disabled' | 'mock' | 'live'

export function shippingMode(): ShippingMode {
  return getConfig().nzPost.mode
}

export function isShippingEnabled(): boolean {
  return shippingMode() !== 'disabled'
}

/**
 * Environment variables a live call for this capability still needs. Empty
 * means it can be made. Mock mode needs nothing, so this is only meaningful in
 * live mode — but it is computed either way so the status endpoint can show an
 * operator what going live will take.
 */
export function liveConfigurationGaps(
  capability: ShippingCapability
): string[] {
  const nz = getConfig().nzPost
  const gaps: string[] = []

  if (!nz.clientId) gaps.push('NZPOST_CLIENT_ID')
  if (!nz.clientSecret) gaps.push('NZPOST_CLIENT_SECRET')
  if (!nz.apiBaseUrl) gaps.push('NZPOST_API_BASE_URL')

  if (capability === 'rates') {
    const pickup = nz.pickupAddress
    const hasSuburbTriple = pickup.suburb && pickup.city && pickup.postcode
    if (!nz.siteCode && !hasSuburbTriple) {
      gaps.push(
        'NZPOST_SITE_CODE (or NZPOST_PICKUP_SUBURB, NZPOST_PICKUP_CITY and NZPOST_PICKUP_POSTCODE)'
      )
    }
  }

  if (capability === 'label' || capability === 'pickup') {
    gaps.push(...senderGaps())
    if (capability === 'label') gaps.push(...pickupStreetGaps())
    if (capability === 'pickup' && !nz.siteCode)
      gaps.push(...pickupStreetGaps())
  }

  return gaps
}

/** Sender contact fields a label or a pickup booking carries. */
export function senderGaps(): string[] {
  const sender = getConfig().nzPost.sender
  return [
    sender.name ? null : 'NZPOST_SENDER_NAME',
    sender.phone ? null : 'NZPOST_SENDER_PHONE',
    sender.email ? null : 'NZPOST_SENDER_EMAIL',
  ].filter((name): name is string => name !== null)
}

/** The ship-from street address, which ParcelLabel wants in parts. */
export function pickupStreetGaps(): string[] {
  const pickup = getConfig().nzPost.pickupAddress
  return [
    pickup.streetNumber ? null : 'NZPOST_PICKUP_STREET_NUMBER',
    pickup.street ? null : 'NZPOST_PICKUP_STREET',
    pickup.suburb ? null : 'NZPOST_PICKUP_SUBURB',
    pickup.city ? null : 'NZPOST_PICKUP_CITY',
    pickup.postcode ? null : 'NZPOST_PICKUP_POSTCODE',
  ].filter((name): name is string => name !== null)
}
