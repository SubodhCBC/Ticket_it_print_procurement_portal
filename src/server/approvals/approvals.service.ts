import { Prisma } from '@prisma/client'
import { AuditAction } from '../audit/audit.actions'
import {
  changesBetween,
  created,
  fieldChange,
  mergeChanges,
  removed,
} from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope, type TransactionClient } from '../db/client'
import {
  sendApprovalDecidedEmail,
  sendApprovalPendingEmail,
} from '../mail/mail.dispatcher'
// The pure lifecycle file, not the orders service: that depends on this one, and
// the cycle would be real at runtime. Same deliberate deep import as the cart's.
import { OrderStatus, requiresApproval } from '../orders/order-status'
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../utils/errors'
import { createId } from '../utils/ids'
import { offsetPage, toSkipTake, type OffsetPage } from '../utils/pagination'
import { asEnum, asEnumOrNull } from '../db/column-types'
import { releaseStock } from '../catalog/stock.service'
import {
  assertStepOpen,
  canDecideStep,
  evaluateProgress,
  planApproval,
  type ApprovalRuleSpec,
  type OrderFacts,
  type StepStatus,
} from './approval-engine'
import type {
  CreateApprovalRuleDto,
  DecideApprovalDto,
  ListApprovalsQueryDto,
  UpdateApprovalRuleDto,
} from './approval.validation'

const FULL_REQUEST = Prisma.validator<Prisma.ApprovalRequestInclude>()({
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      placedById: true,
      placedByName: true,
      poNumber: true,
      customerReference: true,
      createdAt: true,
      site: { select: { id: true, code: true, name: true } },
      // Counted here rather than in a second query: the approval email states
      // how many items an order has, and "Items: 0" would be worse than not
      // saying it at all.
      _count: { select: { lines: true } },
      // What is being approved, for the hub's cards. Never `customisation`: it
      // holds the buyer's artwork and preview, megabytes a queue must not read
      // — `lineImages` finds the previews without loading them.
      lines: {
        select: {
          id: true,
          orderId: true,
          productId: true,
          templateId: true,
          sku: true,
          name: true,
          variantSku: true,
          quantity: true,
          uom: true,
          unitPrice: true,
          lineTotal: true,
          notes: true,
          template: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
  steps: { orderBy: [{ tier: 'asc' }, { createdAt: 'asc' }] },
})

export type FullApprovalRequest = Prisma.ApprovalRequestGetPayload<{
  include: typeof FULL_REQUEST
}>

export type ApprovalRuleRow = Prisma.ApprovalRuleGetPayload<{
  include: { category: { select: { id: true; code: true; name: true } } }
}>

/**
 * The approval workflow engine.
 *
 * ---------------------------------------------------------------------------
 * Why this writes order rows directly
 * ---------------------------------------------------------------------------
 * A decision and the order status it produces must commit together. If the step
 * were written here and the order moved by a separate call into the orders
 * module, a failure between them would leave an approved decision on an order
 * still sitting in the queue — visible to the approver as their click having
 * done nothing, and to the buyer as an order stuck forever.
 *
 * So the transition rule is imported from `order-status.ts` (pure, shared) and
 * the write happens in the same transaction as the step. Orders depends on this
 * module; this one does not depend on it, which is what keeps the graph acyclic.
 */

// --- Raising ----------------------------------------------------------------

/**
 * Plans and records the approval an order needs, if any.
 *
 * Returns true when the order must wait. Called from inside the placement
 * transaction, so the request and the order are one write — an order that is
 * PENDING_APPROVAL with no request would be invisible to every approver.
 */
export async function raiseApprovalFor(
  tx: TransactionClient,
  order: {
    id: string
    accountId: string
    siteId: string
    totalCents: number
    placedById: string
    requesterRole: Role
    categoryIds: readonly string[]
  }
): Promise<boolean> {
  const rules = await tx.approvalRule.findMany({
    where: { accountId: order.accountId, active: true, deletedAt: null },
    orderBy: [{ tier: 'asc' }, { id: 'asc' }],
  })

  if (rules.length === 0) return false

  const facts: OrderFacts = {
    totalCents: order.totalCents,
    siteId: order.siteId,
    requesterRole: order.requesterRole,
    requesterId: order.placedById,
    categoryIds: order.categoryIds,
  }

  const plan = planApproval(
    rules.map((rule) =>
      toRuleSpec({
        ...rule,
        requesterRole: asEnumOrNull<Role>(rule.requesterRole),
        approverRole: asEnumOrNull<Role>(rule.approverRole),
      })
    ),
    facts
  )
  if (plan.length === 0) return false

  const requestId = createId('apq')

  await tx.approvalRequest.create({
    data: {
      id: requestId,
      accountId: order.accountId,
      orderId: order.id,
      status: 'PENDING',
      currentTier: plan[0]!.tier,
      totalAtRequest: (order.totalCents / 100).toFixed(2),
    },
  })

  await tx.approvalStep.createMany({
    data: plan.map((step) => ({
      id: createId('aps'),
      requestId,
      ruleId: step.ruleId,
      tier: step.tier,
      // Copied from the rule, so retiring or editing it later cannot rewrite
      // who this step was addressed to.
      approverRole: step.approverRole,
      approverUserId: step.approverUserId,
      status: 'PENDING' as const,
    })),
  })

  console.info(
    `Order ${order.id} needs ${plan.length} approval(s) across its tiers.`
  )
  return true
}

// --- Previewing -------------------------------------------------------------

export interface ApprovalPreview {
  /** Whether placing this basket now would send it for approval. */
  readonly required: boolean
  /**
   * RULES: the account's approval rules matched. ACCOUNT_THRESHOLD: the account
   * has no rules and the total is over its threshold. Null when not required.
   */
  readonly reason: 'RULES' | 'ACCOUNT_THRESHOLD' | null
  /** The rounds it would go through, lowest tier first. Empty for a threshold hold. */
  readonly steps: ReadonlyArray<{
    readonly tier: number
    readonly ruleName: string
    readonly approverRole: Role | null
    readonly approverUserId: string | null
  }>
  /** The account threshold in cents, when that is what decides. */
  readonly thresholdCents: number | null
}

/**
 * What placement would decide about approval, without writing anything.
 *
 * The same two-stage rule `placeOrder` applies, from the same inputs: an
 * account with any active rules is routed by them alone, and only an account
 * with none falls back to its threshold. Kept beside `raiseApprovalFor` and
 * built from the same engine so the checkout screen cannot promise one thing
 * and placement do another.
 *
 * A preview, not a guarantee: a rule edited or a colleague's order placed
 * between this and the submit can change the answer, and placement decides
 * again when it happens.
 */
export async function previewApproval(input: {
  readonly accountId: string
  readonly siteId: string
  readonly totalCents: number
  readonly requesterId: string
  readonly requesterRole: Role
  readonly productIds: readonly string[]
}): Promise<ApprovalPreview> {
  const [rules, account, products] = await withTenantScope(
    input.accountId,
    (tx) =>
      Promise.all([
        tx.approvalRule.findMany({
          where: { accountId: input.accountId, active: true, deletedAt: null },
          orderBy: [{ tier: 'asc' }, { id: 'asc' }],
        }),
        tx.account.findFirst({
          where: { id: input.accountId },
          select: { approvalThreshold: true },
        }),
        input.productIds.length > 0
          ? tx.product.findMany({
              where: { id: { in: [...input.productIds] } },
              select: { categoryId: true },
            })
          : Promise.resolve([]),
      ])
  )

  if (rules.length > 0) {
    const plan = planApproval(
      rules.map((rule) =>
        toRuleSpec({
          ...rule,
          requesterRole: asEnumOrNull<Role>(rule.requesterRole),
          approverRole: asEnumOrNull<Role>(rule.approverRole),
        })
      ),
      {
        totalCents: input.totalCents,
        siteId: input.siteId,
        requesterRole: input.requesterRole,
        requesterId: input.requesterId,
        categoryIds: [...new Set(products.map((row) => row.categoryId))],
      }
    )
    return {
      required: plan.length > 0,
      reason: plan.length > 0 ? 'RULES' : null,
      steps: plan.map((step) => ({
        tier: step.tier,
        ruleName: step.ruleName,
        approverRole: asEnumOrNull<Role>(step.approverRole),
        approverUserId: step.approverUserId,
      })),
      thresholdCents: null,
    }
  }

  const thresholdCents =
    account?.approvalThreshold == null
      ? null
      : Math.round(Number(account.approvalThreshold.toFixed(2)) * 100)
  const required = requiresApproval(input.totalCents, thresholdCents)

  return {
    required,
    reason: required ? 'ACCOUNT_THRESHOLD' : null,
    steps: [],
    thresholdCents,
  }
}

// --- Deciding ---------------------------------------------------------------

/**
 * Records one decision and moves the order if that completes a round.
 *
 * Everything happens in one transaction: the step, the request's new tier or
 * outcome, the order's status, and the entry on the order's timeline.
 */
export async function decideApproval(
  actor: AuthenticatedActor,
  stepId: string,
  dto: DecideApprovalDto
): Promise<FullApprovalRequest> {
  const step = await requireStep(actor, stepId)
  const request = step.request

  if (request.status !== 'PENDING') {
    throw new ConflictError('This order is no longer awaiting a decision.', {
      details: { status: request.status },
    })
  }

  // A PENDING request is not the same thing as an order still waiting on it.
  //
  // `cancelApprovalRequestForOrder` closes the request when an order is
  // cancelled, but a request raised before that existed — or one whose order
  // moved by some path that does not come through here — would still be open,
  // and this is the check that makes the order itself the authority. Without
  // it, approving a stale queue entry wrote APPROVED straight onto the order,
  // bypassing `assertTransition` and reviving an order whose stock had already
  // gone back on the shelf and whose budget had already been given back.
  if (request.order.status !== OrderStatus.PENDING_APPROVAL) {
    throw new ConflictError('This order is no longer waiting for a decision.', {
      details: { orderStatus: request.order.status },
    })
  }

  assertStepOpen(
    { status: asEnum<StepStatus>(step.status), tier: step.tier },
    request.currentTier
  )

  if (
    !canDecideStep(
      {
        approverRole: asEnumOrNull<Role>(step.approverRole),
        approverUserId: step.approverUserId,
      },
      { userId: actor.userId, role: actor.role },
      request.order.placedById
    )
  ) {
    throw new ForbiddenError(
      request.order.placedById === actor.userId
        ? 'An order cannot be approved by the person who raised it.'
        : 'This approval is addressed to someone else.'
    )
  }

  const actorName = await resolveActorName(actor)
  const now = new Date()

  const updated = await withTenantScope(request.accountId, async (tx) => {
    await tx.approvalStep.update({
      where: { id: stepId },
      data: {
        status: dto.decision,
        decidedById: actor.userId,
        decidedByName: actorName,
        decidedAt: now,
        comment: dto.comment ?? null,
      },
    })

    const steps = await tx.approvalStep.findMany({
      where: { requestId: request.id },
      select: { id: true, tier: true, status: true },
    })

    const progress = evaluateProgress(
      steps.map((s) => ({ tier: s.tier, status: asEnum<StepStatus>(s.status) }))
    )

    // Steps above a refusal are marked SKIPPED rather than left PENDING, so they
    // disappear from their approvers' queues instead of sitting there as work
    // nobody can ever do.
    if (progress.skipTiersAbove !== null) {
      await tx.approvalStep.updateMany({
        where: {
          requestId: request.id,
          tier: { gt: progress.skipTiersAbove },
          status: 'PENDING',
        },
        data: { status: 'SKIPPED' },
      })
    }

    await tx.approvalRequest.update({
      where: { id: request.id },
      data: {
        status: progress.outcome,
        currentTier: progress.currentTier,
        completedAt: progress.outcome === 'PENDING' ? null : now,
      },
    })

    const orderStatus = ORDER_STATUS_FOR[progress.outcome]
    if (orderStatus && orderStatus !== request.order.status) {
      await tx.order.update({
        where: { id: request.orderId },
        data: {
          status: orderStatus,
          ...(orderStatus === OrderStatus.APPROVED
            ? {
                approvedById: actor.userId,
                approvedAt: now,
                changeRequestNote: null,
              }
            : {}),
          ...(orderStatus === OrderStatus.REJECTED
            ? { rejectionReason: dto.comment ?? 'Rejected in approval' }
            : {}),
          ...(orderStatus === OrderStatus.CHANGES_REQUESTED
            ? { changeRequestNote: dto.comment ?? null }
            : {}),
        },
      })

      // A refusal hands the goods back to the shelf, in the same transaction as
      // the status that caused it.
      //
      // The orders module does this for a rejection reached through the status
      // endpoint; a rejection reached through an approval step never did, so a
      // refused order held its reservation for ever and the stock was promised
      // to an order nobody was going to ship. Predates the SQL Server move --
      // the NestJS original has the same gap -- and was found by exercising the
      // approval path rather than the status one.
      //
      // CHANGES_REQUESTED deliberately keeps the reservation: that order is
      // still live and coming back for another decision, and releasing the
      // stock would let someone else take it in the meantime.
      if (orderStatus === OrderStatus.REJECTED) {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: request.orderId },
          select: {
            stockState: true,
            lines: {
              select: {
                productId: true,
                variantId: true,
                quantity: true,
                sku: true,
              },
            },
          },
        })

        if (order.stockState === 'RESERVED') {
          await releaseStock(tx, order.lines)
          await tx.order.update({
            where: { id: request.orderId },
            data: { stockState: 'RELEASED' },
          })
        }
      }

      // The order's own timeline, not just the approval's — a buyer reading
      // their order should see the decision without opening a second screen.
      await tx.orderStatusEvent.create({
        data: {
          id: createId('ose'),
          orderId: request.orderId,
          fromStatus: request.order.status,
          toStatus: orderStatus,
          actorId: actor.userId,
          actorName,
          actorRole: actor.role,
          comment: dto.comment ?? null,
        },
      })
    }

    return tx.approvalRequest.findFirstOrThrow({
      where: { id: request.id },
      include: FULL_REQUEST,
    })
  })

  await recordAudit({
    action: AuditAction.APPROVAL_DECIDED,
    entityType: 'ORDER',
    entityId: request.orderId,
    entityName: request.order.orderNumber,
    accountId: request.accountId,
    // The step decided, the request it belongs to, and the order — each only
    // if it moved. Tier one of two resolves the step and leaves the request
    // PENDING and the order where it was, and the entry says exactly that.
    changes: mergeChanges(
      fieldChange(
        `steps.${step.id}.status`,
        step.status,
        updated.steps.find((candidate) => candidate.id === step.id)?.status ??
          null
      ),
      fieldChange('requestStatus', request.status, updated.status),
      fieldChange('orderStatus', request.order.status, updated.order.status)
    ),
    details: {
      decision: dto.decision,
      tier: step.tier,
      comment: dto.comment ?? null,
    },
  })

  // The buyer hears about every decision (SOW §10 acceptance: "the requester is
  // notified on every approval decision"). A tier cleared on the way to the
  // next is said to be exactly that — an order that has passed step one is not
  // "approved", and telling the buyer it was would be wrong twice, once now and
  // once when step two refuses.
  if (updated.status !== 'PENDING') {
    await notifyRequester(updated, dto.decision, actorName, dto.comment ?? null)
  } else {
    await notifyRequester(
      updated,
      dto.decision,
      actorName,
      dto.comment ?? null,
      {
        decidedTier: step.tier,
        nextTier: updated.currentTier,
      }
    )
    // And the next round's approvers need to know it has reached them.
    await notifyPendingApprovers(request.orderId)
  }

  console.info(
    `Approval ${stepId} on order ${request.order.orderNumber}: ${dto.decision} by ${actor.userId} (request now ${updated.status}).`
  )
  return updated
}

/**
 * Closes the open approval request on an order that is being cancelled.
 *
 * Takes the caller's transaction rather than opening one: the request has to
 * close in the same commit as the cancellation, or a crash between the two
 * leaves an order that is cancelled and still decidable — which is the bug this
 * exists to prevent, merely narrowed to a smaller window.
 *
 * Open steps are marked SKIPPED, not left PENDING, so the order leaves its
 * approvers' queues instead of sitting there as work nobody can ever do — the
 * same treatment `decideApproval` gives the tiers above a refusal.
 *
 * Silent when there is nothing open: an order held only by the account
 * threshold has no request at all, and one already decided must keep the
 * outcome it was decided with.
 */
export async function cancelApprovalRequestForOrder(
  tx: TransactionClient,
  orderId: string
): Promise<void> {
  const request = await tx.approvalRequest.findFirst({
    where: { orderId, status: 'PENDING' },
    select: { id: true },
  })
  if (!request) return

  await tx.approvalStep.updateMany({
    where: { requestId: request.id, status: 'PENDING' },
    data: { status: 'SKIPPED' },
  })

  await tx.approvalRequest.update({
    where: { id: request.id },
    data: { status: 'CANCELLED', completedAt: new Date() },
  })
}

// --- Reading ----------------------------------------------------------------

/**
 * The approvals queue.
 *
 * `mine=true` narrows to steps this actor can actually act on right now: open,
 * at the current tier, and addressed to them by name or by role. That is the
 * query the hub screen makes, and doing it here rather than in the client keeps
 * "who may decide" in one place.
 */
export async function listApprovals(
  actor: AuthenticatedActor,
  query: ListApprovalsQueryDto
): Promise<OffsetPage<FullApprovalRequest>> {
  const accountId =
    actor.role === Role.ADMIN ? (query.accountId ?? null) : actor.accountId

  const clauses: Prisma.ApprovalRequestWhereInput[] = []
  if (accountId) clauses.push({ accountId })
  if (query.status) clauses.push({ status: query.status })

  if (query.mine) {
    clauses.push({
      status: 'PENDING',
      // Never your own order, whatever role you hold.
      order: { placedById: { not: actor.userId } },
      steps: {
        some: {
          status: 'PENDING',
          OR: [
            { approverUserId: actor.userId },
            ...(actor.role === Role.ADMIN
              ? [{ approverRole: { not: null } }]
              : [{ approverRole: actor.role }]),
          ],
        },
      },
    })
  }

  const where: Prisma.ApprovalRequestWhereInput =
    clauses.length > 0 ? { AND: clauses } : {}
  const { skip, take } = toSkipTake(query)

  // `mine` cannot be answered by the WHERE alone: the last condition compares
  // each step's tier against its own request's currentTier, and no single clause
  // can hold a row up against a column of its own parent.
  //
  // That test used to run over the page the database had already cut, which made
  // every page short and the total a count of what survived one page. It also
  // asked only whether *some* step was open at the current tier — not whether
  // that step was addressed to this actor — so a request whose open step
  // belonged to someone else stayed in the queue as long as the actor held a
  // step at any other tier.
  //
  // So the filter now runs over the whole candidate set, which the WHERE above
  // has already narrowed to open requests carrying a step for this actor, and
  // the page is cut afterwards. `canDecideStep` is the same rule the decision
  // endpoint applies, rather than a second spelling of it that can drift.
  if (query.mine) {
    const readCandidates = (client: TransactionClient | typeof prisma) =>
      client.approvalRequest.findMany({
        where,
        select: {
          id: true,
          currentTier: true,
          order: { select: { placedById: true } },
          steps: {
            select: {
              tier: true,
              status: true,
              approverRole: true,
              approverUserId: true,
            },
          },
        },
        orderBy: [{ createdAt: 'asc' }],
      })

    const candidates = accountId
      ? await withTenantScope(accountId, readCandidates)
      : await readCandidates(prisma)

    const ids = candidates
      .filter((request) =>
        request.steps.some(
          (step) =>
            step.status === 'PENDING' &&
            step.tier === request.currentTier &&
            canDecideStep(
              {
                approverRole: asEnumOrNull<Role>(step.approverRole),
                approverUserId: step.approverUserId,
              },
              { userId: actor.userId, role: actor.role },
              request.order.placedById
            )
        )
      )
      .map((request) => request.id)

    const pageIds = ids.slice(skip, skip + take)
    if (pageIds.length === 0) return offsetPage([], ids.length, query)

    // The heavy include is read for one page, not for everything the filter
    // had to consider.
    const readPage = (client: TransactionClient | typeof prisma) =>
      client.approvalRequest.findMany({
        where: { id: { in: pageIds } },
        include: FULL_REQUEST,
        orderBy: [{ createdAt: 'asc' }],
      })

    const items = accountId
      ? await withTenantScope(accountId, readPage)
      : await readPage(prisma)

    return offsetPage(items, ids.length, query)
  }

  const read = async (client: TransactionClient | typeof prisma) =>
    Promise.all([
      client.approvalRequest.findMany({
        where,
        include: FULL_REQUEST,
        orderBy: [{ createdAt: 'asc' }],
        skip,
        take,
      }),
      client.approvalRequest.count({ where }),
    ])

  const [items, total] = accountId
    ? await withTenantScope(accountId, read)
    : await read(prisma)

  return offsetPage(items, total, query)
}

export async function findApprovalByOrder(
  actor: AuthenticatedActor,
  orderId: string
): Promise<FullApprovalRequest> {
  const accountId = await accountOfOrder(actor, orderId)

  const request = await withTenantScope(accountId, (tx) =>
    tx.approvalRequest.findFirst({ where: { orderId }, include: FULL_REQUEST })
  )

  if (!request) throw new NotFoundError('Approval request')
  return request
}

// --- Rules ------------------------------------------------------------------

export async function listApprovalRules(
  actor: AuthenticatedActor,
  accountId?: string
): Promise<ApprovalRuleRow[]> {
  const scope =
    actor.role === Role.ADMIN ? (accountId ?? actor.accountId) : actor.accountId

  return withTenantScope(scope, (tx) =>
    tx.approvalRule.findMany({
      where: { deletedAt: null },
      include: { category: { select: { id: true, code: true, name: true } } },
      orderBy: [{ tier: 'asc' }, { name: 'asc' }],
    })
  )
}

export async function createApprovalRule(
  actor: AuthenticatedActor,
  dto: CreateApprovalRuleDto
): Promise<ApprovalRuleRow> {
  const accountId =
    actor.role === Role.ADMIN
      ? (dto.accountId ?? actor.accountId)
      : actor.accountId
  await assertRuleTargetsExist(accountId, dto)

  const rule = await withTenantScope(accountId, (tx) =>
    tx.approvalRule.create({
      data: {
        id: createId('apr'),
        accountId,
        name: dto.name,
        description: dto.description ?? null,
        active: dto.active,
        minTotal: dto.minTotal ?? null,
        categoryId: dto.categoryId ?? null,
        requesterRole: dto.requesterRole ?? null,
        siteId: dto.siteId ?? null,
        tier: dto.tier,
        approverRole: dto.approverRole ?? null,
        approverUserId: dto.approverUserId ?? null,
      },
      include: { category: { select: { id: true, code: true, name: true } } },
    })
  )

  await recordAudit({
    action: AuditAction.APPROVAL_RULE_CREATED,
    entityType: 'ACCOUNT',
    entityId: accountId,
    entityName: rule.name,
    accountId,
    changes: created(rule, APPROVAL_RULE_AUDIT_FIELDS),
    details: { ruleId: rule.id },
  })

  return rule
}

export async function updateApprovalRule(
  actor: AuthenticatedActor,
  ruleId: string,
  dto: UpdateApprovalRuleDto
): Promise<ApprovalRuleRow> {
  const accountId = await accountOfRule(actor, ruleId)
  await assertRuleTargetsExist(accountId, dto)
  const previous = await readRuleForAudit(accountId, ruleId)

  const rule = await withTenantScope(accountId, (tx) =>
    tx.approvalRule.update({
      where: { id: ruleId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.minTotal !== undefined ? { minTotal: dto.minTotal } : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
        ...(dto.requesterRole !== undefined
          ? { requesterRole: dto.requesterRole }
          : {}),
        ...(dto.siteId !== undefined ? { siteId: dto.siteId } : {}),
        ...(dto.tier !== undefined ? { tier: dto.tier } : {}),
        ...(dto.approverRole !== undefined
          ? { approverRole: dto.approverRole }
          : {}),
        ...(dto.approverUserId !== undefined
          ? { approverUserId: dto.approverUserId }
          : {}),
      },
      include: { category: { select: { id: true, code: true, name: true } } },
    })
  )

  await recordAudit({
    action: AuditAction.APPROVAL_RULE_UPDATED,
    entityType: 'ACCOUNT',
    entityId: accountId,
    entityName: rule.name,
    accountId,
    changes: changesBetween(previous, rule, APPROVAL_RULE_AUDIT_FIELDS),
    details: { ruleId },
  })

  return rule
}

/**
 * Soft delete.
 *
 * Requests already in flight keep their steps, because `ApprovalStep.ruleId` is
 * nullable and the approver was snapshotted onto the step. Retiring a rule never
 * strands an order that is halfway through it.
 */
export async function removeApprovalRule(
  actor: AuthenticatedActor,
  ruleId: string
): Promise<void> {
  const accountId = await accountOfRule(actor, ruleId)
  const previous = await readRuleForAudit(accountId, ruleId)

  const rule = await withTenantScope(accountId, (tx) =>
    tx.approvalRule.update({
      where: { id: ruleId },
      data: { active: false, deletedAt: new Date() },
    })
  )

  await recordAudit({
    action: AuditAction.APPROVAL_RULE_DELETED,
    entityType: 'ACCOUNT',
    entityId: accountId,
    entityName: rule.name,
    accountId,
    // What the rule routed, so a deletion made in error can be put back.
    changes: removed(previous, APPROVAL_RULE_AUDIT_FIELDS),
    details: { ruleId },
  })
}

// --- Audit ------------------------------------------------------------------

const APPROVAL_RULE_AUDIT_FIELDS = [
  'name',
  'description',
  'active',
  'tier',
  'minTotal',
  'categoryId',
  'requesterRole',
  'siteId',
  'approverRole',
  'approverUserId',
] as const

function readRuleForAudit(accountId: string, ruleId: string) {
  return withTenantScope(accountId, (tx) =>
    tx.approvalRule.findUniqueOrThrow({ where: { id: ruleId } })
  )
}

// --- Internals --------------------------------------------------------------

/**
 * Emails whoever can act on an order's current round.
 *
 * Role steps fan out to every active holder of that role in the account — that
 * is what makes a rota work, and sending to only one of them would leave an
 * order waiting on whoever happened to be picked.
 *
 * Called from the orders module at placement as well as from `decideApproval`,
 * which is why it takes an order id rather than a request: at placement the
 * caller has the order and not the request that was just raised for it.
 */
export async function notifyPendingApprovers(orderId: string): Promise<void> {
  const request = await prisma.approvalRequest.findFirst({
    where: { orderId, status: 'PENDING' },
    include: FULL_REQUEST,
  })
  if (!request) return

  const open = request.steps.filter(
    (step) => step.status === 'PENDING' && step.tier === request.currentTier
  )
  if (open.length === 0) return

  const named = open
    .map((step) => step.approverUserId)
    .filter((id): id is string => id !== null)
  const roles = open
    .map((step) => step.approverRole)
    .filter((role) => role !== null)

  const recipients = await withTenantScope(request.accountId, (tx) =>
    tx.user.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        // Never the person who raised it — they cannot decide it, so asking them
        // to would be noise they learn to ignore.
        id: { not: request.order.placedById },
        OR: [
          ...(named.length > 0 ? [{ id: { in: named } }] : []),
          ...(roles.length > 0 ? [{ role: { in: roles } }] : []),
        ],
      },
      select: { email: true, firstName: true },
    })
  )

  for (const recipient of recipients) {
    // The dispatcher swallows its own failures: a notification must never fail
    // the decision that produced it, which is already committed.
    sendApprovalPendingEmail({
      to: recipient.email,
      firstName: recipient.firstName,
      order: summariseOrder(request),
      tier: request.currentTier,
    })
  }
}

/**
 * Tells the buyer what was decided: the outcome once the request has resolved,
 * or, with `interim`, that one step has passed and the next has the order.
 */
async function notifyRequester(
  request: FullApprovalRequest,
  decision: DecideApprovalDto['decision'],
  decidedByName: string,
  comment: string | null,
  interim: { decidedTier: number; nextTier: number } | null = null
): Promise<void> {
  const requester = await withTenantScope(request.accountId, (tx) =>
    tx.user.findFirst({
      where: { id: request.order.placedById },
      select: { email: true, firstName: true },
    })
  )
  if (!requester) return

  sendApprovalDecidedEmail({
    to: requester.email,
    firstName: requester.firstName,
    order: summariseOrder(request),
    decision,
    decidedByName,
    comment,
    interim,
  })
}

async function requireStep(actor: AuthenticatedActor, stepId: string) {
  const step = await prisma.approvalStep.findFirst({
    where: { id: stepId },
    include: { request: { include: FULL_REQUEST } },
  })

  if (!step) throw new NotFoundError('Approval')
  if (actor.role !== Role.ADMIN && step.request.accountId !== actor.accountId) {
    throw new NotFoundError('Approval')
  }
  return step
}

async function accountOfOrder(
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

async function accountOfRule(
  actor: AuthenticatedActor,
  ruleId: string
): Promise<string> {
  const rule = await prisma.approvalRule.findFirst({
    where: { id: ruleId, deletedAt: null },
    select: { accountId: true },
  })
  if (!rule) throw new NotFoundError('Approval rule')
  if (actor.role !== Role.ADMIN && rule.accountId !== actor.accountId) {
    throw new NotFoundError('Approval rule')
  }
  return rule.accountId
}

/**
 * A rule that points at a category, branch or person that does not exist would
 * match nothing, or route to nobody, and give no sign of either.
 */
/**
 * The targets a rule names have to be real, on the way in and on every edit.
 *
 * Takes the fields rather than either DTO so create and update share one
 * answer: an edit that could point a rule at a deleted site, a removed category
 * or a departed approver would strand every order the rule went on to match,
 * and a rule that create refused is not one update should be able to write.
 */
async function assertRuleTargetsExist(
  accountId: string,
  dto: {
    categoryId?: string | null
    siteId?: string | null
    approverUserId?: string | null
  }
): Promise<void> {
  if (dto.categoryId) {
    const category = await prisma.productCategory.findFirst({
      where: { id: dto.categoryId, deletedAt: null },
      select: { id: true },
    })
    if (!category) throw new NotFoundError('Category')
  }

  if (dto.siteId || dto.approverUserId) {
    await withTenantScope(accountId, async (tx) => {
      if (dto.siteId) {
        const site = await tx.site.findFirst({
          where: { id: dto.siteId, deletedAt: null },
          select: { id: true },
        })
        if (!site) throw new NotFoundError('Site')
      }
      if (dto.approverUserId) {
        const user = await tx.user.findFirst({
          where: { id: dto.approverUserId, deletedAt: null, status: 'ACTIVE' },
          select: { id: true },
        })
        // An approver who has left would strand every order the rule matched.
        if (!user) {
          throw new BusinessRuleError(
            'That approver is not an active user of this account.',
            {
              details: { approverUserId: dto.approverUserId },
            }
          )
        }
      }
    })
  }
}

async function resolveActorName(actor: AuthenticatedActor): Promise<string> {
  const user = await prisma.user.findFirst({
    where: { id: actor.userId },
    select: { firstName: true, lastName: true },
  })
  return user ? `${user.firstName} ${user.lastName}`.trim() : actor.email
}

/** The order facts the notification templates repeat back to the reader. */
function summariseOrder(request: FullApprovalRequest) {
  return {
    orderId: request.order.id,
    orderNumber: request.order.orderNumber,
    total: request.order.total.toFixed(2),
    siteName: request.order.site.name,
    placedByName: request.order.placedByName,
    poNumber: request.order.poNumber,
    customerReference: request.order.customerReference,
    lineCount: request.order._count.lines,
  }
}

/** What each request outcome means for the order it is deciding on. */
const ORDER_STATUS_FOR: Readonly<Record<string, OrderStatus | null>> = {
  PENDING: null,
  APPROVED: OrderStatus.APPROVED,
  REJECTED: OrderStatus.REJECTED,
  CHANGES_REQUESTED: OrderStatus.CHANGES_REQUESTED,
  CANCELLED: null,
}

function toRuleSpec(rule: {
  id: string
  name: string
  tier: number
  minTotal: Prisma.Decimal | null
  categoryId: string | null
  requesterRole: Role | null
  siteId: string | null
  approverRole: Role | null
  approverUserId: string | null
}): ApprovalRuleSpec {
  return {
    id: rule.id,
    name: rule.name,
    tier: rule.tier,
    minTotalCents:
      rule.minTotal == null
        ? null
        : Math.round(Number(rule.minTotal.toFixed(2)) * 100),
    categoryId: rule.categoryId,
    requesterRole: rule.requesterRole,
    siteId: rule.siteId,
    approverRole: rule.approverRole,
    approverUserId: rule.approverUserId,
  }
}
