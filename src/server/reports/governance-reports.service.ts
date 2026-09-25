import { Prisma } from '@prisma/client'
import type { AuthenticatedActor } from '../context/request-context'
import { withTenantScope } from '../db/client'
import { OPEN_STATUSES, type OrderStatus } from '../orders/order-status'
import { BusinessRuleError } from '../utils/errors'
import { offsetPage, toSkipTake, type OffsetPage } from '../utils/pagination'
import { resolveAccountId } from '../utils/tenant'
import { reportSiteScope, siteWhere } from './report-scope'
import { resolveRange } from './report-periods'
import type {
  AccessReviewQueryDto,
  ApprovalActivityQueryDto,
  OrderAgeingQueryDto,
  OrderHistoryQueryDto,
} from './report.validation'

/**
 * The governance reports of SOW §15: approval activity, the user access review
 * extract, order ageing and the order history extract.
 *
 * Kept apart from `reports.service.ts` because they answer a different kind of
 * question. Those are aggregates — how much, how many — and are cached. These
 * are row-level evidence for an attestation or an operational chase: who
 * approved this, who can sign in, which order has sat still for a fortnight.
 * A cached answer to "who can sign in" is the wrong answer, so none of these is
 * cached.
 *
 * Every one runs inside the tenant scope of a single account, resolved with
 * `resolveAccountId`: a head-office user naming another account is refused, not
 * quietly shown their own, and only an administrator may name another tenant.
 */

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

// --- Approval activity -------------------------------------------------------

/** How an order came to need a decision. */
export type ApprovalRoute = 'RULE' | 'THRESHOLD'

export type ApprovalOutcome = 'APPROVED' | 'REJECTED' | 'CHANGES_REQUESTED'

export interface ApprovalDecisionRow {
  readonly decidedAt: Date
  readonly orderId: string
  readonly orderNumber: string
  readonly siteCode: string
  readonly siteName: string
  readonly orderTotal: string
  /** When the order was put in front of approvers for this decision. */
  readonly submittedAt: Date
  /** Submission to decision, to one decimal place: the cycle time (§15). */
  readonly hoursToDecision: number
  readonly route: ApprovalRoute
  /** The rule tier decided; null for a threshold hold, which has no tiers. */
  readonly tier: number | null
  readonly approverId: string | null
  readonly approverName: string
  /** The role the step was routed to, or the role of whoever released a hold. */
  readonly approverRole: string | null
  readonly outcome: ApprovalOutcome
  readonly comment: string | null
}

export interface ApproverSummaryRow {
  readonly approverId: string | null
  readonly approverName: string
  readonly decisions: number
  readonly approved: number
  readonly rejected: number
  readonly changesRequested: number
  readonly averageHoursToDecision: number
  readonly medianHoursToDecision: number
}

export interface ApprovalActivityReport {
  readonly from: string
  readonly to: string
  readonly totals: Omit<ApproverSummaryRow, 'approverId' | 'approverName'>
  readonly byApprover: readonly ApproverSummaryRow[]
  readonly decisions: readonly ApprovalDecisionRow[]
}

const DECISIONS: readonly ApprovalOutcome[] = [
  'APPROVED',
  'REJECTED',
  'CHANGES_REQUESTED',
]

/**
 * Every approval decision in a window, by approver and outcome (§15: "by
 * approver, outcome and date range — governance and approval cycle time").
 *
 * ---------------------------------------------------------------------------
 * Two sources, and why they cannot overlap
 * ---------------------------------------------------------------------------
 * An order reaches an approver one of two ways, and they are recorded
 * differently:
 *
 * - **By rule.** The order has an approval request with a step per tier, and
 *   every step records who decided it, when and how. One row per decided step,
 *   so a two-tier approval is two rows with two approvers — which is the point
 *   of a governance report.
 *
 * - **By the account threshold.** No request and no steps; the hold is released
 *   through the ordinary status transition, and the decision lives in the
 *   order's status history as a move out of PENDING_APPROVAL.
 *
 * A rule-routed order also writes a status event when its round resolves, so
 * reading events for every order would count those decisions twice. Events are
 * read only for orders with no approval request at all.
 *
 * ---------------------------------------------------------------------------
 * Cycle time
 * ---------------------------------------------------------------------------
 * Measured from when the order was put in front of approvers for *this*
 * decision to when it was made. For a rule, that is when the request was
 * raised; for a hold, when the order last entered PENDING_APPROVAL — an order
 * sent back for changes and resubmitted starts a new clock, and measuring from
 * the first submission would charge the approver for the buyer's rework.
 */
export async function approvalActivity(
  actor: AuthenticatedActor,
  query: ApprovalActivityQueryDto
): Promise<ApprovalActivityReport> {
  const accountId = resolveAccountId(actor, query.accountId)
  const sites = await reportSiteScope(actor, query.siteId)
  const range = resolveRange(query.from, query.to)
  const outcomes = query.outcome ? [query.outcome] : DECISIONS

  const decisions = await withTenantScope(accountId, async (tx) => {
    const steps = await tx.approvalStep.findMany({
      where: {
        decidedAt: { gte: range.from, lt: range.to },
        status: { in: [...outcomes] },
        ...(query.approverId ? { decidedById: query.approverId } : {}),
        request: {
          accountId,
          ...(sites === undefined ? {} : { order: siteWhere(sites) }),
        },
      },
      include: {
        request: {
          select: {
            createdAt: true,
            order: {
              select: {
                id: true,
                orderNumber: true,
                total: true,
                site: { select: { code: true, name: true } },
              },
            },
          },
        },
      },
    })

    const released = await tx.orderStatusEvent.findMany({
      where: {
        createdAt: { gte: range.from, lt: range.to },
        fromStatus: 'PENDING_APPROVAL',
        toStatus: { in: [...outcomes] },
        ...(query.approverId ? { actorId: query.approverId } : {}),
        order: {
          accountId,
          approvalRequest: { is: null },
          ...siteWhere(sites),
        },
      },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            total: true,
            createdAt: true,
            site: { select: { code: true, name: true } },
          },
        },
      },
    })

    // When each held order last went into PENDING_APPROVAL before its release.
    const submissions = released.length
      ? await tx.orderStatusEvent.findMany({
          where: {
            orderId: { in: [...new Set(released.map((e) => e.orderId))] },
            toStatus: 'PENDING_APPROVAL',
          },
          select: { orderId: true, createdAt: true },
        })
      : []

    const fromRules = steps.map((step): ApprovalDecisionRow => ({
      decidedAt: step.decidedAt!,
      orderId: step.request.order.id,
      orderNumber: step.request.order.orderNumber,
      siteCode: step.request.order.site.code,
      siteName: step.request.order.site.name,
      orderTotal: step.request.order.total.toFixed(2),
      submittedAt: step.request.createdAt,
      hoursToDecision: hoursBetween(step.request.createdAt, step.decidedAt!),
      route: 'RULE',
      tier: step.tier,
      approverId: step.decidedById,
      approverName: step.decidedByName ?? 'Unknown approver',
      approverRole: step.approverRole,
      outcome: step.status as ApprovalOutcome,
      comment: step.comment,
    }))

    const fromHolds = released.map((event): ApprovalDecisionRow => {
      const submittedAt =
        submissions
          .filter(
            (entry) =>
              entry.orderId === event.orderId &&
              entry.createdAt <= event.createdAt
          )
          .map((entry) => entry.createdAt)
          .sort((a, b) => b.getTime() - a.getTime())[0] ??
        // An order placed straight into PENDING_APPROVAL may have no event
        // *into* that status; it was submitted when it was placed.
        event.order.createdAt

      return {
        decidedAt: event.createdAt,
        orderId: event.order.id,
        orderNumber: event.order.orderNumber,
        siteCode: event.order.site.code,
        siteName: event.order.site.name,
        orderTotal: event.order.total.toFixed(2),
        submittedAt,
        hoursToDecision: hoursBetween(submittedAt, event.createdAt),
        route: 'THRESHOLD',
        tier: null,
        approverId: event.actorId,
        approverName: event.actorName,
        approverRole: event.actorRole,
        outcome: event.toStatus as ApprovalOutcome,
        comment: event.comment,
      }
    })

    return [...fromRules, ...fromHolds].sort(
      (a, b) => b.decidedAt.getTime() - a.decidedAt.getTime()
    )
  })

  const groups = new Map<string, ApprovalDecisionRow[]>()
  for (const decision of decisions) {
    const key = decision.approverId ?? `name:${decision.approverName}`
    groups.set(key, [...(groups.get(key) ?? []), decision])
  }

  const byApprover = [...groups.values()]
    .map((rows) => ({
      approverId: rows[0]!.approverId,
      approverName: rows[0]!.approverName,
      ...summarise(rows),
    }))
    .sort((a, b) => b.decisions - a.decisions)

  return {
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    totals: summarise(decisions),
    byApprover,
    decisions,
  }
}

function summarise(
  rows: readonly ApprovalDecisionRow[]
): Omit<ApproverSummaryRow, 'approverId' | 'approverName'> {
  const hours = rows.map((row) => row.hoursToDecision).sort((a, b) => a - b)
  const middle = Math.floor(hours.length / 2)
  const median =
    hours.length === 0
      ? 0
      : hours.length % 2
        ? hours[middle]!
        : (hours[middle - 1]! + hours[middle]!) / 2

  return {
    decisions: rows.length,
    approved: rows.filter((row) => row.outcome === 'APPROVED').length,
    rejected: rows.filter((row) => row.outcome === 'REJECTED').length,
    changesRequested: rows.filter((row) => row.outcome === 'CHANGES_REQUESTED')
      .length,
    averageHoursToDecision: round1(
      hours.length ? hours.reduce((sum, h) => sum + h, 0) / hours.length : 0
    ),
    medianHoursToDecision: round1(median),
  }
}

// --- User access review ------------------------------------------------------

export interface AccessReviewRow {
  readonly userId: string
  readonly login: string
  readonly name: string
  readonly email: string
  readonly role: string
  readonly userType: string
  readonly status: string
  readonly primarySite: string | null
  /** Branch codes beyond the primary one, comma separated. */
  readonly additionalSites: string
  /**
   * Per-user overrides of what the role grants — `ALLOW REPORT_VIEW`,
   * `DENY ORDER_CREATE on site_…`. An attestation that listed roles alone would
   * miss the one person who was quietly given more.
   */
  readonly permissionOverrides: string
  readonly lastLoginAt: Date | null
  /** Whole days since the last sign-in; null for someone who never has. */
  readonly daysSinceLastLogin: number | null
  readonly activatedAt: Date | null
  readonly createdAt: Date
  readonly deactivatedAt: Date | null
}

export interface AccessReviewReport {
  readonly accountId: string
  readonly asOf: string
  readonly users: readonly AccessReviewRow[]
}

/**
 * Every user with access, their role, their branches and when they last signed
 * in (§15 "user access review extract — by account"; §12: "quarterly extract of
 * every active user, role, site association and last login, for client
 * attestation").
 *
 * Expired permission grants are left out: they confer nothing, and listing them
 * would ask a reviewer to attest to access nobody has. A grant with no expiry,
 * or one still in the future, is shown.
 */
export async function accessReview(
  actor: AuthenticatedActor,
  query: AccessReviewQueryDto
): Promise<AccessReviewReport> {
  const accountId = resolveAccountId(actor, query.accountId)
  const now = new Date()

  const users = await withTenantScope(accountId, (tx) =>
    tx.user.findMany({
      where: {
        accountId,
        ...(query.includeInactive ? {} : { status: 'ACTIVE', deletedAt: null }),
      },
      include: {
        site: { select: { code: true, name: true } },
        siteAccess: { select: { site: { select: { code: true } } } },
        permissionGrants: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          select: { permission: true, effect: true, resourceId: true },
        },
      },
      orderBy: [{ role: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }],
    })
  )

  return {
    accountId,
    asOf: now.toISOString(),
    users: users.map((user) => ({
      userId: user.id,
      login: user.login,
      name: `${user.firstName} ${user.lastName}`.trim() || user.login,
      email: user.email,
      role: user.role,
      userType: user.userType,
      status: user.status,
      primarySite: user.site ? `${user.site.code} — ${user.site.name}` : null,
      additionalSites: user.siteAccess
        .map((access) => access.site.code)
        .sort()
        .join(', '),
      permissionOverrides: user.permissionGrants
        .map(
          (grant) =>
            `${grant.effect} ${grant.permission}` +
            (grant.resourceId ? ` on ${grant.resourceId}` : '')
        )
        .sort()
        .join('; '),
      lastLoginAt: user.lastLoginAt,
      daysSinceLastLogin: user.lastLoginAt
        ? Math.floor((now.getTime() - user.lastLoginAt.getTime()) / DAY_MS)
        : null,
      activatedAt: user.activatedAt,
      createdAt: user.createdAt,
      deactivatedAt: user.deletedAt,
    })),
  }
}

// --- Order ageing -------------------------------------------------------------

/**
 * The bands, by whole days in the current status.
 *
 * Days in the *status*, not since the order was placed. The operational question
 * is which orders have stopped moving: an order placed a month ago and
 * dispatched yesterday is fine, and one approved ten days ago and still not in
 * production is not — age since placement would rank them the other way round.
 * Both figures are on every row.
 */
export const AGEING_BANDS = [
  { label: '0–2 days', maxDays: 2 },
  { label: '3–7 days', maxDays: 7 },
  { label: '8–14 days', maxDays: 14 },
  { label: '15–30 days', maxDays: 30 },
  { label: '31+ days', maxDays: Number.POSITIVE_INFINITY },
] as const

export type AgeingBand = (typeof AGEING_BANDS)[number]['label']

export interface AgeingOrderRow {
  readonly orderId: string
  readonly orderNumber: string
  readonly status: OrderStatus
  readonly siteCode: string
  readonly siteName: string
  readonly placedByName: string
  readonly poNumber: string | null
  readonly total: string
  readonly placedAt: Date
  /** When the order entered the status it is in now. */
  readonly inStatusSince: Date
  readonly daysOpen: number
  readonly daysInStatus: number
  readonly band: AgeingBand
}

export interface AgeingStatusRow {
  readonly status: OrderStatus
  readonly orders: number
  readonly value: string
  readonly oldestDaysInStatus: number
  /** Orders per band, in `AGEING_BANDS` order. */
  readonly bands: Readonly<Record<AgeingBand, number>>
}

export interface OrderAgeingReport {
  readonly asOf: string
  readonly bands: readonly AgeingBand[]
  readonly byStatus: readonly AgeingStatusRow[]
  /** Longest in their status first. */
  readonly orders: readonly AgeingOrderRow[]
}

/**
 * Every open order and how long it has sat where it is (§15, order operations
 * dashboard: "orders by status, awaiting approval, in production, in transit,
 * and ageing").
 *
 * A snapshot as of now, not a range: an order that is open is open today, and
 * a window would hide exactly the old ones this exists to find.
 */
export async function orderAgeing(
  actor: AuthenticatedActor,
  query: OrderAgeingQueryDto
): Promise<OrderAgeingReport> {
  const accountId = resolveAccountId(actor, query.accountId)
  const sites = await reportSiteScope(actor, query.siteId)
  const now = new Date()
  const statuses = query.status ? [query.status] : [...OPEN_STATUSES]

  const orders = await withTenantScope(accountId, (tx) =>
    tx.order.findMany({
      where: {
        accountId,
        status: { in: statuses },
        ...siteWhere(sites),
      },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        placedByName: true,
        poNumber: true,
        total: true,
        createdAt: true,
        site: { select: { code: true, name: true } },
        // Only the latest move into the current status is needed; the filter
        // on `toStatus` happens below because it differs per order.
        history: {
          orderBy: { createdAt: 'desc' },
          select: { toStatus: true, createdAt: true },
        },
      },
    })
  )

  const rows = orders
    .map((order): AgeingOrderRow => {
      const inStatusSince =
        order.history.find((event) => event.toStatus === order.status)
          ?.createdAt ?? order.createdAt
      const daysInStatus = wholeDays(inStatusSince, now)

      return {
        orderId: order.id,
        orderNumber: order.orderNumber,
        status: order.status as OrderStatus,
        siteCode: order.site.code,
        siteName: order.site.name,
        placedByName: order.placedByName,
        poNumber: order.poNumber,
        total: order.total.toFixed(2),
        placedAt: order.createdAt,
        inStatusSince,
        daysOpen: wholeDays(order.createdAt, now),
        daysInStatus,
        band: bandOf(daysInStatus),
      }
    })
    .sort((a, b) => b.daysInStatus - a.daysInStatus)

  const byStatus = statuses
    .map((status): AgeingStatusRow => {
      const inStatus = rows.filter((row) => row.status === status)
      return {
        status,
        orders: inStatus.length,
        value: inStatus
          .reduce((sum, row) => sum.plus(row.total), new Prisma.Decimal(0))
          .toFixed(2),
        oldestDaysInStatus: inStatus[0]?.daysInStatus ?? 0,
        bands: Object.fromEntries(
          AGEING_BANDS.map((band) => [
            band.label,
            inStatus.filter((row) => row.band === band.label).length,
          ])
        ) as Record<AgeingBand, number>,
      }
    })
    .filter((row) => row.orders > 0 || query.status !== undefined)

  return {
    asOf: now.toISOString(),
    bands: AGEING_BANDS.map((band) => band.label),
    byStatus,
    orders: rows,
  }
}

function bandOf(days: number): AgeingBand {
  return AGEING_BANDS.find((band) => days <= band.maxDays)!.label
}

// --- Order history extract ----------------------------------------------------

export interface OrderHistoryLineRow {
  readonly orderId: string
  readonly orderNumber: string
  readonly placedAt: Date
  readonly status: string
  readonly siteCode: string
  readonly siteName: string
  readonly placedByName: string
  readonly placedByEmail: string
  readonly poNumber: string | null
  readonly customerReference: string | null
  readonly campaignCode: string | null
  readonly projectCode: string | null
  readonly sku: string
  readonly variantSku: string | null
  readonly productName: string
  readonly quantity: number
  readonly unitPrice: string
  readonly lineTotal: string
  readonly orderTotal: string
}

/**
 * The most lines one export carries.
 *
 * Refused above it rather than truncated, as the catalogue export is: a history
 * extract that silently stops at a row limit reads as complete once it is open
 * in Excel, and it is exactly the file somebody reconciles against. A year of
 * the planned volume — 20,000 orders at six lines — fits twice over in two
 * windows; narrow the range beyond that.
 */
export const MAX_ORDER_HISTORY_LINES = 60_000

/**
 * Who ordered what, for which branch, when, how many and for how much (§15
 * "order history / audit extract — by account, site, user, status and date
 * range"; AD-7).
 *
 * One row per order line, because "what" and "how many" are line facts; the
 * order's own figures repeat on each of its lines so a filtered or sorted sheet
 * still says which order a line belongs to. Values are the order's snapshot —
 * the price it was placed at — never today's catalogue.
 *
 * The window is on when the order was placed. Drafts are never included: a
 * basket that was never submitted is not an order anyone placed.
 */
export async function orderHistory(
  actor: AuthenticatedActor,
  query: OrderHistoryQueryDto
): Promise<OffsetPage<OrderHistoryLineRow>> {
  const { where } = await historyScope(actor, query)
  const { skip, take } = toSkipTake(query)

  const [lines, total] = await withTenantScope(where.accountId, (tx) =>
    Promise.all([
      tx.orderLineItem.findMany({
        where: { order: where.order },
        include: HISTORY_LINE_INCLUDE,
        orderBy: [{ order: { createdAt: 'desc' } }, { createdAt: 'asc' }],
        skip,
        take,
      }),
      tx.orderLineItem.count({ where: { order: where.order } }),
    ])
  )

  return offsetPage(lines.map(toHistoryRow), total, query)
}

/** The whole window, for an export. Refused above `MAX_ORDER_HISTORY_LINES`. */
export async function orderHistoryForExport(
  actor: AuthenticatedActor,
  query: OrderHistoryQueryDto
): Promise<readonly OrderHistoryLineRow[]> {
  const { where } = await historyScope(actor, query)

  return withTenantScope(where.accountId, async (tx) => {
    const total = await tx.orderLineItem.count({
      where: { order: where.order },
    })
    if (total > MAX_ORDER_HISTORY_LINES) {
      throw new BusinessRuleError(
        `That is ${total.toLocaleString('en-NZ')} order lines, and one export carries at most ` +
          `${MAX_ORDER_HISTORY_LINES.toLocaleString('en-NZ')}. Narrow the dates, branch or buyer and export in parts.`,
        { details: { matched: total, maximum: MAX_ORDER_HISTORY_LINES } }
      )
    }

    const lines = await tx.orderLineItem.findMany({
      where: { order: where.order },
      include: HISTORY_LINE_INCLUDE,
      orderBy: [{ order: { createdAt: 'desc' } }, { createdAt: 'asc' }],
    })
    return lines.map(toHistoryRow)
  })
}

/** The window an extract covers, for the file name. */
export function orderHistoryRange(query: OrderHistoryQueryDto) {
  return resolveRange(query.from, query.to)
}

const HISTORY_LINE_INCLUDE = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      createdAt: true,
      status: true,
      placedByName: true,
      placedByEmail: true,
      poNumber: true,
      customerReference: true,
      campaignCode: true,
      projectCode: true,
      total: true,
      site: { select: { code: true, name: true } },
    },
  },
} satisfies Prisma.OrderLineItemInclude

async function historyScope(
  actor: AuthenticatedActor,
  query: OrderHistoryQueryDto
): Promise<{
  where: { accountId: string; order: Prisma.OrderWhereInput }
}> {
  const accountId = resolveAccountId(actor, query.accountId)
  const sites = await reportSiteScope(actor, query.siteId)
  const range = resolveRange(query.from, query.to)

  return {
    where: {
      accountId,
      order: {
        accountId,
        createdAt: { gte: range.from, lt: range.to },
        status: query.status ? query.status : { not: 'DRAFT' },
        ...siteWhere(sites),
        ...(query.userId ? { placedById: query.userId } : {}),
      },
    },
  }
}

function toHistoryRow(
  line: Prisma.OrderLineItemGetPayload<{ include: typeof HISTORY_LINE_INCLUDE }>
): OrderHistoryLineRow {
  return {
    orderId: line.order.id,
    orderNumber: line.order.orderNumber,
    placedAt: line.order.createdAt,
    status: line.order.status,
    siteCode: line.order.site.code,
    siteName: line.order.site.name,
    placedByName: line.order.placedByName,
    placedByEmail: line.order.placedByEmail,
    poNumber: line.order.poNumber,
    customerReference: line.order.customerReference,
    campaignCode: line.order.campaignCode,
    projectCode: line.order.projectCode,
    sku: line.sku,
    variantSku: line.variantSku,
    productName: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice.toFixed(2),
    lineTotal: line.lineTotal.toFixed(2),
    orderTotal: line.order.total.toFixed(2),
  }
}

// --- Time -------------------------------------------------------------------

function hoursBetween(from: Date, to: Date): number {
  return round1(Math.max(0, to.getTime() - from.getTime()) / HOUR_MS)
}

function wholeDays(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / DAY_MS))
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}
