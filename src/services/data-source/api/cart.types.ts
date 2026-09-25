/**
 * The basket and its validation, exactly as the API returns them.
 *
 * Mirrors `modules/cart/dto/cart-response.ts`.
 *
 * The split between `ApiCart` and `ApiCartValidation` is the important part of
 * this contract: **a bare cart read carries no prices**. A price only means
 * something once the line has been through the rate card, and returning one on
 * a plain read would invite the client to cache a number that was never quoted.
 * Everything the UI shows as money comes from `POST /cart/validate`.
 */

/** A placed basket is `CHECKED_OUT`; the next read opens a fresh one. */
export type ApiCartStatus = 'OPEN' | 'CHECKED_OUT'
export type ApiPaymentMethod = 'NET_30_INVOICE' | 'P_CARD' | 'ACH'
/** How the parcel travels. See `ApiShippingOption` for the label and price. */
export type ApiShippingMethod = 'COURIERPOST_EXPRESS' | 'STANDARD_PARCEL'

/** A problem or an adjustment, written for the buyer rather than for a log. */
/**
 * Issue codes the cart validator reports.
 *
 * Listed rather than left as `string` because screens branch on them, and a
 * typo in a branch is a check that silently never fires.
 */
export type ApiCartIssueCode =
  | 'EMPTY_CART'
  | 'NO_SITE'
  | 'PRODUCT_UNAVAILABLE'
  | 'VARIANT_UNAVAILABLE'
  | 'QUANTITY_BELOW_MOQ'
  | 'QUANTITY_NOT_MULTIPLE'
  | 'INSUFFICIENT_STOCK'
  | 'TEMPLATE_UNAVAILABLE'
  | 'PO_REQUIRED'
  | 'PO_PREFIX_MISMATCH'
  | 'PO_TOO_SHORT'
  | 'PO_INVALID_CHARACTERS'
  | 'PO_FORMAT_MISMATCH'
  | 'BUDGET_EXCEEDED'
  | 'USER_BUDGET_EXCEEDED'
  | 'NO_SHIPPING_ADDRESS'
  | 'ADDRESS_NOT_AVAILABLE'
  | 'BILLING_ADDRESS_NOT_AVAILABLE'
  | 'SHIPPING_METHOD_REQUIRED'
  | 'PAYMENT_METHOD_REQUIRED'
  | 'TERMS_NOT_ACCEPTED'
  | 'DELIVERY_DATE_IN_PAST'
  /**
   * Raised by `POST /orders` only — the instructions travel with the order,
   * not the basket — when the account requires them and none were sent.
   */
  | 'DELIVERY_NOTES_REQUIRED'

export interface ApiCartIssue {
  code: string
  message: string
  /** The line it belongs to, or null for a basket-wide problem. */
  lineId: string | null
  details?: Record<string, unknown>
}

export interface ApiCartSite {
  id: string
  code: string
  name: string
  monthlyBudget: string | null
  poRequired: boolean
  poPrefix: string | null
  costCentre: string | null
}

export interface ApiCartLine {
  id: string
  productId: string
  sku: string
  name: string
  uom: string
  variantId: string | null
  variantSku: string | null
  /**
   * The chosen configuration — `{"Finish": "Gloss Laminate"}` — or null for a
   * line with no options.
   */
  options: Record<string, string> | null
  /** As the buyer typed it, before any MOQ rounding. */
  quantity: number
  moq: number
  orderMultiple: number
  packSize: number
  leadTimeDays: number | null
  /**
   * The artwork this line was personalised from. Null for a line with none.
   *
   * `available` goes false once the template has been unpublished, archived or
   * deleted. Validation blocks checkout on it, and the basket says so first —
   * a buyer should not discover withdrawn artwork at the last step.
   */
  template: {
    id: string
    code: string
    name: string
    versionId: string
    version: number
    available: boolean
  } | null
  customisation: unknown
  notes: string | null
  addedAt: string
}

export interface ApiCart {
  id: string
  status: ApiCartStatus
  site: ApiCartSite | null
  lines: ApiCartLine[]
  lineCount: number
  itemCount: number
  poNumber: string | null
  campaignCode: string | null
  /** Absent from an API build before F-14. */
  customerReference?: string | null
  notes: string | null
  requestedDeliveryDate: string | null
  shippingAddressId: string | null
  billingAddressId: string | null
  paymentMethod: ApiPaymentMethod | null
  shippingMethod: ApiShippingMethod | null
  termsAcceptedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiValidatedLine {
  lineId: string
  productId: string
  sku: string
  name: string
  /** As typed by the buyer. */
  quantity: number
  /** What will actually be ordered once the MOQ and multiple are applied. */
  orderableQuantity: number
  quantityAdjusted: boolean
  /** Null when the product is gone, or no longer visible to this account. */
  unitPrice: string | null
  lineTotal: string | null
  catalogUnitPrice: string | null
  priceSource: string | null
  rateCardName: string | null
  issues: ApiCartIssue[]
  warnings: ApiCartIssue[]
}

export interface ApiPurchaseOrderCheck {
  required: boolean
  requiredBy: string | null
  prefix: string | null
  prefixFrom: string | null
  /** e.g. `PO-####-YY`; absent from an API build before F-14. */
  format?: string | null
  formatExample?: string | null
  provided: string | null
  valid: boolean
  problem: string | null
  message: string | null
}

export interface ApiBudgetCheck {
  /** Null means the branch is uncapped. Zero means it may not order at all. */
  cap: string | null
  spent: string
  remaining: string | null
  cartTotal: string
  projected: string
  wouldExceed: boolean
  overage: string
  utilisationPercent: number | null
}

/** A way the parcel can travel, and what it adds to the order. */
export interface ApiShippingOption {
  code: ApiShippingMethod
  /** "CourierPost Express" */
  label: string
  /** "Next Day", "2-3 Days" */
  eta: string
  /** Money string. A flat charge per order, not per line. */
  price: string
}

/** An address as the server freezes it onto an order. */
export interface ApiAddressSnapshot {
  label: string | null
  recipientName: string | null
  line1: string
  line2: string | null
  city: string
  region: string | null
  postcode: string
  country: string
  phone: string | null
}

/**
 * Who the order will be billed to, decided by the server: the address pinned
 * on the basket, else the branch's billing address, else the head office's.
 */
export interface ApiBillTo {
  addressId: string
  source: 'CHOSEN' | 'SITE' | 'ACCOUNT'
  address: ApiAddressSnapshot
}

/** One line: "12 Queen St, Level 2, Auckland 1010, NZ". */
export function formatAddressSnapshot(
  address: Partial<ApiAddressSnapshot> | null | undefined
): string {
  if (!address) return ''
  return [
    address.line1,
    address.line2,
    [address.city, address.region].filter(Boolean).join(', '),
    address.postcode,
    address.country,
  ]
    .filter(Boolean)
    .join(', ')
}

export interface ApiCustomDeliveryAddress {
  allowed: boolean
  current: (ApiAddressSnapshot & { id: string }) | null
}

/** A delivery address typed at checkout. */
export interface ApiOneOffDeliveryAddressInput {
  /**
   * The NZ Post ParcelAddress id for this address, when the buyer picked it in
   * the NZ Post panel (SOW F-16). The server then takes the street, suburb, city
   * and postcode from NZ Post — with its DPID and rural flag — instead of the
   * typed lines, so the label and the order name the same, verified address.
   */
  nzPostAddressId?: string
  label?: string
  recipientName?: string
  line1: string
  line2?: string
  city: string
  region?: string
  postcode: string
  /** ISO 3166-1 alpha-2. */
  country: string
  phone?: string
}

export interface ApiCartValidation {
  cart: ApiCart
  valid: boolean
  /** Blocking. */
  issues: ApiCartIssue[]
  /** Adjustments the buyer can accept — a below-MOQ quantity, for instance. */
  warnings: ApiCartIssue[]
  lines: ApiValidatedLine[]
  purchaseOrder: ApiPurchaseOrderCheck
  /** Absent from an API build before F-15; null when none is on file. */
  billTo?: ApiBillTo | null
  /**
   * Whether this buyer may type a one-off delivery address (the account allows
   * it and they hold the permission), and the one on the basket if they have.
   * Absent from an API build before F-18.
   */
  customDeliveryAddress?: ApiCustomDeliveryAddress
  budget: ApiBudgetCheck
  /** The buyer's own monthly limit; null for none, absent before AD-4. */
  userBudget?: ApiBudgetCheck | null
  billingPeriod: string
  subtotal: string
  /** The same basket with no rate card applied, for the "you save" line. */
  catalogSubtotal: string
  saving: string
  /** The chosen delivery and what this basket pays for it; null until chosen. */
  shipping: ApiShippingOption | null
  /** Every delivery the buyer can choose, for the picker. */
  shippingOptions: ApiShippingOption[]
  /** Subtotal plus shipping: what the order will cost. */
  total: string
  /**
   * Whether placing this basket now would need approval, decided by the same
   * rules placement applies. A preview: placement decides again.
   */
  approval: ApiApprovalPreview
  /** The account requires delivery instructions on every order. */
  deliveryNotesRequired: boolean
}

export interface ApiApprovalPreview {
  required: boolean
  /** RULES, ACCOUNT_THRESHOLD, or null when not required. */
  reason: 'RULES' | 'ACCOUNT_THRESHOLD' | null
  /** Each round the order would wait on, lowest tier first. */
  steps: {
    tier: number
    ruleName: string
    approverRole: string | null
    approverUserId: string | null
  }[]
  /** The account threshold, when that is what decides. Money string. */
  threshold: string | null
}

// --- NZ Post delivery ---------------------------------------------------------
//
// Mirrors `server/shipping/shipping.types.ts` and `carrier.types.ts`.
//
// Recorded, never billed: an NZ Post service or collection point travels to the
// order for dispatch, and does not change `total`, the budget or the invoice.
// What the order pays for delivery is still `shippingMethod` above.

/** One suggestion from `GET /shipping/addresses`. */
export interface ApiAddressSuggestion {
  addressId: string
  dpid: string | null
  /** For display only — the address is fetched again when it is chosen. */
  fullAddress: string
}

export interface ApiCollectionPoint {
  id: string
  name: string
  fullAddress: string
  addressLine1: string
  suburb: string | null
  city: string | null
  postcode: string | null
  phone: string | null
  partner: string | null
  distanceMetres: number | null
  latitude: number | null
  longitude: number | null
  hours: { day: number; open?: string; close?: string; closed?: boolean }[]
}

export interface ApiParcelEstimate {
  weightGrams: number
  lengthCm: number
  widthCm: number
  heightCm: number
  /** Products with no recorded weight, estimated at a floor instead. */
  missingWeightSkus: string[]
  isFloor: boolean
}

export interface ApiRateOption {
  carrier: string
  serviceCode: string
  description: string
  priceExclGst: string
  priceInclGst: string
  /** Surcharges NZ Post adds whether asked or not — rural delivery, say. */
  mandatoryAddons: {
    code: string
    description: string
    priceExclGst: string
    priceInclGst: string
  }[]
  totalExclGst: string
  totalInclGst: string
  trackingIncluded: boolean
  signatureIncluded: boolean
}

/** `GET /cart/shipping/options`. Never an error: it degrades to a flat rate, then to nothing. */
export interface ApiShippingRates {
  source: 'NZPOST' | 'FLAT_RATE' | 'UNAVAILABLE'
  options: ApiRateOption[]
  parcelEstimate: ApiParcelEstimate
  message: string | null
  freightBilled: false
}

export interface ApiDeliveryAddressParts {
  companyName?: string
  buildingName?: string
  unitType?: string
  unitValue?: string
  floor?: string
  streetNumber: string
  street: string
  suburb: string | null
  city: string
  postcode: string
  countryCode: 'NZ'
}

/** `GET /cart/shipping`, and the answer to every `/cart/shipping/*` write. */
export interface ApiCartShipping {
  cartId: string
  siteId: string | null
  /** Whether the postcode matches the basket's saved ship-to address. Null when either is missing. */
  matchesSavedAddress: boolean | null
  selection: {
    deliveryKind: 'ADDRESS' | 'COLLECTION'
    nzPostAddressId: string | null
    dpid: string | null
    isRural: boolean | null
    fullAddress: string | null
    deliveryAddress: ApiDeliveryAddressParts | null
    collectionPoint: ApiCollectionPoint | null
    service: {
      code: string
      description: string | null
      quoteSource: 'NZPOST' | 'FLAT_RATE' | null
      priceExclGst: string | null
      priceInclGst: string | null
      quotedAt: string | null
    } | null
    parcelEstimate: ApiParcelEstimate | null
    freightBilled: false
  } | null
}
