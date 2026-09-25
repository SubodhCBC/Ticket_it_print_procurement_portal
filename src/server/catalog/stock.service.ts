import type { TransactionClient } from '../db/client'
import { BusinessRuleError } from '../utils/errors'

/**
 * Reserving, releasing and consuming warehouse stock.
 *
 * ---------------------------------------------------------------------------
 * The race this exists to lose safely
 * ---------------------------------------------------------------------------
 * Reserving is the one place in this system where two requests genuinely
 * compete for the same scarce thing. A read-then-write check — "are there three
 * left? yes, take three" — passes for both of two buyers at the last three
 * units, and both are told yes. One of them finds out at dispatch.
 *
 * So every function here is a single conditional UPDATE that carries its own
 * guard, and a row count of zero means "someone else got there first". Postgres
 * serialises the two statements on the row lock, so exactly one can win. There
 * is no SELECT beforehand to be stale.
 *
 * ---------------------------------------------------------------------------
 * Called inside someone else's transaction
 * ---------------------------------------------------------------------------
 * Every function takes a `tx`. Reserving stock and writing the order have to
 * commit together: a reservation left behind by an order that failed to save is
 * inventory nobody can ever buy and nobody knows to release.
 */

/**
 * Holds stock for an order.
 *
 * Products that do not track inventory are skipped silently — print-on-demand
 * has no shelf to reserve from, and refusing or pretending would both be wrong.
 * Returns true when anything was actually held, which is what tells the caller
 * whether there is a reservation to release later.
 *
 * Throws on the first line that cannot be satisfied, and because this runs
 * inside the caller's transaction, the lines already reserved are rolled back
 * with it. A partially reserved order is not a state anything downstream knows
 * how to read.
 */
export async function reserveStock(
  tx: TransactionClient,
  lines: readonly {
    productId: string
    variantId: string | null
    quantity: number
    sku: string
  }[]
): Promise<boolean> {
  let held = false

  for (const line of lines) {
    const taken = line.variantId
      ? await take(tx, 'product_variants', line.variantId, line.quantity)
      : await take(tx, 'products', line.productId, line.quantity)

    if (taken === 'not-tracked') continue

    if (taken === 'insufficient') {
      // The available figure is read only now, to explain the failure. It may
      // already have moved again by the time the message is composed, which is
      // why the *decision* was made by the UPDATE and not by this number.
      const free = await available(tx, line.productId, line.variantId)
      throw new BusinessRuleError(
        free === 0
          ? `"${line.sku}" is out of stock.`
          : `Only ${free} of "${line.sku}" are available; the order needs ${line.quantity}.`,
        {
          details: { sku: line.sku, requested: line.quantity, available: free },
        }
      )
    }

    held = true
  }

  return held
}

/**
 * Puts a rejected or cancelled order's stock back on the shelf.
 *
 * Idempotent by the caller's `stockState` check, not by anything here: this
 * decrements unconditionally, because a release that silently did nothing would
 * leave stock stranded and give no sign of it.
 */
export async function releaseStock(
  tx: TransactionClient,
  lines: readonly {
    productId: string
    variantId: string | null
    quantity: number
  }[]
): Promise<void> {
  for (const line of lines) {
    if (line.variantId) {
      await tx.$executeRaw`
        UPDATE "product_variants"
        SET "stockReserved" = GREATEST(0, "stockReserved" - ${line.quantity})
        WHERE "id" = ${line.variantId}`
    } else {
      await tx.$executeRaw`
        UPDATE "products"
        SET "stockReserved" = GREATEST(0, "stockReserved" - ${line.quantity})
        WHERE "id" = ${line.productId} AND "trackInventory" = 1`
    }
  }
}

/**
 * The goods have shipped: the shelf count and the reservation both come down.
 *
 * Floored at zero on both, so a reconciliation that corrected the shelf between
 * placement and dispatch cannot drive either negative and fail the dispatch. The
 * variance is the stocktake's to explain, not the shipment's to refuse.
 */
export async function consumeStock(
  tx: TransactionClient,
  lines: readonly {
    productId: string
    variantId: string | null
    quantity: number
  }[]
): Promise<void> {
  for (const line of lines) {
    if (line.variantId) {
      await tx.$executeRaw`
        UPDATE "product_variants"
        SET "stockOnHand"   = GREATEST(0, "stockOnHand" - ${line.quantity}),
            "stockReserved" = GREATEST(0, "stockReserved" - ${line.quantity})
        WHERE "id" = ${line.variantId}`
    } else {
      await tx.$executeRaw`
        UPDATE "products"
        SET "stockOnHand"   = GREATEST(0, "stockOnHand" - ${line.quantity}),
            "stockReserved" = GREATEST(0, "stockReserved" - ${line.quantity})
        WHERE "id" = ${line.productId} AND "trackInventory" = 1`
    }
  }
}

/**
 * The conditional update, and the whole reason this file exists.
 *
 * The `WHERE` clause is the check. Doing it in the statement rather than before
 * it is what makes two simultaneous checkouts for the last unit resolve to one
 * winner instead of two.
 */
async function take(
  tx: TransactionClient,
  table: 'products' | 'product_variants',
  id: string,
  quantity: number
): Promise<'ok' | 'insufficient' | 'not-tracked'> {
  const updated =
    table === 'products'
      ? await tx.$executeRaw`
          UPDATE "products"
          SET "stockReserved" = "stockReserved" + ${quantity}
          WHERE "id" = ${id}
            AND "trackInventory" = 1
            AND "stockOnHand" - "stockReserved" >= ${quantity}`
      : await tx.$executeRaw`
          UPDATE "product_variants"
          SET "stockReserved" = "stockReserved" + ${quantity}
          WHERE "id" = ${id}
            AND "stockOnHand" - "stockReserved" >= ${quantity}`

  if (updated > 0) return 'ok'

  // Zero rows means one of two things, and they need different answers: the
  // product does not track stock at all, or it does and there is not enough.
  if (table === 'products') {
    const product = await tx.product.findFirst({
      where: { id },
      select: { trackInventory: true },
    })
    if (product && !product.trackInventory) return 'not-tracked'
  }

  return 'insufficient'
}

/** What is still buyable. Used only to explain a failure. */
async function available(
  tx: TransactionClient,
  productId: string,
  variantId: string | null
): Promise<number> {
  if (variantId) {
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId },
      select: { stockOnHand: true, stockReserved: true },
    })
    return variant
      ? Math.max(0, variant.stockOnHand - variant.stockReserved)
      : 0
  }

  const product = await tx.product.findFirst({
    where: { id: productId },
    select: { stockOnHand: true, stockReserved: true },
  })
  return product ? Math.max(0, product.stockOnHand - product.stockReserved) : 0
}
