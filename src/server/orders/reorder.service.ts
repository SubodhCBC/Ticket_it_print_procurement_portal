import { addLine, openCart, type FullCart } from '../cart/cart.service'
import { ORDERABLE_STATUSES } from '../catalog/product-status'
import type { AuthenticatedActor } from '../context/request-context'
import { prisma } from '../db/client'
import { fromJsonOr } from '../db/json-column'
import { getCustomisable } from '../templates/templates.service'
import { BusinessRuleError, isAppError } from '../utils/errors'
import { findOrderById } from './orders.service'

/**
 * One-click re-order (SOW M-08: "one-click re-order"; E2E-06 asks for a
 * re-order "with specifications intact").
 *
 * ---------------------------------------------------------------------------
 * What is carried over, and what deliberately is not
 * ---------------------------------------------------------------------------
 * The specification is carried: product, configuration, quantity, the design
 * and the personalisation that was printed on it, and the line's notes.
 *
 * The money is not. An order line holds the price it was placed at — that is
 * the point of the snapshot — and a design's price lives on its published
 * version. Re-ordering resolves each design to the version published *now*, so
 * the basket quotes today's price, exactly as if the buyer had found the item in
 * the catalogue. A basket quoting last year's figure would not survive checkout.
 *
 * ---------------------------------------------------------------------------
 * Why this fills the basket instead of placing an order
 * ---------------------------------------------------------------------------
 * "One click" is one click to a filled basket, not to a committed order. A
 * re-order still has to clear MOQ and order multiples, budget caps, approval
 * routing, stock and a PO number, and any of those can have changed since.
 * Placing it outright would either skip those rules or fail with a message about
 * a basket the buyer never saw.
 *
 * Lines are appended, never replacing what is already there: a basket is work
 * in progress, and discarding it because someone clicked re-order would be
 * losing data to save a click.
 *
 * ---------------------------------------------------------------------------
 * Why each line goes through `addLine`
 * ---------------------------------------------------------------------------
 * Every rule about what may enter a basket lives in `addLine` — orderable
 * status, visibility to this account, a configuration for a configurable
 * product, a published design, and the rebuilding of personalisation against
 * the live version. Re-order calls it once per line and reports what it
 * refused, rather than reimplementing any of it. A second copy of those rules
 * would drift, and the way it would fail is by accepting into a basket
 * something the shop would not sell.
 *
 * ---------------------------------------------------------------------------
 * Nothing is substituted
 * ---------------------------------------------------------------------------
 * A line is re-ordered as it was or not at all. Two tempting shortcuts are
 * refused on purpose:
 *
 * - **Swapping in a replacement product.** A superseded product points at its
 *   successor, but a design is drawn and priced for one product; moving it onto
 *   another would print old artwork on a different item at a price nobody
 *   agreed. The successor is *named* instead, so the buyer can go to it.
 *
 * - **Picking a design for a line that had none.** Orders placed before template
 *   pricing carry no design, and the basket now requires one because the design
 *   is what sets the price. Choosing it on the buyer's behalf would choose what
 *   is printed and what is charged. The line says a design is needed instead.
 */

/** Whether a line went back in the basket. */
export type ReorderOutcome = 'ADDED' | 'UNAVAILABLE'

/**
 * Why a line did not go back in, as something a screen can act on.
 *
 * The prose `reason` is for reading; this is for deciding what to offer next to
 * it — a link to the replacement, a design picker, or nothing.
 */
export type ReorderReasonCode =
  /** Deleted, withdrawn, or no longer offered to this account. */
  | 'PRODUCT_WITHDRAWN'
  /** Superseded. `replacedBy` names the product that took its place. */
  | 'PRODUCT_REPLACED'
  /** The design on the line is no longer published to this account. */
  | 'DESIGN_WITHDRAWN'
  /** The line has no design, and every basket line needs one now. */
  | 'DESIGN_REQUIRED'
  /** Any other refusal from the basket; `reason` carries its own words. */
  | 'REFUSED'

export interface ReorderReplacement {
  readonly productId: string
  readonly sku: string
  readonly name: string
}

export interface ReorderLineResult {
  readonly orderLineId: string
  /** The SKU and name as the order recorded them, so the row is recognisable. */
  readonly sku: string
  readonly name: string
  readonly quantity: number
  readonly outcome: ReorderOutcome
  /** Null when the line was added. */
  readonly reasonCode: ReorderReasonCode | null
  /** Why it was not added, in words a buyer can act on. Null when added. */
  readonly reason: string | null
  /** The product that replaced this one, when it was superseded. */
  readonly replacedBy: ReorderReplacement | null
}

export interface ReorderResult {
  readonly cart: FullCart
  readonly lines: readonly ReorderLineResult[]
}

/** The value shape a basket line's personalisation may hold. */
type CustomisationValues = Record<string, string | number | boolean | null>

/**
 * How far a chain of replacements is followed to name the current one.
 *
 * A successor may only be an orderable product, so a long chain means a product
 * replaced several times over — plausible — while an endless one means a cycle
 * somebody made by hand. Stopping names no replacement rather than looping.
 */
const MAX_SUCCESSOR_HOPS = 8

interface ProductRow {
  readonly id: string
  readonly sku: string
  readonly name: string
  readonly status: string
  readonly supersededById: string | null
}

/**
 * Read outside the tenant scope on purpose: the catalogue is the platform's,
 * not a tenant's, and this reads only status, SKU and name. Whether this buyer
 * may *order* a product is decided by `addLine`, which applies visibility.
 */
function readProduct(id: string): Promise<ProductRow | null> {
  return prisma.product.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true,
      sku: true,
      name: true,
      status: true,
      supersededById: true,
    },
  })
}

const isOrderable = (status: string) =>
  (ORDERABLE_STATUSES as readonly string[]).includes(status)

/**
 * The orderable product at the end of a chain of replacements.
 *
 * Null when the chain ends somewhere unorderable or runs too long — in which
 * case the line is still reported as replaced, just without a name to follow.
 */
async function currentReplacement(
  product: ProductRow
): Promise<ReorderReplacement | null> {
  let next = product.supersededById
  for (let hop = 0; hop < MAX_SUCCESSOR_HOPS && next; hop++) {
    const candidate = await readProduct(next)
    if (!candidate) return null
    if (candidate.status !== 'SUPERSEDED') {
      return isOrderable(candidate.status)
        ? { productId: candidate.id, sku: candidate.sku, name: candidate.name }
        : null
    }
    next = candidate.supersededById
  }
  return null
}

export async function reorderToCart(
  actor: AuthenticatedActor,
  orderId: string
): Promise<ReorderResult> {
  // 404 for an order this buyer may not see, from the same read the order page
  // uses. Re-order must not become a way to discover what another branch bought.
  const order = await findOrderById(actor, orderId)

  const results: ReorderLineResult[] = []
  let cart: FullCart | null = null

  for (const line of order.lines) {
    const product = await readProduct(line.productId)

    if (product?.status === 'SUPERSEDED') {
      const replacedBy = await currentReplacement(product)
      results.push(
        notAdded(
          line,
          'PRODUCT_REPLACED',
          replacedBy
            ? `${line.sku} has been replaced by ${replacedBy.sku}. Order that instead.`
            : `${line.sku} has been replaced and can no longer be ordered.`,
          replacedBy
        )
      )
      continue
    }

    if (!product || !isOrderable(product.status)) {
      results.push(
        notAdded(
          line,
          'PRODUCT_WITHDRAWN',
          'This item is no longer available to order.'
        )
      )
      continue
    }

    /**
     * The design is re-resolved to whatever is published now.
     *
     * The order names the exact version it was printed from, and that row is
     * immutable — but a basket may only hold the live version, so the old one
     * would be refused as stale. Taking the current version and letting
     * `addLine` rebuild the personalisation against it is what carries a buyer's
     * details across a redesign; a field the new artwork no longer has is
     * dropped there. It is also what re-prices the line.
     */
    let templateVersionId: string | null = null
    if (line.templateId) {
      try {
        const { version } = await getCustomisable(actor, line.templateId)
        templateVersionId = version.id
      } catch (error) {
        if (!isAppError(error)) throw error
        results.push(
          notAdded(
            line,
            'DESIGN_WITHDRAWN',
            'The design on this item is no longer published, so it cannot be ordered again as it was.'
          )
        )
        continue
      }
    }

    try {
      cart = await addLine(
        actor,
        {
          productId: product.id,
          variantId: line.variantId,
          // Carried as ordered, not rounded here. The basket reports MOQ and
          // order-multiple corrections at validation, and doing it in two places
          // is how the two start to disagree.
          quantity: line.quantity,
          ...(line.templateId && templateVersionId
            ? {
                templateId: line.templateId,
                templateVersionId,
                // Typed as the basket types it: this JSON was written by
                // `acceptCustomisation` on the way in, and is handed straight
                // back to it, which rebuilds it against the live artwork.
                customisation: fromJsonOr<CustomisationValues | null>(
                  line.customisation,
                  null
                ),
              }
            : {}),
          notes: line.notes,
        },
        // The order's branch, not the buyer's default: head office re-ordering
        // for a branch fills that branch's basket. A site user is pinned to
        // their own branch by `resolveSite` whatever is passed here.
        order.siteId
      )

      results.push({
        orderLineId: line.id,
        sku: line.sku,
        name: line.name,
        quantity: line.quantity,
        outcome: 'ADDED',
        reasonCode: null,
        reason: null,
        replacedBy: null,
      })
    } catch (error) {
      // The shop's own refusal, in the shop's own words — "Choose an option for
      // this product", "Pick a design before adding this". Rewording it here
      // would tell the buyer something different from the product page. Anything
      // that is not an ordinary refusal is a fault, left to the error handler.
      if (!isAppError(error)) throw error
      results.push(
        notAdded(
          line,
          reasonOf(error.details) === 'TEMPLATE_REQUIRED'
            ? 'DESIGN_REQUIRED'
            : 'REFUSED',
          error.message
        )
      )
    }
  }

  /**
   * Nothing carried over is a refusal, not an empty success.
   *
   * A 201 with an untouched basket reads as "done", and the buyer would go
   * looking for lines that were never added. The headline stays neutral because
   * the causes differ — an item still on sale that now needs a design is not an
   * item that was withdrawn — and the per-line codes say which is which.
   */
  if (!results.some((line) => line.outcome === 'ADDED')) {
    throw new BusinessRuleError(
      'None of the items on this order could go back in the basket. Each one says why.',
      { details: { lines: results } }
    )
  }

  // Non-null in practice — the guard above throws unless a line landed, and a
  // line that landed returned a basket — but read back rather than asserted, so
  // a later change to that guard cannot become a null at runtime.
  return { cart: cart ?? (await openCart(actor, order.siteId)), lines: results }
}

function reasonOf(details: unknown): unknown {
  return details && typeof details === 'object'
    ? (details as { reason?: unknown }).reason
    : undefined
}

function notAdded(
  line: { id: string; sku: string; name: string; quantity: number },
  reasonCode: ReorderReasonCode,
  reason: string,
  replacedBy: ReorderReplacement | null = null
): ReorderLineResult {
  return {
    orderLineId: line.id,
    sku: line.sku,
    name: line.name,
    quantity: line.quantity,
    outcome: 'UNAVAILABLE',
    reasonCode,
    reason,
    replacedBy,
  }
}
