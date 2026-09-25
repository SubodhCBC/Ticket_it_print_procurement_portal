import { apiClient } from '@/services/api.service'
import type {
  ApiAddressSuggestion,
  ApiCart,
  ApiCartShipping,
  ApiCartValidation,
  ApiCollectionPoint,
  ApiOneOffDeliveryAddressInput,
  ApiPaymentMethod,
  ApiShippingMethod,
  ApiShippingRates,
} from './cart.types'
import type { CorporatePaymentMethod } from '@/types'

/**
 * The server-side basket, served by `/cart`.
 *
 * There was no mock adapter for this: the cart lived entirely in a Redux slice,
 * so a basket vanished on refresh and its prices, stock and budget were whatever
 * the browser said they were. Every one of those is now the server's answer.
 *
 * Two conventions carried from the API and worth keeping in mind here:
 *
 *  - **Every mutation returns the whole basket.** Adding, changing and removing
 *    a line all answer with the new cart, so the client re-renders from one
 *    response instead of patching its own copy and hoping it matches.
 *  - **A bare read carries no prices.** `validate()` is what prices a basket,
 *    because a rate card can change between adding a line and paying for it.
 */

const CART = '/cart'

/**
 * Which branch's basket. A head-office buyer keeps one per branch they order
 * for; a site user is pinned to their own whatever they ask for, so passing it
 * is harmless and omitting it is correct for them.
 */
function siteParams(siteId?: string): Record<string, unknown> {
  return siteId ? { siteId } : {}
}

export async function addLine(
  input: {
    productId: string
    quantity: number
    variantId?: string | null
    /**
     * The artwork the buyer personalised, and the exact version they saw.
     *
     * Both or neither — the API refuses one without the other, because a
     * template id alone does not say which artwork the values belong to. Get
     * the version from `POST /templates/:id/customise`, which is the same call
     * that checks the values; sending a version the buyer chose themselves is
     * refused server-side.
     */
    templateId?: string | null
    templateVersionId?: string | null
    customisation?: Record<string, unknown> | null
    notes?: string | null
  },
  siteId?: string
): Promise<ApiCart> {
  return apiClient.post(
    `${CART}/lines`,
    {
      productId: input.productId,
      quantity: input.quantity,
      ...(input.variantId ? { variantId: input.variantId } : {}),
      ...(input.templateId && input.templateVersionId
        ? {
            templateId: input.templateId,
            templateVersionId: input.templateVersionId,
          }
        : {}),
      ...(input.customisation ? { customisation: input.customisation } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    },
    { params: siteParams(siteId) }
  )
}

export async function updateLine(
  lineId: string,
  input: {
    quantity?: number
    /** A different stock or finish of the same product. */
    variantId?: string
    /**
     * Only when the buyer re-personalises against a different version. Omit
     * both and the line keeps the artwork it already names — the server takes
     * it from the row rather than the request, so stripping them cannot turn a
     * checked personalisation back into a free-form bag of values.
     */
    templateId?: string | null
    templateVersionId?: string | null
    customisation?: Record<string, unknown> | null
    notes?: string | null
  }
): Promise<ApiCart> {
  return apiClient.patch(`${CART}/lines/${encodeURIComponent(lineId)}`, input)
}

export async function removeLine(lineId: string): Promise<ApiCart> {
  return apiClient.delete(`${CART}/lines/${encodeURIComponent(lineId)}`)
}

export async function clearCart(siteId?: string): Promise<ApiCart> {
  return apiClient.delete(CART, { params: siteParams(siteId) })
}

/**
 * Rounds every line up to a quantity its product can actually be ordered in.
 *
 * The explicit half of the API's "report, don't apply" rule: validation tells
 * the buyer their 400 will be ordered as 500, and this is them accepting it.
 * Nothing rounds silently.
 */
export async function normalise(siteId?: string): Promise<ApiCart> {
  return apiClient.post(`${CART}/normalise`, undefined, {
    params: siteParams(siteId),
  })
}

export async function setCheckoutDetails(
  input: {
    siteId?: string | null
    poNumber?: string | null
    campaignCode?: string | null
    customerReference?: string | null
    notes?: string | null
    requestedDeliveryDate?: string | null
    shippingAddressId?: string | null
    billingAddressId?: string | null
    paymentMethod?: ApiPaymentMethod | null
    /** How the parcel travels; see `ApiCartValidation.shippingOptions`. */
    shippingMethod?: ApiShippingMethod | null
    acceptTerms?: boolean
  },
  siteId?: string
): Promise<ApiCart> {
  return apiClient.patch(`${CART}/checkout-details`, input, {
    params: siteParams(siteId),
  })
}

/**
 * Ships the basket to a one-off address typed at checkout (F-18). The server
 * refuses with 403 unless the account allows it for this buyer; going back to
 * a saved address is `setCheckoutDetails({ shippingAddressId })`.
 */
export async function setOneOffDeliveryAddress(
  input: ApiOneOffDeliveryAddressInput,
  siteId?: string
): Promise<ApiCart> {
  return apiClient.put(`${CART}/delivery-address`, input, {
    params: siteParams(siteId),
  })
}

/**
 * Prices and checks the basket.
 *
 * `forCheckout` also demands the stepper's details — branch, delivery address,
 * payment method, accepted terms. Off for the cart page, which must not
 * complain about an address the buyer has not reached the step for yet.
 */
export async function validate(
  siteId?: string,
  forCheckout = false
): Promise<ApiCartValidation> {
  return apiClient.post(`${CART}/validate`, undefined, {
    params: {
      ...siteParams(siteId),
      ...(forCheckout ? { forCheckout: true } : {}),
    },
  })
}

/**
 * The payload an order will be written from.
 *
 * The same checks as `validate(forCheckout)`, but refused with 422 unless the
 * basket is actually ready. Creates nothing and reserves nothing — all of that
 * belongs to the order write, and doing any of it here would leave a
 * half-committed basket whenever that write failed.
 */
export async function checkoutSession(
  siteId?: string
): Promise<ApiCartValidation> {
  return apiClient.post(`${CART}/checkout-session`, undefined, {
    params: siteParams(siteId),
  })
}

// --- NZ Post delivery ---------------------------------------------------------

/**
 * Where and how NZ Post should carry the parcel — optional, and never billed.
 *
 * The choice travels to the order for dispatch; the order's delivery charge is
 * still `shippingMethod`, set through `setCheckoutDetails`. The server keeps
 * the steps in order, so a screen has to as well: choosing an address clears
 * the collection point and the service, and choosing a point clears the
 * service, because each was quoted for what came before it.
 *
 * Every call that reaches NZ Post can answer 503 when the integration is off or
 * unconfigured. That is a reason to skip this step, not to stop checkout.
 */

/** Type-ahead suggestions. NZ Post refuses fewer than four characters. */
export async function searchDeliveryAddresses(
  query: string,
  count = 8
): Promise<ApiAddressSuggestion[]> {
  const result: { items: ApiAddressSuggestion[] } = await apiClient.get(
    '/shipping/addresses',
    { params: { q: query, count } }
  )
  return result.items
}

export async function getCartShipping(
  siteId?: string
): Promise<ApiCartShipping> {
  return apiClient.get(`${CART}/shipping`, { params: siteParams(siteId) })
}

export async function clearCartShipping(
  siteId?: string
): Promise<ApiCartShipping> {
  return apiClient.delete(`${CART}/shipping`, { params: siteParams(siteId) })
}

/** Takes an `addressId` from `searchDeliveryAddresses`. */
export async function selectDeliveryAddress(
  addressId: string,
  siteId?: string
): Promise<ApiCartShipping> {
  return apiClient.put(
    `${CART}/shipping/address`,
    { addressId },
    { params: siteParams(siteId) }
  )
}

/** Needs an address chosen first; answers 422 otherwise. */
export async function getShippingRates(
  siteId?: string
): Promise<ApiShippingRates> {
  return apiClient.get(`${CART}/shipping/options`, {
    params: siteParams(siteId),
  })
}

/** Takes a `serviceCode` from `getShippingRates`. Re-quoted server-side. */
export async function selectShippingService(
  serviceCode: string,
  siteId?: string
): Promise<ApiCartShipping> {
  return apiClient.put(
    `${CART}/shipping/service`,
    { serviceCode },
    { params: siteParams(siteId) }
  )
}

/** Nearest first, for the address already chosen. */
export async function getCollectionPoints(
  count = 5,
  siteId?: string
): Promise<ApiCollectionPoint[]> {
  const result: { items: ApiCollectionPoint[] } = await apiClient.get(
    `${CART}/shipping/collection-points`,
    { params: { ...siteParams(siteId), count } }
  )
  return result.items
}

/** Null goes back to delivering to the address. */
export async function selectCollectionPoint(
  collectionPointId: string | null,
  siteId?: string
): Promise<ApiCartShipping> {
  return apiClient.put(
    `${CART}/shipping/collection-point`,
    { collectionPointId },
    { params: siteParams(siteId) }
  )
}

// --- Payment method ---------------------------------------------------------

/**
 * The UI names corporate terms; the API names the instrument. Neither
 * vocabulary is wrong, so they are translated rather than one being imposed on
 * the other.
 *
 * `PREAPPROVED_CREDIT` has no counterpart — the API models three payment
 * methods — so it falls to invoice terms, which is what pre-approved credit
 * settles as.
 */
const TO_API_PAYMENT: Record<CorporatePaymentMethod, ApiPaymentMethod> = {
  CORPORATE_INVOICE: 'NET_30_INVOICE',
  PURCHASING_CARD: 'P_CARD',
  CORPORATE_ACH: 'ACH',
  PREAPPROVED_CREDIT: 'NET_30_INVOICE',
}

const FROM_API_PAYMENT: Record<ApiPaymentMethod, CorporatePaymentMethod> = {
  NET_30_INVOICE: 'CORPORATE_INVOICE',
  P_CARD: 'PURCHASING_CARD',
  ACH: 'CORPORATE_ACH',
}

export function toApiPaymentMethod(
  method: CorporatePaymentMethod | undefined
): ApiPaymentMethod {
  return method
    ? (TO_API_PAYMENT[method] ?? 'NET_30_INVOICE')
    : 'NET_30_INVOICE'
}

export function fromApiPaymentMethod(
  method: ApiPaymentMethod | null
): CorporatePaymentMethod | undefined {
  return method ? FROM_API_PAYMENT[method] : undefined
}
