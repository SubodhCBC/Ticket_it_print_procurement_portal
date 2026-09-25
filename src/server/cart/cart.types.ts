import type { Address } from '@prisma/client'
import type { CartIssue } from './cart-validation'
import type {
  CartLineRow,
  CartValidation,
  FullCart,
  ValidatedLine,
} from './cart.service'
import type { PurchaseOrderCheck } from './purchase-order'
import { fromJsonOr } from '../db/json-column'
import { SHIPPING_METHODS, type ShippingMethod } from './shipping-methods'

/**
 * An address as it is frozen onto an order, and as checkout shows it.
 *
 * One shape for both addresses, because both are copies of the same row for the
 * same reason: an address corrected next month must not rewrite where a past
 * order went or who it was billed to. Declared here, beside the basket that
 * shows it first, and used by orders for what they store.
 */
export interface AddressSnapshotView {
  readonly label: string | null
  readonly recipientName: string | null
  readonly line1: string
  readonly line2: string | null
  readonly city: string
  readonly region: string | null
  readonly postcode: string
  readonly country: string
  readonly phone: string | null
}

export type AddressSnapshotSource = Pick<
  Address,
  | 'label'
  | 'recipientName'
  | 'line1'
  | 'line2'
  | 'city'
  | 'region'
  | 'postcode'
  | 'country'
  | 'phone'
>

/**
 * A whitelist, not a spread: an address row also carries its account, site,
 * kind and soft-delete stamp, and none of that belongs in a frozen copy.
 */
export function toAddressSnapshot(
  address: AddressSnapshotSource
): AddressSnapshotView {
  return {
    label: address.label,
    recipientName: address.recipientName,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    region: address.region,
    postcode: address.postcode,
    country: address.country,
    phone: address.phone,
  }
}

/** The bill-to checkout will use, and where it came from (SOW F-15). */
export interface BillToView {
  readonly addressId: string
  /** CHOSEN by the buyer, or defaulted from the SITE or the ACCOUNT. */
  readonly source: 'CHOSEN' | 'SITE' | 'ACCOUNT'
  readonly address: AddressSnapshotView
}

/**
 * A basket as the API exposes it.
 *
 * Money is a string throughout, as everywhere else in this codebase: these are
 * NUMERIC columns and integer-cent arithmetic, and a JSON number would be
 * rounded by the client's parser.
 *
 * Line prices are present on the *validated* view and absent from the plain
 * cart view. That is deliberate: a price only means something once the line has
 * been checked and re-priced, and returning one on a bare read would invite the
 * client to cache a number that had not been through the rate card.
 */
export interface CartView {
  readonly id: string
  readonly status: FullCart['status']
  readonly site: CartSiteView | null
  readonly lines: readonly CartLineView[]
  readonly lineCount: number
  /** Sum of quantities as typed, before any MOQ rounding. */
  readonly itemCount: number
  readonly poNumber: string | null
  readonly campaignCode: string | null
  /** Free text from the buyer (SOW F-14). */
  readonly customerReference: string | null
  readonly notes: string | null
  readonly requestedDeliveryDate: string | null
  readonly shippingAddressId: string | null
  readonly billingAddressId: string | null
  readonly paymentMethod: FullCart['paymentMethod']
  /** How the parcel travels: a code from `SHIPPING_METHODS`, or null. */
  readonly shippingMethod: string | null
  readonly termsAcceptedAt: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface CartSiteView {
  readonly id: string
  readonly code: string
  readonly name: string
  readonly monthlyBudget: string | null
  readonly poRequired: boolean
  readonly poPrefix: string | null
  /** The branch's own PO format, if it has one. `purchaseOrder.format` is the one in force. */
  readonly poFormat: string | null
  readonly costCentre: string | null
}

export interface CartLineView {
  readonly id: string
  readonly productId: string
  readonly sku: string
  readonly name: string
  readonly uom: CartLineRow['product']['uom']
  readonly variantId: string | null
  readonly variantSku: string | null
  /** The chosen configuration — {"Finish": "Gloss Laminate"} — or null. */
  readonly options: Readonly<Record<string, string>> | null
  readonly quantity: number
  readonly moq: number
  readonly orderMultiple: number
  readonly packSize: number
  readonly leadTimeDays: number | null
  /**
   * The artwork this line was personalised from. Null for a line with none.
   *
   * `available` is false once the template has been unpublished, archived or
   * deleted — validation blocks checkout on it, and the basket says so rather
   * than letting the buyer discover it at the last step.
   */
  readonly template: {
    readonly id: string
    readonly code: string
    readonly name: string
    readonly versionId: string
    readonly version: number
    readonly available: boolean
  } | null
  readonly customisation: unknown
  readonly notes: string | null
  readonly addedAt: string
}

export function toCartView(cart: FullCart): CartView {
  return {
    id: cart.id,
    status: cart.status,
    site: cart.site
      ? {
          id: cart.site.id,
          code: cart.site.code,
          name: cart.site.name,
          monthlyBudget: cart.site.monthlyBudget?.toFixed(2) ?? null,
          poRequired: cart.site.poRequired,
          poPrefix: cart.site.poPrefix,
          poFormat: cart.site.poFormat,
          costCentre: cart.site.costCentre,
        }
      : null,
    lines: cart.lines.map(toCartLineView),
    lineCount: cart.lines.length,
    itemCount: cart.lines.reduce((total, line) => total + line.quantity, 0),
    poNumber: cart.poNumber,
    campaignCode: cart.campaignCode,
    customerReference: cart.customerReference,
    notes: cart.notes,
    requestedDeliveryDate: cart.requestedDeliveryDate?.toISOString() ?? null,
    shippingAddressId: cart.shippingAddressId,
    billingAddressId: cart.billingAddressId,
    paymentMethod: cart.paymentMethod,
    shippingMethod: cart.shippingMethod,
    termsAcceptedAt: cart.termsAcceptedAt?.toISOString() ?? null,
    createdAt: cart.createdAt.toISOString(),
    updatedAt: cart.updatedAt.toISOString(),
  }
}

function toCartLineView(line: CartLineRow): CartLineView {
  return {
    id: line.id,
    productId: line.productId,
    sku: line.product.sku,
    name: line.product.name,
    uom: line.product.uom,
    variantId: line.variantId,
    variantSku: line.variant?.sku ?? null,
    options: line.variant
      ? fromJsonOr<Record<string, string>>(line.variant.attributes, {})
      : null,
    quantity: line.quantity,
    moq: line.product.moq,
    orderMultiple: line.product.orderMultiple,
    packSize: line.product.packSize,
    leadTimeDays: line.product.leadTimeDays,
    template:
      line.template && line.templateVersion
        ? {
            id: line.template.id,
            code: line.template.code,
            name: line.template.name,
            versionId: line.templateVersion.id,
            version: line.templateVersion.version,
            available:
              line.template.status === 'PUBLISHED' &&
              line.template.deletedAt === null,
          }
        : null,
    customisation: fromJsonOr<unknown>(line.customisation, null),
    notes: line.notes,
    addedAt: line.createdAt.toISOString(),
  }
}

/** The validated basket: every problem, every price, and what it would cost. */
export interface CartValidationView {
  readonly cart: CartView
  readonly valid: boolean
  readonly issues: readonly CartIssue[]
  readonly warnings: readonly CartIssue[]
  readonly lines: readonly ValidatedLineView[]
  readonly purchaseOrder: PurchaseOrderView
  readonly budget: BudgetView
  /** The buyer's own monthly limit; null when they have none. */
  readonly userBudget: BudgetView | null
  /**
   * Who the order will be billed to, or null when neither the basket, its branch
   * nor its account has a billing address to offer.
   */
  readonly billTo: BillToView | null
  /**
   * Whether this buyer may type a one-off delivery address, and the one typed for
   * this basket (SOW F-18). The buyer's screen learns the account's choice here,
   * because buyers cannot read account settings.
   */
  readonly customDeliveryAddress: {
    readonly allowed: boolean
    readonly current: (AddressSnapshotView & { readonly id: string }) | null
  }
  readonly billingPeriod: string
  readonly subtotal: string
  /** The same basket with no rate card applied, for the "you save" line. */
  readonly catalogSubtotal: string
  readonly saving: string
  /** The chosen delivery and what it adds, or null before one is picked. */
  readonly shipping: ShippingView | null
  /** Every delivery the buyer can choose, with its price, for the picker. */
  readonly shippingOptions: readonly ShippingView[]
  /** Subtotal plus shipping: what the order will cost. */
  readonly total: string
  /**
   * Whether placing this basket now would need approval, decided by the same
   * rules placement applies — so the review step does not have to guess at a
   * threshold. A preview: placement decides again.
   */
  readonly approval: ApprovalPreviewView
  /** Ask for delivery instructions: `POST /orders` refuses an order without them. */
  readonly deliveryNotesRequired: boolean
}

export interface ApprovalPreviewView {
  readonly required: boolean
  /** RULES, ACCOUNT_THRESHOLD, or null when not required. */
  readonly reason: 'RULES' | 'ACCOUNT_THRESHOLD' | null
  /** Each round the order would wait on, lowest tier first. */
  readonly steps: ReadonlyArray<{
    readonly tier: number
    readonly ruleName: string
    readonly approverRole: string | null
    readonly approverUserId: string | null
  }>
  /** The account threshold, when that is what decides; totals above it need approval. */
  readonly threshold: string | null
}

export interface ShippingView {
  /** A code from `SHIPPING_METHODS`, sent back as `shippingMethod`. */
  readonly code: string
  readonly label: string
  /** "Next Day", "2-3 Days". */
  readonly eta: string
  /** The flat charge for the order, as a money string. */
  readonly price: string
}

export interface ValidatedLineView {
  readonly lineId: string
  readonly productId: string
  readonly sku: string
  readonly name: string
  /** As typed by the buyer. */
  readonly quantity: number
  /** What will actually be ordered once the MOQ and multiple are applied. */
  readonly orderableQuantity: number
  readonly quantityAdjusted: boolean
  /** Null when the product is gone or no longer visible to this account. */
  readonly unitPrice: string | null
  readonly lineTotal: string | null
  readonly catalogUnitPrice: string | null
  readonly priceSource: string | null
  readonly rateCardName: string | null
  readonly issues: readonly CartIssue[]
  readonly warnings: readonly CartIssue[]
}

export interface PurchaseOrderView {
  readonly required: boolean
  readonly requiredBy: PurchaseOrderCheck['policy']['requiredBy']
  readonly prefix: string | null
  readonly prefixFrom: PurchaseOrderCheck['policy']['prefixFrom']
  /** The PO format in force, e.g. `PO-####-YY`, or null (SOW F-14). */
  readonly format: string | null
  readonly formatFrom: PurchaseOrderCheck['policy']['formatFrom']
  /** A reference that fits, for the field's placeholder. */
  readonly formatExample: string | null
  readonly provided: string | null
  readonly valid: boolean
  readonly problem: PurchaseOrderCheck['problem']
  readonly message: string | null
}

function toBudgetView(budget: CartValidation['budget']): BudgetView {
  return {
    cap: budget.capCents === null ? null : fromCents(budget.capCents),
    spent: fromCents(budget.spentCents),
    remaining:
      budget.remainingCents === null ? null : fromCents(budget.remainingCents),
    cartTotal: fromCents(budget.cartTotalCents),
    projected: fromCents(budget.projectedCents),
    wouldExceed: budget.wouldExceed,
    overage: fromCents(budget.overageCents),
    utilisationPercent: budget.utilisationPercent,
  }
}

export interface BudgetView {
  /** Null means the branch is uncapped. Zero means it may not order at all. */
  readonly cap: string | null
  readonly spent: string
  readonly remaining: string | null
  readonly cartTotal: string
  readonly projected: string
  readonly wouldExceed: boolean
  readonly overage: string
  readonly utilisationPercent: number | null
}

export function toCartValidationView(
  validation: CartValidation
): CartValidationView {
  return {
    cart: toCartView(validation.cart),
    valid: validation.valid,
    issues: validation.issues,
    warnings: validation.warnings,
    lines: validation.lines.map(toValidatedLineView),
    purchaseOrder: {
      required: validation.purchaseOrder.policy.required,
      requiredBy: validation.purchaseOrder.policy.requiredBy,
      prefix: validation.purchaseOrder.policy.prefix,
      prefixFrom: validation.purchaseOrder.policy.prefixFrom,
      format: validation.purchaseOrder.policy.format,
      formatFrom: validation.purchaseOrder.policy.formatFrom,
      formatExample: validation.purchaseOrder.policy.formatExample,
      provided: validation.purchaseOrder.provided,
      valid: validation.purchaseOrder.valid,
      problem: validation.purchaseOrder.problem,
      message: validation.purchaseOrder.message,
    },
    budget: toBudgetView(validation.budget),
    userBudget: validation.userBudget
      ? toBudgetView(validation.userBudget)
      : null,
    billingPeriod: validation.billingPeriod,
    subtotal: fromCents(validation.subtotalCents),
    catalogSubtotal: fromCents(validation.catalogSubtotalCents),
    saving: fromCents(validation.savingCents),
    shipping: validation.shippingMethod
      ? {
          ...toShippingView(validation.shippingMethod),
          // The charge this basket actually carries, which is zero for an empty
          // one even with a method chosen.
          price: fromCents(validation.shippingCents),
        }
      : null,
    shippingOptions: SHIPPING_METHODS.map(toShippingView),
    total: fromCents(validation.totalCents),
    approval: {
      required: validation.approval.required,
      reason: validation.approval.reason,
      steps: validation.approval.steps,
      threshold:
        validation.approval.thresholdCents === null
          ? null
          : fromCents(validation.approval.thresholdCents),
    },
    deliveryNotesRequired: validation.deliveryNotesRequired,
    billTo: validation.billTo,
    customDeliveryAddress: validation.customDeliveryAddress,
  }
}

function toShippingView(method: ShippingMethod): ShippingView {
  return {
    code: method.code,
    label: method.label,
    eta: method.eta,
    price: fromCents(method.priceCents),
  }
}

function toValidatedLineView(line: ValidatedLine): ValidatedLineView {
  const breakdown = line.quote?.breakdown ?? null

  return {
    lineId: line.line.id,
    productId: line.line.productId,
    sku: line.line.product.sku,
    name: line.line.product.name,
    quantity: line.check.quantity,
    orderableQuantity: line.check.orderableQuantity,
    quantityAdjusted: line.check.orderableQuantity !== line.check.quantity,
    unitPrice: breakdown ? fromCents(breakdown.unitPriceCents) : null,
    lineTotal: breakdown ? fromCents(breakdown.lineTotalCents) : null,
    catalogUnitPrice: breakdown
      ? fromCents(breakdown.catalogUnitPriceCents)
      : null,
    priceSource: breakdown?.source ?? null,
    rateCardName: breakdown?.rateCardName ?? null,
    issues: line.check.issues,
    warnings: line.check.warnings,
  }
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}
