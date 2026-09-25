import type { TransactionClient } from '../db/client'

/**
 * The points where the order lifecycle touches shipping.
 *
 * Kept apart from the shipping services on purpose: those import the orders
 * service, and the orders service imports these. Each function here takes the
 * caller's transaction and depends on nothing but the database, so there is no
 * cycle and no second transaction.
 */

/**
 * Freezes the basket's delivery choice onto the new order, inside the
 * placement transaction.
 *
 * A copy rather than a reference for the same reason the address snapshot is a
 * copy: the basket's row is history once the order exists, and what the order
 * records is what was chosen at the moment it was placed. The quote is copied
 * as it stands. It is not re-quoted, because nothing is billed from it
 * (decision D4) — it is a record for reconciling NZ Post's invoice.
 */
export async function copyCartShippingToOrder(
  tx: TransactionClient,
  cartId: string,
  orderId: string,
  accountId: string
): Promise<boolean> {
  const selection = await tx.cartShippingSelection.findUnique({
    where: { cartId },
  })
  if (!selection) return false

  await tx.orderShipping.create({
    data: {
      orderId,
      accountId,
      deliveryKind: selection.deliveryKind,
      nzPostAddressId: selection.nzPostAddressId,
      dpid: selection.dpid,
      isRural: selection.isRural,
      fullAddress: selection.fullAddress,
      deliveryAddress: selection.deliveryAddress,
      collectionPointId: selection.collectionPointId,
      collectionPoint: selection.collectionPoint,
      serviceCode: selection.serviceCode,
      serviceDescription: selection.serviceDescription,
      quoteSource: selection.quoteSource,
      quotedPriceExclGst: selection.quotedPriceExclGst,
      quotedPriceInclGst: selection.quotedPriceInclGst,
      quotedAt: selection.quotedAt,
      parcelEstimate: selection.parcelEstimate,
    },
  })
  return true
}

/** Statuses a shipment can be voided from by an order leaving production. */
const OPEN_SHIPMENT_STATUSES = ['PENDING', 'SUBMITTED', 'LABELLED', 'FAILED']

/**
 * Voids every label an order still holds, inside the status-change transaction.
 *
 * Called when an order in production is cancelled or sent back for changes.
 * NZ Post has no void endpoint, so this is the portal's record only: a label
 * nobody scans is never charged, and staff are told to discard the printed copy.
 * A label job still in flight sees VOIDED and stops.
 */
export async function voidOpenShipmentsForOrder(
  tx: TransactionClient,
  orderId: string,
  reason: string
): Promise<string[]> {
  const open = await tx.shipment.findMany({
    where: { orderId, status: { in: OPEN_SHIPMENT_STATUSES } },
    select: { id: true },
  })
  if (open.length === 0) return []

  await tx.shipment.updateMany({
    where: { id: { in: open.map((row) => row.id) } },
    data: {
      status: 'VOIDED',
      voidedAt: new Date(),
      voidReason: reason.slice(0, 500),
    },
  })
  return open.map((row) => row.id)
}
