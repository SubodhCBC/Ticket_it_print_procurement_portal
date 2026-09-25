import { DependencyUnavailableError } from '../utils/errors'
import type { Carrier } from './carrier.types'
import { instrumented } from './integration-calls'
import { mockCarrier } from './mock/mock.carrier'
import { nzPostCarrier } from './nzpost/nzpost.carrier'
import { NzPostNotConfiguredError } from './nzpost/nzpost.errors'
import {
  liveConfigurationGaps,
  shippingMode,
  type ShippingCapability,
} from './nzpost/nzpost.settings'

// Wrapped once, so every call through either carrier is timed and recorded for
// integration health — see integration-calls.ts.
const MOCK = instrumented(mockCarrier)
const LIVE = instrumented(nzPostCarrier)

/**
 * The carrier to use for one capability, or a refusal saying why there is none.
 *
 * Checked per capability rather than once, so a deployment with a base URL but
 * no ParcelTrack path can still take labels. The missing variable names are
 * logged by `toAppError`; the response only says the service is unavailable.
 */
export function carrierFor(capability: ShippingCapability): Carrier {
  const mode = shippingMode()

  if (mode === 'disabled') {
    throw new DependencyUnavailableError('NZ Post shipping', {
      details: { reason: 'Shipping is switched off for this portal.' },
    })
  }
  if (mode === 'mock') return MOCK

  const gaps = liveConfigurationGaps(capability)
  if (gaps.length > 0) throw new NzPostNotConfiguredError(capability, gaps)
  return LIVE
}
