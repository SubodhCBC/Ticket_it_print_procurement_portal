import type { Prisma, User, UserPermissionGrant } from '@prisma/client'
import { AuditAction } from '../audit/audit.actions'
import {
  changesBetween,
  created,
  fieldChange,
  mergeChanges,
  removed,
} from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import { isPermission } from '../auth/permissions'
import { revokeAllForUser } from '../auth/token.service'
import {
  Role,
  UserType,
  type AuthenticatedActor,
} from '../context/request-context'
import { withTenantScope, type TransactionClient } from '../db/client'
import { BusinessRuleError, NotFoundError } from '../utils/errors'
import { createId } from '../utils/ids'
import { emptyPage, type CursorPage } from '../utils/pagination'
import { assertMayChangeRoleOf, assertMayGrantRole } from './role-grant'
import type {
  GrantPermissionDto,
  ListUsersQueryDto,
  RevokePermissionDto,
  UpdateUserDto,
} from './user.validation'

export type UserWithSites = User & {
  site: { id: string; code: string; name: string } | null
  siteAccess: { siteId: string }[]
}

/**
 * User administration inside a tenant.
 *
 * Creating users is not here — that is the invitation service for portal-native
 * and external users, and the legacy provisioning for replicated ones. This
 * covers what happens afterwards: role, status, branch attachment and the
 * per-user permission grants that the code-defined baseline cannot express.
 */

export async function listUsers(
  accountId: string,
  query: ListUsersQueryDto
): Promise<CursorPage<UserWithSites>> {
  const where: Prisma.UserWhereInput = {
    accountId,
    deletedAt: null,
    ...(query.siteId ? { siteId: query.siteId } : {}),
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.userType ? { userType: query.userType } : {}),
    ...(query.search
      ? {
          OR: [
            { login: { contains: query.search } },
            { email: { contains: query.search } },
            { firstName: { contains: query.search } },
            { lastName: { contains: query.search } },
          ],
        }
      : {}),
  }

  return withTenantScope(accountId, async (tx) => {
    const rows = await tx.user.findMany({
      where,
      include: {
        site: { select: { id: true, code: true, name: true } },
        siteAccess: { select: { siteId: true } },
      },
      orderBy: [{ lastName: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    })

    if (rows.length === 0) return emptyPage<UserWithSites>(query.limit)

    const hasMore = rows.length > query.limit
    const items = hasMore ? rows.slice(0, query.limit) : rows

    return {
      items,
      pageInfo: {
        nextCursor: hasMore ? (items[items.length - 1]?.id ?? null) : null,
        hasMore,
        limit: query.limit,
      },
    }
  })
}

export async function findUserById(
  accountId: string,
  userId: string
): Promise<UserWithSites> {
  return withTenantScope(accountId, async (tx) => {
    const user = await tx.user.findFirst({
      where: { id: userId, accountId, deletedAt: null },
      include: {
        site: { select: { id: true, code: true, name: true } },
        siteAccess: { select: { siteId: true } },
      },
    })
    if (!user) throw new NotFoundError('User')
    return user
  })
}

export async function updateUser(
  accountId: string,
  userId: string,
  dto: UpdateUserDto,
  actor: AuthenticatedActor
): Promise<UserWithSites> {
  const target = await findUserById(accountId, userId)

  assertNotSelfDemotion(target, dto, actor)
  assertExternalStaysConstrained(target, dto)

  // Promotion and demotion are the same control. Without this, USER_MANAGE was
  // enough for head office to make someone a platform administrator — the
  // invitation route's hole, reachable on an existing user instead of a new one.
  if (dto.role !== undefined && dto.role !== target.role) {
    assertMayChangeRoleOf(actor, target.role)
    assertMayGrantRole(actor, dto.role)
  }

  const updated = await withTenantScope(accountId, async (tx) => {
    // Re-validated only when it actually changes. Resending the site a user is
    // already on is not a move, and a user whose branch was deactivated under
    // them has to stay editable — otherwise the one field the deactivation broke
    // is the field that blocks every other edit to their record.
    if (dto.siteId && dto.siteId !== target.siteId) {
      await assertSiteBelongsToAccount(tx, accountId, dto.siteId)
    }

    if (dto.additionalSiteIds) {
      for (const siteId of dto.additionalSiteIds) {
        await assertSiteBelongsToAccount(tx, accountId, siteId)
      }

      // Replace rather than merge: the caller sent the complete set, and a merge
      // would make removing a branch impossible through this endpoint.
      await tx.userSiteAccess.deleteMany({ where: { userId } })
      if (dto.additionalSiteIds.length > 0) {
        await tx.userSiteAccess.createMany({
          data: dto.additionalSiteIds.map((siteId) => ({
            id: createId('usa'),
            accountId,
            userId,
            siteId,
          })),
        })
      }
    }

    return tx.user.update({
      where: { id: userId },
      data: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.siteId !== undefined ? { siteId: dto.siteId } : {}),
        // Neither is on the access token, so changing them ends no session:
        // checkout reads both fresh on every validation.
        ...(dto.monthlyBudgetCap !== undefined
          ? { monthlyBudgetCap: dto.monthlyBudgetCap }
          : {}),
        ...(dto.poPrefix !== undefined ? { poPrefix: dto.poPrefix } : {}),
      },
      include: {
        site: { select: { id: true, code: true, name: true } },
        siteAccess: { select: { siteId: true } },
      },
    })
  })

  const name =
    `${updated.firstName} ${updated.lastName}`.trim() || updated.login

  // A role change is its own action, not a line in a diff: "who made this person
  // an administrator" is a question asked on its own, usually under time
  // pressure.
  if (dto.role !== undefined && dto.role !== target.role) {
    await recordAudit({
      action: AuditAction.USER_ROLE_CHANGED,
      entityType: 'USER',
      entityId: userId,
      entityName: name,
      accountId,
      changes: changesBetween(target, updated, ['role']),
    })
  }

  await recordAudit({
    action: AuditAction.USER_UPDATED,
    entityType: 'USER',
    entityId: userId,
    entityName: name,
    accountId,
    // What the record became, not what was sent: a request that resends the
    // current branch changed nothing, and logging it as a change would put a
    // move in the trail that never happened.
    changes: mergeChanges(
      changesBetween(target, updated, USER_AUDIT_FIELDS),
      fieldChange(
        'additionalSiteIds',
        siteIdsOf(target.siteAccess),
        siteIdsOf(updated.siteAccess)
      )
    ),
  })

  // The access token carries role, siteId and userType, so any of these changing
  // makes every live token stale — and a demotion that only takes effect when
  // the token expires is not a demotion. Revoking the refresh family bounds it
  // to the access TTL.
  if (
    dto.role !== undefined ||
    dto.siteId !== undefined ||
    dto.status === 'DISABLED'
  ) {
    await revokeAllForUser(userId)
    console.info(
      `Revoked sessions for ${userId} after an access-affecting change.`
    )
  }

  return updated
}

/**
 * Deactivates a user and ends their sessions.
 *
 * Soft, like everything else: the row is referenced by orders, approvals and
 * audit entries, so it has to survive. `deletedAt` plus DISABLED is what stops
 * them logging in — the login path checks both.
 */
export async function deactivateUser(
  accountId: string,
  userId: string,
  actor: AuthenticatedActor
): Promise<void> {
  if (userId === actor.userId) {
    throw new BusinessRuleError('You cannot deactivate your own account')
  }

  const target = await findUserById(accountId, userId)

  const deactivatedAt = new Date()
  await withTenantScope(accountId, async (tx) => {
    const result = await tx.user.updateMany({
      where: { id: userId, accountId, deletedAt: null },
      data: { status: 'DISABLED', deletedAt: deactivatedAt },
    })
    if (result.count === 0) throw new NotFoundError('User')
  })

  await revokeAllForUser(userId)

  await recordAudit({
    action: AuditAction.USER_DEACTIVATED,
    entityType: 'USER',
    entityId: userId,
    entityName: `${target.firstName} ${target.lastName}`.trim() || target.login,
    accountId,
    changes: changesBetween(
      target,
      { ...target, status: 'DISABLED', deletedAt: deactivatedAt },
      ['status', 'deletedAt']
    ),
    // Who they were, for an entry read long after the name has gone stale.
    details: {
      login: target.login,
      role: target.role,
      userType: target.userType,
    },
  })

  console.info(`Deactivated user ${userId} in account ${accountId}.`)
}

// --- Permission grants ------------------------------------------------------

export async function listGrants(
  accountId: string,
  userId: string
): Promise<UserPermissionGrant[]> {
  await findUserById(accountId, userId)

  return withTenantScope(accountId, (tx) =>
    tx.userPermissionGrant.findMany({
      where: { userId, accountId },
      orderBy: { createdAt: 'desc' },
    })
  )
}

export async function grantPermission(
  accountId: string,
  userId: string,
  dto: GrantPermissionDto,
  actor: AuthenticatedActor
): Promise<UserPermissionGrant> {
  await findUserById(accountId, userId)

  // The schema validates against the catalog already; this is the belt to that
  // braces, and it narrows the type for the write.
  if (!isPermission(dto.permission)) {
    throw new BusinessRuleError(`Unknown permission "${dto.permission}"`)
  }

  if (dto.expiresAt && dto.expiresAt.getTime() <= Date.now()) {
    throw new BusinessRuleError('A grant cannot expire in the past')
  }

  const resourceId = dto.resourceId ?? null

  const { grant, previous } = await withTenantScope(accountId, async (tx) => {
    // Not an upsert. The unique index is (userId, permission, resourceId) and
    // resourceId is nullable, so Prisma's compound-unique `where` cannot express
    // the account-wide row at all — PostgreSQL treats NULLs as distinct, which
    // is also why the index does not actually prevent two of them. Finding first
    // and branching is what makes a repeat grant an update rather than a
    // duplicate.
    // The whole row, not just its id: a repeat grant is an update, and the
    // audit entry needs what it said before to show what the update changed.
    const existing = await tx.userPermissionGrant.findFirst({
      where: { userId, accountId, permission: dto.permission, resourceId },
    })

    if (existing) {
      const updatedGrant = await tx.userPermissionGrant.update({
        where: { id: existing.id },
        data: {
          effect: dto.effect,
          reason: dto.reason ?? null,
          expiresAt: dto.expiresAt ?? null,
          grantedById: actor.userId,
        },
      })
      return { grant: updatedGrant, previous: existing }
    }

    const createdGrant = await tx.userPermissionGrant.create({
      data: {
        id: createId('grt'),
        accountId,
        userId,
        permission: dto.permission,
        effect: dto.effect,
        resourceId,
        reason: dto.reason ?? null,
        expiresAt: dto.expiresAt ?? null,
        grantedById: actor.userId,
      },
    })
    return { grant: createdGrant, previous: null }
  })

  await recordAudit({
    action: AuditAction.USER_PERMISSION_GRANTED,
    entityType: 'PERMISSION',
    entityId: grant.id,
    entityName: dto.permission,
    accountId,
    changes: previous
      ? changesBetween(previous, grant, GRANT_AUDIT_FIELDS)
      : created(grant, GRANT_AUDIT_FIELDS),
    // Whose permission it is. The grant's own fields are in `changes`.
    details: { subjectUserId: userId },
  })

  console.info(
    `${actor.userId} set ${dto.effect} ${dto.permission}` +
      `${dto.resourceId ? ` on ${dto.resourceId}` : ''} for user ${userId}.`
  )

  return grant
}

export async function revokeGrant(
  accountId: string,
  userId: string,
  dto: RevokePermissionDto
): Promise<void> {
  const revoked = await withTenantScope(accountId, async (tx) => {
    const where = {
      userId,
      accountId,
      permission: dto.permission,
      resourceId: dto.resourceId ?? null,
    }
    // Read before the delete, in the same transaction, so the entry records
    // what was actually removed — an ALLOW and a DENY are revoked the same way
    // and mean opposite things.
    const row = await tx.userPermissionGrant.findFirst({ where })
    if (!row) throw new NotFoundError('Permission grant')
    await tx.userPermissionGrant.deleteMany({ where })
    return row
  })

  await recordAudit({
    action: AuditAction.USER_PERMISSION_REVOKED,
    entityType: 'PERMISSION',
    entityId: `${userId}:${dto.permission}`,
    entityName: dto.permission,
    accountId,
    changes: removed(revoked, GRANT_AUDIT_FIELDS),
    details: { subjectUserId: userId },
  })
}

// --- Audit ------------------------------------------------------------------

/**
 * The user fields an administrator edits here. Not names or email — those come
 * from the identity provider and are not changed through this endpoint — and
 * not the timestamps, which move on every write.
 */
const USER_AUDIT_FIELDS = [
  'role',
  'status',
  'siteId',
  'monthlyBudgetCap',
  'poPrefix',
] as const

const GRANT_AUDIT_FIELDS = [
  'permission',
  'effect',
  'resourceId',
  'reason',
  'expiresAt',
] as const

/** Sorted, so the same set of branches never reads as a change. */
function siteIdsOf(rows: readonly { siteId: string }[]): string[] {
  return rows.map((row) => row.siteId).sort()
}

// --- Guards on the guards ---------------------------------------------------

/**
 * Stops an administrator locking themselves — and possibly the account — out.
 *
 * Not a security control: someone with USER_MANAGE can still demote a peer. It
 * is a foot-gun guard, and the reason it is worth having is that the mistake is
 * unrecoverable through the API that made it.
 */
function assertNotSelfDemotion(
  target: User,
  dto: UpdateUserDto,
  actor: AuthenticatedActor
): void {
  if (target.id !== actor.userId) return

  if (dto.role !== undefined && dto.role !== actor.role) {
    throw new BusinessRuleError('You cannot change your own role')
  }
  if (dto.status === 'DISABLED') {
    throw new BusinessRuleError('You cannot deactivate your own account')
  }
}

/**
 * External users stay least-privileged.
 *
 * Their permission baseline is a closed list that ignores `role` (see
 * `basePermissionsFor`), so promoting one to ADMIN would grant nothing and
 * merely make the UI lie about what they can do. Refusing keeps the record
 * honest, and anything genuinely needed is a per-resource grant.
 */
function assertExternalStaysConstrained(
  target: User,
  dto: UpdateUserDto
): void {
  if (target.userType !== UserType.EXTERNAL) return

  if (dto.role !== undefined && dto.role !== Role.SITE_USER) {
    throw new BusinessRuleError(
      'An external user cannot hold an elevated role. Grant individual permissions instead.'
    )
  }
  if (dto.siteId === null) {
    throw new BusinessRuleError('An external user must stay attached to a site')
  }
}

async function assertSiteBelongsToAccount(
  tx: TransactionClient,
  accountId: string,
  siteId: string
): Promise<void> {
  const site = await tx.site.findFirst({
    where: { id: siteId, accountId, deletedAt: null },
    select: { id: true },
  })
  if (!site) throw new NotFoundError('Site')
}
