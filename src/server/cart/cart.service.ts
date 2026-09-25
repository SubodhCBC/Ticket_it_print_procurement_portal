import { Prisma } from '@prisma/client'
import {
  previewApproval,
  type ApprovalPreview,
} from '../approvals/approvals.service'
import { ORDERABLE_STATUSES } from '../catalog/product-status'
import { roundToOrderable } from '../catalog/product-pricing'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope } from '../db/client'
// Imported from the file rather than from the orders service: that module will
// depend on this one, and the cycle would be real at runtime. `order-status.ts`
// is pure, so both sides agree on which statuses count as committed spend — the
// part that must not drift — without either module depending on the other.
import { COMMITTED_STATUSES } from '../orders/order-status'
import {
  quote as quoteProducts,
  type QuotedLine,
} from '../pricing/pricing.service'
import { getCustomisable } from '../templates/templates.service'
// The pure rules file, not the service: this needs one function, and reaching
// through the service would pull its whole dependency chain in behind it.
import {
  acceptCustomisation,
  type TemplateLayerLike,
} from '../templates/template-status'
import { readSnapshot } from '../templates/template.types'
import type { ValidatedAddress } from '../shipping/carrier.types'
import { can } from '../auth/permission.service'
import { Permission } from '../auth/permissions'
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors'
import { createId } from '../utils/ids'
import { billingPeriodOf, evaluateBudget, type BudgetStatus } from './budget'
// A value import of a module that only type-imports this one back, so there is
// no cycle at runtime.
import {
  toAddressSnapshot,
  type AddressSnapshotView,
  type BillToView,
} from './cart.types'
import {
  findShippingMethod,
  shippingCostCents,
  type ShippingMethod,
} from './shipping-methods'
import { toJson, toJsonOrNull } from '../db/json-column'
import {
  CartIssueCode,
  checkCheckoutDetails,
  checkLine,
  type CartIssue,
  type LineCheck,
  type LineProductFacts,
} from './cart-validation'
import type {
  AddCartLineDto,
  SetCheckoutDetailsDto,
  SetOneOffDeliveryAddressDto,
  UpdateCartLineDto,
} from './cart.validation'
import {
  checkPurchaseOrder,
  resolvePurchaseOrderPolicy,
  type PurchaseOrderCheck,
} from './purchase-order'

const FULL_CART = Prisma.validator<Prisma.CartInclude>()({
  site: {
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      monthlyBudget: true,
      poRequired: true,
      poPrefix: true,
      poFormat: true,
      costCentre: true,
    },
  },
  shippingAddress: true,
  billingAddress: true,
  lines: {
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          status: true,
          moq: true,
          orderMultiple: true,
          uom: true,
          packSize: true,
          taxTreatment: true,
          trackInventory: true,
          stockOnHand: true,
          stockReserved: true,
          leadTimeDays: true,
        },
      },
      variant: {
        select: {
          id: true,
          sku: true,
          // The chosen stock and finish, shown on the basket line and frozen
          // onto the order line at placement.
          attributes: true,
          status: true,
          deletedAt: true,
          stockOnHand: true,
          stockReserved: true,
        },
      },
      // `status` and `deletedAt` are read by validation, not by the view: a
      // template withdrawn while a basket sat is a line that cannot be printed,
      // and the buyer has to be told before they check out rather than after.
      template: {
        select: {
          id: true,
          code: true,
          name: true,
          status: true,
          deletedAt: true,
        },
      },
      templateVersion: { select: { id: true, version: true, label: true } },
    },
    orderBy: { createdAt: 'asc' },
  },
})

export type FullCart = Prisma.CartGetPayload<{ include: typeof FULL_CART }>
export type CartLineRow = FullCart['lines'][number]

/**
 * Matches the cap on `POST /pricing/quote`. A basket bigger than this is priced
 * in several calls rather than being refused.
 */
const QUOTE_BATCH_SIZE = 200

/**
 * A price depends on the design, the product and the quantity, so all three
 * belong in the key. See the note in `validateCart()` for what keying on the
 * product alone did.
 *
 * The template version joined the key when designs started carrying their own
 * prices. Two lines for the same product at the same quantity, personalised
 * from two different designs, are two different prices — and a key that could
 * not tell them apart would quote both at whichever was priced last. That is
 * the same fault the quantity fixed, one level further in.
 */
function quoteKey(
  productId: string,
  quantity: number,
  templateVersionId: string | null,
  variantId: string | null
): string {
  // The variant joined the key when a chosen stock could add to a design's
  // price: the same design at the same run on two stocks is two prices.
  return `${productId}:${quantity}:${templateVersionId ?? ''}:${variantId ?? ''}`
}

/** One line, priced and checked. */
export interface ValidatedLine {
  readonly line: CartLineRow
  readonly check: LineCheck
  /** Null when the product could not be priced — it is gone or now invisible. */
  readonly quote: QuotedLine | null
}

export interface CartValidation {
  readonly cart: FullCart
  readonly lines: readonly ValidatedLine[]
  /** Blocking. The cart cannot become an order while any of these stand. */
  readonly issues: readonly CartIssue[]
  /** Non-blocking. The buyer accepts an adjustment and proceeds. */
  readonly warnings: readonly CartIssue[]
  readonly valid: boolean
  readonly purchaseOrder: PurchaseOrderCheck
  readonly budget: BudgetStatus
  /**
   * The buyer's own monthly limit (`User.monthlyBudgetCap`), measured against
   * what they have placed this period across every branch. Null when they have
   * none, which is the common case.
   */
  readonly userBudget: BudgetStatus | null
  readonly billingPeriod: string
  /** Priced at the quantities that would actually be ordered, in cents. */
  readonly subtotalCents: number
  /** What the same basket would cost with no rate card. */
  readonly catalogSubtotalCents: number
  readonly savingCents: number
  /** The chosen delivery, or null before the buyer has picked one. */
  readonly shippingMethod: ShippingMethod | null
  /** What delivery adds. Zero until a method is chosen. */
  readonly shippingCents: number
  /**
   * Subtotal plus shipping: what the order will cost. The budget check and the
   * approval threshold both measure this, not the subtotal — delivery is money
   * the branch spends like any other.
   */
  readonly totalCents: number
  /**
   * Whether placing the basket now would send it for approval, and to whom —
   * decided by the same rules placement applies. Not required for an empty
   * basket or one with no branch yet.
   */
  readonly approval: ApprovalPreview
  /**
   * The account requires delivery instructions on every order. They are sent
   * with `POST /orders`, not stored on the basket, so this tells the delivery
   * step to ask for them rather than raising an issue here.
   */
  readonly deliveryNotesRequired: boolean
  /**
   * The bill-to placement will freeze onto the order (SOW F-15), or null when
   * there is none on file. A pinned address that is no longer usable is not
   * replaced by a default — see `resolveBillTo`.
   */
  readonly billTo: ResolvedBillTo | null
  /**
   * Whether this buyer may type a one-off delivery address (SOW F-18), and the one
   * they typed for this basket if any. Here rather than on account settings,
   * which a buyer cannot read.
   */
  readonly customDeliveryAddress: {
    readonly allowed: boolean
    readonly current: (AddressSnapshotView & { readonly id: string }) | null
  }
}

export type ResolvedBillTo = BillToView

const NO_APPROVAL: ApprovalPreview = {
  required: false,
  reason: null,
  steps: [],
  thresholdCents: null,
}

/**
 * Baskets and checkout validation.
 *
 * ---------------------------------------------------------------------------
 * The cart is never the source of a price
 * ---------------------------------------------------------------------------
 * Nothing here stores money. Every read re-prices through the pricing service,
 * so a rate card that is activated, corrected or expires between adding a line
 * and paying for it is reflected immediately. A price cached on the line would
 * be a quote the system had quietly stopped honouring, and the customer would
 * find out from the invoice.
 *
 * ---------------------------------------------------------------------------
 * Which basket a request may touch
 * ---------------------------------------------------------------------------
 * Carts are never addressed by id. Every function resolves the basket from the
 * authenticated user and the branch they asked for, so there is no identifier
 * for one colleague to guess another's with. RLS covers the tenant boundary;
 * this covers the boundary inside a tenant, which RLS cannot express because
 * the scope carries an account and not a user.
 */

// --- Reading and creating the basket ----------------------------------------

/**
 * This user's open basket for a branch, created on first use.
 *
 * Creating on read is deliberate: every client's first action is to show the
 * cart, and making them POST an empty one first would be a round trip that
 * exists only to satisfy REST. The partial unique index in the migration is
 * what keeps a double-tap from making two.
 */
export async function openCart(
  actor: AuthenticatedActor,
  requestedSiteId?: string
): Promise<FullCart> {
  const siteId = await resolveSite(actor, requestedSiteId)

  return withTenantScope(actor.accountId, async (tx) => {
    const existing = await tx.cart.findFirst({
      where: { userId: actor.userId, siteId, status: 'OPEN' },
      include: FULL_CART,
    })
    if (existing) return existing

    return tx.cart.create({
      data: {
        id: createId('crt'),
        accountId: actor.accountId,
        userId: actor.userId,
        siteId,
        status: 'OPEN',
      },
      include: FULL_CART,
    })
  })
}

// --- Template personalisation -----------------------------------------------

/**
 * Resolves the artwork a line was personalised from, and rebuilds the values it
 * may carry.
 *
 * Three things are enforced here, and the third is the one that matters:
 *
 * 1. **The template must be published and visible to this buyer.** Delegated to
 *    `getCustomisable`, which is the same call the customiser made — so the
 *    basket cannot accept a template the storefront would not have shown.
 *
 * 2. **The version must be the one currently published.** A stale id means the
 *    buyer had the customiser open while a designer republished; their values
 *    were checked against artwork that is no longer live, so they are sent back
 *    rather than pinned to something nobody can see any more.
 *
 * 3. **The values are rebuilt from that version's editable layers.** Not
 *    filtered — rebuilt, by `acceptCustomisation`. A key aimed at a locked layer
 *    cannot survive a rebuild the way it survives a check somebody later forgets
 *    to run.
 *
 * Returns nulls when no template is named: a box of envelopes has no artwork,
 * and its `customisation` stays free-form as it always was.
 */
async function resolveTemplateSelection(
  actor: AuthenticatedActor,
  selection: {
    readonly templateId?: string | null
    readonly templateVersionId?: string | null
    readonly customisation?: Record<string, unknown> | null
  }
): Promise<{
  templateId: string | null
  templateVersionId: string | null
  customisation: string | null
}> {
  const raw = selection.customisation ?? null

  if (!selection.templateId || !selection.templateVersionId) {
    return {
      templateId: null,
      templateVersionId: null,
      customisation: toJsonOrNull(raw),
    }
  }

  // Throws 404 when the template is unpublished, deleted, or restricted to
  // another account — deliberately the same answer for all three, so a basket
  // cannot be used to enumerate the library.
  const { version } = await getCustomisable(actor, selection.templateId)

  if (version.id !== selection.templateVersionId) {
    throw new BusinessRuleError(
      'This template has been updated since you personalised it. ' +
        'Open the customiser again so your details are checked against the new artwork.',
      {
        details: {
          templateId: selection.templateId,
          sentVersionId: selection.templateVersionId,
          publishedVersionId: version.id,
        },
      }
    )
  }

  const snapshot = readSnapshot(version.snapshot)
  const accepted = acceptCustomisation(
    snapshot.layers as unknown as readonly TemplateLayerLike[],
    raw ?? {}
  )

  return {
    templateId: selection.templateId,
    templateVersionId: version.id,
    customisation: toJson(accepted),
  }
}

// --- Lines ------------------------------------------------------------------

/**
 * Adds a line, merging into an existing one where that is unambiguous.
 *
 * Merging only happens when both lines are for the same product and variant
 * **and neither carries customisation**. Two personalised runs of the same
 * business card are two different things to print, and adding their quantities
 * together would silently destroy one of them.
 */
export async function addLine(
  actor: AuthenticatedActor,
  dto: AddCartLineDto,
  requestedSiteId?: string
): Promise<FullCart> {
  // The branch has to come through here as it does on every other cart
  // function. Without it a head-office buyer can select a branch basket, see it,
  // and edit its checkout details — but every line they add lands in their own
  // branch-less one, which looks like the add silently failing.
  const cart = await openCart(actor, requestedSiteId)
  const product = await requireOrderableProduct(
    actor,
    dto.productId,
    dto.variantId ?? null
  )
  const selection = await resolveTemplateSelection(actor, dto)

  // Every new line is a design.
  //
  // A product on its own has no price any more — what a job costs is decided
  // by the design printed on it — so a bare product line would have nothing to
  // price against but the catalogue figure the storefront has stopped showing
  // anyone. The buyer would agree to one number and be invoiced another.
  //
  // Held on the way in rather than in `validateCart`, deliberately: a basket
  // built before this rule existed still validates and can still be checked
  // out, priced the way it was quoted. This only stops new ones being made.
  if (!selection.templateId || !selection.templateVersionId) {
    throw new BusinessRuleError(
      'Pick a design before adding this to your basket — the design is what sets the price.',
      { details: { productId: dto.productId, reason: 'TEMPLATE_REQUIRED' } }
    )
  }

  await withTenantScope(actor.accountId, async (tx) => {
    // Only a plain line merges: no personalisation *and* no artwork behind it. A
    // line naming a template is a specific print run even when its fields happen
    // to be empty, and adding quantities across two of them would silently
    // destroy one.
    const mergeable =
      dto.customisation == null && selection.templateId === null
        ? await tx.cartLine.findFirst({
            where: {
              cartId: cart.id,
              productId: dto.productId,
              variantId: dto.variantId ?? null,
              customisation: null,
              templateId: null,
            },
          })
        : null

    if (mergeable) {
      await tx.cartLine.update({
        where: { id: mergeable.id },
        data: { quantity: mergeable.quantity + dto.quantity },
      })
      return
    }

    await tx.cartLine.create({
      data: {
        id: createId('crl'),
        cartId: cart.id,
        productId: dto.productId,
        variantId: dto.variantId ?? null,
        quantity: dto.quantity,
        templateId: selection.templateId,
        templateVersionId: selection.templateVersionId,
        customisation: selection.customisation,
        notes: dto.notes ?? null,
      },
    })
  })

  console.info(`Added ${product.sku} x${dto.quantity} to cart ${cart.id}.`)
  return openCart(actor, cart.siteId ?? undefined)
}

export async function updateLine(
  actor: AuthenticatedActor,
  lineId: string,
  dto: UpdateCartLineDto
): Promise<FullCart> {
  const cart = await requireOwnedLine(actor, lineId)

  const existing = await withTenantScope(actor.accountId, (tx) =>
    tx.cartLine.findUniqueOrThrow({
      where: { id: lineId },
      select: { productId: true, templateId: true, templateVersionId: true },
    })
  )

  // A new stock for the same product. Checked exactly as on add: it must be a
  // live configuration of *this line's* product, or a PATCH could quietly
  // attach another product's variant — and its price — to the line.
  if (dto.variantId !== undefined) {
    await requireOrderableProduct(actor, existing.productId, dto.variantId)
  }

  // Editing the values of a line that already names a template must go through
  // the same rebuild. The template is taken from the line rather than from the
  // request when the request is silent about it — otherwise a buyer could strip
  // `templateId` from a PATCH and turn a checked personalisation back into a
  // free-form bag of values.
  const namesTemplate =
    dto.templateId !== undefined || dto.templateVersionId !== undefined
  const touchesValues = dto.customisation !== undefined

  const selection =
    namesTemplate || (touchesValues && existing.templateId)
      ? await resolveTemplateSelection(actor, {
          templateId: namesTemplate ? dto.templateId : existing.templateId,
          templateVersionId: namesTemplate
            ? dto.templateVersionId
            : existing.templateVersionId,
          customisation: dto.customisation,
        })
      : null

  await withTenantScope(actor.accountId, (tx) =>
    tx.cartLine.update({
      where: { id: lineId },
      data: {
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.variantId !== undefined ? { variantId: dto.variantId } : {}),
        ...(selection
          ? {
              templateId: selection.templateId,
              templateVersionId: selection.templateVersionId,
              customisation: selection.customisation,
            }
          : dto.customisation !== undefined
            ? { customisation: toJsonOrNull(dto.customisation) }
            : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
      },
    })
  )

  return openCart(actor, cart.siteId ?? undefined)
}

export async function removeLine(
  actor: AuthenticatedActor,
  lineId: string
): Promise<FullCart> {
  const cart = await requireOwnedLine(actor, lineId)

  await withTenantScope(actor.accountId, (tx) =>
    tx.cartLine.delete({ where: { id: lineId } })
  )

  return openCart(actor, cart.siteId ?? undefined)
}

export async function clearCart(
  actor: AuthenticatedActor,
  requestedSiteId?: string
): Promise<FullCart> {
  const cart = await openCart(actor, requestedSiteId)

  await withTenantScope(actor.accountId, (tx) =>
    tx.cartLine.deleteMany({ where: { cartId: cart.id } })
  )

  return openCart(actor, cart.siteId ?? undefined)
}

/**
 * Rounds every line up to a quantity the product can be ordered in.
 *
 * The explicit half of "report the adjustment rather than applying it": the
 * buyer sees the warnings, then asks for them to be applied. Nothing here
 * happens without that second call.
 */
export async function normaliseQuantities(
  actor: AuthenticatedActor,
  requestedSiteId?: string
): Promise<FullCart> {
  const validation = await validateCart(actor, requestedSiteId, false)

  const adjustments = validation.lines
    .filter((line) => line.check.orderableQuantity !== line.line.quantity)
    .map((line) => ({
      id: line.line.id,
      quantity: line.check.orderableQuantity,
    }))

  if (adjustments.length > 0) {
    await withTenantScope(actor.accountId, async (tx) => {
      for (const adjustment of adjustments) {
        await tx.cartLine.update({
          where: { id: adjustment.id },
          data: { quantity: adjustment.quantity },
        })
      }
    })
    console.info(
      `Rounded ${adjustments.length} line(s) in cart ${validation.cart.id}.`
    )
  }

  return openCart(actor, validation.cart.siteId ?? undefined)
}

// --- Checkout details -------------------------------------------------------

export async function setCheckoutDetails(
  actor: AuthenticatedActor,
  dto: SetCheckoutDetailsDto,
  requestedSiteId?: string
): Promise<FullCart> {
  const cart = await openCart(actor, requestedSiteId)

  // Changing the branch would move the basket to a different budget, a
  // different purchase-order rule and different addresses, so it is a different
  // basket — the client asks for that one instead of mutating this.
  if (dto.siteId !== undefined && dto.siteId !== cart.siteId) {
    throw new BusinessRuleError(
      'A basket belongs to one branch. Ask for the basket for the other branch instead of ' +
        'moving this one — its budget, purchase-order rule and addresses all differ.',
      { details: { currentSiteId: cart.siteId, requestedSiteId: dto.siteId } }
    )
  }

  if (dto.shippingAddressId) {
    await assertAddressUsable(
      actor,
      cart.siteId,
      dto.shippingAddressId,
      'SHIPPING'
    )
  }
  if (dto.billingAddressId) {
    await assertAddressUsable(
      actor,
      cart.siteId,
      dto.billingAddressId,
      'BILLING'
    )
  }

  await withTenantScope(actor.accountId, (tx) =>
    tx.cart.update({
      where: { id: cart.id },
      data: {
        ...(dto.poNumber !== undefined ? { poNumber: dto.poNumber } : {}),
        ...(dto.campaignCode !== undefined
          ? { campaignCode: dto.campaignCode }
          : {}),
        ...(dto.customerReference !== undefined
          ? { customerReference: dto.customerReference }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.requestedDeliveryDate !== undefined
          ? { requestedDeliveryDate: dto.requestedDeliveryDate }
          : {}),
        ...(dto.shippingAddressId !== undefined
          ? { shippingAddressId: dto.shippingAddressId }
          : {}),
        ...(dto.billingAddressId !== undefined
          ? { billingAddressId: dto.billingAddressId }
          : {}),
        ...(dto.paymentMethod !== undefined
          ? { paymentMethod: dto.paymentMethod }
          : {}),
        ...(dto.shippingMethod !== undefined
          ? { shippingMethod: dto.shippingMethod }
          : {}),
        // The server stamps the instant. Accepting one from the client would let
        // it claim the buyer agreed at any time it liked.
        ...(dto.acceptTerms !== undefined
          ? { termsAcceptedAt: dto.acceptTerms ? new Date() : null }
          : {}),
      },
    })
  )

  return openCart(actor, cart.siteId ?? undefined)
}

// --- Validation -------------------------------------------------------------

/**
 * Everything wrong with the basket, at once.
 *
 * Never short-circuits: a buyer with four bad lines sees four messages rather
 * than fixing one and discovering the next.
 */
export async function validateCart(
  actor: AuthenticatedActor,
  requestedSiteId?: string,
  forCheckout = false
): Promise<CartValidation> {
  const cart = await openCart(actor, requestedSiteId)
  const now = new Date()
  const enforceMoq = await moqEnforcedFor(actor.accountId)

  const quotes = await quoteLines(actor, cart, enforceMoq)

  // Keyed by product, quantity *and* design, not by product alone. The same SKU
  // can appear on several lines — two personalised runs of one business card —
  // and a product-keyed map would collapse them, pricing every such line at
  // whichever quantity happened to be quoted last. That is a wrong number on an
  // invoice, so the key has to carry everything the price depends on, which now
  // includes which design the line was personalised from.
  const quoteByLine = new Map(
    quotes.map((quote) => [
      quoteKey(
        quote.productId,
        quote.breakdown.quantity,
        quote.templateVersionId,
        quote.variantId
      ),
      quote,
    ])
  )
  // Visibility is a product-level fact, so it needs its own set.
  const visibleProducts = new Set(quotes.map((quote) => quote.productId))

  const lines: ValidatedLine[] = cart.lines.map((line) => {
    // A product missing from the quote is one the actor may no longer see.
    // `checkLine` reports that identically to "gone", which is deliberate: a
    // cart message must not confirm that a SKU exists but has become another
    // customer's contract line.
    const facts = visibleProducts.has(line.productId) ? factsFor(line) : null

    // A template withdrawn since the line was added. Read from the joined row
    // rather than re-queried: the basket already loaded it, and one more round
    // trip per line to learn a status it is holding would be waste.
    const template =
      line.template && line.templateVersion
        ? {
            templateId: line.template.id,
            name: line.template.name,
            version: line.templateVersion.version,
            available:
              line.template.status === 'PUBLISHED' &&
              line.template.deletedAt === null,
          }
        : null

    return {
      line,
      check: checkLine(line.id, line.quantity, facts, template, enforceMoq),
      quote:
        quoteByLine.get(
          quoteKey(
            line.productId,
            orderableQuantityOf(line, enforceMoq),
            line.templateVersionId,
            line.variantId
          )
        ) ?? null,
    }
  })

  const subtotalCents = lines.reduce(
    (total, line) => total + lineTotalCents(line),
    0
  )
  const catalogSubtotalCents = lines.reduce(
    (total, line) => total + catalogLineTotalCents(line),
    0
  )

  const shippingMethod = findShippingMethod(cart.shippingMethod)
  const shippingCents = shippingCostCents(
    cart.shippingMethod,
    cart.lines.length > 0
  )
  const totalCents = subtotalCents + shippingCents

  const purchaseOrder = await checkPo(actor, cart)
  // Measured against the total, delivery included: the branch is invoiced for
  // the parcel as well as what is in it, and a budget that ignored the charge
  // would let an order through that the invoice then takes over the cap.
  const budget = await checkBudget(cart, totalCents, now)
  const userBudget = await checkUserBudget(actor, totalCents, now)

  const [approval, deliveryNotesRequired, billTo, oneOffAllowed] =
    await Promise.all([
      cart.siteId && cart.lines.length > 0
        ? previewApproval({
            accountId: actor.accountId,
            siteId: cart.siteId,
            totalCents,
            requesterId: actor.userId,
            requesterRole: actor.role,
            productIds: [...new Set(cart.lines.map((line) => line.productId))],
          })
        : Promise.resolve(NO_APPROVAL),
      deliveryNotesRequiredFor(actor.accountId),
      resolveBillTo(actor, cart),
      mayUseOneOffDeliveryAddress(actor),
    ])

  const shipTo = cart.shippingAddress
  // The buyer's own one-off address for this basket, while it is live.
  const ownOneOff =
    shipTo !== null &&
    shipTo.isOneOff &&
    shipTo.deletedAt === null &&
    shipTo.createdById === actor.userId
      ? shipTo
      : null

  const issues: CartIssue[] = lines.flatMap((line) => [...line.check.issues])
  const warnings: CartIssue[] = lines.flatMap((line) => [
    ...line.check.warnings,
  ])

  if (!purchaseOrder.valid && purchaseOrder.problem) {
    issues.push({
      code: CartIssueCode[purchaseOrder.problem],
      message:
        purchaseOrder.message ?? 'The purchase order reference is not valid.',
      lineId: null,
      details: {
        prefix: purchaseOrder.policy.prefix,
        requiredBy: purchaseOrder.policy.requiredBy,
        format: purchaseOrder.policy.format,
        formatExample: purchaseOrder.policy.formatExample,
      },
    })
  }

  if (budget.wouldExceed) {
    issues.push({
      code: CartIssueCode.BUDGET_EXCEEDED,
      message:
        budget.capCents === 0
          ? 'This branch is not currently permitted to place orders.'
          : `This order would take the branch ${formatMoney(budget.overageCents)} over its monthly budget.`,
      lineId: null,
      details: {
        cap: formatMoney(budget.capCents ?? 0),
        spent: formatMoney(budget.spentCents),
        remaining: formatMoney(budget.remainingCents ?? 0),
        overage: formatMoney(budget.overageCents),
      },
    })
  }

  // Both caps apply, and each is reported on its own: "the branch is over" and
  // "you are over your own limit" are fixed by different people.
  if (userBudget?.wouldExceed) {
    issues.push({
      code: CartIssueCode.USER_BUDGET_EXCEEDED,
      message:
        userBudget.capCents === 0
          ? 'Your account is not currently permitted to place orders.'
          : `This order would take you ${formatMoney(userBudget.overageCents)} over your personal monthly limit.`,
      lineId: null,
      details: {
        cap: formatMoney(userBudget.capCents ?? 0),
        spent: formatMoney(userBudget.spentCents),
        remaining: formatMoney(userBudget.remainingCents ?? 0),
        overage: formatMoney(userBudget.overageCents),
      },
    })
  }

  if (forCheckout) {
    issues.push(
      ...checkCheckoutDetails({
        hasLines: cart.lines.length > 0,
        siteId: cart.siteId,
        shippingAddressId: cart.shippingAddressId,
        // A one-off address stays usable only while the account still allows
        // them, this buyer still may, and it is theirs. Any of those lapsing
        // raises ADDRESS_NOT_AVAILABLE, the same as a saved address deleted
        // from under the basket.
        shippingAddressUsable:
          shipTo != null &&
          shipTo.deletedAt === null &&
          (!shipTo.isOneOff || (oneOffAllowed && ownOneOff !== null)),
        shippingMethod: cart.shippingMethod,
        paymentMethod: cart.paymentMethod,
        termsAcceptedAt: cart.termsAcceptedAt,
        requestedDeliveryDate: cart.requestedDeliveryDate,
        now,
      })
    )

    // Only a *pinned* bill-to that has gone away blocks. Having none on file at
    // all does not — orders were placed that way before bill-to was captured,
    // and refusing them now would be a new rule nobody has agreed to.
    if (billTo.chosenUnavailable) {
      issues.push({
        code: CartIssueCode.BILLING_ADDRESS_NOT_AVAILABLE,
        message:
          'The billing address chosen for this order is no longer available. Choose another.',
        lineId: null,
        details: { billingAddressId: cart.billingAddressId },
      })
    }
  }

  return {
    cart,
    lines,
    issues,
    warnings,
    valid: issues.length === 0,
    purchaseOrder,
    budget,
    userBudget,
    billingPeriod: billingPeriodOf(now),
    subtotalCents,
    catalogSubtotalCents,
    savingCents: catalogSubtotalCents - subtotalCents,
    shippingMethod,
    shippingCents,
    totalCents,
    approval,
    deliveryNotesRequired,
    billTo: billTo.resolved,
    customDeliveryAddress: {
      allowed: oneOffAllowed,
      current: ownOneOff
        ? { id: ownOneOff.id, ...toAddressSnapshot(ownOneOff) }
        : null,
    },
  }
}

/**
 * The account's "hold lines at their minimum order quantity" setting, read
 * without creating the settings row: a missing row means the schema default,
 * which is on.
 */
async function moqEnforcedFor(accountId: string): Promise<boolean> {
  const settings = await withTenantScope(accountId, (tx) =>
    tx.accountSettings.findUnique({
      where: { accountId },
      select: { enforceMoq: true },
    })
  )
  return settings?.enforceMoq ?? true
}

/**
 * The account's "require delivery notes" setting, read without creating the
 * settings row: a missing row means the schema default, which is off.
 */
export async function deliveryNotesRequiredFor(
  accountId: string
): Promise<boolean> {
  const settings = await withTenantScope(accountId, (tx) =>
    tx.accountSettings.findUnique({
      where: { accountId },
      select: { requireDeliveryNotes: true },
    })
  )
  return settings?.requireDeliveryNotes ?? false
}

/**
 * Whether this buyer may type a one-off delivery address (SOW F-18).
 *
 * Both halves, every time: the account has switched the option on (AD-8,
 * "alternate ship-to permission"), and this person has not had it withheld. The
 * route checks the permission too; this is also read by validation, where a
 * basket already holding a one-off address has to be re-judged if either half
 * has since been switched off.
 */
export async function mayUseOneOffDeliveryAddress(
  actor: AuthenticatedActor
): Promise<boolean> {
  const settings = await withTenantScope(actor.accountId, (tx) =>
    tx.accountSettings.findUnique({
      where: { accountId: actor.accountId },
      select: { allowCustomDeliveryAddress: true },
    })
  )
  if (!settings?.allowCustomDeliveryAddress) return false

  return can(actor, Permission.ORDER_CUSTOM_DELIVERY_ADDRESS)
}

/**
 * Delivers this basket to an address the buyer typed, rather than one of the
 * branch's saved ones (SOW F-18: "alternate ship-to entry").
 *
 * ---------------------------------------------------------------------------
 * Why it is still an address row
 * ---------------------------------------------------------------------------
 * Placement references and snapshots `cart.shippingAddress`, and the NZ Post
 * choice reads the basket's delivery address. Storing the typed address as an
 * ordinary SHIPPING row on the basket's branch means every one of those keeps
 * working untouched; `isOneOff` is what keeps it out of the branch's address
 * lists, and `createdById` is what keeps it to its author.
 *
 * ---------------------------------------------------------------------------
 * Replacing one
 * ---------------------------------------------------------------------------
 * Typing a second address retires the first, if it was this buyer's one-off and
 * no order points at it — otherwise every correction of a typo would leave a
 * row behind. One an order references is kept: it is that order's record of
 * where it went.
 */
export async function setOneOffDeliveryAddress(
  actor: AuthenticatedActor,
  dto: SetOneOffDeliveryAddressDto,
  requestedSiteId?: string,
  /**
   * The NZ Post record for `dto.nzPostAddressId`, fetched by the caller. When
   * given, its street, suburb, city and postcode are what is stored — not what
   * was typed — so the address row and the NZ Post choice set beside it
   * describe the same place (SOW F-16).
   */
  verified?: ValidatedAddress
): Promise<FullCart> {
  if (!(await mayUseOneOffDeliveryAddress(actor))) {
    throw new ForbiddenError(
      'This account does not allow delivery to an address typed at checkout. Choose one of the saved addresses.'
    )
  }

  const cart = await openCart(actor, requestedSiteId)
  if (!cart.siteId) {
    // An address has to hang off a branch, and a basket with none has no budget
    // or PO rule to order against either.
    throw new BusinessRuleError(
      'Choose the branch this order is for before entering a delivery address.'
    )
  }

  const previous = cart.shippingAddress
  const siteId = cart.siteId

  // NZ Post's lines win over typed ones. The buyer's own line2 is kept in front
  // of the suburb, because it is where a unit or floor goes that ParcelAddress
  // does not carry.
  const lines = verified
    ? {
        line1: `${verified.streetNumber} ${verified.street}`.trim(),
        line2:
          [dto.line2, verified.suburb]
            .filter((part): part is string => Boolean(part))
            .join(', ') || null,
        city: verified.city,
        region: null,
        postcode: verified.postcode,
        country: verified.countryCode,
      }
    : {
        line1: dto.line1!,
        line2: dto.line2 ?? null,
        city: dto.city!,
        region: dto.region ?? null,
        postcode: dto.postcode!,
        country: dto.country!,
      }

  await withTenantScope(actor.accountId, async (tx) => {
    const address = await tx.address.create({
      data: {
        id: createId('adr'),
        accountId: actor.accountId,
        siteId,
        kind: 'SHIPPING',
        isOneOff: true,
        isDefault: false,
        createdById: actor.userId,
        label: dto.label ?? null,
        recipientName: dto.recipientName ?? null,
        ...lines,
        phone: dto.phone ?? null,
        // The DPID and rural flag on the row itself, so the order's ship-to
        // and the label agree on the place (SOW F-16).
        ...(verified
          ? {
              nzPostAddressId: verified.addressId,
              dpid: verified.dpid,
              isRural: verified.isRural,
              nzPostValidatedAt: new Date(),
            }
          : {}),
      },
    })

    await tx.cart.update({
      where: { id: cart.id },
      data: { shippingAddressId: address.id },
    })

    if (
      previous &&
      previous.isOneOff &&
      previous.createdById === actor.userId &&
      previous.deletedAt === null
    ) {
      const referenced = await tx.order.count({
        where: { shippingAddressId: previous.id },
      })
      if (referenced === 0) {
        await tx.address.update({
          where: { id: previous.id },
          data: { deletedAt: new Date() },
        })
      }
    }
  })

  return openCart(actor, siteId)
}

/**
 * The validated basket, refused unless it is ready to become an order.
 *
 * This is the checkout session payload: the order module takes what this returns
 * and writes the order from it, without re-deriving anything. It deliberately
 * does not create the order, reserve stock or change the cart's status — all
 * three belong to the write the order module owns, and doing any of them here
 * would leave the system half-committed whenever that write failed.
 */
export async function checkoutSession(
  actor: AuthenticatedActor,
  requestedSiteId?: string
): Promise<CartValidation> {
  const validation = await validateCart(actor, requestedSiteId, true)

  if (!validation.valid) {
    throw new BusinessRuleError('This basket is not ready to be ordered.', {
      details: { issues: validation.issues },
    })
  }

  return validation
}

// --- Internals --------------------------------------------------------------

/**
 * Which branch this request may act for.
 *
 * A site user is pinned to their own branch: passing another one is not a
 * request to be corrected with an error that confirms the branch exists. A
 * head-office user may name any branch in their account — the tenant scope
 * already bounds that.
 */
async function resolveSite(
  actor: AuthenticatedActor,
  requested?: string
): Promise<string | null> {
  if (actor.role === Role.SITE_USER) return actor.siteId ?? null
  if (!requested) return actor.siteId ?? null

  const site = await withTenantScope(actor.accountId, (tx) =>
    tx.site.findFirst({
      where: { id: requested, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    })
  )

  // 404, not 403: the tenant scope means a site from another account is already
  // invisible, and a deactivated one should not be distinguishable from a
  // missing one.
  if (!site) throw new NotFoundError('Site')
  return site.id
}

async function requireOwnedLine(
  actor: AuthenticatedActor,
  lineId: string
): Promise<FullCart> {
  const line = await withTenantScope(actor.accountId, (tx) =>
    tx.cartLine.findFirst({
      where: { id: lineId },
      select: {
        id: true,
        cart: {
          select: { id: true, userId: true, siteId: true, status: true },
        },
      },
    })
  )

  if (!line) throw new NotFoundError('Cart line')

  // The tenant scope has already bounded this to the account. What it cannot
  // express is "this user's basket", so it is checked here.
  if (line.cart.userId !== actor.userId) throw new NotFoundError('Cart line')
  if (line.cart.status !== 'OPEN') {
    throw new BusinessRuleError('This basket has already been checked out.', {
      details: { status: line.cart.status },
    })
  }

  return openCart(actor, line.cart.siteId ?? undefined)
}

/**
 * The product must exist, be orderable and be one the actor may see.
 *
 * Read through the catalogue's visibility rule via the pricing service rather
 * than queried directly, so add-to-cart cannot become a second place that
 * decides what a customer may see.
 */
async function requireOrderableProduct(
  actor: AuthenticatedActor,
  productId: string,
  variantId: string | null
): Promise<{ sku: string }> {
  const [quote] = await quoteProducts(actor, {
    lines: [{ productId, quantity: 1 }],
  })

  if (!quote) throw new NotFoundError('Product')

  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    select: { sku: true, status: true, options: { select: { id: true } } },
  })
  if (!product) throw new NotFoundError('Product')

  if (!(ORDERABLE_STATUSES as readonly string[]).includes(product.status)) {
    throw new BusinessRuleError('This product cannot currently be ordered.', {
      details: { sku: product.sku, status: product.status },
    })
  }

  if (variantId) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null, status: 'ACTIVE' },
      select: { id: true },
    })
    if (!variant) throw new NotFoundError('Product option')
  } else if (product.options.length > 0) {
    // A configurable product ordered without a configuration would reach
    // production with nothing saying what to print.
    throw new BusinessRuleError(
      'Choose an option for this product before adding it.',
      {
        details: { sku: product.sku },
      }
    )
  }

  return { sku: product.sku }
}

async function assertAddressUsable(
  actor: AuthenticatedActor,
  siteId: string | null,
  addressId: string,
  kind: 'SHIPPING' | 'BILLING'
): Promise<void> {
  const address = await withTenantScope(actor.accountId, (tx) =>
    tx.address.findFirst({
      where: {
        id: addressId,
        deletedAt: null,
        kind,
        // An account-level address (siteId null) is usable by any branch — that
        // is the head-office bill-to. A site-level one belongs to its branch
        // alone.
        OR: [{ siteId: null }, ...(siteId ? [{ siteId }] : [])],
      },
      select: { id: true, isOneOff: true, createdById: true },
    })
  )

  // A one-off address belongs to the buyer who typed it. Anyone else pinning it
  // — by guessing or reusing an id — is told it does not exist, the same answer
  // as for an address in another account.
  if (!address || (address.isOneOff && address.createdById !== actor.userId)) {
    throw new NotFoundError(
      kind === 'SHIPPING' ? 'Delivery address' : 'Billing address'
    )
  }
}

/**
 * The bill-to this basket will be placed with (SOW F-15: "held against the site,
 * defaulted at checkout").
 *
 * ---------------------------------------------------------------------------
 * A choice is honoured or refused, never swapped
 * ---------------------------------------------------------------------------
 * When the buyer has pinned one, it is used only while it is still a live
 * BILLING address of this account that is either account-level or this basket's
 * branch — the same rule `assertAddressUsable` applied when it was chosen. If it
 * has since been deleted, retyped or belongs to a different branch (a head-office
 * buyer switched the basket's branch), the answer is `chosenUnavailable` and no
 * address. Falling back to a default there would bill somewhere the buyer did not
 * pick, on an order they believe says otherwise.
 *
 * ---------------------------------------------------------------------------
 * The default, when nothing is pinned
 * ---------------------------------------------------------------------------
 * The branch's own before the account's, because F-15 says the bill-to is "held
 * against the site". Within each level the one marked default wins, then the
 * oldest. One query for every candidate, ordered here rather than four queries
 * run in turn.
 *
 * `cart.billingAddress` is already loaded, but not trusted: the relation returns
 * a soft-deleted row just as happily, so the pinned address is re-read with the
 * filters that matter.
 */
async function resolveBillTo(
  actor: AuthenticatedActor,
  cart: FullCart
): Promise<{ resolved: ResolvedBillTo | null; chosenUnavailable: boolean }> {
  const branches = [
    { siteId: null },
    ...(cart.siteId ? [{ siteId: cart.siteId }] : []),
  ]

  if (cart.billingAddressId) {
    const chosen = await withTenantScope(actor.accountId, (tx) =>
      tx.address.findFirst({
        where: {
          id: cart.billingAddressId!,
          accountId: actor.accountId,
          kind: 'BILLING',
          deletedAt: null,
          OR: branches,
        },
      })
    )

    return chosen
      ? {
          resolved: {
            addressId: chosen.id,
            source: 'CHOSEN',
            address: toAddressSnapshot(chosen),
          },
          chosenUnavailable: false,
        }
      : { resolved: null, chosenUnavailable: true }
  }

  const candidates = await withTenantScope(actor.accountId, (tx) =>
    tx.address.findMany({
      where: {
        accountId: actor.accountId,
        kind: 'BILLING',
        deletedAt: null,
        OR: branches,
      },
      orderBy: { createdAt: 'asc' },
    })
  )

  const rank = (address: (typeof candidates)[number]) =>
    (address.siteId ? 0 : 2) + (address.isDefault ? 0 : 1)

  // Stable, so the createdAt order from the query survives within a rank.
  const best = [...candidates].sort((a, b) => rank(a) - rank(b))[0]

  return {
    resolved: best
      ? {
          addressId: best.id,
          source: best.siteId ? 'SITE' : 'ACCOUNT',
          address: toAddressSnapshot(best),
        }
      : null,
    chosenUnavailable: false,
  }
}

async function checkPo(
  actor: AuthenticatedActor,
  cart: FullCart
): Promise<PurchaseOrderCheck> {
  const [account, user] = await withTenantScope(actor.accountId, (tx) =>
    Promise.all([
      tx.account.findFirstOrThrow({
        where: { id: actor.accountId },
        select: { requirePoNumber: true, poPrefix: true, poFormat: true },
      }),
      tx.user.findFirstOrThrow({
        where: { id: actor.userId },
        select: { poPrefix: true },
      }),
    ])
  )

  // One instant for both calls, so the example the policy shows and the years
  // the check accepts cannot straddle midnight on 31 December.
  const now = new Date()

  const policy = resolvePurchaseOrderPolicy(
    {
      site: cart.site
        ? {
            poRequired: cart.site.poRequired,
            poPrefix: cart.site.poPrefix,
            poFormat: cart.site.poFormat,
          }
        : null,
      account,
      userPoPrefix: user.poPrefix,
    },
    now
  )

  return checkPurchaseOrder(cart.poNumber, policy, now)
}

/**
 * The branch's cap against what it has already committed this period.
 *
 * "Committed" deliberately includes orders still awaiting approval. If it did
 * not, a branch could queue ten unapproved orders, each individually within
 * budget, and blow the cap the moment they were approved together. Drafts,
 * rejections and cancellations do not count — see COMMITTED_STATUSES.
 *
 * The sum is over `billingPeriod` on the order rather than over `createdAt`, so
 * it uses the same key the invoices do and cannot disagree with an invoice by an
 * order placed either side of midnight on the 1st.
 *
 * An account with no branch chosen yet has no cap to check: `evaluateBudget`
 * treats a null cap as uncapped, which is correct — the branch decides the
 * ceiling and there is no branch.
 */
async function checkBudget(
  cart: FullCart,
  cartTotalCents: number,
  at: Date
): Promise<BudgetStatus> {
  const capCents =
    cart.site?.monthlyBudget == null ? null : toCents(cart.site.monthlyBudget)

  // Nothing to measure against, so nothing to sum. Skipping the query here is
  // not an optimisation: an uncapped branch must never be blocked, and asking
  // the database first would only make that slower.
  if (capCents === null || !cart.siteId) {
    return evaluateBudget({ capCents, spentCents: 0, cartTotalCents })
  }

  const committed = await withTenantScope(cart.accountId, (tx) =>
    tx.order.aggregate({
      where: {
        siteId: cart.siteId!,
        billingPeriod: billingPeriodOf(at),
        status: { in: [...COMMITTED_STATUSES] },
      },
      _sum: { total: true },
    })
  )

  return evaluateBudget({
    capCents,
    spentCents:
      committed._sum.total == null ? 0 : toCents(committed._sum.total),
    cartTotalCents,
  })
}

/**
 * The buyer's own monthly limit, if they have one (AD-4).
 *
 * Spend is what *this user* has committed this period — every order they
 * placed, at any branch, in the same committed statuses the branch cap counts —
 * because the limit is on the person, not on a branch they happen to be
 * ordering for. Null for a user with no cap.
 */
async function checkUserBudget(
  actor: AuthenticatedActor,
  cartTotalCents: number,
  at: Date
): Promise<BudgetStatus | null> {
  return withTenantScope(actor.accountId, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: actor.userId },
      select: { monthlyBudgetCap: true },
    })
    if (user?.monthlyBudgetCap == null) return null

    const committed = await tx.order.aggregate({
      where: {
        placedById: actor.userId,
        billingPeriod: billingPeriodOf(at),
        status: { in: [...COMMITTED_STATUSES] },
      },
      _sum: { total: true },
    })

    return evaluateBudget({
      capCents: toCents(user.monthlyBudgetCap),
      spentCents:
        committed._sum.total == null ? 0 : toCents(committed._sum.total),
      cartTotalCents,
    })
  })
}

/**
 * Prices every line, in as few calls as the quote endpoint allows.
 *
 * Two things happen here that a naive one-call-per-cart version gets wrong.
 * Identical (product, quantity, design) triples are asked for once — a basket
 * with the same SKU on four lines personalised from one design at the same run
 * length is one question, not four. And the request is chunked, because the
 * quote endpoint caps a batch and a large re-order would otherwise be rejected
 * outright rather than priced.
 */
async function quoteLines(
  actor: AuthenticatedActor,
  cart: FullCart,
  enforceMoq: boolean
): Promise<QuotedLine[]> {
  if (cart.lines.length === 0) return []

  const wanted = new Map<
    string,
    {
      productId: string
      quantity: number
      templateVersionId?: string
      variantId?: string
    }
  >()
  for (const line of cart.lines) {
    const quantity = orderableQuantityOf(line, enforceMoq)
    wanted.set(
      quoteKey(
        line.productId,
        quantity,
        line.templateVersionId,
        line.variantId
      ),
      {
        productId: line.productId,
        quantity,
        ...(line.templateVersionId
          ? { templateVersionId: line.templateVersionId }
          : {}),
        ...(line.variantId ? { variantId: line.variantId } : {}),
      }
    )
  }

  const pending = [...wanted.values()]
  const quotes: QuotedLine[] = []

  for (let index = 0; index < pending.length; index += QUOTE_BATCH_SIZE) {
    const batch = pending.slice(index, index + QUOTE_BATCH_SIZE)
    quotes.push(...(await quoteProducts(actor, { lines: batch })))
  }

  return quotes
}

function factsFor(line: CartLineRow): LineProductFacts {
  return {
    productId: line.productId,
    sku: line.product.sku,
    name: line.product.name,
    orderable: (ORDERABLE_STATUSES as readonly string[]).includes(
      line.product.status
    ),
    moq: line.product.moq,
    orderMultiple: line.product.orderMultiple,
    trackInventory: line.product.trackInventory,
    // A configured line draws on its variant's shelf, not the product's.
    availableStock: line.variant
      ? Math.max(0, line.variant.stockOnHand - line.variant.stockReserved)
      : Math.max(0, line.product.stockOnHand - line.product.stockReserved),
    variant: line.variant
      ? {
          id: line.variant.id,
          sku: line.variant.sku,
          active:
            line.variant.status === 'ACTIVE' && line.variant.deletedAt === null,
        }
      : null,
  }
}

/**
 * The quantity that would actually be ordered, used for pricing and for the
 * stock check.
 *
 * Priced at the rounded quantity rather than the typed one: rounding 120 up to
 * 500 is what the customer will be charged for, and quoting the 120 would show a
 * total the invoice then disagrees with.
 *
 * With the account's `enforceMoq` off the typed quantity is what is ordered, so
 * it is also what is priced.
 */
function orderableQuantityOf(line: CartLineRow, enforceMoq: boolean): number {
  if (!enforceMoq) return line.quantity
  return roundToOrderable(
    line.quantity,
    line.product.moq,
    line.product.orderMultiple
  )
}

function lineTotalCents(line: ValidatedLine): number {
  return line.quote?.breakdown.lineTotalCents ?? 0
}

function catalogLineTotalCents(line: ValidatedLine): number {
  return line.quote?.breakdown.catalogLineTotalCents ?? 0
}

function toCents(value: { toFixed(digits: number): string }): number {
  return Math.round(Number(value.toFixed(2)) * 100)
}

function formatMoney(cents: number): string {
  return (cents / 100).toFixed(2)
}
