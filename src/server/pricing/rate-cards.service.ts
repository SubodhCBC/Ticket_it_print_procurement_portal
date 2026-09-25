import { Prisma } from '@prisma/client'
import type { RateCard } from '@prisma/client'
import type { RateCardStatus } from './rate-card-status'
import { AuditAction } from '../audit/audit.actions'
import {
  changesBetween,
  created,
  mergeChanges,
  type AuditChanges,
} from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope, type TransactionClient } from '../db/client'
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../utils/errors'
import { createId } from '../utils/ids'
import { offsetPage, toSkipTake, type OffsetPage } from '../utils/pagination'
import { asEnum } from '../db/column-types'
import type {
  ChangeRateCardStatusDto,
  CreateRateCardDto,
  ListRateCardItemsQueryDto,
  ListRateCardsQueryDto,
  RateCardItemDto,
  SetRateCardItemsDto,
  UpdateRateCardDto,
} from './rate-card.validation'

/** Everything the rate-card detail screen needs, in one read. */
const FULL_RATE_CARD = Prisma.validator<Prisma.RateCardInclude>()({
  account: { select: { id: true, accountCode: true, name: true } },
  items: {
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          basePrice: true,
          uom: true,
          moq: true,
        },
      },
      tiers: { orderBy: { minQuantity: 'asc' } },
    },
    orderBy: { productId: 'asc' },
  },
  _count: { select: { items: true } },
})

export type FullRateCard = Prisma.RateCardGetPayload<{
  include: typeof FULL_RATE_CARD
}>
export type RateCardItemRow = FullRateCard['items'][number]

/** The list view: counts, no items. */
const RATE_CARD_SUMMARY = Prisma.validator<Prisma.RateCardInclude>()({
  account: { select: { id: true, accountCode: true, name: true } },
  _count: { select: { items: true } },
})

export type RateCardSummary = Prisma.RateCardGetPayload<{
  include: typeof RATE_CARD_SUMMARY
}>

/**
 * Which status changes are allowed.
 *
 * A card never returns to DRAFT once it has been active: orders priced under it
 * reference it, and "draft" would suggest it can still be edited freely. An
 * archived card is final — reviving one would resurrect a contract that has
 * been superseded, and writing a new card is both cheap and auditable.
 */
const ALLOWED_TRANSITIONS: Readonly<
  Record<RateCardStatus, readonly RateCardStatus[]>
> = {
  DRAFT: ['ACTIVE', 'ARCHIVED'],
  ACTIVE: ['ARCHIVED'],
  ARCHIVED: [],
}

/**
 * Rate card administration.
 *
 * ---------------------------------------------------------------------------
 * Tenant scoping, and the one place it is deliberately absent
 * ---------------------------------------------------------------------------
 * Rate cards are tenant-owned and policied — unlike the catalog they price,
 * which is global. Every read and write for a single account opens that
 * account's scope, so RLS covers the ordinary path.
 *
 * The exception is `listRateCards()` when an administrator asks for every
 * account's cards, which is what the pricing admin screen does and which no
 * tenant scope can express. That path is guarded by PRICING_MANAGE, which no
 * customer role holds, and filtered in the query. A customer calling the same
 * endpoint is pinned to their own account before the query is built — see
 * `resolveScope`.
 */

/**
 * The account a request may act on.
 *
 * An administrator may name any account, or none for a cross-tenant list.
 * Everyone else is pinned to their own, whatever they asked for — silently,
 * because a customer supplying someone else's accountId is not a request to be
 * corrected with an error message that confirms the id exists.
 */
function resolveScope(
  actor: AuthenticatedActor,
  requested?: string
): string | null {
  if (actor.role !== Role.ADMIN) return actor.accountId
  return requested ?? null
}

// --- Reads ------------------------------------------------------------------

export async function listRateCards(
  actor: AuthenticatedActor,
  query: ListRateCardsQueryDto
): Promise<OffsetPage<RateCardSummary>> {
  const accountId = resolveScope(actor, query.accountId)

  // Composed as an AND array rather than one spread object. `activeAt` also
  // constrains `status`, and spreading both into a single object would let it
  // silently overwrite an explicit `status=DRAFT` — the caller would get ACTIVE
  // cards back and no indication their filter had been discarded.
  const clauses: Prisma.RateCardWhereInput[] = [{ deletedAt: null }]

  if (accountId) clauses.push({ accountId })
  if (query.status) clauses.push({ status: query.status })
  if (query.search) {
    clauses.push({ name: { contains: query.search } })
  }
  if (query.activeAt) {
    clauses.push({
      status: 'ACTIVE',
      effectiveFrom: { lte: query.activeAt },
      // Exclusive upper bound, matching the `[)` range in the constraint.
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: query.activeAt } }],
    })
  }

  // status=DRAFT with activeAt is now a contradiction rather than a silent
  // rewrite, and correctly returns nothing.
  const where: Prisma.RateCardWhereInput = { AND: clauses }

  const { skip, take } = toSkipTake(query)
  const read = async (client: TransactionClient | typeof prisma) =>
    Promise.all([
      client.rateCard.findMany({
        where,
        include: RATE_CARD_SUMMARY,
        orderBy: [{ effectiveFrom: 'desc' }, { id: 'asc' }],
        skip,
        take,
      }),
      client.rateCard.count({ where }),
    ])

  // Cross-tenant only when an administrator asked for it; otherwise scoped, so
  // RLS is exercised on the path customers actually take.
  const [items, total] = accountId
    ? await withTenantScope(accountId, read)
    : await read(prisma)

  return offsetPage(items, total, query)
}

export async function findRateCardById(
  actor: AuthenticatedActor,
  rateCardId: string
): Promise<FullRateCard> {
  const accountId = await requireReadableAccount(actor, rateCardId)

  const card = await withTenantScope(accountId, (tx) =>
    tx.rateCard.findFirst({
      where: { id: rateCardId, deletedAt: null },
      include: FULL_RATE_CARD,
    })
  )

  if (!card) throw new NotFoundError('Rate card')
  return card
}

/**
 * One card without its items.
 *
 * For callers that need the card's own terms — its default discount, to price
 * an item row against — and not the price list itself. `findRateCardById`
 * includes every item, so using it here would load the whole contract on each
 * page of a paged read and undo the paging entirely.
 */
export async function findRateCardSummary(
  actor: AuthenticatedActor,
  rateCardId: string
): Promise<RateCardSummary> {
  const accountId = await requireReadableAccount(actor, rateCardId)

  const card = await withTenantScope(accountId, (tx) =>
    tx.rateCard.findFirst({
      where: { id: rateCardId, deletedAt: null },
      include: RATE_CARD_SUMMARY,
    })
  )

  if (!card) throw new NotFoundError('Rate card')
  return card
}

/**
 * One card's items, paged and searchable.
 *
 * Separate from `findRateCardById` because a negotiated price list runs to
 * hundreds of lines and the detail screen pages through them; returning all of
 * them on every card read would make opening the screen the most expensive
 * request in the pricing module.
 */
export async function listRateCardItems(
  actor: AuthenticatedActor,
  rateCardId: string,
  query: ListRateCardItemsQueryDto
): Promise<OffsetPage<RateCardItemRow>> {
  const accountId = await requireReadableAccount(actor, rateCardId)

  const where: Prisma.RateCardItemWhereInput = {
    rateCardId,
    ...(query.search
      ? {
          product: {
            OR: [
              { name: { contains: query.search } },
              { sku: { contains: query.search } },
            ],
          },
        }
      : {}),
  }

  const { skip, take } = toSkipTake(query)

  const [items, total] = await withTenantScope(accountId, (tx) =>
    Promise.all([
      tx.rateCardItem.findMany({
        where,
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              basePrice: true,
              uom: true,
              moq: true,
            },
          },
          tiers: { orderBy: { minQuantity: 'asc' } },
        },
        orderBy: { product: { name: 'asc' } },
        skip,
        take,
      }),
      tx.rateCardItem.count({ where }),
    ])
  )

  return offsetPage(items, total, query)
}

// --- Writes -----------------------------------------------------------------

export async function createRateCard(
  dto: CreateRateCardDto,
  actor: AuthenticatedActor
): Promise<FullRateCard> {
  await assertAccountExists(dto.accountId)
  await assertProductsExist(dto.items)

  const rateCardId = createId('rc')

  const card = await withTenantScope(dto.accountId, async (tx) => {
    await tx.rateCard.create({
      data: {
        id: rateCardId,
        accountId: dto.accountId,
        name: dto.name,
        notes: dto.notes ?? null,
        // Always DRAFT. Activation is its own audited transition — see
        // changeRateCardStatus, which is also where the overlap rule is
        // arbitrated.
        status: 'DRAFT',
        effectiveFrom: dto.effectiveFrom,
        effectiveTo: dto.effectiveTo ?? null,
        defaultDiscountPercent: dto.defaultDiscountPercent,
        createdById: actor.userId,
      },
    })

    await writeItems(tx, rateCardId, dto.items)

    return tx.rateCard.findFirstOrThrow({
      where: { id: rateCardId },
      include: FULL_RATE_CARD,
    })
  })

  await recordAudit({
    action: AuditAction.RATE_CARD_CREATED,
    entityType: 'RATE_CARD',
    entityId: card.id,
    entityName: card.name,
    accountId: card.accountId,
    changes: mergeChanges(
      created(card, RATE_CARD_AUDIT_FIELDS),
      itemChanges({}, await itemsForAudit(card.accountId, card.id))
    ),
  })

  console.info(`Created rate card ${card.id} for account ${card.accountId}.`)
  return card
}

export async function updateRateCard(
  rateCardId: string,
  dto: UpdateRateCardDto
): Promise<FullRateCard> {
  const before = await requireCard(rateCardId)
  assertMutable(before)

  const effectiveFrom = dto.effectiveFrom ?? before.effectiveFrom
  const effectiveTo =
    dto.effectiveTo === undefined ? before.effectiveTo : dto.effectiveTo
  if (effectiveTo != null && effectiveTo <= effectiveFrom) {
    throw new BusinessRuleError('The card must end after it starts', {
      details: {
        effectiveFrom: effectiveFrom.toISOString(),
        effectiveTo: effectiveTo.toISOString(),
      },
    })
  }

  const card = await withTenantScope(before.accountId, (tx) =>
    tx.rateCard.update({
      where: { id: rateCardId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.effectiveFrom !== undefined
          ? { effectiveFrom: dto.effectiveFrom }
          : {}),
        ...(dto.effectiveTo !== undefined
          ? { effectiveTo: dto.effectiveTo }
          : {}),
        ...(dto.defaultDiscountPercent !== undefined
          ? { defaultDiscountPercent: dto.defaultDiscountPercent }
          : {}),
      },
      include: FULL_RATE_CARD,
    })
  ).catch((error: unknown) => {
    // Moving an ACTIVE card's window onto another live card's is rejected by the
    // same EXCLUDE constraint that guards activation, and deserves the same 409
    // rather than a raw database error.
    throw translateOverlap(error, before)
  })

  await recordAudit({
    action: AuditAction.RATE_CARD_UPDATED,
    entityType: 'RATE_CARD',
    entityId: rateCardId,
    entityName: card.name,
    accountId: card.accountId,
    changes: changesBetween(before, card, RATE_CARD_AUDIT_FIELDS),
  })

  return card
}

/**
 * DRAFT → ACTIVE → ARCHIVED, and DRAFT → ARCHIVED for a card that was never
 * signed.
 *
 * Activating is the interesting one: the EXCLUDE constraint refuses a second
 * card whose window overlaps an already-active one for the same account, and
 * that rejection is translated here into an explanation rather than a 500. It
 * is a constraint and not a query because two administrators activating two
 * cards in the same second would both pass a read-then-write check and leave
 * the customer with two live contracts.
 */
export async function changeRateCardStatus(
  rateCardId: string,
  dto: ChangeRateCardStatusDto
): Promise<FullRateCard> {
  const before = await requireCard(rateCardId)

  if (before.status === dto.status) {
    throw new BusinessRuleError(`This rate card is already ${dto.status}`, {
      details: { status: dto.status },
    })
  }

  const from = asEnum<RateCardStatus>(before.status)

  if (!ALLOWED_TRANSITIONS[from].includes(dto.status)) {
    throw new BusinessRuleError(
      `A ${before.status} rate card cannot become ${dto.status}. ` +
        `Allowed from here: ${ALLOWED_TRANSITIONS[from].join(', ') || 'nothing'}.`,
      { details: { from: before.status, to: dto.status } }
    )
  }

  const card = await withTenantScope(before.accountId, (tx) =>
    tx.rateCard.update({
      where: { id: rateCardId },
      data: { status: dto.status },
      include: FULL_RATE_CARD,
    })
  ).catch((error: unknown) => {
    throw translateOverlap(error, before)
  })

  await recordAudit({
    action: AuditAction.RATE_CARD_STATUS_CHANGED,
    entityType: 'RATE_CARD',
    entityId: rateCardId,
    entityName: card.name,
    accountId: card.accountId,
    changes: changesBetween(before, card, ['status']),
    details: { reason: dto.reason ?? null },
  })

  console.info(`Rate card ${rateCardId}: ${before.status} -> ${dto.status}.`)
  return card
}

/**
 * Bulk item editor.
 *
 * Upserts the named products and, with `replaceAll`, removes everything else.
 * The whole payload is one transaction: half a price list is worse than none,
 * because the half that landed would start pricing orders immediately.
 */
export async function setRateCardItems(
  rateCardId: string,
  dto: SetRateCardItemsDto
): Promise<FullRateCard> {
  const before = await requireCard(rateCardId)
  assertMutable(before)
  await assertProductsExist(dto.items)

  const keep = dto.items.map((item) => item.productId)
  const itemsBefore = await itemsForAudit(before.accountId, rateCardId)

  const card = await withTenantScope(before.accountId, async (tx) => {
    if (dto.replaceAll) {
      await tx.rateCardItem.deleteMany({
        where: { rateCardId, productId: { notIn: keep } },
      })
    }

    await writeItems(tx, rateCardId, dto.items)

    return tx.rateCard.findFirstOrThrow({
      where: { id: rateCardId },
      include: FULL_RATE_CARD,
    })
  })

  await recordAudit({
    action: AuditAction.RATE_CARD_ITEMS_SET,
    entityType: 'RATE_CARD',
    entityId: rateCardId,
    entityName: card.name,
    accountId: card.accountId,
    // One field per product, keyed by SKU, so the difference view reads as a
    // price list: which lines were added, removed or repriced, and from what.
    changes: itemChanges(
      itemsBefore,
      await itemsForAudit(card.accountId, rateCardId)
    ),
    details: { replaceAll: dto.replaceAll },
  })

  return card
}

export async function removeRateCardItem(
  rateCardId: string,
  productId: string
): Promise<void> {
  const card = await requireCard(rateCardId)
  assertMutable(card)
  const itemsBefore = await itemsForAudit(card.accountId, rateCardId)

  const deleted = await withTenantScope(card.accountId, (tx) =>
    tx.rateCardItem.deleteMany({ where: { rateCardId, productId } })
  )

  if (deleted.count === 0) throw new NotFoundError('Rate card item')

  await recordAudit({
    action: AuditAction.RATE_CARD_ITEM_REMOVED,
    entityType: 'RATE_CARD',
    entityId: rateCardId,
    entityName: card.name,
    accountId: card.accountId,
    changes: itemChanges(
      itemsBefore,
      await itemsForAudit(card.accountId, rateCardId)
    ),
    details: { productId },
  })
}

/**
 * Soft delete.
 *
 * Orders priced under this card reference it, so the row survives; ARCHIVED
 * plus `deletedAt` is what takes it out of pricing. An ACTIVE card is archived
 * on the way out, which also releases its slot in the overlap constraint —
 * otherwise a deleted card would keep blocking its successor.
 */
export async function removeRateCard(rateCardId: string): Promise<void> {
  const card = await requireCard(rateCardId)

  const archived = await withTenantScope(card.accountId, (tx) =>
    tx.rateCard.update({
      where: { id: rateCardId },
      data: { status: 'ARCHIVED', deletedAt: new Date() },
    })
  )

  await recordAudit({
    action: AuditAction.RATE_CARD_DELETED,
    entityType: 'RATE_CARD',
    entityId: rateCardId,
    entityName: card.name,
    accountId: card.accountId,
    changes: changesBetween(card, archived, ['status', 'deletedAt']),
  })

  console.info(`Deleted rate card ${rateCardId} (was ${card.status}).`)
}

// --- Internals --------------------------------------------------------------

/**
 * Writes item rows and their tiers.
 *
 * Tiers are deleted and re-created rather than diffed: a ladder is read as a
 * whole, an update that merged rows would leave a threshold nobody asked for
 * still standing, and there are at most twenty of them.
 */
async function writeItems(
  tx: TransactionClient,
  rateCardId: string,
  items: readonly RateCardItemDto[]
): Promise<void> {
  for (const item of items) {
    const existing = await tx.rateCardItem.findUnique({
      where: {
        rateCardId_productId: { rateCardId, productId: item.productId },
      },
      select: { id: true },
    })

    const data = {
      fixedPrice: item.fixedPrice ?? null,
      discountPercent: item.discountPercent ?? null,
    }

    const itemId = existing?.id ?? createId('rci')

    if (existing) {
      await tx.rateCardItem.update({ where: { id: existing.id }, data })
      await tx.rateCardTier.deleteMany({
        where: { rateCardItemId: existing.id },
      })
    } else {
      await tx.rateCardItem.create({
        data: { id: itemId, rateCardId, productId: item.productId, ...data },
      })
    }

    if (item.tiers.length > 0) {
      await tx.rateCardTier.createMany({
        data: item.tiers.map((tier) => ({
          id: createId('rct'),
          rateCardItemId: itemId,
          minQuantity: tier.minQuantity,
          discountPercent: tier.discountPercent,
        })),
      })
    }
  }
}

/**
 * Reads the card outside any scope, purely to learn which account owns it.
 *
 * Deliberately narrow in intent — this is the one read in the module that RLS
 * does not cover, and it exists only to decide which scope to open next.
 */
async function requireCard(rateCardId: string): Promise<RateCard> {
  const card = await prisma.rateCard.findFirst({
    where: { id: rateCardId, deletedAt: null },
  })
  if (!card) throw new NotFoundError('Rate card')
  return card
}

/**
 * The account whose scope a read should open, having checked the actor may see
 * this card at all.
 *
 * A customer asking for someone else's card gets 404, not 403: confirming that
 * a rate card exists for another company is itself a disclosure.
 */
async function requireReadableAccount(
  actor: AuthenticatedActor,
  rateCardId: string
): Promise<string> {
  const card = await requireCard(rateCardId)
  if (actor.role !== Role.ADMIN && card.accountId !== actor.accountId) {
    throw new NotFoundError('Rate card')
  }
  return card.accountId
}

/**
 * An ARCHIVED card is history. Editing one would rewrite the terms an already
 * invoiced order was priced under.
 *
 * ACTIVE cards *are* editable, deliberately: a price correction on a live
 * contract is an ordinary thing to need, and forcing an archive-and-recreate
 * would break the link from existing orders to the card they cite. Every edit
 * is audited, which is what makes that safe.
 */
function assertMutable(card: RateCard): void {
  if (card.status === 'ARCHIVED') {
    throw new BusinessRuleError(
      'An archived rate card cannot be edited. Create a new card instead.',
      { details: { rateCardId: card.id, status: card.status } }
    )
  }
}

async function assertAccountExists(accountId: string): Promise<void> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, deletedAt: null },
    select: { id: true },
  })
  if (!account) throw new NotFoundError('Account')
}

/**
 * Every named product must exist and not be deleted.
 *
 * Checked up front rather than relying on the foreign key, so a 400 naming the
 * bad ids comes back instead of a constraint violation that says only that
 * something failed. Draft products are allowed: a contract is routinely signed
 * before the SKU is published.
 */
async function assertProductsExist(
  items: readonly RateCardItemDto[]
): Promise<void> {
  if (items.length === 0) return

  const wanted = [...new Set(items.map((item) => item.productId))]
  const found = await prisma.product.findMany({
    where: { id: { in: wanted }, deletedAt: null },
    select: { id: true },
  })

  const missing = wanted.filter(
    (id) => !found.some((product) => product.id === id)
  )
  if (missing.length > 0) {
    throw new BusinessRuleError(
      `${missing.length} of the products on this rate card do not exist`,
      { details: { productIds: missing } }
    )
  }
}

/**
 * Turns the EXCLUDE constraint's rejection into something an administrator can
 * act on.
 *
 * Prisma surfaces an exclusion violation as P2010 (raw query failed) rather
 * than as a unique-constraint error, so it is matched on the constraint name,
 * which is the stable part.
 */
function translateOverlap(error: unknown, card: RateCard): unknown {
  const message = error instanceof Error ? error.message : String(error)
  if (!message.includes('rate_cards_no_overlapping_active')) return error

  return new ConflictError(
    'Another rate card is already active for this account over part of the same period. ' +
      'Archive it, or change the effective dates so the two do not overlap.',
    {
      details: {
        accountId: card.accountId,
        effectiveFrom: card.effectiveFrom.toISOString(),
        effectiveTo: card.effectiveTo?.toISOString() ?? null,
      },
    }
  )
}

/**
 * The rate-card fields the audit log records a before and after for.
 *
 * `as const` so the list is checked against the model: a field added to the DTO
 * and the update without being added here is simply not logged, which is the
 * failure worth making visible in review.
 */
const RATE_CARD_AUDIT_FIELDS = [
  'name',
  'notes',
  'status',
  'effectiveFrom',
  'effectiveTo',
  'defaultDiscountPercent',
] as const

/**
 * A card's price list as the log compares it: one entry per product, keyed
 * `items.<SKU>`, holding the fixed price, the discount and the tier ladder.
 *
 * Keyed by SKU rather than by item id because items are rewritten on every save
 * — `writeItems` recreates tiers — and an id that changes on each save would
 * make every line look added and removed.
 */
async function itemsForAudit(
  accountId: string,
  rateCardId: string
): Promise<Record<string, unknown>> {
  const items = await withTenantScope(accountId, (tx) =>
    tx.rateCardItem.findMany({
      where: { rateCardId },
      include: {
        product: { select: { sku: true } },
        tiers: { orderBy: { minQuantity: 'asc' } },
      },
    })
  )

  return Object.fromEntries(
    items.map((item) => [
      `items.${item.product.sku}`,
      {
        fixedPrice: item.fixedPrice,
        discountPercent: item.discountPercent,
        tiers: item.tiers.map((tier) => ({
          minQuantity: tier.minQuantity,
          discountPercent: tier.discountPercent,
        })),
      },
    ])
  )
}

/** Added lines have a null before; removed lines a null after. */
function itemChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): AuditChanges {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  return changesBetween(before, after, keys)
}
