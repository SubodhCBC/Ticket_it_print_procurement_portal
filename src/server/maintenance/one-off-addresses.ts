import { getConfig } from '../config'
import { prisma } from '../db/client'

/**
 * Removes delivery addresses typed at checkout that nothing uses any more
 * (SOW F-18).
 *
 * ---------------------------------------------------------------------------
 * Where they come from
 * ---------------------------------------------------------------------------
 * A one-off address is a row on the basket's branch, hidden from its address
 * lists. It stops being used when the buyer types a different one (the previous
 * one is retired then), or when they switch the basket back to a saved address
 * — which leaves the typed one live but unreferenced, and nothing else would
 * ever clear it.
 *
 * ---------------------------------------------------------------------------
 * Why deleted, when nothing else here is
 * ---------------------------------------------------------------------------
 * The rule that rows are soft-deleted exists so history survives. These have
 * none: no order was placed to them, no basket holds them, only their author
 * could ever see them, and a soft delete would leave exactly the row this job
 * exists to remove. Anything an order references — shipping or billing — is
 * never touched, whatever its age, because that is the order's record of where
 * it went.
 *
 * ---------------------------------------------------------------------------
 * One statement
 * ---------------------------------------------------------------------------
 * The "nothing references it" test is part of the DELETE rather than a lookup
 * before it, so a basket that pins an address between the two cannot have it
 * removed from under it. The window that remains is the database's own, and a
 * foreign-key refusal there fails the job, which the queue retries tomorrow.
 *
 * Runs unscoped on the worker, across every account, which is what a platform
 * housekeeping job is for.
 */
export async function purgeUnusedOneOffAddresses(
  now: Date = new Date()
): Promise<number> {
  const days = getConfig().maintenance.oneOffAddressRetentionDays
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60_000)

  const result = await prisma.address.deleteMany({
    where: {
      isOneOff: true,
      createdAt: { lt: cutoff },
      cartsShippingTo: { none: {} },
      cartsBillingTo: { none: {} },
      ordersShippingTo: { none: {} },
      ordersBillingTo: { none: {} },
    },
  })

  if (result.count > 0) {
    console.info(
      `[maintenance] removed ${result.count} unused one-off delivery address(es) older than ${days} day(s).`
    )
  }
  return result.count
}
