import { Prisma } from '@prisma/client'
import { Permission } from '../auth/permissions'
import { resolvePermissions } from '../auth/permission.service'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { withTenantScope } from '../db/client'
import { ForbiddenError } from '../utils/errors'

/**
 * Which branches a report may count (SOW §15: "Site User sees own site only,
 * Head Office sees all sites in the account, Administrator sees all accounts.
 * Enforced server-side — scope cannot be widened through report parameters").
 *
 * ---------------------------------------------------------------------------
 * Decided by what the caller may see, not by what they ask for
 * ---------------------------------------------------------------------------
 * The rule is the one the order list already applies: ORDER_VIEW_ACCOUNT sees
 * the whole account; anyone else sees the branches they belong to — their home
 * branch and any they have been granted. A report is an aggregate of orders, so
 * a report that counted orders its reader could not open would be a way round
 * the order permissions, one total at a time.
 *
 * `siteId` stays a filter within that: a site user attached to two branches can
 * narrow to one. Naming a branch outside it is refused with 403 rather than
 * answered with zeros — an empty report would read as "nothing was spent there",
 * which is a claim about another branch.
 */

/**
 * No restriction (`undefined`), one branch, or a set of branches. An empty set
 * is a real answer — a user attached to no branch sees nothing.
 */
export type SiteScope = string | readonly string[] | undefined

export async function reportSiteScope(
  actor: AuthenticatedActor,
  requestedSiteId: string | undefined
): Promise<SiteScope> {
  if (actor.role === Role.ADMIN) return requestedSiteId

  const effective = await resolvePermissions(actor)
  if (effective.has(Permission.ORDER_VIEW_ACCOUNT)) return requestedSiteId

  const granted = await withTenantScope(actor.accountId, (tx) =>
    tx.userSiteAccess.findMany({
      where: { userId: actor.userId },
      select: { siteId: true },
    })
  )
  const mine = [
    ...new Set([
      ...(actor.siteId ? [actor.siteId] : []),
      ...granted.map((row) => row.siteId),
    ]),
  ].sort()

  if (requestedSiteId === undefined) return mine
  if (mine.includes(requestedSiteId)) return requestedSiteId

  throw new ForbiddenError(
    'Reports cover only the branches you belong to, and that branch is not one of them.',
    { details: { siteId: requestedSiteId } }
  )
}

/** The scope as a Prisma `where` fragment on an order's `siteId`. */
export function siteWhere(scope: SiteScope): {
  siteId?: Prisma.StringFilter | string
} {
  if (scope === undefined) return {}
  if (typeof scope === 'string') return { siteId: scope }
  return { siteId: { in: [...scope] } }
}

/** The same, as a raw SQL condition on `column`, beginning with AND. */
export function siteSql(scope: SiteScope, column: Prisma.Sql): Prisma.Sql {
  if (scope === undefined) return Prisma.empty
  if (typeof scope === 'string') return Prisma.sql`AND ${column} = ${scope}`
  // SQL Server refuses an empty IN list; no branches means no rows.
  if (scope.length === 0) return Prisma.sql`AND 1 = 0`
  return Prisma.sql`AND ${column} IN (${Prisma.join([...scope])})`
}

/** The query with its branch filter replaced by the scope it resolves to. */
export async function scopedToSites<T extends { siteId?: string }>(
  actor: AuthenticatedActor,
  query: T
): Promise<Omit<T, 'siteId'> & { siteId?: SiteScope }> {
  return { ...query, siteId: await reportSiteScope(actor, query.siteId) }
}

/**
 * The scope as one cache-key part. Every scope a query can have gets its own
 * key, and two callers resolved to the same set of branches share one, which
 * is safe because they are allowed exactly the same figures.
 */
export function siteScopeKey(scope: SiteScope): string | undefined {
  if (scope === undefined || typeof scope === 'string') return scope
  return `in:${scope.join('|')}`
}
