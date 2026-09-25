import type { ValidatedAddress } from '../shipping/carrier.types'

/**
 * What NZ Post's ParcelAddress resolved an address to, as the columns an
 * `addresses` row keeps (SOW F-16: "held against the site and defaulted at
 * checkout; validated through NZ Post ParcelAddress with DPID resolution and
 * rural-delivery flagging").
 *
 * The street, suburb, city and postcode are NZ Post's, not what was typed:
 * validating an address and then keeping the typed lines would leave a row
 * whose DPID names one place and whose text names another — the disagreement
 * this exists to remove. A typed second line is kept in front of the suburb,
 * because a unit or floor is where it goes and ParcelAddress does not carry it.
 */
export function nzPostAddressColumns(
  verified: ValidatedAddress,
  typedLine2?: string | null
) {
  return {
    line1: `${verified.streetNumber} ${verified.street}`.trim(),
    line2:
      [typedLine2, verified.suburb]
        .filter((part): part is string => Boolean(part?.trim()))
        .join(', ') || null,
    city: verified.city,
    postcode: verified.postcode,
    country: verified.countryCode,
    nzPostAddressId: verified.addressId,
    dpid: verified.dpid,
    isRural: verified.isRural,
    nzPostValidatedAt: new Date(),
  }
}
