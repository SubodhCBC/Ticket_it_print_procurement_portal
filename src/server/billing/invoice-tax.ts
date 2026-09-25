import { Prisma } from '@prisma/client'

/**
 * GST on an invoice (SOW F-06, B-07; M-11 "PDF invoice ... tax summary").
 *
 * ---------------------------------------------------------------------------
 * Per item, then summed
 * ---------------------------------------------------------------------------
 * Tax is worked out on every billed item and rounded there, and the invoice's
 * tax is the sum of those. Taxing the subtotal once would usually land a cent
 * or two away from the sum of the items, and the backing file has to reconcile
 * to the invoice exactly (SOW §10 acceptance: "the backing file reconciles
 * to the consolidated total with no variance"). Each item is rounded once, to
 * the cent, half up.
 *
 * ---------------------------------------------------------------------------
 * Two conventions, chosen per account (A-08)
 * ---------------------------------------------------------------------------
 * Exclusive — the portal's prices do not include GST, and the invoice adds it:
 * a 100.00 line at 15% carries 15.00 and the invoice total is subtotal + tax.
 *
 * Inclusive — the prices already include GST, and the invoice states how much
 * of each is GST: the same 100.00 line contains 13.04, and the invoice total is
 * the subtotal. Nothing is added to what the buyer saw at checkout.
 *
 * ZERO_RATED and EXEMPT items carry no GST under either convention. They are
 * kept apart because they are reported apart on a GST return.
 */

export type TaxTreatmentCode = 'STANDARD' | 'ZERO_RATED' | 'EXEMPT'

export interface TaxBasis {
  /** A percentage: 15 for NZ GST. */
  readonly ratePercent: Prisma.Decimal
  readonly pricesIncludeTax: boolean
}

/** New Zealand's GST, for an account with no settings row yet. */
export const DEFAULT_TAX_BASIS: TaxBasis = {
  ratePercent: new Prisma.Decimal(15),
  pricesIncludeTax: false,
}

export function taxOn(
  value: Prisma.Decimal,
  treatment: string,
  basis: TaxBasis
): Prisma.Decimal {
  if (treatment !== 'STANDARD' || basis.ratePercent.isZero()) {
    return new Prisma.Decimal(0)
  }

  const tax = basis.pricesIncludeTax
    ? value.times(basis.ratePercent).dividedBy(basis.ratePercent.plus(100))
    : value.times(basis.ratePercent).dividedBy(100)

  return tax.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP)
}

/** What is payable: the subtotal, plus the tax unless it is already in it. */
export function totalWithTax(
  subtotal: Prisma.Decimal,
  tax: Prisma.Decimal,
  basis: TaxBasis
): Prisma.Decimal {
  return basis.pricesIncludeTax ? subtotal : subtotal.plus(tax)
}
