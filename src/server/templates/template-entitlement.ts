import { COMMITTED_STATUSES } from '../orders/order-status'
import { prisma } from '../db/client'
import { BusinessRuleError } from '../utils/errors'
import { createId } from '../utils/ids'
import { copyTemplateImages } from './template-asset-copy'

/**
 * Whether a customer has bought a template, which is what earns them a copy.
 *
 * ---------------------------------------------------------------------------
 * The rule, and why it is a purchase rather than a permission
 * ---------------------------------------------------------------------------
 * The operator's templates are the product. Somebody was paid to design them,
 * and a customer who wants one starts by ordering it — after that the design is
 * theirs to copy and rework as often as they like, and the original is never
 * touched. Without the gate, the library could be emptied into private copies by
 * anyone who opened the gallery.
 *
 * It applies only to the operator's library. A customer's own work needs no
 * entitlement: a head office copying its own template, or a site user copying
 * theirs, is not buying anything.
 *
 * ---------------------------------------------------------------------------
 * What counts as bought
 * ---------------------------------------------------------------------------
 * A line on one of this user's orders naming this template, on an order that
 * has reached a committed status. `COMMITTED_STATUSES` is the same set the
 * branch budget counts, and it includes PENDING_APPROVAL deliberately: a buyer
 * whose order is sitting with their head office has committed to it, and making
 * them wait for approval before they can start personalising is a delay with
 * nothing behind it.
 *
 * Per user, not per account. A colleague's purchase does not entitle you —
 * "visible only to that specific site user" is the rule for the copies, and an
 * entitlement wider than the visibility would be a door into a room with no
 * light.
 */
export async function hasPurchased(
  userId: string,
  templateId: string
): Promise<boolean> {
  const line = await prisma.orderLineItem.findFirst({
    where: {
      templateId,
      order: {
        placedById: userId,
        status: { in: [...COMMITTED_STATUSES] as string[] },
      },
    },
    select: { id: true },
  })

  return line !== null
}

/**
 * The same question, phrased as the refusal a route should return.
 *
 * The message names the remedy rather than the rule. "Order it once" is
 * something the buyer can act on; "you lack an entitlement" is not.
 */
export async function assertPurchased(
  userId: string,
  templateId: string,
  templateName: string
): Promise<void> {
  if (await hasPurchased(userId, templateId)) return

  throw new BusinessRuleError(
    `Order "${templateName}" once and it is yours to copy and edit as often as you like.`,
    { details: { templateId, reason: 'NOT_PURCHASED' } }
  )
}

/**
 * Every operator template this user has bought.
 *
 * For the gallery, so it can mark what is already theirs to copy without asking
 * once per tile.
 */
export async function purchasedTemplateIds(
  userId: string
): Promise<ReadonlySet<string>> {
  const lines = await prisma.orderLineItem.findMany({
    where: {
      templateId: { not: null },
      order: {
        placedById: userId,
        status: { in: [...COMMITTED_STATUSES] as string[] },
      },
    },
    select: { templateId: true },
    distinct: ['templateId'],
  })

  return new Set(
    lines
      .map((line) => line.templateId)
      .filter((id): id is string => id !== null)
  )
}

/**
 * Hands the buyer their own copy of every template they just ordered.
 *
 * ---------------------------------------------------------------------------
 * Why a copy arrives with the order rather than being asked for
 * ---------------------------------------------------------------------------
 * Buying one of the operator's designs is what earns the right to rework it,
 * and the point of buying is not to admire it — it is to put this branch's name
 * on it next month without paying a designer again. Waiting for the buyer to
 * find a "make a copy" button turns a thing they have already paid for into a
 * thing they have to discover.
 *
 * Idempotent on the source: a second order of the same design does not produce a
 * second copy, because the first one is by then the copy they have been editing.
 * This is the only way a buyer gets a copy — there is no endpoint for making
 * more by hand.
 *
 * ---------------------------------------------------------------------------
 * Never allowed to fail the order
 * ---------------------------------------------------------------------------
 * The order is committed and paid for by the time this runs. A copy that could
 * not be made is a missing convenience, not a lost order, so failures are logged
 * and swallowed, in the same way and for the same reason as the confirmation
 * email beside it. The log line matters more than it used to: this is the only
 * path that makes a copy, so nothing else will retry it.
 */
export async function grantTemplateCopies(
  buyer: { userId: string; accountId: string; email: string },
  orderId: string
): Promise<void> {
  try {
    const lines = await prisma.orderLineItem.findMany({
      where: { orderId, templateId: { not: null } },
      select: { templateId: true },
      distinct: ['templateId'],
    })

    for (const line of lines) {
      if (!line.templateId) continue
      await copyForBuyer(buyer, line.templateId)
    }
  } catch (error) {
    console.error(
      `Could not hand out template copies for order ${orderId}; nothing else ` +
        'retries this, so the buyer has no copy of these designs. ' +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

async function copyForBuyer(
  buyer: { userId: string; accountId: string; email: string },
  templateId: string
): Promise<void> {
  const source = await prisma.template.findFirst({
    where: { id: templateId, deletedAt: null },
  })

  // Only the operator's designs are handed out. A buyer who ordered from their
  // own copy already has it, and copying it again on every order would fill
  // their gallery with duplicates of one design.
  if (!source || source.ownerUserId !== null) return

  const already = await prisma.template.findFirst({
    where: {
      sourceTemplateId: templateId,
      ownerUserId: buyer.userId,
      deletedAt: null,
    },
    select: { id: true },
  })
  if (already) return

  const name = `${source.name} (my copy)`
  const id = createId('tpl')
  const code = `${source.code}-${buyer.userId.slice(-8).toUpperCase()}`

  await prisma.template.create({
    data: {
      id,
      // Suffixed with the owner because the code is unique across every
      // template in the system, and two branches buying the same design would
      // otherwise collide on it.
      code,
      name,
      description: source.description,
      productId: source.productId,
      categoryId: source.categoryId,
      status: 'DRAFT',
      visibility: 'PRIVATE',
      ownerUserId: buyer.userId,
      ownerAccountId: buyer.accountId,
      sourceTemplateId: source.id,
      // Inherited from the design they bought. This is the copy a buyer
      // actually reorders from, so an unpriced one would be a design they own
      // and cannot buy again — the opposite of what granting it is for.
      price: source.price,
      unitsPerPack: source.unitsPerPack,
      theme: source.theme,
      orientation: source.orientation,
      aspectRatio: source.aspectRatio,
      widthValue: source.widthValue,
      heightValue: source.heightValue,
      dimensionUnit: source.dimensionUnit,
      bleedMargin: source.bleedMargin,
      safeMargin: source.safeMargin,
      // Already JSON text on the row, so copied across as-is.
      canvasConfig: source.canvasConfig,
      layers: source.layers,
      design: source.design,
      canvasJson: source.canvasJson,
      createdById: buyer.userId,
      createdByName: buyer.email,
      updatedById: buyer.userId,
      updatedByName: buyer.email,
    },
  })

  // The tile too, so the copy is recognisable in their gallery the moment it
  // arrives. Without it a buyer's whole library reads as unfinished drafts of
  // designs they never edited.
  await copyTemplateImages(source.id, id, code)

  console.info(
    `Handed ${buyer.userId} their own copy of template ${source.code}.`
  )
}
