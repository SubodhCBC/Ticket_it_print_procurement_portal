import type { Prisma, ProductCategory } from '@prisma/client'
import {
  changesBetween,
  created,
  fieldChange,
  mergeChanges,
} from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import { AuditAction } from '../audit/audit.actions'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { prisma } from '../db/client'
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../utils/errors'
import { createId } from '../utils/ids'
import type {
  CreateCategoryDto,
  ListCategoriesQueryDto,
  SetCategoryVisibilityDto,
  UpdateCategoryDto,
} from './category.validation'
import { categoryVisibilityFilter } from './category-visibility'
import { visibilityFilter as productVisibilityFilter } from './products.service'

export type CategoryWithCount = ProductCategory & {
  _count: { products: number }
}

/**
 * The catalog's category taxonomy.
 *
 * Global, like the rest of the catalog: no `accountId`, no tenant scope, no RLS
 * policy. `CATALOG_MANAGE` is what protects it, and only ADMIN holds that.
 *
 * What a customer may *see* of it is narrower (SOW AD-5): a RESTRICTED category
 * is listed only to the accounts on its allow-list, through the same
 * `categoryVisibilityFilter` the product reads apply. The allow-list is the one
 * tenant-owned table here, and it is covered by RLS like its product twin.
 *
 * Every read here is unpaginated. There are eight categories in the statement
 * of work, and paginating a list the navigation renders in full would be
 * ceremony — the cap in `listCategories()` is there to keep that assumption
 * honest rather than to page through anything.
 */

/** Far above the eight the SOW names; a signal, not a page size. */
const MAX_CATEGORIES = 200

export async function listCategories(
  actor: AuthenticatedActor,
  query: ListCategoriesQueryDto
): Promise<CategoryWithCount[]> {
  // An AND array for the same reason `listProducts` uses one: the visibility
  // filter brings a top-level `OR`, and spreading clauses into one object would
  // let a later key overwrite it.
  const clauses: Prisma.ProductCategoryWhereInput[] = [
    { deletedAt: null },
    categoryVisibilityFilter(actor),
  ]

  if (query.status) clauses.push({ status: query.status })

  // Admin-only. For anyone else the list is already cut to what their account
  // may see, and a customer filtering for RESTRICTED would only be asking which
  // contract categories they happen to be on.
  if (query.visibility && actor.role === Role.ADMIN) {
    clauses.push({ visibility: query.visibility })
  }

  // The catalogue navigation hides categories with nothing in them; the admin
  // table shows them, because an empty category is exactly what an
  // administrator has just created and needs to fill.
  //
  // "Nothing in them" means nothing *this actor* could see. The check used to
  // count any active product, so a category whose only product was restricted
  // to another account still appeared in this account's navigation — an entry
  // that opened onto an empty page and named a line meant for someone else.
  // An AND array, because the product rule carries its own `status` and `OR`
  // and would overwrite the ACTIVE test if spread into the same object.
  if (!query.includeEmpty) {
    clauses.push({
      products: {
        some: {
          AND: [
            { deletedAt: null, status: 'ACTIVE' },
            productVisibilityFilter(actor),
          ],
        },
      },
    })
  }

  return prisma.productCategory.findMany({
    where: { AND: clauses },
    include: {
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: MAX_CATEGORIES,
  })
}

/**
 * One category.
 *
 * With an actor, a category that actor may not see answers 404 — the same as
 * one that does not exist, so a customer cannot probe for the names of other
 * accounts' contract categories. Without one it is the internal lookup the
 * write paths use, which run behind CATALOG_MANAGE and must see everything.
 */
export async function findCategoryById(
  categoryId: string,
  actor?: AuthenticatedActor
): Promise<CategoryWithCount> {
  const category = await prisma.productCategory.findFirst({
    where: {
      AND: [
        { id: categoryId, deletedAt: null },
        actor ? categoryVisibilityFilter(actor) : {},
      ],
    },
    include: {
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  })
  if (!category) throw new NotFoundError('Category')
  return category
}

/**
 * Which accounts a restricted category is open to.
 *
 * Returns the saved rows for an ALL_ACCOUNTS category too: they are kept when a
 * restriction is lifted, and a screen reinstating one needs to see them.
 */
export async function findCategoryVisibility(categoryId: string): Promise<{
  visibility: string
  accounts: { id: string; name: string; accountCode: string }[]
}> {
  const category = await findCategoryById(categoryId)

  const rows = await prisma.categoryAccountVisibility.findMany({
    where: { categoryId },
    select: {
      account: { select: { id: true, name: true, accountCode: true } },
    },
    orderBy: { account: { name: 'asc' } },
  })

  return {
    visibility: category.visibility,
    accounts: rows.map((row) => row.account),
  }
}

/**
 * Sets who may see a category, and so every product in it (SOW AD-5).
 *
 * RESTRICTED replaces the whole allow-list, in one transaction with the flag, so
 * there is no moment at which the category is restricted to nobody or open to
 * the previous list. ALL_ACCOUNTS leaves the saved rows in place: they are
 * ignored while unrestricted, and a restriction lifted for a campaign is usually
 * put back.
 *
 * Duplicate account ids are collapsed rather than refused — the list is a set —
 * and every remaining id has to be a live account, or nothing is written.
 */
export async function setCategoryVisibility(
  categoryId: string,
  dto: SetCategoryVisibilityDto,
  actor: AuthenticatedActor
): Promise<CategoryWithCount> {
  const previous = await findCategoryById(categoryId)
  const previousAccountIds = await allowListOf(categoryId)

  const accountIds = [...new Set(dto.accountIds)]

  if (dto.visibility === 'RESTRICTED') {
    const found = await prisma.account.count({
      where: { id: { in: accountIds }, deletedAt: null },
    })
    if (found !== accountIds.length) {
      throw new BusinessRuleError(
        'One or more of those accounts does not exist',
        { details: { requested: accountIds.length, found } }
      )
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.productCategory.update({
      where: { id: categoryId },
      data: { visibility: dto.visibility },
    })

    if (dto.visibility === 'RESTRICTED') {
      await tx.categoryAccountVisibility.deleteMany({ where: { categoryId } })
      await tx.categoryAccountVisibility.createMany({
        data: accountIds.map((accountId) => ({
          id: createId('cav'),
          categoryId,
          accountId,
        })),
      })
    }
  })

  const category = await findCategoryById(categoryId)

  await recordAudit({
    action: AuditAction.CATEGORY_VISIBILITY_SET,
    entityType: 'PRODUCT',
    entityId: categoryId,
    entityName: `${category.code} — ${category.name}`,
    accountId: actor.accountId,
    // The allow-list as stored on both sides. Rows are kept when a category is
    // opened back up to every account, so a flip to ALL_ACCOUNTS shows the
    // visibility changing and the list staying — which is what the table holds.
    changes: mergeChanges(
      changesBetween(previous, category, ['visibility']),
      fieldChange(
        'accountIds',
        previousAccountIds,
        await allowListOf(categoryId)
      )
    ),
  })

  return category
}

/** Used by the bulk importer, which names categories by code, not by id. */
export async function findCategoryIdByCode(
  code: string
): Promise<string | null> {
  const category = await prisma.productCategory.findFirst({
    where: { code: code.trim().toUpperCase(), deletedAt: null },
    select: { id: true },
  })
  return category?.id ?? null
}

export async function createCategory(
  dto: CreateCategoryDto,
  accountId: string
): Promise<CategoryWithCount> {
  const clash = await prisma.productCategory.findUnique({
    where: { code: dto.code },
    select: { id: true, deletedAt: true },
  })

  if (clash) {
    // A soft-deleted category still holds the code, because the unique index
    // covers every row. Saying so beats a constraint error the caller cannot
    // interpret.
    throw new ConflictError(
      clash.deletedAt
        ? `Category code "${dto.code}" belongs to a deactivated category and cannot be reused`
        : `Category code "${dto.code}" is already in use`,
      { details: { code: dto.code } }
    )
  }

  const category = await prisma.productCategory.create({
    data: {
      id: createId('cat'),
      code: dto.code,
      name: dto.name,
      description: dto.description ?? null,
      sortOrder: dto.sortOrder,
    },
    include: { _count: { select: { products: true } } },
  })

  await recordAudit({
    action: AuditAction.CATEGORY_CREATED,
    entityType: 'PRODUCT',
    entityId: category.id,
    entityName: `${category.code} — ${category.name}`,
    accountId,
    changes: created(category, CATEGORY_AUDIT_FIELDS),
  })

  console.info(`Created category ${category.id} (${category.code}).`)
  return category
}

export async function updateCategory(
  categoryId: string,
  dto: UpdateCategoryDto,
  accountId: string
): Promise<CategoryWithCount> {
  const previous = await findCategoryById(categoryId)

  const category = await prisma.productCategory.update({
    where: { id: categoryId },
    data: {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
    },
    include: {
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  })

  await recordAudit({
    action: AuditAction.CATEGORY_UPDATED,
    entityType: 'PRODUCT',
    entityId: categoryId,
    entityName: `${category.code} — ${category.name}`,
    accountId,
    changes: changesBetween(previous, category, CATEGORY_AUDIT_FIELDS),
  })

  return category
}

/**
 * Soft delete, and refused while products still point at it.
 *
 * `categoryId` is a required column on Product, so deactivating a category with
 * products in it would leave rows referencing something the catalogue no longer
 * lists — and every catalogue query joins through it. Moving the products first
 * is the administrator's decision, not one to make for them.
 */
export async function deactivateCategory(
  categoryId: string,
  accountId: string
): Promise<void> {
  const category = await findCategoryById(categoryId)

  if (category._count.products > 0) {
    throw new BusinessRuleError(
      `This category still has ${category._count.products} product(s). ` +
        'Move or delete them before deactivating it.',
      { details: { productCount: category._count.products } }
    )
  }

  const deactivated = await prisma.productCategory.update({
    where: { id: categoryId },
    data: { status: 'INACTIVE', deletedAt: new Date() },
  })

  await recordAudit({
    action: AuditAction.CATEGORY_DEACTIVATED,
    entityType: 'PRODUCT',
    entityId: categoryId,
    entityName: `${category.code} — ${category.name}`,
    accountId,
    changes: changesBetween(category, deactivated, ['status', 'deletedAt']),
  })

  console.info(`Deactivated category ${categoryId} (${category.code}).`)
}

// --- Audit ------------------------------------------------------------------

const CATEGORY_AUDIT_FIELDS = [
  'code',
  'name',
  'description',
  'sortOrder',
  'status',
] as const

/** The accounts a category is restricted to, sorted so order never reads as a change. */
async function allowListOf(categoryId: string): Promise<string[]> {
  const rows = await prisma.categoryAccountVisibility.findMany({
    where: { categoryId },
    select: { accountId: true },
  })
  return rows.map((row) => row.accountId).sort()
}
