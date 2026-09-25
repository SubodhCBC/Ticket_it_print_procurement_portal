import { Prisma } from '@prisma/client'
import {
  findPriceableProducts,
  type PriceableProduct,
} from '../catalog/products.service'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope } from '../db/client'
import { NotFoundError } from '../utils/errors'
import type { QuoteDto } from './rate-card.validation'
import {
  priceForContract,
  priceForTemplate,
  priceLadderForContract,
  type ContractPriceBreakdown,
  type ResolvedRateCard,
} from './rate-card-pricing'

/** The card in force plus only the items the caller asked about. */
const CARD_FOR_PRICING = Prisma.validator<Prisma.RateCardSelect>()({
  id: true,
  name: true,
  defaultDiscountPercent: true,
  effectiveFrom: true,
  effectiveTo: true,
})

export type PricingRateCard = Prisma.RateCardGetPayload<{
  select: typeof CARD_FOR_PRICING
}>

export interface QuotedLine {
  readonly productId: string
  readonly sku: string
  readonly name: string
  readonly uom: PriceableProduct['uom']
  readonly moq: number
  readonly orderMultiple: number
  /**
   * The design this quote is for, echoed back so a caller can tell two quotes
   * for the same product apart. Null when the line names no design, which is
   * the only case still priced from the catalogue.
   */
  readonly templateVersionId: string | null
  /**
   * The configuration this quote is for, echoed back for the same reason as the
   * design: on a design-priced line the chosen stock can add to the price, so
   * two quotes differing only in variant are two different prices.
   */
  readonly variantId: string | null
  readonly breakdown: ContractPriceBreakdown
  /**
   * The ladder as this account sees it, for the volume table on the tile.
   * Empty for a design-priced line: one price at every quantity is not a
   * ladder, and rendering a one-row table would imply a break that is not
   * there.
   */
  readonly ladder: readonly ContractPriceBreakdown[]
}

/**
 * What an account actually pays.
 *
 * The read side of pricing, and the piece the cart and order snapshots call:
 * the cart prices its lines through `quote()`, and an order snapshots the
 * breakdown it returns so a later base-price change cannot rewrite what was
 * ordered.
 *
 * Kept apart from `rate-cards.service.ts`, which administers the contracts.
 * This one only ever reads them, and it is reachable by every signed-in
 * customer, so the separation is also the permission boundary: PRICING_VIEW
 * here, PRICING_MANAGE there.
 */

/**
 * The one card in force for an account at an instant, or null.
 *
 * "One" is guaranteed by the EXCLUDE constraint on `rate_cards`, not by the
 * `findFirst` here — which is why this can order by `effectiveFrom` and take
 * the first row without the result being arbitrary. If that constraint were
 * ever dropped, this would quietly start picking a winner, so the ordering is
 * deliberate rather than incidental.
 */
export async function activeCardFor(
  accountId: string,
  at: Date = new Date()
): Promise<PricingRateCard | null> {
  return withTenantScope(accountId, (tx) =>
    tx.rateCard.findFirst({
      where: {
        accountId,
        status: 'ACTIVE',
        deletedAt: null,
        effectiveFrom: { lte: at },
        // Exclusive upper bound, matching the `[)` range in the constraint.
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: at } }],
      },
      select: CARD_FOR_PRICING,
      orderBy: { effectiveFrom: 'desc' },
    })
  )
}

/**
 * The frozen price of each named template version, in cents.
 *
 * A version published before designs carried prices has none, and is absent
 * from the map rather than present as zero — the caller falls back to the
 * catalogue for it, which is what that order would have been priced at anyway.
 * Free designs are a real thing and are `0`, so absence and zero have to stay
 * distinguishable.
 *
 * Not tenant-scoped, and not filtered by visibility. A version id only reaches
 * this from a basket line the actor already owns, and the price of a design
 * someone is being asked to pay for is not a secret from them.
 */
async function templatePricesFor(
  ids: readonly (string | undefined)[]
): Promise<Map<string, number>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) return new Map()

  const versions = await prisma.templateVersion.findMany({
    where: { id: { in: wanted }, price: { not: null } },
    select: { id: true, price: true },
  })

  return new Map(
    versions.map((version) => [version.id, toCents(version.price!)])
  )
}

/**
 * What each named variant's chosen option values add to a pack, in cents.
 *
 * A value's surcharge lives on its option — `valuePrices` on `product_options`
 * — and the variant names which values it is, so the sum is over the variant's
 * attributes looked up in its product's options. A variant whose values carry
 * no surcharge is present as `0`; an id that is not a live variant is absent.
 *
 * Read once for the batch, like the template prices above.
 */
async function optionSurchargesFor(
  ids: readonly (string | undefined)[]
): Promise<Map<string, number>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  if (wanted.length === 0) return new Map()

  const variants = await prisma.productVariant.findMany({
    where: { id: { in: wanted }, deletedAt: null },
    select: {
      id: true,
      attributes: true,
      product: {
        select: { options: { select: { name: true, valuePrices: true } } },
      },
    },
  })

  return new Map(
    variants.map((variant) => {
      const attributes = parseJsonObject(variant.attributes)
      let cents = 0
      for (const option of variant.product.options) {
        const chosen = attributes[option.name]
        if (typeof chosen !== 'string') continue
        const price = parseJsonObject(option.valuePrices)[chosen]
        const amount = Number(price)
        if (Number.isFinite(amount) && amount > 0) {
          cents += Math.round(amount * 100)
        }
      }
      return [variant.id, cents]
    })
  )
}

function parseJsonObject(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/**
 * Prices a batch of lines for the actor's account.
 *
 * Batched deliberately: a product grid needs every tile priced, and one request
 * per tile would put the rate-card lookup on the critical path fifty times for
 * a single page. The card is read once for the whole batch.
 *
 * A product the actor may not see is left out of the result rather than
 * raising. The caller gets fewer lines than it sent and can say so per row —
 * failing the whole quote because one SKU was unpublished a second ago would
 * blank an entire page.
 *
 * A line naming a template version is priced from that version and nothing
 * else. See `priceForTemplate`: the design's price replaces the catalogue
 * price rather than being discounted from it, so the rate card is not
 * consulted for those lines at all.
 */
export async function quote(
  actor: AuthenticatedActor,
  dto: QuoteDto
): Promise<QuotedLine[]> {
  const accountId = resolveAccount(actor, dto.accountId)
  // Only an administrator may price against another instant. A customer
  // choosing `at` could quote themselves against an expired contract, or one
  // that has not been signed yet.
  const at = actor.role === Role.ADMIN ? (dto.at ?? new Date()) : new Date()

  const products = await findPriceableProducts(
    actor,
    dto.lines.map((line) => line.productId)
  )
  const byId = new Map(products.map((product) => [product.id, product]))

  // The frozen prices, read once for the batch for the same reason the rate
  // card is: a basket of twenty personalised lines is one query, not twenty.
  // No visibility filter — a version id only reaches here off a basket line the
  // actor already owns, and a price is not a secret from the person paying it.
  const templatePrices = await templatePricesFor(
    dto.lines.map((line) => line.templateVersionId)
  )
  // What a chosen stock or finish adds to a design's pack price. Only read for
  // design-priced lines: a catalogue line's variant is priced by the rate card
  // as it always was.
  const surcharges = await optionSurchargesFor(
    dto.lines
      .filter((line) => line.templateVersionId)
      .map((line) => line.variantId)
  )

  const card = await activeCardFor(accountId, at)
  const rules: Map<string, ResolvedRateCard['item']> = card
    ? await itemRules(accountId, card.id, [...byId.keys()])
    : new Map<string, ResolvedRateCard['item']>()

  const quoted: QuotedLine[] = []

  for (const line of dto.lines) {
    const product = byId.get(line.productId)
    if (!product) continue

    const templatePriceCents = line.templateVersionId
      ? (templatePrices.get(line.templateVersionId) ?? null)
      : null

    if (templatePriceCents !== null) {
      quoted.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        uom: product.uom,
        moq: product.moq,
        orderMultiple: product.orderMultiple,
        templateVersionId: line.templateVersionId ?? null,
        variantId: line.variantId ?? null,
        breakdown: priceForTemplate({
          // The design's pack price, plus whatever the chosen stock or finish
          // adds to a pack. The surcharge is folded into the unit price rather
          // than carried beside it, so every consumer of a breakdown — the
          // basket, the order snapshot, the invoice — prices it with no idea a
          // surcharge exists.
          unitPriceCents:
            templatePriceCents +
            (line.variantId ? (surcharges.get(line.variantId) ?? 0) : 0),
          quantity: line.quantity,
        }),
        ladder: [],
      })
      continue
    }

    const resolved = toResolvedCard(card, rules.get(product.id) ?? null)
    const catalogTiers = product.volumeTiers.map((tier) => ({
      minQuantity: tier.minQuantity,
      discountPercent: Number(tier.discountPercent),
    }))

    quoted.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      uom: product.uom,
      moq: product.moq,
      orderMultiple: product.orderMultiple,
      templateVersionId: line.templateVersionId ?? null,
      variantId: line.variantId ?? null,
      breakdown: priceForContract({
        baseUnitPriceCents: toCents(product.basePrice),
        quantity: line.quantity,
        catalogTiers,
        card: resolved,
      }),
      ladder: priceLadderForContract({
        baseUnitPriceCents: toCents(product.basePrice),
        moq: product.moq,
        catalogTiers,
        card: resolved,
      }),
    })
  }

  return quoted
}

/**
 * The card in force for the calling customer, for the "your pricing" banner.
 *
 * Returns null rather than 404 when there is no contract: having no rate card
 * is the ordinary case, not an error.
 */
export async function myActiveCard(
  actor: AuthenticatedActor,
  accountId?: string
): Promise<PricingRateCard | null> {
  return activeCardFor(resolveAccount(actor, accountId))
}

/**
 * The terms a card sets for a set of products, keyed by product id.
 *
 * Only the products being priced are read. A contract with two thousand lines
 * should not be loaded whole to price one tile.
 */
async function itemRules(
  accountId: string,
  rateCardId: string,
  productIds: readonly string[]
): Promise<Map<string, ResolvedRateCard['item']>> {
  if (productIds.length === 0) return new Map()

  const items = await withTenantScope(accountId, (tx) =>
    tx.rateCardItem.findMany({
      where: { rateCardId, productId: { in: [...productIds] } },
      select: {
        productId: true,
        fixedPrice: true,
        discountPercent: true,
        tiers: {
          select: { minQuantity: true, discountPercent: true },
          orderBy: { minQuantity: 'asc' },
        },
      },
    })
  )

  return new Map(
    items.map((item) => [
      item.productId,
      {
        fixedPriceCents:
          item.fixedPrice == null ? null : toCents(item.fixedPrice),
        discountPercent:
          item.discountPercent == null ? null : Number(item.discountPercent),
        tiers: item.tiers.map((tier) => ({
          minQuantity: tier.minQuantity,
          discountPercent: Number(tier.discountPercent),
        })),
      },
    ])
  )
}

/**
 * Which account a quote is for.
 *
 * An administrator may price on behalf of a named customer — that is how the
 * rate-card preview works. Everyone else is pinned to their own account,
 * whatever they sent.
 */
function resolveAccount(actor: AuthenticatedActor, requested?: string): string {
  if (actor.role === Role.ADMIN && requested) return requested
  if (!actor.accountId) throw new NotFoundError('Account')
  return actor.accountId
}

function toResolvedCard(
  card: PricingRateCard | null,
  item: ResolvedRateCard['item']
): ResolvedRateCard | null {
  if (!card) return null
  return {
    id: card.id,
    name: card.name,
    defaultDiscountPercent: Number(card.defaultDiscountPercent),
    item,
  }
}

/**
 * Decimal to integer cents, via the string form.
 *
 * The same conversion as `product.types.ts`, and the same reason: Prisma's
 * Decimal is exact and so is its string form, and routing through a float first
 * is the one step that can lose the cent the whole convention exists to
 * protect.
 */
function toCents(value: Prisma.Decimal): number {
  return Math.round(Number(value.toFixed(2)) * 100)
}
