import { Prisma } from '@prisma/client'
import { canDecideStep } from '../approvals/approval-engine'
import {
  cancelApprovalRequestForOrder,
  decideApproval,
  notifyPendingApprovers,
  raiseApprovalFor,
} from '../approvals/approvals.service'
import { AuditAction } from '../audit/audit.actions'
import {
  changesBetween,
  created,
  fieldChange,
  mergeChanges,
  type AuditChanges,
} from '../audit/audit-changes'
import { recordAudit, SYSTEM_ACTOR } from '../audit/audit.service'
import {
  can as hasPermission,
  resolvePermissions,
} from '../auth/permission.service'
import { Permission } from '../auth/permissions'
import {
  checkoutSession,
  deliveryNotesRequiredFor,
  type CartValidation,
} from '../cart/cart.service'
import { assertBudgetsAllowOrder } from '../cart/budget-lock'
import { CartIssueCode } from '../cart/cart-validation'
import { toAddressSnapshot } from '../cart/cart.types'
import {
  consumeStock,
  releaseStock,
  reserveStock,
} from '../catalog/stock.service'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope, type TransactionClient } from '../db/client'
import {
  sendOrderDispatchedEmail,
  sendOrderPlacedEmail,
} from '../mail/mail.dispatcher'
import type { OrderSummaryInput } from '../mail/mail.templates'
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors'
import { createId } from '../utils/ids'
import { offsetPage, toSkipTake, type OffsetPage } from '../utils/pagination'
import { toJson } from '../db/json-column'
import { asEnum, asEnumOrNull } from '../db/column-types'
import { grantTemplateCopies } from '../templates/template-entitlement'
import { isShippingEnabled } from '../shipping/nzpost/nzpost.settings'
import {
  copyCartShippingToOrder,
  voidOpenShipmentsForOrder,
} from '../shipping/order-shipping.hooks'
import { dispatchLabelFrom } from '../shipping/shipping.types'
import {
  assertTransition,
  AWAITING_APPROVAL_STATUSES,
  OrderStatus,
  requiresApproval,
} from './order-status'
import type {
  ChangeOrderStatusDto,
  ListOrdersQueryDto,
  PlaceOrderDto,
  RecordPaymentDto,
} from './order.validation'

const FULL_ORDER = Prisma.validator<Prisma.OrderInclude>()({
  site: { select: { id: true, code: true, name: true, costCentre: true } },
  account: { select: { id: true, accountCode: true, name: true } },
  lines: {
    orderBy: { createdAt: 'asc' },
    // The artwork behind a personalised line, joined rather than left as an id.
    // Whoever fulfils this order needs to know *which* template and *which*
    // version — an id alone would send them back to the database, and the
    // version's own name is what makes "Opening Hours A2 v2" readable on a
    // packing sheet.
    include: {
      template: { select: { id: true, code: true, name: true, status: true } },
      templateVersion: {
        select: { id: true, version: true, label: true, createdAt: true },
      },
    },
  },
  history: { orderBy: { createdAt: 'asc' } },
  // The NZ Post delivery choice and the labels made for this order. Joined
  // here because dispatch reads the label and every order page shows both.
  shipping: true,
  shipments: {
    orderBy: { createdAt: 'asc' },
    include: { parcels: { orderBy: { sequence: 'asc' } } },
  },
})

export type FullOrder = Prisma.OrderGetPayload<{ include: typeof FULL_ORDER }>

/** The list view: no lines, no history. */
const ORDER_SUMMARY = Prisma.validator<Prisma.OrderInclude>()({
  site: { select: { id: true, code: true, name: true, costCentre: true } },
  account: { select: { id: true, accountCode: true, name: true } },
  _count: { select: { lines: true } },
})

export type OrderSummary = Prisma.OrderGetPayload<{
  include: typeof ORDER_SUMMARY
}>

/**
 * Orders.
 *
 * ---------------------------------------------------------------------------
 * Placement is one transaction
 * ---------------------------------------------------------------------------
 * Allocating the number, writing the order and its lines, reserving stock,
 * recording the first status event and closing the basket all commit together
 * or not at all. Split across two writes, a failure between them leaves either a
 * basket the customer has already been charged for or an order with no lines —
 * and both are discovered by a person rather than by a monitor.
 *
 * ---------------------------------------------------------------------------
 * Everything is snapshotted
 * ---------------------------------------------------------------------------
 * The cart stores no prices because a rate card can move. An order is the
 * opposite: at placement every number stops moving. Line items carry their own
 * price, the discount that produced it and the rule it came from; the delivery
 * address is copied as JSON as well as referenced; the buyer's name and email
 * are copied too. Re-pricing or re-addressing a historical order is impossible
 * by construction.
 */

// --- Placing ----------------------------------------------------------------

export interface PlacedOrder {
  readonly order: FullOrder
  /** True when the basket had already become this order and nothing new was written. */
  readonly replayed: boolean
}

/**
 * Placement waits on a sequence allocation, the lines, a stock reservation,
 * approval routing, the timeline and the basket — one round trip each. It was
 * measured past the old five-second ceiling on a cold dev server.
 */
const PLACEMENT_SCOPE = { maxWait: 5_000, timeout: 20_000 } as const

/**
 * Turns a validated basket into an order — once.
 *
 * The validation is the cart's — `checkoutSession()` refuses anything that is
 * not ready — and it is re-run here rather than trusted from an earlier call,
 * because a product can be unpublished, a rate card can expire and a budget can
 * be consumed by a colleague between the buyer seeing the review step and
 * pressing submit. The check that matters is the last one.
 *
 * ---------------------------------------------------------------------------
 * Safe to repeat
 * ---------------------------------------------------------------------------
 * A basket becomes at most one order: `orders.cartId` is unique. Two submits of
 * the same basket therefore cannot both succeed, and this makes the second one
 * *answer* rather than fail:
 *
 *   - sent again after the first committed, with `cartId`, it finds the order
 *     that basket became and returns it, marked `replayed`;
 *   - sent at the same moment as the first, it loses the race on the unique
 *     index, and the order the winner wrote is returned the same way.
 *
 * A retry after a timeout needs nothing special: the timed-out transaction
 * rolled back, the basket is still open, and the retry places it.
 */
export async function placeOrder(
  actor: AuthenticatedActor,
  dto: PlaceOrderDto
): Promise<PlacedOrder> {
  if (dto.cartId) {
    const existing = await orderPlacedFromCart(actor, dto.cartId)
    if (existing) return { order: existing, replayed: true }
  }

  const deliveryNotes = dto.deliveryNotes?.trim() || null
  if (!deliveryNotes && (await deliveryNotesRequiredFor(actor.accountId))) {
    const message =
      'Add delivery instructions — this account requires them on every order.'
    // The same shape as a checkout-session refusal, so a client that renders
    // `details.issues` shows this without a special case.
    throw new BusinessRuleError(message, {
      details: {
        issues: [
          {
            code: CartIssueCode.DELIVERY_NOTES_REQUIRED,
            message,
            lineId: null,
          },
        ],
      },
    })
  }

  const session = await checkoutSession(actor, dto.siteId)
  const { cart } = session

  if (dto.cartId && dto.cartId !== cart.id) {
    throw new ConflictError(
      'This basket has changed since it was reviewed. Review it again before placing the order.',
      { details: { reviewedCartId: dto.cartId, currentCartId: cart.id } }
    )
  }

  if (!cart.siteId) {
    // checkoutSession already refuses this; restated because the rest of this
    // function treats the branch as present and a future change to that
    // validation must not silently produce an unbranched order.
    throw new BusinessRuleError('Choose which branch this order is for.')
  }

  // Captured once, after the guard. TypeScript loses the narrowing across the
  // transaction closure below, and `cart.siteId!` inside it would be an
  // assertion that nothing re-checks if that guard ever moves.
  const siteId = cart.siteId

  const [account, buyer] = await withTenantScope(actor.accountId, (tx) =>
    Promise.all([
      tx.account.findFirstOrThrow({
        where: { id: actor.accountId },
        select: { approvalThreshold: true },
      }),
      tx.user.findFirstOrThrow({
        where: { id: actor.userId },
        select: { firstName: true, lastName: true, email: true },
      }),
    ])
  )

  const thresholdCents =
    account.approvalThreshold == null
      ? null
      : toCents(account.approvalThreshold)

  const orderId = createId('ord')
  const buyerName = `${buyer.firstName} ${buyer.lastName}`.trim()

  let order: FullOrder
  try {
    order = await withTenantScope(
      actor.accountId,
      async (tx) => {
        // Both monthly caps, counted again under a lock. The basket was checked
        // when it was validated; anything that committed since then — another
        // buyer at this branch, this buyer in another tab — is counted here, and
        // a second placement waits for this one rather than reading the total
        // before it lands.
        await assertBudgetsAllowOrder(tx, {
          siteId,
          userId: actor.userId,
          billingPeriod: session.billingPeriod,
          orderTotalCents: session.totalCents,
        })

        // Allocated inside the transaction but from a sequence, so it does not roll
        // back with it. Gaps are accepted — see the migration.
        // A stored procedure rather than a function: T-SQL forbids NEXT VALUE FOR
        // inside a function, because a function may not have side effects.
        const [{ orderNumber }] = await tx.$queryRawUnsafe<
          [{ orderNumber: string }]
        >('EXEC dbo.next_order_number')

        await tx.order.create({
          data: {
            id: orderId,
            orderNumber,
            accountId: actor.accountId,
            siteId,
            placedById: actor.userId,
            placedByName: buyerName,
            placedByEmail: buyer.email,
            // The role they ordered in, frozen with their name (SOW F-13): a
            // buyer promoted to head office next month did not place this as one.
            placedByRole: actor.role,
            cartId: cart.id,
            // Written APPROVED and corrected below if approval turns out to be
            // needed. Both happen in the same transaction, so no reader ever sees
            // the intermediate state — and this way the approval engine reads the
            // order's own rows rather than being handed a second copy of them to
            // keep in step.
            status: OrderStatus.APPROVED,
            paymentMethod: cart.paymentMethod,
            poNumber: session.purchaseOrder.provided,
            campaignCode: cart.campaignCode,
            customerReference: cart.customerReference,
            projectCode: dto.projectCode ?? null,
            requiresApproval: false,
            subtotal: fromCents(session.subtotalCents),
            catalogSubtotal: fromCents(session.catalogSubtotalCents),
            // What the order costs: its lines plus delivery. Still no tax column —
            // see the migration — and the invoice engine adds tax rather than this
            // carrying a zero that downstream code starts trusting.
            total: fromCents(session.totalCents),
            shippingMethod: cart.shippingMethod,
            shippingCost: fromCents(session.shippingCents),
            rateCardId: session.lines[0]?.quote?.breakdown.rateCardId ?? null,
            rateCardName:
              session.lines[0]?.quote?.breakdown.rateCardName ?? null,
            billingPeriod: session.billingPeriod,
            shippingAddressId: cart.shippingAddressId,
            shippingSnapshot: toJson(addressSnapshot(cart.shippingAddress)),
            // Whatever checkout resolved and the buyer saw — chosen or defaulted
            // — frozen with the order (SOW F-15). Null when none was on file; a
            // pinned address that had gone away has already refused placement.
            billingAddressId: session.billTo?.addressId ?? null,
            billingSnapshot: session.billTo
              ? toJson(session.billTo.address)
              : null,
            recipientName: dto.recipientName ?? null,
            recipientPhone: dto.recipientPhone ?? null,
            recipientEmail: dto.recipientEmail ?? null,
            requestedDeliveryDate: cart.requestedDeliveryDate,
            deliveryNotes,
            notes: cart.notes,
            termsAcceptedAt: cart.termsAcceptedAt,
          },
        })

        await tx.orderLineItem.createMany({
          data: session.lines.map((line) => {
            const breakdown = line.quote?.breakdown
            if (!breakdown) {
              // Unreachable: checkoutSession refuses a basket with an unpriceable
              // line. Stated because an order line with no price is the one thing
              // that must never reach the database.
              throw new BusinessRuleError(
                'A line in this basket could not be priced.',
                {
                  details: { sku: line.line.product.sku },
                }
              )
            }

            return {
              id: createId('oli'),
              orderId,
              productId: line.line.productId,
              variantId: line.line.variantId,
              sku: line.line.product.sku,
              name: line.line.product.name,
              variantSku: line.line.variant?.sku ?? null,
              // The chosen stock and finish, frozen: the variant row can be
              // reconfigured later, and this line must still say what was printed.
              options: line.line.variant?.attributes ?? null,
              uom: line.line.product.uom,
              packSize: line.line.product.packSize,
              quantity: line.check.orderableQuantity,
              unitPrice: fromCents(breakdown.unitPriceCents),
              lineTotal: fromCents(breakdown.lineTotalCents),
              // Frozen with the price it applies to (SOW F-06, B-07).
              taxTreatment: line.line.product.taxTreatment,
              catalogUnitPrice: fromCents(breakdown.catalogUnitPriceCents),
              discountPercent: breakdown.discountPercent.toFixed(2),
              priceSource: breakdown.source,
              // Carried across with the values, and the reason they mean anything:
              // a version is immutable, so a reference to it is as good as a copy of
              // the artwork and costs nothing. Without it an operator reading this
              // order months later has the answers and not the question.
              templateId: line.line.templateId,
              templateVersionId: line.line.templateVersionId,
              customisation: line.line.customisation,
              notes: line.line.notes,
            }
          }),
        })

        // The buyer's NZ Post delivery choice, frozen with everything else. Absent
        // when checkout did not use the NZ Post steps, which is allowed: shipping
        // is never a reason an order cannot be placed.
        await copyCartShippingToOrder(tx, cart.id, orderId, actor.accountId)

        // Reserved inside the placement transaction, before anything else can read
        // the order. A reservation left behind by an order that failed to save is
        // inventory nobody can buy and nobody knows to release; a reservation taken
        // after the commit is a window in which two buyers can both be promised the
        // last unit.
        //
        // Reserved even while the order is only PENDING_APPROVAL. The alternative —
        // waiting for approval — means an order can clear its approvers and then
        // turn out to be unfillable, which is the worst moment to find out.
        const reserved = await reserveStock(
          tx,
          session.lines.map((line) => ({
            productId: line.line.productId,
            variantId: line.line.variantId,
            quantity: line.check.orderableQuantity,
            sku: line.line.product.sku,
          }))
        )

        if (reserved) {
          await tx.order.update({
            where: { id: orderId },
            data: { stockState: 'RESERVED' },
          })
        }

        // Configurable rules first. They supersede the account threshold entirely:
        // once an account has any, the simple number is not consulted, so the two
        // can never disagree about the same order.
        const categoryIds = await tx.product
          .findMany({
            where: {
              id: { in: session.lines.map((line) => line.line.productId) },
            },
            select: { categoryId: true },
          })
          .then((rows) => [...new Set(rows.map((row) => row.categoryId))])

        const routed = await raiseApprovalFor(tx, {
          id: orderId,
          accountId: actor.accountId,
          siteId,
          // The whole order, delivery included: an approver signs off on what the
          // branch will be invoiced, not on the goods alone.
          totalCents: session.totalCents,
          placedById: actor.userId,
          requesterRole: actor.role,
          categoryIds,
        })

        const needsApproval =
          routed ||
          (!(await accountHasRules(tx, actor.accountId)) &&
            requiresApproval(session.totalCents, thresholdCents))

        const initialStatus = needsApproval
          ? OrderStatus.PENDING_APPROVAL
          : OrderStatus.APPROVED

        if (needsApproval) {
          await tx.order.update({
            where: { id: orderId },
            data: { status: initialStatus, requiresApproval: true },
          })
        }

        await tx.orderStatusEvent.create({
          data: {
            id: createId('ose'),
            orderId,
            fromStatus: null,
            toStatus: initialStatus,
            actorId: actor.userId,
            actorName: buyerName,
            actorRole: actor.role,
            comment: needsApproval
              ? routed
                ? 'Submitted for approval'
                : 'Submitted for approval (over the account threshold)'
              : 'Placed and approved automatically',
          },
        })

        // The basket becomes history rather than being deleted, so the buyer can see
        // what they submitted and support can trace a question back to it.
        await tx.cart.update({
          where: { id: cart.id },
          data: { status: 'CHECKED_OUT', checkedOutAt: new Date() },
        })

        return tx.order.findFirstOrThrow({
          where: { id: orderId },
          include: FULL_ORDER,
        })
      },
      PLACEMENT_SCOPE
    )
  } catch (error) {
    // Lost the race to a concurrent submit of the same basket: the unique index
    // on `orders.cartId` refused this insert after the other one committed.
    const existing = isUniqueViolation(error)
      ? await orderPlacedFromCart(actor, cart.id)
      : null
    if (existing) return { order: existing, replayed: true }
    throw error
  }

  await recordAudit({
    action: AuditAction.ORDER_PLACED,
    entityType: 'ORDER',
    entityId: order.id,
    entityName: order.orderNumber,
    accountId: actor.accountId,
    // Who ordered what, for which branch, how many and for how much (§15, "order
    // history / audit extract") — as the order recorded it, lines included, so
    // the entry stands on its own if the order is later disputed.
    changes: created(
      { ...order, lines: linesForAudit(order.lines) },
      [...ORDER_PLACEMENT_AUDIT_FIELDS, 'lines'],
      { json: ['shippingSnapshot', 'billingSnapshot'] }
    ),
  })

  // After the commit and after the audit entry, never inside the transaction: a
  // message announcing an order that then failed to save is not retractable.
  // The dispatcher swallows its own failures — failing the response now would
  // tell the buyer their order did not go through when it did, and they would
  // place it again.
  sendOrderPlacedEmail({
    to: buyer.email,
    firstName: buyer.firstName,
    order: summarise(order),
    awaitingApproval: order.status === OrderStatus.PENDING_APPROVAL,
  })

  if (order.status === OrderStatus.PENDING_APPROVAL) {
    await notifyPendingApprovers(order.id)
  }

  // Buying one of the operator's designs earns the right to rework it, so the
  // copy arrives with the order rather than waiting to be asked for. Swallows
  // its own failures for the same reason the email above does: the order is
  // placed, and a missing copy is a convenience the buyer can still make by
  // hand — the purchase that entitles them is what has just been recorded.
  void grantTemplateCopies(
    { userId: actor.userId, accountId: actor.accountId, email: buyer.email },
    order.id
  )

  console.info(
    `Order ${order.orderNumber} placed by ${actor.userId} (${order.lines.length} lines, ${order.status}).`
  )
  return { order, replayed: false }
}

/** The order a basket became, placed by this actor, if it has become one. */
async function orderPlacedFromCart(
  actor: AuthenticatedActor,
  cartId: string
): Promise<FullOrder | null> {
  const row = await withTenantScope(actor.accountId, (tx) =>
    tx.order.findFirst({
      where: { cartId, placedById: actor.userId },
      select: { id: true },
    })
  )
  return row ? findOrderById(actor, row.id) : null
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  )
}

// --- Reading ----------------------------------------------------------------

export async function listOrders(
  actor: AuthenticatedActor,
  query: ListOrdersQueryDto
): Promise<OffsetPage<OrderSummary>> {
  const accountId =
    actor.role === Role.ADMIN ? (query.accountId ?? null) : actor.accountId

  const clauses: Prisma.OrderWhereInput[] = [await visibilityFilter(actor)]

  if (accountId) clauses.push({ accountId })
  if (query.status) clauses.push({ status: query.status })
  if (query.siteId) clauses.push({ siteId: query.siteId })
  if (query.billingPeriod) clauses.push({ billingPeriod: query.billingPeriod })
  if (query.awaitingApproval)
    clauses.push({ status: { in: [...AWAITING_APPROVAL_STATUSES] } })
  if (query.from || query.to) {
    clauses.push({
      createdAt: {
        ...(query.from ? { gte: query.from } : {}),
        ...(query.to ? { lte: query.to } : {}),
      },
    })
  }
  if (query.search) {
    clauses.push({
      OR: [
        { orderNumber: { contains: query.search } },
        { poNumber: { contains: query.search } },
        // The buyer's own reference is often the one thing they remember about
        // an order, so it is searchable alongside the numbers we issued.
        { customerReference: { contains: query.search } },
      ],
    })
  }

  const where: Prisma.OrderWhereInput = { AND: clauses }
  const { skip, take } = toSkipTake(query)

  const read = async (client: TransactionClient | typeof prisma) =>
    Promise.all([
      client.order.findMany({
        where,
        include: ORDER_SUMMARY,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      client.order.count({ where }),
    ])

  const [items, total] = accountId
    ? await withTenantScope(accountId, read)
    : await read(prisma)

  return offsetPage(items, total, query)
}

export async function findOrderById(
  actor: AuthenticatedActor,
  orderId: string
): Promise<FullOrder> {
  const accountId = await requireReadableAccount(actor, orderId)
  const visible = await visibilityFilter(actor)

  const order = await withTenantScope(accountId, (tx) =>
    tx.order.findFirst({
      where: { AND: [{ id: orderId }, visible] },
      include: FULL_ORDER,
    })
  )

  // 404, not 403: telling a buyer that an order exists but is a colleague's
  // leaks what other branches are spending on.
  if (!order) throw new NotFoundError('Order')
  return order
}

// --- Lifecycle --------------------------------------------------------------

export async function changeOrderStatus(
  actor: AuthenticatedActor,
  orderId: string,
  dto: ChangeOrderStatusDto
): Promise<FullOrder> {
  const before = await findOrderById(actor, orderId)
  const from = asEnum<OrderStatus>(before.status)
  const to = dto.status

  assertTransition(from, to)
  await assertMayMakeTransition(actor, before, to)

  // An order routed by approval rules is decided step by step, tier by tier.
  // Moving it here directly would skip the steps: the request would stay
  // PENDING in every approver's queue for an order that had already moved on,
  // and a two-tier order would be approved on one signature.
  if (
    to === OrderStatus.APPROVED ||
    to === OrderStatus.REJECTED ||
    to === OrderStatus.CHANGES_REQUESTED
  ) {
    const decided = await decideThroughApprovalSteps(actor, before, to, dto)
    if (decided) return decided
  }

  const tracking =
    to === OrderStatus.DISPATCHED ? resolveDispatchTracking(before, dto) : null

  const now = new Date()
  const actorName = await resolveActorName(actor)
  let voidedShipmentIds: string[] = []

  const order = await withTenantScope(before.accountId, async (tx) => {
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: to,
        ...(to === OrderStatus.APPROVED
          ? {
              approvedById: actor.userId,
              approvedAt: now,
              changeRequestNote: null,
            }
          : {}),
        ...(to === OrderStatus.REJECTED
          ? { rejectionReason: dto.reason ?? null }
          : {}),
        ...(to === OrderStatus.CHANGES_REQUESTED
          ? { changeRequestNote: dto.reason ?? null }
          : {}),
        ...(to === OrderStatus.DISPATCHED
          ? {
              dispatchedAt: now,
              ...(tracking?.carrier ? { carrier: tracking.carrier } : {}),
              ...(tracking?.trackingNumber
                ? { trackingNumber: tracking.trackingNumber }
                : {}),
            }
          : {}),
        ...(to === OrderStatus.DELIVERED ? { deliveredAt: now } : {}),
        ...(to === OrderStatus.CANCELLED ? { cancelledAt: now } : {}),
        ...(dto.deliveryNotes !== undefined
          ? { deliveryNotes: dto.deliveryNotes || null }
          : {}),
      },
    })

    // The shelf moves in the same transaction as the status. A dispatched order
    // whose stock was not consumed would be counted twice for as long as it took
    // anyone to notice.
    if (before.stockState === 'RESERVED') {
      if (to === OrderStatus.DISPATCHED) {
        await consumeStock(tx, stockLines(before))
        await tx.order.update({
          where: { id: orderId },
          data: { stockState: 'CONSUMED' },
        })
      } else if (to === OrderStatus.REJECTED || to === OrderStatus.CANCELLED) {
        await releaseStock(tx, stockLines(before))
        await tx.order.update({
          where: { id: orderId },
          data: { stockState: 'RELEASED' },
        })
      }
    }

    // A cancelled order takes its approval request with it, in the same commit
    // as the status and the stock.
    //
    // Cancelling used to leave the request PENDING: the order stayed in every
    // approver's queue, and approving it there put a cancelled order back to
    // APPROVED — with its stock already released and its budget already given
    // back. Nothing else closes it, because nothing else can: there is no
    // decision to record, only a subject that has gone away.
    if (to === OrderStatus.CANCELLED) {
      await cancelApprovalRequestForOrder(tx, orderId)
    }

    // An order leaving production takes its labels with it. A cancelled order
    // must not be picked up, and one sent back for changes will be repacked and
    // relabelled. NZ Post has no void endpoint: this is the portal's record,
    // and a label nobody scans is never charged.
    if (to === OrderStatus.CANCELLED || to === OrderStatus.CHANGES_REQUESTED) {
      voidedShipmentIds = await voidOpenShipmentsForOrder(
        tx,
        orderId,
        to === OrderStatus.CANCELLED
          ? `Order cancelled${dto.reason ? `: ${dto.reason}` : ''}`
          : `Changes requested${dto.reason ? `: ${dto.reason}` : ''}`
      )
    }

    await tx.orderStatusEvent.create({
      data: {
        id: createId('ose'),
        orderId,
        fromStatus: from,
        toStatus: to,
        actorId: actor.userId,
        actorName,
        actorRole: actor.role,
        comment: dto.reason ?? null,
      },
    })

    return tx.order.findFirstOrThrow({
      where: { id: orderId },
      include: FULL_ORDER,
    })
  })

  await recordAudit({
    action: AuditAction.ORDER_STATUS_CHANGED,
    entityType: 'ORDER',
    entityId: orderId,
    entityName: order.orderNumber,
    accountId: order.accountId,
    // Everything the transition wrote, not just the status: who approved it and
    // when, the carrier and tracking on dispatch, what happened to the stock.
    changes: changesBetween(before, order, ORDER_STATUS_AUDIT_FIELDS),
    details: { reason: dto.reason ?? null },
  })

  if (voidedShipmentIds.length > 0) {
    await recordAudit({
      action: AuditAction.SHIPMENT_VOIDED,
      entityType: 'ORDER',
      entityId: orderId,
      entityName: order.orderNumber,
      accountId: order.accountId,
      changes: shipmentStatusChanges(
        before.shipments,
        order.shipments,
        voidedShipmentIds
      ),
      details: { becauseOrderBecame: to },
    })
  }

  if (to === OrderStatus.DISPATCHED) {
    sendOrderDispatchedEmail({
      to: order.placedByEmail,
      firstName: order.placedByName.split(' ')[0] ?? order.placedByName,
      order: summarise(order),
      carrier: order.carrier,
      trackingNumber: order.trackingNumber,
    })
  }

  console.info(
    `Order ${order.orderNumber}: ${from} -> ${to} by ${actor.userId}.`
  )
  return order
}

/**
 * NZ Post reported every parcel delivered: the order follows (decision D5).
 *
 * Called by the tracking worker, not by a person, so it takes no actor and
 * checks no permission — the permission question was answered when a person
 * dispatched the order. It moves only DISPATCHED to DELIVERED, conditionally in
 * the UPDATE itself, so a manual change made in the meantime wins and this
 * becomes a no-op rather than a second transition.
 *
 * The timeline records the actor as "System (NZ Post)" with the ADMIN role:
 * `order_status_events.actorRole` is constrained to the three portal roles, and
 * widening that CHECK would mean altering a table the RLS predicates reach
 * through. The name and the comment say who really did it; the audit entry
 * uses the system actor.
 */
export async function confirmDeliveryByCarrier(
  orderId: string,
  deliveredAt: Date,
  trackingReferences: readonly string[]
): Promise<boolean> {
  const order = await prisma.order.findFirst({
    where: { id: orderId },
    select: { id: true, accountId: true, orderNumber: true, status: true },
  })
  if (!order || order.status !== OrderStatus.DISPATCHED) return false

  const moved = await withTenantScope(order.accountId, async (tx) => {
    const result = await tx.order.updateMany({
      where: { id: orderId, status: OrderStatus.DISPATCHED },
      data: { status: OrderStatus.DELIVERED, deliveredAt },
    })
    if (result.count === 0) return false

    await tx.orderStatusEvent.create({
      data: {
        id: createId('ose'),
        orderId,
        fromStatus: OrderStatus.DISPATCHED,
        toStatus: OrderStatus.DELIVERED,
        actorId: null,
        actorName: 'System (NZ Post)',
        actorRole: Role.ADMIN,
        comment:
          `NZ Post reported delivery at ${deliveredAt.toISOString()}` +
          (trackingReferences.length > 0
            ? ` (${trackingReferences.join(', ')}).`
            : '.'),
      },
    })
    return true
  })

  if (moved) {
    await recordAudit({
      action: AuditAction.ORDER_DELIVERY_CONFIRMED,
      entityType: 'ORDER',
      entityId: orderId,
      entityName: order.orderNumber,
      accountId: order.accountId,
      actor: SYSTEM_ACTOR(order.accountId),
      // The conditional update only moves a DISPATCHED order, so the before
      // status is known without a second read.
      changes: mergeChanges(
        fieldChange('status', OrderStatus.DISPATCHED, OrderStatus.DELIVERED),
        fieldChange('deliveredAt', null, deliveredAt)
      ),
      details: { trackingReferences },
    })
    console.info(
      `Order ${order.orderNumber}: DISPATCHED -> DELIVERED on NZ Post's delivery scan.`
    )
  }
  return moved
}

/**
 * Payment moves on its own axis, so it has its own endpoint.
 *
 * Recording a payment never touches `status`: an order can be DELIVERED and
 * UNPAID on Net 30 terms, and PAID while still PROCESSING on a P-Card.
 */
export async function recordPayment(
  actor: AuthenticatedActor,
  orderId: string,
  dto: RecordPaymentDto
): Promise<FullOrder> {
  const before = await findOrderById(actor, orderId)

  if (!(await hasPermission(actor, Permission.BILLING_MANAGE))) {
    throw new ForbiddenError('Recording a payment needs BILLING_MANAGE.')
  }

  const order = await withTenantScope(before.accountId, (tx) =>
    tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: dto.paymentStatus,
        paymentReference: dto.paymentReference ?? null,
        paidAt: dto.paymentStatus === 'PAID' ? new Date() : null,
      },
      include: FULL_ORDER,
    })
  )

  await recordAudit({
    action: AuditAction.ORDER_PAYMENT_RECORDED,
    entityType: 'ORDER',
    entityId: orderId,
    entityName: order.orderNumber,
    accountId: order.accountId,
    changes: changesBetween(before, order, [
      'paymentStatus',
      'paymentReference',
      'paidAt',
    ]),
  })

  return order
}

// --- Audit ------------------------------------------------------------------

/**
 * An order as it was placed. The money, the references a finance team searches
 * by, and where it is going — not the placer's name and email, which are the
 * entry's own actor.
 */
const ORDER_PLACEMENT_AUDIT_FIELDS = [
  'orderNumber',
  'siteId',
  'status',
  'requiresApproval',
  'paymentMethod',
  'poNumber',
  'campaignCode',
  'projectCode',
  'customerReference',
  'subtotal',
  'shippingCost',
  'total',
  'rateCardName',
  'billingPeriod',
  'shippingMethod',
  'shippingSnapshot',
  'billingSnapshot',
  'recipientName',
  'requestedDeliveryDate',
  'deliveryNotes',
] as const

/** What a lifecycle transition can write. */
const ORDER_STATUS_AUDIT_FIELDS = [
  'status',
  'stockState',
  'approvedById',
  'approvedAt',
  'rejectionReason',
  'changeRequestNote',
  'carrier',
  'trackingNumber',
  'deliveryNotes',
  'dispatchedAt',
  'deliveredAt',
  'cancelledAt',
] as const

function linesForAudit(lines: FullOrder['lines']): {
  sku: string
  variantSku: string | null
  quantity: number
  unitPrice: unknown
  lineTotal: unknown
}[] {
  return lines.map((line) => ({
    sku: line.sku,
    variantSku: line.variantSku,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
  }))
}

/** One field per voided shipment — `shipments.<id>.status` — from its row before and after. */
function shipmentStatusChanges(
  before: FullOrder['shipments'],
  after: FullOrder['shipments'],
  ids: readonly string[]
): AuditChanges {
  const statusOf = (rows: FullOrder['shipments']) =>
    Object.fromEntries(
      rows
        .filter((row) => ids.includes(row.id))
        .map((row) => [`shipments.${row.id}.status`, row.status])
    )
  const was = statusOf(before)
  const now = statusOf(after)
  return changesBetween(was, now, [
    ...new Set([...Object.keys(was), ...Object.keys(now)]),
  ])
}

// --- Internals --------------------------------------------------------------

/**
 * Which orders this actor may see.
 *
 * Three permissions, widest wins: ORDER_VIEW_ACCOUNT sees the whole tenant,
 * ORDER_VIEW_SITE sees their branch and any branch they have been granted,
 * ORDER_VIEW_OWN sees only what they placed. An actor with none of them sees
 * nothing rather than everything — the filter fails closed.
 *
 * This is the boundary RLS cannot draw: the tenant scope carries an account, not
 * a user, so "my orders" has to be decided here. It is one function for the same
 * reason the catalogue's visibility is.
 */
async function visibilityFilter(
  actor: AuthenticatedActor
): Promise<Prisma.OrderWhereInput> {
  if (actor.role === Role.ADMIN) return {}

  const effective = await resolvePermissions(actor)

  if (effective.has(Permission.ORDER_VIEW_ACCOUNT)) return {}

  if (effective.has(Permission.ORDER_VIEW_SITE)) {
    const extraSites = await withTenantScope(actor.accountId, (tx) =>
      tx.userSiteAccess.findMany({
        where: { userId: actor.userId },
        select: { siteId: true },
      })
    )
    const siteIds = [
      ...new Set([
        ...(actor.siteId ? [actor.siteId] : []),
        ...extraSites.map((s) => s.siteId),
      ]),
    ]

    // A site user with no branch at all would otherwise match every order.
    return siteIds.length > 0
      ? { OR: [{ siteId: { in: siteIds } }, { placedById: actor.userId }] }
      : { placedById: actor.userId }
  }

  if (effective.has(Permission.ORDER_VIEW_OWN))
    return { placedById: actor.userId }

  // Fail closed. An impossible id rather than `{}`, so a caller that forgets to
  // check the permission gets an empty page and not the whole tenant.
  return { id: '__no_orders_visible__' }
}

/**
 * Reads the order outside any scope, only to learn which account owns it.
 *
 * Deliberately narrow — never the money — because this is the one read here that
 * RLS does not cover, and it exists to decide which scope to open next.
 */
async function requireReadableAccount(
  actor: AuthenticatedActor,
  orderId: string
): Promise<string> {
  const order = await prisma.order.findFirst({
    where: { id: orderId },
    select: { accountId: true },
  })

  if (!order) throw new NotFoundError('Order')
  if (actor.role !== Role.ADMIN && order.accountId !== actor.accountId) {
    throw new NotFoundError('Order')
  }
  return order.accountId
}

/**
 * Who may make a particular move.
 *
 * The state machine says what is *possible*; this says who is *allowed*.
 * Approval decisions need APPROVAL_ACT, fulfilment moves need ORDER_MANAGE, and
 * a buyer may cancel their own order — which is the one transition a customer
 * can make without either.
 */
async function assertMayMakeTransition(
  actor: AuthenticatedActor,
  order: FullOrder,
  to: OrderStatus
): Promise<void> {
  const effective = await resolvePermissions(actor)

  const isApprovalDecision =
    to === OrderStatus.APPROVED ||
    to === OrderStatus.REJECTED ||
    to === OrderStatus.CHANGES_REQUESTED

  if (isApprovalDecision) {
    if (!effective.has(Permission.APPROVAL_ACT)) {
      throw new ForbiddenError('Deciding on an order needs APPROVAL_ACT.')
    }
    // An approver approving their own order defeats the control the threshold
    // exists to impose. The routing rules make this rare; the rule belongs here
    // because it must hold whatever routing decides.
    if (order.placedById === actor.userId && actor.role !== Role.ADMIN) {
      throw new ForbiddenError(
        'An order cannot be approved by the person who placed it.'
      )
    }
    return
  }

  // Resubmitting after an approver asked for changes is the buyer's move, not
  // the operator's. Without this a CHANGES_REQUESTED order is stuck forever: the
  // one person who has to act on it is the one person with no permission to, and
  // the only way out would be to cancel and re-key the whole basket.
  if (to === OrderStatus.PENDING_APPROVAL) {
    if (
      order.placedById === actor.userId ||
      effective.has(Permission.ORDER_CREATE)
    )
      return
    throw new ForbiddenError(
      'Submitting an order for approval needs ORDER_CREATE.'
    )
  }

  if (to === OrderStatus.CANCELLED) {
    const ownOrder = order.placedById === actor.userId
    if (ownOrder || effective.has(Permission.ORDER_CANCEL)) return
    throw new ForbiddenError(
      "Cancelling someone else's order needs ORDER_CANCEL."
    )
  }

  // PROCESSING, DISPATCHED, DELIVERED — the fulfilment side, which is the
  // platform operator's and later the integrations'.
  if (!effective.has(Permission.ORDER_MANAGE)) {
    throw new ForbiddenError(`Moving an order to ${to} needs ORDER_MANAGE.`)
  }
}

/**
 * Records an approval decision made through the status route on the order's
 * approval step, when the order has an approval request still open.
 *
 * Returns null when there is no open request — an order held by the plain
 * account threshold, or one sent back for changes from production — and the
 * status change proceeds as it always did.
 *
 * The step decided is the one open at the current tier that this actor may
 * decide, by the same rule `POST /approvals/steps/:id` applies. When there is
 * none, the refusal names the open steps so a client can send the approver
 * there instead. A decision that clears one tier of several leaves the order
 * PENDING_APPROVAL, and the response says so.
 */
async function decideThroughApprovalSteps(
  actor: AuthenticatedActor,
  order: FullOrder,
  to: 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED',
  dto: ChangeOrderStatusDto
): Promise<FullOrder | null> {
  const request = await withTenantScope(order.accountId, (tx) =>
    tx.approvalRequest.findFirst({
      where: { orderId: order.id, status: 'PENDING' },
      include: { steps: { orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }] } },
    })
  )
  if (!request) return null

  const open = request.steps.filter(
    (step) => step.status === 'PENDING' && step.tier === request.currentTier
  )
  const step = open.find((candidate) =>
    canDecideStep(
      {
        approverRole: asEnumOrNull<Role>(candidate.approverRole),
        approverUserId: candidate.approverUserId,
      },
      { userId: actor.userId, role: actor.role },
      order.placedById
    )
  )

  if (!step) {
    throw new ForbiddenError(
      'This order is waiting on its approval steps, and none open now is addressed to you.',
      {
        details: {
          currentTier: request.currentTier,
          openSteps: open.map((candidate) => ({
            stepId: candidate.id,
            tier: candidate.tier,
            approverRole: candidate.approverRole,
            approverUserId: candidate.approverUserId,
          })),
        },
      }
    )
  }

  await decideApproval(actor, step.id, {
    decision: to,
    ...(dto.reason ? { comment: dto.reason } : {}),
  })

  if (dto.deliveryNotes !== undefined) {
    await withTenantScope(order.accountId, (tx) =>
      tx.order.update({
        where: { id: order.id },
        data: { deliveryNotes: dto.deliveryNotes || null },
      })
    )
  }

  return findOrderById(actor, order.id)
}

/**
 * Whether the account routes approvals by rule.
 *
 * When it does, `Account.approvalThreshold` is ignored entirely. Consulting both
 * would let a customer configure rules that say one thing and a threshold that
 * says another, with no way to tell afterwards which had applied to a given
 * order.
 */
async function accountHasRules(
  tx: TransactionClient,
  accountId: string
): Promise<boolean> {
  const count = await tx.approvalRule.count({
    where: { accountId, active: true, deletedAt: null },
  })
  return count > 0
}

/**
 * Where a dispatched order's carrier and tracking number come from.
 *
 * In order of preference: what the operator typed, when they gave both — a
 * parcel going by another courier, or by hand, is still a real dispatch — then
 * the NZ Post label. With shipping switched on and neither, dispatch is refused
 * (decision D1): an order marked dispatched with nothing to track is the one the
 * buyer rings about.
 *
 * With shipping switched off this is the behaviour from before the NZ Post
 * integration: whatever was sent, possibly nothing.
 */
function resolveDispatchTracking(
  order: FullOrder,
  dto: ChangeOrderStatusDto
): { carrier: string | null; trackingNumber: string | null } {
  if (dto.carrier && dto.trackingNumber) {
    return { carrier: dto.carrier, trackingNumber: dto.trackingNumber }
  }

  const label = dispatchLabelFrom(order.shipments)
  if (label) {
    return {
      carrier: dto.carrier ?? label.carrier,
      trackingNumber: label.trackingNumber,
    }
  }

  if (!isShippingEnabled()) {
    return {
      carrier: dto.carrier ?? null,
      trackingNumber: dto.trackingNumber ?? null,
    }
  }

  throw new BusinessRuleError(
    'Generate the NZ Post label before dispatching this order, or give the carrier ' +
      'and tracking number of the service it is going by instead.',
    {
      details: {
        shipments: order.shipments.map((shipment) => ({
          id: shipment.id,
          status: shipment.status,
        })),
      },
    }
  )
}

async function resolveActorName(actor: AuthenticatedActor): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { id: actor.userId },
    select: { firstName: true, lastName: true },
  })
  return user ? `${user.firstName} ${user.lastName}`.trim() : actor.email
}

/**
 * An address, frozen.
 *
 * An address the customer later corrects must not rewrite where a past order
 * went — the row is referenced for the UI to link to, this copy is what shipped.
 * The fields come from `toAddressSnapshot`, the same whitelist the bill-to uses,
 * so the two copies on an order cannot drift into different shapes.
 *
 * An empty object rather than null when there is no address: `shippingSnapshot`
 * is NOT NULL, and has been since before delivery addresses were required.
 */
function addressSnapshot(
  address: CartValidation['cart']['shippingAddress']
): Prisma.InputJsonValue {
  if (!address) return {}
  return { ...toAddressSnapshot(address) }
}

/** An order's lines in the shape the stock functions work in. */
function stockLines(order: FullOrder) {
  return order.lines.map((line) => ({
    productId: line.productId,
    variantId: line.variantId,
    quantity: line.quantity,
    sku: line.sku,
  }))
}

/** The order facts every notification repeats back to its reader. */
function summarise(order: FullOrder): OrderSummaryInput {
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    total: order.total.toFixed(2),
    siteName: order.site.name,
    placedByName: order.placedByName,
    poNumber: order.poNumber,
    customerReference: order.customerReference,
    lineCount: order.lines.length,
  }
}

function toCents(value: { toFixed(digits: number): string }): number {
  return Math.round(Number(value.toFixed(2)) * 100)
}

function fromCents(cents: number): string {
  return (cents / 100).toFixed(2)
}
