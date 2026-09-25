import type { Account, Prisma } from '@prisma/client'
import { AuditAction } from '../audit/audit.actions'
import { changesBetween, created } from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import type { AuthenticatedActor } from '../context/request-context'
import { prisma, withTenantScope } from '../db/client'
import { ConflictError, NotFoundError } from '../utils/errors'
import { createId } from '../utils/ids'
import { offsetPage, toSkipTake, type OffsetPage } from '../utils/pagination'
import type {
  CreateAccountDto,
  ListAccountsQueryDto,
  UpdateAccountDto,
} from './account.validation'

/**
 * The account fields the audit log records a before and after for.
 *
 * Everything an administrator can set. Not `slug` or `legacyClient`, which are
 * derived and never edited, and not the timestamps, which change on every write
 * and would make every entry look like a change to `updatedAt`.
 */
const ACCOUNT_AUDIT_FIELDS = [
  'accountCode',
  'name',
  'status',
  'contactEmail',
  'contactPhone',
  'approvalThreshold',
  'requirePoNumber',
  'poPrefix',
  'poFormat',
] as const

/** Counts the admin table shows next to each account. */
export type AccountWithCounts = Account & {
  _count: { sites: number; users: number }
}

/**
 * Tenant administration.
 *
 * Two things make this module unlike the others.
 *
 * First, it is the one place that legitimately reads and writes across tenants:
 * listing accounts *is* a cross-tenant operation, so it cannot run inside
 * `withTenantScope`. It is therefore restricted to ADMIN by
 * `Permission.ACCOUNT_MANAGE`, which no customer role holds, and the queries do
 * their own filtering. Writes to a single account still open that account's
 * scope, so RLS covers them.
 *
 * Second, accounts are also created implicitly, by the legacy user provisioning,
 * when a legacy user of an unseen `Users.Client` logs in for the first time.
 * Those rows arrive with a slug-derived `accountCode` and no contact details,
 * and an administrator fills the rest in here.
 */

/**
 * Cross-tenant by definition, so no tenant scope and no RLS. The guard on the
 * route is the whole protection here — ACCOUNT_MANAGE is ADMIN-only in the role
 * baseline, and this must never be reachable without it.
 */
export async function listAccounts(
  query: ListAccountsQueryDto
): Promise<OffsetPage<AccountWithCounts>> {
  const where: Prisma.AccountWhereInput = {
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search } },
            { accountCode: { contains: query.search } },
            { legacyClient: { contains: query.search } },
          ],
        }
      : {}),
  }

  const { skip, take } = toSkipTake(query)

  const [items, total] = await Promise.all([
    prisma.account.findMany({
      where,
      include: { _count: { select: { sites: true, users: true } } },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      skip,
      take,
    }),
    prisma.account.count({ where }),
  ])

  return offsetPage(items, total, query)
}

export async function findAccountById(
  accountId: string
): Promise<AccountWithCounts> {
  const account = await prisma.account.findFirst({
    where: { id: accountId, deletedAt: null },
    include: { _count: { select: { sites: true, users: true } } },
  })
  if (!account) throw new NotFoundError('Account')
  return account
}

export async function createAccount(
  dto: CreateAccountDto,
  actor: AuthenticatedActor
): Promise<AccountWithCounts> {
  const slug = toSlug(dto.accountCode)

  const clash = await prisma.account.findFirst({
    where: { OR: [{ accountCode: dto.accountCode }, { slug }] },
    select: { id: true, accountCode: true, slug: true, deletedAt: true },
  })

  if (clash) {
    // The slug is how a legacy login finds its account, so a collision here
    // would silently attach that customer's users to this new row. Refusing is
    // the only safe answer, and the message says which of the two keys collided
    // so the administrator can pick a different code.
    throw new ConflictError(
      clash.accountCode === dto.accountCode
        ? `Account code "${dto.accountCode}" is already in use`
        : `Account code "${dto.accountCode}" collides with the existing account "${clash.slug}"`,
      { details: { accountCode: dto.accountCode } }
    )
  }

  const account = await prisma.account.create({
    data: {
      id: createId('acc'),
      slug,
      accountCode: dto.accountCode,
      // Null, not the name: this account has no legacy counterpart, and writing
      // one in would make a later reconciliation match the wrong row.
      legacyClient: null,
      name: dto.name,
      contactEmail: dto.contactEmail ?? null,
      contactPhone: dto.contactPhone ?? null,
      approvalThreshold: dto.approvalThreshold ?? null,
      requirePoNumber: dto.requirePoNumber,
      poPrefix: dto.poPrefix ?? null,
      poFormat: dto.poFormat ?? null,
    },
    include: { _count: { select: { sites: true, users: true } } },
  })

  // After the write commits, never before.
  await recordAudit({
    action: AuditAction.ACCOUNT_CREATED,
    entityType: 'ACCOUNT',
    entityId: account.id,
    entityName: account.name,
    accountId: account.id,
    changes: created(account, ACCOUNT_AUDIT_FIELDS),
  })

  console.info(
    `Created account ${account.id} (${account.accountCode}) by ${actor.userId}.`
  )
  return account
}

export async function updateAccount(
  accountId: string,
  dto: UpdateAccountDto
): Promise<AccountWithCounts> {
  const before = await findAccountById(accountId)

  const updated = await withTenantScope(accountId, (tx) =>
    tx.account.update({
      where: { id: accountId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.contactEmail !== undefined
          ? { contactEmail: dto.contactEmail }
          : {}),
        ...(dto.contactPhone !== undefined
          ? { contactPhone: dto.contactPhone }
          : {}),
        ...(dto.approvalThreshold !== undefined
          ? { approvalThreshold: dto.approvalThreshold }
          : {}),
        ...(dto.requirePoNumber !== undefined
          ? { requirePoNumber: dto.requirePoNumber }
          : {}),
        ...(dto.poPrefix !== undefined ? { poPrefix: dto.poPrefix } : {}),
        ...(dto.poFormat !== undefined ? { poFormat: dto.poFormat } : {}),
      },
      include: { _count: { select: { sites: true, users: true } } },
    })
  )

  // A status change is logged as its own action rather than folded into
  // `account.updated`, because "who suspended this customer and when" is a
  // question people actually ask, and it should not require reading a diff.
  if (dto.status !== undefined && dto.status !== before.status) {
    await recordAudit({
      action: AuditAction.ACCOUNT_STATUS_CHANGED,
      entityType: 'ACCOUNT',
      entityId: accountId,
      entityName: updated.name,
      accountId,
      changes: changesBetween(before, updated, ['status']),
    })
  }

  await recordAudit({
    action: AuditAction.ACCOUNT_UPDATED,
    entityType: 'ACCOUNT',
    entityId: accountId,
    entityName: updated.name,
    accountId,
    changes: changesBetween(before, updated, ACCOUNT_AUDIT_FIELDS),
  })

  return updated
}

/**
 * Soft delete. Invoices, orders and audit entries reference the account, so the
 * row survives; INACTIVE plus `deletedAt` is what stops it being used.
 *
 * The users are deliberately left alone rather than cascaded: deactivating a
 * customer must not silently rewrite hundreds of user rows in a way that a
 * mistaken deactivation cannot be undone from. They cannot sign in anyway once
 * the account is gone from every listing.
 */
export async function deactivateAccount(accountId: string): Promise<void> {
  const account = await findAccountById(accountId)

  const deactivated = await withTenantScope(accountId, (tx) =>
    tx.account.update({
      where: { id: accountId },
      data: { status: 'INACTIVE', deletedAt: new Date() },
    })
  )

  await recordAudit({
    action: AuditAction.ACCOUNT_DEACTIVATED,
    entityType: 'ACCOUNT',
    entityId: accountId,
    entityName: account.name,
    accountId,
    changes: changesBetween(account, deactivated, ['status', 'deletedAt']),
  })

  console.info(`Deactivated account ${accountId} (${account.accountCode}).`)
}

/**
 * Mirrors `toAccountSlug` in the auth module, but applied to the account code
 * rather than to a legacy client name.
 *
 * Kept separate rather than shared because the two answer different questions:
 * that one normalises a messy upstream string so repeated logins converge on one
 * account, this one derives an internal key from a code an administrator already
 * typed cleanly. Sharing them would tie the legacy normalisation rules to the
 * admin UI's validation rules, which have no reason to move together.
 */
function toSlug(accountCode: string): string {
  return accountCode
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
