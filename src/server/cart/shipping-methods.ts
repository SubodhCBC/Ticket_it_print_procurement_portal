/**
 * How an order travels to the branch, and what that adds to it.
 *
 * A fixed list rather than a table. There are two services, their prices are
 * set by the operator's courier contract rather than by any customer's, and a
 * table with an admin screen in front of it would be machinery for a number
 * that changes once a year. When it does change, it changes here and in the
 * CHECK constraint on `carts.shippingMethod` and `orders.shippingMethod`, which
 * name the same codes.
 *
 * The charge is per order, not per line: one parcel leaves for one address
 * however many designs are in it.
 *
 * Money is in integer cents, as everywhere the server does arithmetic on it.
 */
export const SHIPPING_METHODS = [
  {
    code: 'COURIERPOST_EXPRESS',
    label: 'CourierPost Express',
    eta: 'Next Day',
    priceCents: 1250,
  },
  {
    code: 'STANDARD_PARCEL',
    label: 'Standard Parcel',
    eta: '2-3 Days',
    priceCents: 650,
  },
] as const

export type ShippingMethod = (typeof SHIPPING_METHODS)[number]
export type ShippingMethodCode = ShippingMethod['code']

export const SHIPPING_METHOD_CODES = SHIPPING_METHODS.map(
  (method) => method.code
) as [ShippingMethodCode, ...ShippingMethodCode[]]

export function findShippingMethod(
  code: string | null | undefined
): ShippingMethod | null {
  return SHIPPING_METHODS.find((method) => method.code === code) ?? null
}

/**
 * What delivery adds to a basket.
 *
 * Nothing until a method is chosen, and nothing for an empty basket: the cart
 * page shows the goods before the buyer has reached the delivery step, and a
 * charge for a parcel nobody has asked for yet would be a number they cannot
 * explain.
 */
export function shippingCostCents(
  code: string | null | undefined,
  hasLines: boolean
): number {
  if (!hasLines) return 0
  return findShippingMethod(code)?.priceCents ?? 0
}
