import { Prisma } from '@prisma/client'
import type { Product, ProductVariant } from '@prisma/client'
import { AuditAction } from '../audit/audit.actions'
import { Permission } from '../auth/permissions'
import { can } from '../auth/permission.service'
import { asEnum } from '../db/column-types'
import { enqueueDerivatives } from './asset-derivative.service'
import { skuCandidates } from './image-sku-match'
import {
  changesBetween,
  created,
  fieldChange,
  mergeChanges,
  removed,
} from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma } from '../db/client'
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../utils/errors'
import { createId } from '../utils/ids'
import { offsetPage, toSkipTake, type OffsetPage } from '../utils/pagination'
import { forgetOperatorDamFile, readOperatorDamFile } from '../dam/dam.service'
import {
  buildKey,
  presignDownload,
  put,
  remove as removeObject,
  StoragePrefix,
} from '../storage/storage.service'
import { categoryVisibilityFilter } from './category-visibility'
import { MAX_EXPORT_ROWS } from './product-csv'
import {
  assertTransition,
  CUSTOMER_VISIBLE_STATUSES,
  type ProductStatus,
} from './product-status'
import { sendLowStockEmail } from '../mail/mail.dispatcher'
import {
  fromJsonOr,
  fromStringList,
  tagFilter,
  toCanonicalJson,
  toStringList,
} from '../db/json-column'
import type {
  AdjustStockDto,
  AttachAssetDto,
  MatchImageFilenamesDto,
  ChangeProductStatusDto,
  CreateProductDto,
  CreateVariantDto,
  ExportProductsQueryDto,
  ListProductsQueryDto,
  ReconcileStockDto,
  SetProductOptionsDto,
  SetVisibilityDto,
  SetVolumeTiersDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './product.validation'

/**
 * Everything the product detail page needs, in one read.
 *
 * Wrapped in `Prisma.validator` rather than declared `as const`: the latter
 * makes the nested `orderBy` arrays readonly, which Prisma's own input types
 * reject. The validator keeps the literal types that `ProductGetPayload` needs
 * while still type-checking the shape against the schema.
 */
const FULL_PRODUCT = Prisma.validator<Prisma.ProductInclude>()({
  category: { select: { id: true, code: true, name: true } },
  options: { orderBy: { sortOrder: 'asc' } },
  variants: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
  volumeTiers: { orderBy: { minQuantity: 'asc' } },
  assets: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
  supersededBy: { select: { id: true, sku: true, name: true, status: true } },
})

export type FullProduct = Prisma.ProductGetPayload<{
  include: typeof FULL_PRODUCT
}>

/**
 * Just enough of a product to price it: the base price, the order rules and the
 * public volume ladder.
 *
 * Deliberately narrow. A quote for a fifty-tile grid would otherwise drag every
 * variant, option and asset row along with it for data no price calculation
 * looks at.
 */
const PRICEABLE_PRODUCT = Prisma.validator<Prisma.ProductSelect>()({
  id: true,
  sku: true,
  name: true,
  status: true,
  basePrice: true,
  moq: true,
  orderMultiple: true,
  packSize: true,
  uom: true,
  volumeTiers: {
    select: { minQuantity: true, discountPercent: true },
    orderBy: { minQuantity: 'asc' },
  },
})

export type PriceableProduct = Prisma.ProductGetPayload<{
  select: typeof PRICEABLE_PRODUCT
}>

/**
 * The product catalog.
 *
 * ---------------------------------------------------------------------------
 * Global data, and what that means here
 * ---------------------------------------------------------------------------
 * None of the catalog tables carries an `accountId`, so none of this runs
 * inside `withTenantScope` and none of it is covered by Row-Level Security.
 * That is deliberate — the catalog belongs to the platform operator — but it
 * removes the safety net every other module has.
 *
 * What replaces it is `visibilityFilter()`: the single place that decides which
 * products an actor may see. Every customer-facing read goes through it. A bug
 * there cannot leak one customer's data to another, because there is none in
 * these tables; what it can leak is a RESTRICTED product to an account that has
 * no contract for it, which is why it is one function and not a predicate
 * copied into each query.
 */

/**
 * Which products this actor may see.
 *
 * An administrator sees the whole catalog including drafts, because building
 * the catalog is their job. Everyone else sees published products that are
 * either unrestricted or explicitly granted to their account.
 *
 * The `visibleTo: { some: ... }` arm is an EXISTS subquery on
 * `product_account_visibility`, which is indexed on accountId — so a restricted
 * catalog does not cost a scan.
 *
 * The product's category has to be visible too (SOW AD-5: rules "at category
 * and product level"). Both must pass: restricting a category hides everything
 * in it from other accounts, and a product granted to an account is still hidden
 * if its category is not. The category rule sits under its own `category` key
 * rather than inside the product's `OR`, so neither can widen the other.
 *
 * Exported for the category list, which asks "does this category have anything
 * this actor could see in it?" and must answer with the same rule.
 */
export function visibilityFilter(
  actor: AuthenticatedActor
): Prisma.ProductWhereInput {
  if (actor.role === Role.ADMIN) return {}

  return {
    status: { in: CUSTOMER_VISIBLE_STATUSES as unknown as ProductStatus[] },
    OR: [
      { visibility: 'ALL_ACCOUNTS' },
      {
        visibility: 'RESTRICTED',
        visibleTo: { some: { accountId: actor.accountId } },
      },
    ],
    category: categoryVisibilityFilter(actor),
  }
}

// The category-level half, re-exported so callers of the catalogue service keep
// finding it here. It lives in its own module — see category-visibility.ts for
// the import cycle that forced the move.
export { categoryVisibilityFilter }

// --- Reads ------------------------------------------------------------------

/**
 * The filters the catalogue list and the catalogue export both apply.
 *
 * One function, because the export exists to be edited and imported back (SOW
 * M-13), and a filter the list honoured but the export did not would hand
 * somebody a file that quietly disagrees with the screen they exported it from.
 *
 * Composed as an AND array rather than one spread object: both the visibility
 * filter and the search filter contribute a top-level `OR`, and spreading them
 * into a single object would silently drop the first — the search would then
 * widen the result past what the actor may see.
 */
function catalogueClauses(
  actor: AuthenticatedActor,
  query: {
    categoryId?: string
    status?: string
    search?: string
    tags?: readonly string[]
  }
): Prisma.ProductWhereInput[] {
  const clauses: Prisma.ProductWhereInput[] = [
    { deletedAt: null },
    visibilityFilter(actor),
  ]

  if (query.categoryId) clauses.push({ categoryId: query.categoryId })
  // A non-admin asking for DRAFT gets an empty page rather than an error: the
  // visibility clause already excludes it, and the two simply intersect.
  if (query.status) clauses.push({ status: query.status })
  // Every requested tag must be present. One `contains` per tag ANDed together,
  // because the column is a JSON array in NVARCHAR and there is no array
  // operator to ask with — see `tagFilter` for why the quotes matter.
  if (query.tags?.length) {
    for (const tag of query.tags) clauses.push({ tags: tagFilter(tag) })
  }

  // Substring, on name, SKU and description (SOW F-02: "name and short
  // description — free text, both searchable"), and case-insensitive by
  // collation rather than by a `mode` the SQL Server connector does not accept.
  // What that scan costs is measured in the note inside `listProducts`.
  if (query.search) {
    clauses.push({
      OR: [
        { name: { contains: query.search } },
        { sku: { contains: query.search } },
        { description: { contains: query.search } },
      ],
    })
  }

  return clauses
}

export async function listProducts(
  actor: AuthenticatedActor,
  query: ListProductsQueryDto
): Promise<OffsetPage<FullProduct>> {
  const clauses = catalogueClauses(actor, query)

  // What `catalogueClauses` spends on `search`, measured rather than guessed.
  //
  // -------------------------------------------------------------------------
  // This is a scan, and what that actually costs
  // -------------------------------------------------------------------------
  // PostgreSQL answered the same predicate from a GIN trigram index. SQL Server
  // has no trigram operator class, and full-text search is not present in the
  // standard container image, so there is nothing for a leading wildcard to seek
  // on.
  //
  // Measured at 50,000 products rather than guessed at — `npm run bench:search`
  // reproduces it:
  //
  //     a common term ('Banner')          2.8ms
  //     a rare term                     193.4ms
  //     prefix on name ('Roll-Up%')       2.1ms
  //
  // Seventy times apart, and the reason is not table size but selectivity: a
  // common term fills its 25 rows almost at once, a rare one reads most of the
  // table first. The rare figure grows roughly linearly with the catalogue, so
  // it is the one to watch.
  //
  // A covering index on (deletedAt) INCLUDE (name, sku) was tried and returned
  // 1.2x — not worth what it would cost on every product write, so it was not
  // kept.
  //
  // Two hundred milliseconds for the worst term at a realistic catalogue size is
  // affordable for a search a buyer presses enter on. It would not be affordable
  // for type-ahead, and it will not stay affordable at half a million products.
  // The answer then is a `product_search_word` table — one row per word, seeked
  // with a trailing wildcard — which is fast at any size and gives word-prefix
  // semantics rather than true substring. That is a change to what search
  // *means*, so it is a decision to take deliberately rather than a refactor to
  // slip in.
  if (query.lowStockOnly) {
    // Prisma cannot compare two columns in a `where`, so the set is resolved in
    // SQL first. Cheap in practice — the point of a low-stock threshold is that
    // few items are under it — but it is a two-query read, and if the catalog
    // ever makes that hurt the fix is a generated column with an index on it
    // rather than a bigger `IN` list.
    const lowStockIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "products"
      WHERE "trackInventory" = 1
        AND "stockOnHand" <= "lowStockThreshold"
        AND "deletedAt" IS NULL
    `
    clauses.push({ id: { in: lowStockIds.map((row) => row.id) } })
  }

  const finalWhere: Prisma.ProductWhereInput = { AND: clauses }
  const { skip, take } = toSkipTake(query)

  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where: finalWhere,
      include: FULL_PRODUCT,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip,
      take,
    }),
    prisma.product.count({ where: finalWhere }),
  ])

  return offsetPage(items, total, query)
}

/**
 * Every product a filter matches, for the catalogue export (SOW M-13).
 *
 * The same `where` the list builds, without paging: an export is the whole
 * result or it is not an export. Ordered by SKU rather than by the list's own
 * order, because the file is read and diffed by people, and SKU is the key they
 * and the importer both work from.
 *
 * Refused above `MAX_EXPORT_ROWS` rather than truncated. A truncated catalogue
 * file is indistinguishable from a complete one once it is open in Excel, and
 * re-importing it would look like a bulk delete that never happened. The count
 * runs first so nothing large is read to decide that.
 */
export async function exportProducts(
  actor: AuthenticatedActor,
  query: ExportProductsQueryDto
): Promise<FullProduct[]> {
  const where: Prisma.ProductWhereInput = {
    AND: catalogueClauses(actor, query),
  }

  const total = await prisma.product.count({ where })
  if (total > MAX_EXPORT_ROWS) {
    throw new BusinessRuleError(
      `That is ${total.toLocaleString('en-NZ')} products, and an export carries at most ` +
        `${MAX_EXPORT_ROWS.toLocaleString('en-NZ')} — the importer's own limit, so that every ` +
        'export can be imported back. Narrow the filters and export in parts.',
      { details: { matched: total, maximum: MAX_EXPORT_ROWS } }
    )
  }

  return prisma.product.findMany({
    where,
    include: FULL_PRODUCT,
    orderBy: { sku: 'asc' },
  })
}

export async function findProductById(
  actor: AuthenticatedActor,
  productId: string
): Promise<FullProduct> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null, ...visibilityFilter(actor) },
    include: FULL_PRODUCT,
  })

  // A product the actor may not see is reported as missing, not forbidden.
  // Telling a customer that a SKU exists but is not theirs leaks the existence
  // of another customer's contract line.
  if (!product) throw new NotFoundError('Product')
  return product
}

/**
 * Several products at once, in the shape pricing needs and nothing more.
 *
 * Used by the rate-card quote endpoint and again by the cart. It goes through
 * `visibilityFilter()` like every other read: a batch endpoint that built its
 * own predicate is precisely how a RESTRICTED product ends up priced for an
 * account with no contract for it.
 *
 * Ids the actor may not see are simply absent from the result rather than
 * raising — a quote for fifty tiles should not fail because one of them was
 * unpublished a second ago, and the caller reports the gap per line.
 */
export async function findPriceableProducts(
  actor: AuthenticatedActor,
  productIds: readonly string[]
): Promise<PriceableProduct[]> {
  if (productIds.length === 0) return []

  return prisma.product.findMany({
    where: {
      AND: [
        { id: { in: [...new Set(productIds)] } },
        { deletedAt: null },
        visibilityFilter(actor),
      ],
    },
    select: PRICEABLE_PRODUCT,
  })
}

// --- Writes -----------------------------------------------------------------

export async function createProduct(
  dto: CreateProductDto,
  actor: AuthenticatedActor
): Promise<FullProduct> {
  await assertCategoryExists(dto.categoryId)
  await assertSkuIsFree(dto.sku)

  const product = await prisma.product.create({
    data: {
      id: createId('prd'),
      sku: dto.sku,
      name: dto.name,
      description: dto.description ?? null,
      categoryId: dto.categoryId,
      // Always DRAFT. Publishing is its own audited transition.
      status: 'DRAFT',
      basePrice: dto.basePrice,
      moq: dto.moq,
      orderMultiple: dto.orderMultiple,
      packSize: dto.packSize,
      uom: dto.uom,
      taxTreatment: dto.taxTreatment,
      widthMm: dto.widthMm ?? null,
      heightMm: dto.heightMm ?? null,
      depthMm: dto.depthMm ?? null,
      weightGrams: dto.weightGrams ?? null,
      bleedMm: dto.bleedMm ?? null,
      safeMarginMm: dto.safeMarginMm ?? null,
      trackInventory: dto.trackInventory,
      lowStockThreshold: dto.lowStockThreshold,
      reorderQuantity: dto.reorderQuantity ?? null,
      leadTimeDays: dto.leadTimeDays ?? null,
      tags: toStringList(dto.tags),
    },
    include: FULL_PRODUCT,
  })

  await recordAudit({
    action: AuditAction.PRODUCT_CREATED,
    entityType: 'PRODUCT',
    entityId: product.id,
    entityName: `${product.sku} — ${product.name}`,
    accountId: actor.accountId,
    changes: created(product, PRODUCT_AUDIT_FIELDS, { json: ['tags'] }),
  })

  console.info(`Created product ${product.id} (${product.sku}).`)
  return product
}

export async function updateProduct(
  productId: string,
  dto: UpdateProductDto,
  actor: AuthenticatedActor
): Promise<FullProduct> {
  const before = await requireProduct(productId)
  if (dto.categoryId) await assertCategoryExists(dto.categoryId)

  const product = await prisma.product.update({
    where: { id: productId },
    data: {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId } : {}),
      ...(dto.basePrice !== undefined ? { basePrice: dto.basePrice } : {}),
      ...(dto.moq !== undefined ? { moq: dto.moq } : {}),
      ...(dto.orderMultiple !== undefined
        ? { orderMultiple: dto.orderMultiple }
        : {}),
      ...(dto.packSize !== undefined ? { packSize: dto.packSize } : {}),
      ...(dto.uom !== undefined ? { uom: dto.uom } : {}),
      ...(dto.taxTreatment !== undefined
        ? { taxTreatment: dto.taxTreatment }
        : {}),
      ...(dto.widthMm !== undefined ? { widthMm: dto.widthMm } : {}),
      ...(dto.heightMm !== undefined ? { heightMm: dto.heightMm } : {}),
      ...(dto.depthMm !== undefined ? { depthMm: dto.depthMm } : {}),
      ...(dto.weightGrams !== undefined
        ? { weightGrams: dto.weightGrams }
        : {}),
      ...(dto.bleedMm !== undefined ? { bleedMm: dto.bleedMm } : {}),
      ...(dto.safeMarginMm !== undefined
        ? { safeMarginMm: dto.safeMarginMm }
        : {}),
      ...(dto.trackInventory !== undefined
        ? { trackInventory: dto.trackInventory }
        : {}),
      ...(dto.lowStockThreshold !== undefined
        ? { lowStockThreshold: dto.lowStockThreshold }
        : {}),
      ...(dto.reorderQuantity !== undefined
        ? { reorderQuantity: dto.reorderQuantity }
        : {}),
      ...(dto.leadTimeDays !== undefined
        ? { leadTimeDays: dto.leadTimeDays }
        : {}),
      ...(dto.tags !== undefined ? { tags: toStringList(dto.tags) } : {}),
    },
    include: FULL_PRODUCT,
  })

  await recordAudit({
    action: AuditAction.PRODUCT_UPDATED,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: `${product.sku} — ${product.name}`,
    accountId: actor.accountId,
    // Every field that moved, price included — which used to be the only one
    // with a before value, because it is the question most often asked of this
    // log. It no longer has to be special.
    changes: changesBetween(before, product, PRODUCT_AUDIT_FIELDS, {
      json: ['tags'],
    }),
  })

  return product
}

/**
 * Moves a product through its lifecycle. The only way `status` ever changes.
 *
 * See product-status.ts for the transition table and for why a published
 * product can never return to DRAFT.
 */
export async function changeProductStatus(
  productId: string,
  dto: ChangeProductStatusDto,
  actor: AuthenticatedActor
): Promise<FullProduct> {
  const product = await requireProduct(productId)

  // Both sides are already the same string union: the Prisma enum and the
  // ProductStatus constant agree by construction.
  assertTransition(asEnum<ProductStatus>(product.status), dto.status)

  if (dto.supersededById) {
    await assertUsableSuccessor(productId, dto.supersededById)
  }

  if (dto.status === 'ACTIVE') await assertPublishable(product)

  const updated = await prisma.product.update({
    where: { id: productId },
    data: {
      status: dto.status,
      supersededById:
        dto.status === 'SUPERSEDED' ? (dto.supersededById ?? null) : null,
    },
    include: FULL_PRODUCT,
  })

  await recordAudit({
    action: AuditAction.PRODUCT_STATUS_CHANGED,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: `${updated.sku} — ${updated.name}`,
    accountId: actor.accountId,
    changes: changesBetween(product, updated, ['status', 'supersededById']),
    details: { reason: dto.reason ?? null },
  })

  console.info(`Product ${productId} moved ${product.status} -> ${dto.status}.`)
  return updated
}

/**
 * Soft delete, and only ever from DRAFT.
 *
 * Once a product has been published, orders and invoices reference it, and
 * removing it from the catalogue is what UNAVAILABLE and SUPERSEDED are for.
 * Deleting a draft is the genuine case — something created by mistake that
 * nobody has ever been able to order.
 */
export async function removeProduct(
  productId: string,
  actor: AuthenticatedActor
): Promise<void> {
  const product = await requireProduct(productId)

  if (product.status !== 'DRAFT') {
    throw new BusinessRuleError(
      'Only a draft product can be deleted. Mark a published product unavailable, ' +
        'or supersede it with its replacement.',
      { details: { status: product.status } }
    )
  }

  await prisma.product.update({
    where: { id: productId },
    data: { deletedAt: new Date() },
  })

  await recordAudit({
    action: AuditAction.PRODUCT_DELETED,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: `${product.sku} — ${product.name}`,
    accountId: actor.accountId,
    // What the draft was when it went, so a deletion made by mistake can be
    // recreated from the log.
    changes: removed(product, PRODUCT_AUDIT_FIELDS, { json: ['tags'] }),
  })
}

// --- Options and variants ---------------------------------------------------

/**
 * Replaces the whole option set.
 *
 * Removing a value that a variant is built on would leave that variant
 * describing a configuration the product no longer offers, so it is refused
 * with the offending variants named. Deleting the variants first is the
 * administrator's decision.
 */
export async function setProductOptions(
  productId: string,
  dto: SetProductOptionsDto,
  actor: AuthenticatedActor
): Promise<FullProduct> {
  // With its options, so the audit entry can show the set this replaced.
  const existing = await requireFullProduct(productId)

  const duplicateName = firstDuplicate(
    dto.options.map((option) => option.name.toLowerCase())
  )
  if (duplicateName) {
    throw new BusinessRuleError(`Duplicate option name "${duplicateName}"`)
  }

  for (const option of dto.options) {
    const duplicateValue = firstDuplicate(
      option.values.map((value) => value.toLowerCase())
    )
    if (duplicateValue) {
      throw new BusinessRuleError(
        `Option "${option.name}" lists "${duplicateValue}" more than once`
      )
    }

    // A price for a value the option does not offer would sit in the map with
    // nothing to charge it against — and survive silently into a later edit
    // that re-adds a value of that name at a different meaning.
    const unknownPriced = Object.keys(option.valuePrices).filter(
      (value) => !option.values.includes(value)
    )
    if (unknownPriced.length > 0) {
      throw new BusinessRuleError(
        `Option "${option.name}" prices ${unknownPriced.map((v) => `"${v}"`).join(', ')}, which it does not offer`,
        { details: { option: option.name, values: unknownPriced } }
      )
    }
  }

  const variants = await prisma.productVariant.findMany({
    where: { productId, deletedAt: null },
    select: { sku: true, attributes: true, status: true },
  })

  const orphaned = variants.filter(
    (variant) =>
      !attributesMatchOptions(fromJsonOr(variant.attributes, {}), dto.options)
  )
  if (orphaned.length > 0) {
    throw new BusinessRuleError(
      'These variants use option values that the new option set does not offer: ' +
        orphaned.map((variant) => variant.sku).join(', '),
      { details: { variantSkus: orphaned.map((variant) => variant.sku) } }
    )
  }

  // The third door into the unorderable state: giving an on-sale product options
  // it has no active variant to answer. Counted from the rows already read
  // rather than with another query.
  if (existing.status === 'ACTIVE') {
    assertOrderable(
      dto.options.length,
      variants.filter((variant) => variant.status === 'ACTIVE').length,
      `${existing.sku} is on sale and has no active variants, so these options would ` +
        'leave nothing that could be ordered. Add a variant for each combination ' +
        'you sell, or take the product off sale first.'
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.productOption.deleteMany({ where: { productId } })
    if (dto.options.length > 0) {
      await tx.productOption.createMany({
        data: dto.options.map((option) => ({
          id: createId('opt'),
          productId,
          name: option.name,
          values: toStringList(option.values),
          // Stored as money strings, and only the values that cost something:
          // a zero is the same as absent, and keeping it would make "no
          // surcharge" two different shapes.
          valuePrices: JSON.stringify(
            Object.fromEntries(
              Object.entries(option.valuePrices)
                .filter(([, amount]) => amount > 0)
                .map(([value, amount]) => [value, amount.toFixed(2)])
            )
          ),
          sortOrder: option.sortOrder,
        })),
      })
    }
  })

  const product = await requireFullProduct(productId)

  await recordAudit({
    action: AuditAction.PRODUCT_OPTIONS_SET,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: `${product.sku} — ${product.name}`,
    accountId: actor.accountId,
    changes: fieldChange(
      'options',
      optionsForAudit(existing.options),
      optionsForAudit(product.options)
    ),
  })

  return product
}

export async function createVariant(
  productId: string,
  dto: CreateVariantDto,
  actor: AuthenticatedActor
): Promise<ProductVariant> {
  const product = await requireProduct(productId)
  await assertSkuIsFree(dto.sku)

  const stored = await prisma.productOption.findMany({
    where: { productId },
    select: { name: true, values: true },
  })
  const options = stored.map((option) => ({
    name: option.name,
    values: fromStringList(option.values),
  }))

  // Every key must be an option and every value one that option offers. Without
  // this the JSON drifts from the options, and the product page renders
  // selectors that match no variant.
  if (!attributesMatchOptions(dto.attributes, options)) {
    throw new BusinessRuleError(
      "The variant attributes do not match this product's options",
      {
        details: { attributes: dto.attributes, options },
      }
    )
  }

  if (Object.keys(dto.attributes).length !== options.length) {
    throw new BusinessRuleError(
      'A variant must choose a value for every option the product defines',
      {
        details: {
          expected: options.map((o) => o.name),
          given: Object.keys(dto.attributes),
        },
      }
    )
  }

  const clash = await prisma.productVariant.findFirst({
    where: {
      productId,
      deletedAt: null,
      attributes: { equals: toCanonicalJson(dto.attributes) },
    },
    select: { sku: true },
  })
  if (clash) {
    throw new ConflictError(
      `Variant "${clash.sku}" already covers that combination of options`,
      {
        details: { attributes: dto.attributes },
      }
    )
  }

  const variant = await prisma.productVariant.create({
    data: {
      id: createId('var'),
      productId,
      sku: dto.sku,
      attributes: toCanonicalJson(dto.attributes),
      priceOverride: dto.priceOverride ?? null,
      sortOrder: dto.sortOrder,
    },
  })

  await recordAudit({
    action: AuditAction.PRODUCT_VARIANT_CREATED,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: `${product.sku} — ${product.name}`,
    accountId: actor.accountId,
    changes: created(variant, VARIANT_AUDIT_FIELDS, { json: ['attributes'] }),
    details: { variantId: variant.id },
  })

  return variant
}

export async function updateVariant(
  productId: string,
  variantId: string,
  dto: UpdateVariantDto,
  actor: AuthenticatedActor
): Promise<ProductVariant> {
  const existing = await prisma.productVariant.findFirst({
    where: { id: variantId, productId, deletedAt: null },
  })
  if (!existing) throw new NotFoundError('Variant')

  // Only when this edit actually takes the variant out of circulation. A price
  // or sort-order change cannot make a product unorderable, and paying for two
  // counts on every such edit would be a tax on the common case.
  if (
    dto.status !== undefined &&
    dto.status !== existing.status &&
    dto.status !== 'ACTIVE'
  ) {
    await assertVariantExitLeavesProductOrderable(
      productId,
      variantId,
      'deactivated'
    )
  }

  const variant = await prisma.productVariant.update({
    where: { id: variantId },
    data: {
      ...(dto.priceOverride !== undefined
        ? { priceOverride: dto.priceOverride }
        : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
    },
  })

  await recordAudit({
    action: AuditAction.PRODUCT_VARIANT_UPDATED,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: variant.sku,
    accountId: actor.accountId,
    changes: changesBetween(existing, variant, VARIANT_AUDIT_FIELDS, {
      json: ['attributes'],
    }),
    details: { variantId },
  })

  return variant
}

export async function removeVariant(
  productId: string,
  variantId: string,
  actor: AuthenticatedActor
): Promise<void> {
  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, productId, deletedAt: null },
  })
  if (!variant) throw new NotFoundError('Variant')

  await assertVariantExitLeavesProductOrderable(productId, variantId, 'removed')

  // Soft, like everything else: order lines will reference the variant SKU.
  await prisma.productVariant.update({
    where: { id: variantId },
    data: { status: 'INACTIVE', deletedAt: new Date() },
  })

  await recordAudit({
    action: AuditAction.PRODUCT_VARIANT_DELETED,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: variant.sku,
    accountId: actor.accountId,
    changes: removed(variant, VARIANT_AUDIT_FIELDS, { json: ['attributes'] }),
    details: { variantId },
  })
}

// --- Volume tiers -----------------------------------------------------------

export async function setVolumeTiers(
  productId: string,
  dto: SetVolumeTiersDto,
  actor: AuthenticatedActor
): Promise<FullProduct> {
  const previous = await requireFullProduct(productId)

  const duplicate = firstDuplicate(
    dto.tiers.map((tier) => String(tier.minQuantity))
  )
  if (duplicate) {
    throw new BusinessRuleError(`Two tiers both start at ${duplicate}`)
  }

  // A ladder where a larger order costs more per unit is a pricing error that
  // customers find before we do.
  const ordered = [...dto.tiers].sort((a, b) => a.minQuantity - b.minQuantity)
  for (let index = 1; index < ordered.length; index += 1) {
    if (
      ordered[index]!.discountPercent <= ordered[index - 1]!.discountPercent
    ) {
      throw new BusinessRuleError(
        `The tier at ${ordered[index]!.minQuantity} does not discount more than the one ` +
          `at ${ordered[index - 1]!.minQuantity}. Volume discounts must increase with quantity.`
      )
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.productVolumeTier.deleteMany({ where: { productId } })
    if (ordered.length > 0) {
      await tx.productVolumeTier.createMany({
        data: ordered.map((tier) => ({
          id: createId('vtr'),
          productId,
          minQuantity: tier.minQuantity,
          discountPercent: tier.discountPercent,
        })),
      })
    }
  })

  const product = await requireFullProduct(productId)

  await recordAudit({
    action: AuditAction.PRODUCT_TIERS_SET,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: `${product.sku} — ${product.name}`,
    accountId: actor.accountId,
    changes: fieldChange(
      'volumeTiers',
      tiersForAudit(previous.volumeTiers),
      tiersForAudit(product.volumeTiers)
    ),
  })

  return product
}

// --- Visibility -------------------------------------------------------------

export async function setProductVisibility(
  productId: string,
  dto: SetVisibilityDto,
  actor: AuthenticatedActor
): Promise<FullProduct> {
  const previous = await requireProduct(productId)
  const previousAccountIds = await productAllowList(productId)

  // An allow-list is a set, and the caller naming the same account twice means
  // the same thing as naming it once. The existence check below was already
  // counting distinct ids, so duplicates passed it — and then landed on
  // `@@unique([productId, accountId])` as a constraint violation and a 500.
  // Collapsed here rather than refused: there is nothing to tell the caller
  // that they have not already said.
  const accountIds = [...new Set(dto.accountIds)]

  if (dto.visibility === 'RESTRICTED') {
    const found = await prisma.account.count({
      where: { id: { in: accountIds }, deletedAt: null },
    })
    if (found !== accountIds.length) {
      throw new BusinessRuleError(
        'One or more of those accounts does not exist'
      )
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { visibility: dto.visibility },
    })

    if (dto.visibility === 'RESTRICTED') {
      await tx.productAccountVisibility.deleteMany({ where: { productId } })
      await tx.productAccountVisibility.createMany({
        data: accountIds.map((accountId) => ({
          id: createId('pav'),
          productId,
          accountId,
        })),
      })
    }
    // ALL_ACCOUNTS deliberately leaves the rows in place. A restriction lifted
    // for a campaign is usually reinstated, and re-entering fifty account ids by
    // hand is how it gets reinstated wrongly.
  })

  const product = await requireFullProduct(productId)

  await recordAudit({
    action: AuditAction.PRODUCT_VISIBILITY_SET,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: `${product.sku} — ${product.name}`,
    accountId: actor.accountId,
    // The allow-list as stored on both sides; see the note above on why lifting
    // a restriction keeps it.
    changes: mergeChanges(
      changesBetween(previous, product, ['visibility']),
      fieldChange(
        'accountIds',
        previousAccountIds,
        await productAllowList(productId)
      )
    ),
  })

  return product
}

/**
 * Which accounts a restricted product is open to.
 *
 * There was no way to ask. `PUT` replaces the whole allow-list and nothing
 * returned it, so the panel that edits it had nothing to pre-fill from: every
 * save started from an empty box and silently replaced whatever was there, and
 * removing one account from a list of fifty meant re-entering the other
 * forty-nine from memory.
 *
 * Returns the rows for an ALL_ACCOUNTS product too, rather than an empty list.
 * They are deliberately kept when a restriction is lifted — see
 * `setProductVisibility` — and a screen reinstating one needs to see them.
 */
export async function findProductVisibility(productId: string): Promise<{
  visibility: string
  accounts: { id: string; name: string; accountCode: string }[]
}> {
  const product = await requireProduct(productId)

  const rows = await prisma.productAccountVisibility.findMany({
    where: { productId },
    select: {
      account: { select: { id: true, name: true, accountCode: true } },
    },
    orderBy: { account: { name: 'asc' } },
  })

  return {
    visibility: product.visibility,
    accounts: rows.map((row) => row.account),
  }
}

// --- Assets -----------------------------------------------------------------

/**
 * Attaches a document-library file to a product.
 *
 * The library is where artwork is kept; object storage is how the portal serves
 * it. So the file is pulled once, on the portal's own credential, and written to
 * the same key an upload would have used — see `attachTemplateAsset` for the
 * three reasons a library URL cannot simply be linked to, all of which apply
 * equally here.
 *
 * `filename`, `contentType` and `sizeBytes` come off the file rather than from
 * the caller, so a row can no longer disagree with the object it describes, and
 * the key is built here, so there is no caller-supplied key to validate.
 */
export async function attachAsset(
  productId: string,
  dto: AttachAssetDto,
  actor: AuthenticatedActor
): Promise<FullProduct> {
  const product = await requireProduct(productId)

  const source = await readOperatorDamFile(dto)

  // The catalog is global, so its assets are filed under the operator's own
  // account id rather than the customer's — they are not tenant data, and
  // filing them per tenant would put the same image under fifty prefixes.
  const storageKey = buildKey(
    dto.kind === 'IMAGE' ? StoragePrefix.ARTWORK : StoragePrefix.DOCUMENT,
    `catalog/${product.sku}`,
    `${Date.now()}-${source.fileName}`
  )

  await put(storageKey, source.bytes, {
    contentType: source.contentType,
    downloadFilename: source.fileName,
  })

  const asset = await prisma.productAsset.create({
    data: {
      id: createId('pas'),
      productId,
      kind: dto.kind,
      storageKey,
      filename: source.fileName,
      contentType: source.contentType,
      sizeBytes: source.sizeBytes,
      altText: dto.altText ?? null,
      sortOrder: dto.sortOrder,
      damDocumentId: dto.damDocumentId,
      // Only images get resized copies, and PENDING is what the render worker
      // looks for. It stays PENDING until the worker writes the derivatives, and
      // `presignThumbnails` serves the original in the meantime — see the
      // fallback there — so a freshly uploaded image shows immediately rather
      // than as a broken tile.
      derivativeStatus: dto.kind === 'IMAGE' ? 'PENDING' : 'NOT_APPLICABLE',
    },
  })

  // After the row exists, so the worker cannot pick up an id that is not there
  // yet. Never awaited for its result and never allowed to throw: the upload has
  // succeeded, and failing the request because a thumbnail could not be
  // scheduled would have the admin upload the file a second time.
  if (dto.kind === 'IMAGE') await enqueueDerivatives(asset.id, 'PRODUCT')

  await recordAudit({
    action: AuditAction.PRODUCT_ASSET_ATTACHED,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: `${product.sku} — ${product.name}`,
    accountId: actor.accountId,
    changes: created(asset, ASSET_AUDIT_FIELDS),
    details: { assetId: asset.id },
  })

  return requireFullProduct(productId)
}

export async function removeAsset(
  productId: string,
  assetId: string,
  actor: AuthenticatedActor
): Promise<void> {
  const asset = await prisma.productAsset.findFirst({
    where: { id: assetId, productId },
  })
  if (!asset) throw new NotFoundError('Asset')

  // The row goes first. If the object delete fails the row is already gone,
  // which leaves an orphaned object for a sweeper to collect — strictly better
  // than a row pointing at a file that no longer exists.
  await prisma.productAsset.delete({ where: { id: assetId } })

  for (const key of [asset.storageKey, asset.thumbnailKey, asset.previewKey]) {
    if (!key) continue
    try {
      await removeObject(key)
    } catch (error) {
      console.warn(
        `Detached asset ${assetId} but could not delete ${key}; it is now an orphaned object.`,
        error instanceof Error ? error.message : String(error)
      )
    }
  }

  // And the library file it was copied from, so detaching an image removes it
  // everywhere rather than leaving a superseded copy in the library. See
  // `forgetOperatorDamFile` for what this costs: the library cannot tell whether
  // anything else uses the file.
  if (asset.damDocumentId) {
    await forgetOperatorDamFile(asset.damDocumentId, asset.contentType)
  }

  await recordAudit({
    action: AuditAction.PRODUCT_ASSET_REMOVED,
    entityType: 'PRODUCT',
    entityId: productId,
    entityName: asset.filename,
    accountId: actor.accountId,
    changes: removed(asset, ASSET_AUDIT_FIELDS),
    details: { assetId },
  })
}

/** One file name's answer from `matchImageFilenames`. */
export interface ImageFilenameMatch {
  readonly filename: string
  /**
   * EXACT: the name (or the SKU typed for it) is a SKU. SUFFIX: it is a SKU
   * once `ignoredSuffix` is cut off the end — worth a glance before uploading.
   */
  readonly matchedOn: 'EXACT' | 'SUFFIX' | null
  readonly ignoredSuffix: string | null
  readonly product: {
    readonly id: string
    readonly sku: string
    readonly name: string
    readonly status: string
    /** Images the product already has. */
    readonly imageCount: number
    /** Where a new image goes so it lands after the existing ones. */
    readonly nextImageSortOrder: number
  } | null
}

/** SQL Server allows 2,100 parameters per statement; stay well under it. */
const SKU_LOOKUP_CHUNK = 1000

/**
 * Resolves image file names to products by SKU, for a bulk image upload.
 *
 * Read-only: it only says which product each file would go to. See
 * `image-sku-match.ts` for how a name becomes candidate SKUs. Deleted products
 * never match; drafts and archived products do, and their status is returned so
 * the screen can say so.
 */
export async function matchImageFilenames(
  dto: MatchImageFilenamesDto
): Promise<ImageFilenameMatch[]> {
  const perFile = dto.files.map((file) =>
    file.sku ? [{ sku: file.sku, suffix: '' }] : skuCandidates(file.filename)
  )

  const wanted = [...new Set(perFile.flat().map((c) => c.sku))]
  const products = new Map<
    string,
    { id: string; sku: string; name: string; status: string }
  >()

  for (let i = 0; i < wanted.length; i += SKU_LOOKUP_CHUNK) {
    const rows = await prisma.product.findMany({
      where: {
        sku: { in: wanted.slice(i, i + SKU_LOOKUP_CHUNK) },
        deletedAt: null,
      },
      select: { id: true, sku: true, name: true, status: true },
    })
    for (const row of rows) products.set(row.sku.toUpperCase(), row)
  }

  const ids = [...new Set([...products.values()].map((p) => p.id))]
  const imageStats = new Map<string, { count: number; maxSort: number }>()
  for (let i = 0; i < ids.length; i += SKU_LOOKUP_CHUNK) {
    const groups = await prisma.productAsset.groupBy({
      by: ['productId'],
      where: {
        productId: { in: ids.slice(i, i + SKU_LOOKUP_CHUNK) },
        kind: 'IMAGE',
      },
      _count: { _all: true },
      _max: { sortOrder: true },
    })
    for (const group of groups) {
      imageStats.set(group.productId, {
        count: group._count._all,
        maxSort: group._max.sortOrder ?? -1,
      })
    }
  }

  return dto.files.map((file, index) => {
    const hit = perFile[index].find((c) => products.has(c.sku))
    if (!hit) {
      return {
        filename: file.filename,
        matchedOn: null,
        ignoredSuffix: null,
        product: null,
      }
    }
    const product = products.get(hit.sku)!
    const stats = imageStats.get(product.id)
    return {
      filename: file.filename,
      matchedOn: hit.suffix ? 'SUFFIX' : 'EXACT',
      ignoredSuffix: hit.suffix || null,
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        status: product.status,
        imageCount: stats?.count ?? 0,
        nextImageSortOrder: Math.min(999, (stats?.maxSort ?? -1) + 1),
      },
    }
  })
}

/**
 * One thumbnail per product, for a catalogue grid.
 *
 * The primary image only — a product may carry artwork, spec sheets and a dozen
 * photographs, and a grid shows one tile. That keeps the signing cost at most
 * one call per row rather than one per asset, which is the whole reason `list`
 * does not simply call `presignAssets` for every product.
 *
 * Falls back to the original when no derivative exists yet: a freshly uploaded
 * image whose resize is still queued should show the full-size file rather than
 * a broken tile.
 */
export async function presignThumbnails(
  products: readonly FullProduct[]
): Promise<Record<string, string>> {
  const jobs = products.flatMap((product) => {
    const primary = product.assets.find((asset) => asset.kind === 'IMAGE')
    if (!primary) return []

    const key = primary.thumbnailKey ?? primary.storageKey
    return [
      presignDownload(key).then(
        (url) => [`${primary.id}:thumbnail`, url] as const
      ),
    ]
  })

  return Object.fromEntries(await Promise.all(jobs))
}

/**
 * Short-lived download URLs for one product's assets, minted on read.
 *
 * Returns the original plus whichever derivatives exist, keyed `<assetId>`,
 * `<assetId>:thumbnail` and `<assetId>:preview`. Flat rather than nested
 * because the view layer looks each up by key and a nested shape would need a
 * null check per level for something that is simply absent.
 *
 * All signed in parallel: signing is local HMAC work, not a network call, so a
 * product with a dozen images costs microseconds rather than round trips.
 */
export async function presignAssets(
  product: FullProduct,
  actor: AuthenticatedActor
): Promise<Record<string, string>> {
  // Artwork and specification sheets are downloadable subject to permission
  // (SOW F-10). Decided here, where the link is minted, rather than in the
  // view: a URL that was signed and then left out of a response is still a URL
  // somebody could log. Photographs are what the catalogue shows, and stay open
  // to anyone who may see the product.
  const mayDownloadFiles = await can(actor, Permission.CATALOG_FILE_DOWNLOAD)

  const jobs = product.assets.flatMap((asset) => {
    if (asset.kind !== 'IMAGE' && !mayDownloadFiles) return []

    const entries: Promise<readonly [string, string]>[] = [
      presignDownload(asset.storageKey, asset.filename).then(
        (url) => [asset.id, url] as const
      ),
    ]

    if (asset.thumbnailKey) {
      entries.push(
        presignDownload(asset.thumbnailKey).then(
          (url) => [`${asset.id}:thumbnail`, url] as const
        )
      )
    }
    if (asset.previewKey) {
      entries.push(
        presignDownload(asset.previewKey).then(
          (url) => [`${asset.id}:preview`, url] as const
        )
      )
    }

    return entries
  })

  return Object.fromEntries(await Promise.all(jobs))
}

// --- Shared helpers ---------------------------------------------------------

async function requireProduct(productId: string): Promise<Product> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
  })
  if (!product) throw new NotFoundError('Product')
  return product
}

async function requireFullProduct(productId: string): Promise<FullProduct> {
  const product = await prisma.product.findFirst({
    where: { id: productId, deletedAt: null },
    include: FULL_PRODUCT,
  })
  if (!product) throw new NotFoundError('Product')
  return product
}

async function assertCategoryExists(categoryId: string): Promise<void> {
  const category = await prisma.productCategory.findFirst({
    where: { id: categoryId, deletedAt: null },
    select: { id: true, status: true },
  })
  if (!category) throw new NotFoundError('Category')

  if (category.status === 'INACTIVE') {
    throw new BusinessRuleError(
      'That category is inactive and cannot take new products'
    )
  }
}

/**
 * SKUs are unique across products *and* variants, which two separate unique
 * indexes cannot express — hence the explicit check.
 */
async function assertSkuIsFree(sku: string): Promise<void> {
  const [product, variant] = await Promise.all([
    prisma.product.findUnique({
      where: { sku },
      select: { id: true, deletedAt: true },
    }),
    prisma.productVariant.findUnique({ where: { sku }, select: { id: true } }),
  ])

  if (product) {
    throw new ConflictError(
      product.deletedAt
        ? `SKU "${sku}" belongs to a deleted product and cannot be reused`
        : `SKU "${sku}" is already in use`,
      { details: { sku } }
    )
  }
  if (variant) {
    throw new ConflictError(
      `SKU "${sku}" is already used by a product variant`,
      {
        details: { sku },
      }
    )
  }
}

async function assertUsableSuccessor(
  productId: string,
  successorId: string
): Promise<void> {
  if (successorId === productId) {
    throw new BusinessRuleError('A product cannot supersede itself')
  }

  const successor = await prisma.product.findFirst({
    where: { id: successorId, deletedAt: null },
    select: { id: true, sku: true, status: true },
  })
  if (!successor) throw new NotFoundError('Replacement product')

  // Pointing at a draft or an already-superseded product sends every re-order to
  // a dead end, which is the exact failure the pointer exists to prevent.
  if (successor.status !== 'ACTIVE' && successor.status !== 'UNAVAILABLE') {
    throw new BusinessRuleError(
      `${successor.sku} is ${successor.status} and cannot be a replacement`,
      { details: { successorStatus: successor.status } }
    )
  }
}

/**
 * A product cannot be published half-built.
 *
 * If it declares options, it needs at least one variant to sell — otherwise the
 * product page renders selectors that resolve to nothing and the customer gets
 * an add-to-cart button that cannot work.
 */
/**
 * The invariant: a product that defines options needs at least one active
 * variant to answer them, or there is nothing anybody can actually order.
 *
 * Takes counts rather than a product id because the callers ask different
 * questions of it. Publishing asks about the state as it stands; the editing
 * paths ask about the state their change *would* produce, which no read of the
 * current rows can answer.
 */
function assertOrderable(
  optionCount: number,
  activeVariantCount: number,
  refusal: string
): void {
  if (optionCount === 0 || activeVariantCount > 0) return

  throw new BusinessRuleError(refusal, {
    details: { optionCount, activeVariantCount },
  })
}

async function assertPublishable(product: Product): Promise<void> {
  const [optionCount, variantCount] = await Promise.all([
    prisma.productOption.count({ where: { productId: product.id } }),
    prisma.productVariant.count({
      where: { productId: product.id, deletedAt: null, status: 'ACTIVE' },
    }),
  ])

  assertOrderable(
    optionCount,
    variantCount,
    'This product defines options but has no active variants, so nothing could be ordered. ' +
      'Add a variant for each combination you sell, or remove the options.'
  )
}

/**
 * Whether taking one variant out of circulation leaves the product orderable.
 *
 * Checked on the way out as well as at publish time. `assertPublishable` used
 * to be the only guard, which made it a gate on one door of a room with three:
 * deactivating the last variant, deleting it, or adding options to a product
 * that has none left all reached the same unorderable state on a product that
 * was already ACTIVE, and nothing said a word. A buyer then found it — an
 * active listing that cannot be added to a basket.
 *
 * Silent on a product that is not ACTIVE: a draft is meant to be half-built,
 * and `assertPublishable` is what stops it going on sale that way.
 */
async function assertVariantExitLeavesProductOrderable(
  productId: string,
  variantId: string,
  verb: string
): Promise<void> {
  const product = await requireProduct(productId)
  if (product.status !== 'ACTIVE') return

  const [optionCount, remaining] = await Promise.all([
    prisma.productOption.count({ where: { productId } }),
    prisma.productVariant.count({
      where: {
        productId,
        deletedAt: null,
        status: 'ACTIVE',
        id: { not: variantId },
      },
    }),
  ])

  assertOrderable(
    optionCount,
    remaining,
    `${product.sku} is on sale with options, and this is its last active variant. ` +
      `Add another variant before it is ${verb}, or take the product off sale first.`
  )
}

/** The first value that appears twice, or undefined. */
function firstDuplicate(values: readonly string[]): string | undefined {
  const seen = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) return value
    seen.add(value)
  }
  return undefined
}

/**
 * Whether an attribute map only uses option names and values the product
 * actually offers.
 *
 * Accepts a partial map on purpose — `setProductOptions` uses it to find
 * variants that a proposed option set would orphan, and `createVariant`
 * separately requires every option to be answered.
 */
function attributesMatchOptions(
  attributes: unknown,
  options: readonly { name: string; values: string[] }[]
): boolean {
  if (
    typeof attributes !== 'object' ||
    attributes === null ||
    Array.isArray(attributes)
  ) {
    return false
  }

  const byName = new Map(
    options.map((option) => [option.name, new Set(option.values)])
  )

  for (const [name, value] of Object.entries(
    attributes as Record<string, unknown>
  )) {
    const allowed = byName.get(name)
    if (!allowed) return false
    if (typeof value !== 'string' || !allowed.has(value)) return false
  }

  return true
}

// --- Warehouse stock ---------------------------------------------------------

/** One line of a stocktake, whether it changed anything or not. */
export interface StockReconciliationLine {
  readonly sku: string
  readonly name?: string
  readonly systemQuantity?: number
  readonly countedQuantity?: number
  /** Counted minus system. Negative means the shelf is short. */
  readonly variance?: number
  readonly reserved?: number
  readonly outcome:
    | 'MATCHED'
    | 'ADJUSTED'
    | 'WOULD_ADJUST'
    | 'BELOW_RESERVED'
    | 'NOT_TRACKED'
    | 'UNKNOWN_SKU'
  readonly message?: string
}

export interface StockReconciliation {
  readonly dryRun: boolean
  readonly reason: string
  readonly summary: {
    readonly counted: number
    readonly matched: number
    readonly adjusted: number
    readonly refused: number
    readonly netVariance: number
  }
  readonly lines: readonly StockReconciliationLine[]
}

/**
 * What an adjustment is not allowed to take the shelf below.
 *
 * Zero, because a negative figure is not a real state — it is an adjustment
 * applied twice, or one applied to the wrong SKU — and letting it through means
 * the low-stock alerts and the 3PL feed both carry the error onwards.
 *
 * And the reserved figure, because those units are already promised to placed
 * orders. The database enforces that much on its own, so this was never a way to
 * oversell; it just arrived as a constraint violation and a 500, which tells a
 * warehouse operator nothing about which order is holding the stock or what to
 * do next. The stocktake path has always said it properly — see
 * `reconcileStock`'s BELOW_RESERVED — and this is the same sentence for the
 * single-adjustment path.
 */
function assertAdjustmentLeavesReserved(
  sku: string,
  stockOnHand: number,
  stockReserved: number,
  delta: number
): void {
  const after = stockOnHand + delta

  if (after < 0) {
    throw new BusinessRuleError(
      `That would take ${sku} to ${after}. Stock cannot go below zero.`,
      { details: { stockOnHand, delta } }
    )
  }

  if (after < stockReserved) {
    throw new BusinessRuleError(
      `That would take ${sku} to ${after}, and ${stockReserved} are already ` +
        'promised to placed orders. Cancel those orders or recount before ' +
        'writing a lower figure.',
      { details: { stockOnHand, stockReserved, delta } }
    )
  }
}

/**
 * Applies a signed stock movement.
 *
 * The write is a conditional increment rather than a read-modify-write: two
 * warehouse staff adjusting the same product at the same moment must both be
 * applied, and reading the figure first would silently lose one of them.
 *
 * Stock is never allowed below zero, nor below what is already reserved — see
 * `assertAdjustmentLeavesReserved`.
 */
export async function adjustStock(
  productId: string,
  dto: AdjustStockDto,
  actor: AuthenticatedActor
): Promise<{ productId: string; variantId?: string; stockOnHand: number }> {
  const product = await requireProduct(productId)

  if (!product.trackInventory) {
    throw new BusinessRuleError(
      'This product is not stock-tracked. Enable inventory tracking before adjusting stock.'
    )
  }

  if (dto.variantId) {
    const variant = await prisma.productVariant.findFirst({
      where: { id: dto.variantId, productId, deletedAt: null },
      select: { id: true, sku: true, stockOnHand: true, stockReserved: true },
    })
    if (!variant) throw new NotFoundError('Variant')

    assertAdjustmentLeavesReserved(
      variant.sku,
      variant.stockOnHand,
      variant.stockReserved,
      dto.delta
    )

    const updated = await prisma.productVariant.update({
      where: { id: dto.variantId },
      data: { stockOnHand: { increment: dto.delta } },
      select: { stockOnHand: true },
    })

    await recordStockAudit(
      product,
      actor,
      dto,
      updated.stockOnHand,
      variant.sku
    )

    return {
      productId,
      variantId: dto.variantId,
      stockOnHand: updated.stockOnHand,
    }
  }

  assertAdjustmentLeavesReserved(
    product.sku,
    product.stockOnHand,
    product.stockReserved,
    dto.delta
  )

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { stockOnHand: { increment: dto.delta } },
    select: { stockOnHand: true, lowStockThreshold: true },
  })

  await recordStockAudit(product, actor, dto, updated.stockOnHand, product.sku)

  // Only on the *crossing*, not on every adjustment below the line. A warehouse
  // counting down from five to one would otherwise send four identical alerts,
  // and the fourth is what teaches people to filter the first away.
  const wasAbove = product.stockOnHand > updated.lowStockThreshold
  if (wasAbove && updated.stockOnHand <= updated.lowStockThreshold) {
    console.warn(
      `${product.sku} is at ${updated.stockOnHand}, at or below its threshold of ` +
        `${updated.lowStockThreshold}.`
    )
    await alertLowStock(product.sku, product.name, updated)
  }

  return { productId, stockOnHand: updated.stockOnHand }
}

/**
 * Applies a physical stocktake (SOW BE-12).
 *
 * Counts are absolute, and every line that differs from the system is a variance
 * the operator has to see. Reported whether or not it is written: the point of a
 * stocktake is the discrepancy, not the new number.
 *
 * ---------------------------------------------------------------------------
 * A count below what is already promised is refused, not applied
 * ---------------------------------------------------------------------------
 * If forty are reserved for placed orders and the shelf holds thirty, writing
 * thirty would make `stockReserved > stockOnHand` — the invariant the whole
 * reservation scheme rests on. The database refuses it, and so does this, with a
 * variance the operator has to resolve by cancelling orders or finding the
 * missing units. Silently clamping would hide a real shortfall until somebody
 * tried to ship it.
 */
export async function reconcileStock(
  dto: ReconcileStockDto,
  actor: AuthenticatedActor
): Promise<StockReconciliation> {
  const skus = dto.counts.map((row) => row.sku)
  const products = await prisma.product.findMany({
    where: { sku: { in: skus }, deletedAt: null },
    select: {
      id: true,
      sku: true,
      name: true,
      trackInventory: true,
      stockOnHand: true,
      stockReserved: true,
    },
  })

  const bySku = new Map(products.map((product) => [product.sku, product]))
  const lines: StockReconciliationLine[] = []

  // Collected here and written in one commit below. Applying each row as the
  // loop reached it meant a count that failed partway — a lost connection, a row
  // another transaction was holding — left the stocktake half applied, with no
  // record of where it stopped. Half a stocktake is worse than none: the figures
  // it did write look authoritative, and the ones it did not are indisputably
  // stale, and nothing on the result says which is which.
  const pending: Array<{
    product: (typeof products)[number]
    countedQuantity: number
    variance: number
    note: string | null
  }> = []

  for (const row of dto.counts) {
    const product = bySku.get(row.sku)

    if (!product) {
      lines.push({
        sku: row.sku,
        outcome: 'UNKNOWN_SKU',
        message: 'No such product.',
      })
      continue
    }

    if (!product.trackInventory) {
      lines.push({
        sku: row.sku,
        name: product.name,
        outcome: 'NOT_TRACKED',
        message: 'This product does not track inventory.',
      })
      continue
    }

    const variance = row.countedQuantity - product.stockOnHand

    if (row.countedQuantity < product.stockReserved) {
      lines.push({
        sku: row.sku,
        name: product.name,
        systemQuantity: product.stockOnHand,
        countedQuantity: row.countedQuantity,
        variance,
        reserved: product.stockReserved,
        outcome: 'BELOW_RESERVED',
        message:
          `${product.stockReserved} are already promised to placed orders. Cancel those ` +
          'orders or recount before writing a lower figure.',
      })
      continue
    }

    if (variance === 0) {
      lines.push({
        sku: row.sku,
        name: product.name,
        systemQuantity: product.stockOnHand,
        countedQuantity: row.countedQuantity,
        variance: 0,
        reserved: product.stockReserved,
        outcome: 'MATCHED',
      })
      continue
    }

    if (!dto.dryRun) {
      pending.push({
        product,
        countedQuantity: row.countedQuantity,
        variance,
        note: row.note ?? null,
      })
    }

    lines.push({
      sku: row.sku,
      name: product.name,
      systemQuantity: product.stockOnHand,
      countedQuantity: row.countedQuantity,
      variance,
      reserved: product.stockReserved,
      outcome: dto.dryRun ? 'WOULD_ADJUST' : 'ADJUSTED',
    })
  }

  if (pending.length > 0) {
    // All of it or none of it. The rows the count refused — unknown SKU, not
    // tracked, below reserved — are already out of `pending`, so nothing here
    // can fail on a rule; what this guards against is the transport.
    await prisma.$transaction(
      pending.map((row) =>
        prisma.product.update({
          where: { id: row.product.id },
          data: { stockOnHand: row.countedQuantity },
        })
      )
    )

    // Afterwards, deliberately. An audit entry written inside the transaction
    // would survive a rollback on some paths and vanish on others; written after
    // the commit it records only movements that actually happened.
    for (const row of pending) {
      await recordAudit({
        action: AuditAction.PRODUCT_STOCK_RECONCILED,
        entityType: 'PRODUCT',
        entityId: row.product.id,
        entityName: `${row.product.sku} — ${row.product.name}`,
        accountId: actor.accountId,
        changes: fieldChange(
          'stockOnHand',
          row.product.stockOnHand,
          row.countedQuantity
        ),
        details: {
          variance: row.variance,
          reason: dto.reason,
          note: row.note,
        },
      })
    }
  }

  const summary = {
    counted: lines.length,
    matched: lines.filter((line) => line.outcome === 'MATCHED').length,
    adjusted: lines.filter(
      (line) => line.outcome === 'ADJUSTED' || line.outcome === 'WOULD_ADJUST'
    ).length,
    refused: lines.filter(
      (line) =>
        line.outcome === 'BELOW_RESERVED' ||
        line.outcome === 'UNKNOWN_SKU' ||
        line.outcome === 'NOT_TRACKED'
    ).length,
    // The net movement, which is the number a finance team asks for.
    netVariance: lines.reduce((total, line) => total + (line.variance ?? 0), 0),
  }

  console.info(
    `Stocktake by ${actor.userId}: ${summary.counted} counted, ${summary.adjusted} ` +
      `${dto.dryRun ? 'would change' : 'changed'}, ${summary.refused} refused.`
  )

  return { dryRun: dto.dryRun, reason: dto.reason, summary, lines }
}

/**
 * Tells the people who can do something about it (SOW BE-08).
 *
 * Sent to the platform operator's administrators, not to the customer:
 * replenishing the warehouse is the operator's job, and a buyer told that stock
 * is low can only worry about it.
 *
 * Never allowed to fail the adjustment. The count is already committed, and
 * refusing the response would have a warehouse operator re-key a stock movement
 * that had actually landed — which is how a count of 40 becomes 80.
 *
 * The dispatcher swallows its own send failures, so the try/catch here is for
 * the query: an unreachable database on this line must not undo a stock
 * movement that has already been written.
 */
async function alertLowStock(
  sku: string,
  name: string,
  stock: { stockOnHand: number; lowStockThreshold: number }
): Promise<void> {
  try {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null },
      select: { email: true, firstName: true },
    })

    for (const admin of admins) {
      sendLowStockEmail({
        to: admin.email,
        firstName: admin.firstName,
        items: [
          {
            sku,
            name,
            stockOnHand: stock.stockOnHand,
            threshold: stock.lowStockThreshold,
          },
        ],
      })
    }
  } catch (error) {
    console.error(
      `Could not send a low-stock alert for ${sku}: ` +
        (error instanceof Error ? error.message : String(error))
    )
  }
}

async function recordStockAudit(
  product: Product,
  actor: AuthenticatedActor,
  dto: AdjustStockDto,
  resulting: number,
  sku: string
): Promise<void> {
  await recordAudit({
    action: AuditAction.PRODUCT_STOCK_ADJUSTED,
    entityType: 'PRODUCT',
    entityId: product.id,
    entityName: `${product.sku} — ${product.name}`,
    accountId: actor.accountId,
    // The shelf count either side of the movement. `resulting` is read back
    // from the atomic increment, so the before value is exact rather than a
    // count taken earlier that another adjustment may have moved since.
    changes: fieldChange('stockOnHand', resulting - dto.delta, resulting),
    details: {
      sku,
      variantId: dto.variantId ?? null,
      delta: dto.delta,
      reason: dto.reason,
    },
  })
}

// --- Audit ------------------------------------------------------------------

/**
 * The product fields the audit log records a before and after for.
 *
 * Everything an administrator edits on the product form. Not `status` or
 * `visibility`, which move only through their own audited transitions and
 * would otherwise appear twice; not the stock figures, which have their own
 * entries with a reason attached; not the timestamps.
 */
export const PRODUCT_AUDIT_FIELDS = [
  'sku',
  'name',
  'description',
  'categoryId',
  'basePrice',
  'moq',
  'orderMultiple',
  'packSize',
  'uom',
  'taxTreatment',
  'widthMm',
  'heightMm',
  'depthMm',
  'weightGrams',
  'bleedMm',
  'safeMarginMm',
  'trackInventory',
  'lowStockThreshold',
  'reorderQuantity',
  'leadTimeDays',
  'tags',
] as const

const VARIANT_AUDIT_FIELDS = [
  'sku',
  'attributes',
  'priceOverride',
  'status',
  'sortOrder',
] as const

/** Not the storage or derivative keys: internal paths, and not what was attached. */
const ASSET_AUDIT_FIELDS = [
  'kind',
  'filename',
  'contentType',
  'sizeBytes',
  'altText',
  'sortOrder',
  'damDocumentId',
] as const

/** An option set as a reader compares it: names, values, surcharges, order. */
function optionsForAudit(
  options: readonly {
    name: string
    values: string
    valuePrices: string | null
    sortOrder: number
  }[]
): unknown[] {
  return options.map((option) => ({
    name: option.name,
    values: fromStringList(option.values),
    valuePrices: fromJsonOr<Record<string, string>>(option.valuePrices, {}),
    sortOrder: option.sortOrder,
  }))
}

function tiersForAudit(
  tiers: readonly {
    minQuantity: number
    discountPercent: { toString(): string }
  }[]
): unknown[] {
  return [...tiers]
    .sort((a, b) => a.minQuantity - b.minQuantity)
    .map((tier) => ({
      minQuantity: tier.minQuantity,
      discountPercent: tier.discountPercent.toString(),
    }))
}

/** Sorted, so the same set of accounts never reads as a change. */
async function productAllowList(productId: string): Promise<string[]> {
  const rows = await prisma.productAccountVisibility.findMany({
    where: { productId },
    select: { accountId: true },
  })
  return rows.map((row) => row.accountId).sort()
}
