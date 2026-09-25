import type { Address, Prisma, Site } from '@prisma/client'
import { AuditAction } from '../audit/audit.actions'
import {
  changesBetween,
  created as createdValues,
} from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import { prisma, withTenantScope, type TransactionClient } from '../db/client'
import { ConflictError, NotFoundError } from '../utils/errors'
import { createId } from '../utils/ids'
import type { ValidatedAddress } from '../shipping/carrier.types'
import { nzPostAddressColumns } from './address-nzpost'
import { emptyPage, type CursorPage } from '../utils/pagination'
import type {
  AddSiteAddressDto,
  CreateSiteDto,
  ListSitesQueryDto,
  UpdateSiteDto,
} from './site.validation'

export type SiteWithAddresses = Site & { addresses: Address[] }

/** The site fields the audit log records a before and after for. */
const SITE_AUDIT_FIELDS = [
  'code',
  'name',
  'status',
  'monthlyBudget',
  'poRequired',
  'poPrefix',
  'poFormat',
  'costCentre',
] as const

/** An address as it is added — what the branch now ships or bills to. */
const ADDRESS_AUDIT_FIELDS = [
  'kind',
  'label',
  'recipientName',
  'line1',
  'line2',
  'city',
  'region',
  'postcode',
  'country',
  'phone',
  'isDefault',
  'nzPostAddressId',
  'dpid',
  'isRural',
] as const

/**
 * Sites and their addresses.
 *
 * Every function runs inside `withTenantScope`, including the ones an ADMIN
 * invokes across accounts — an admin acting on another tenant opens the scope
 * for *that* tenant rather than escaping scoping altogether. Two things follow:
 * Row-Level Security is exercised on the ordinary path rather than only in
 * tests, and a bug in the `where` clause of any query here produces an empty
 * result instead of another customer's branches.
 */

export async function listSites(
  accountId: string,
  query: ListSitesQueryDto
): Promise<CursorPage<SiteWithAddresses>> {
  const where: Prisma.SiteWhereInput = {
    accountId,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { code: { contains: query.search } },
            { name: { contains: query.search } },
          ],
        }
      : {}),
  }

  return withTenantScope(accountId, async (tx) => {
    // One row more than asked for, so "is there another page" is answered
    // without a second count query over the same predicate.
    const rows = await tx.site.findMany({
      where,
      include: { addresses: { where: { deletedAt: null, isOneOff: false } } },
      orderBy: [{ code: 'asc' }, { id: 'asc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    })

    if (rows.length === 0) return emptyPage<SiteWithAddresses>(query.limit)

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

export async function findSiteById(
  accountId: string,
  siteId: string
): Promise<SiteWithAddresses> {
  return withTenantScope(accountId, async (tx) => {
    const site = await tx.site.findFirst({
      where: { id: siteId, accountId, deletedAt: null },
      include: { addresses: { where: { deletedAt: null, isOneOff: false } } },
    })
    if (!site) throw new NotFoundError('Site')
    return site
  })
}

export async function createSite(
  accountId: string,
  dto: CreateSiteDto,
  /** NZ Post's record for each `nzPostAddressId` sent, fetched by the caller. */
  verified: ReadonlyMap<string, ValidatedAddress> = new Map()
): Promise<SiteWithAddresses> {
  const created = await withTenantScope(accountId, async (tx) => {
    await assertCodeIsFree(tx, accountId, dto.code)

    const siteId = createId('sit')

    const site = await tx.site.create({
      data: {
        id: siteId,
        accountId,
        code: dto.code,
        name: dto.name,
        monthlyBudget: dto.monthlyBudget ?? null,
        poRequired: dto.poRequired,
        poPrefix: dto.poPrefix ?? null,
        poFormat: dto.poFormat ?? null,
        costCentre: dto.costCentre ?? null,
        addresses: {
          create: dto.addresses.map(({ nzPostAddressId, ...address }) => ({
            id: createId('adr'),
            accountId,
            ...address,
            label: address.label ?? null,
            recipientName: address.recipientName ?? null,
            line2: address.line2 ?? null,
            region: address.region ?? null,
            phone: address.phone ?? null,
            ...validatedColumns(verified, nzPostAddressId, address.line2),
          })),
        },
      },
      include: { addresses: true },
    })

    console.info(
      `Created site ${site.id} (${site.code}) for account ${accountId}.`
    )
    return site
  })

  await recordAudit({
    action: AuditAction.SITE_CREATED,
    entityType: 'SITE',
    entityId: created.id,
    entityName: `${created.code} — ${created.name}`,
    accountId,
    changes: createdValues(created, SITE_AUDIT_FIELDS),
    details: { addressCount: created.addresses.length },
  })

  return created
}

export async function updateSite(
  accountId: string,
  siteId: string,
  dto: UpdateSiteDto
): Promise<SiteWithAddresses> {
  const { existing, updated } = await withTenantScope(accountId, async (tx) => {
    // The whole row, read in the same transaction as the write, so the audit
    // entry's before values are the ones this update actually replaced.
    const existing = await tx.site.findFirst({
      where: { id: siteId, accountId, deletedAt: null },
    })
    if (!existing) throw new NotFoundError('Site')

    const updated = await tx.site.update({
      where: { id: siteId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        // `nullish` means "omitted" and "explicitly null" are different
        // requests: the first leaves the budget alone, the second removes the
        // cap. Collapsing them would make an uncapped site unreachable.
        ...(dto.monthlyBudget !== undefined
          ? { monthlyBudget: dto.monthlyBudget }
          : {}),
        ...(dto.poRequired !== undefined ? { poRequired: dto.poRequired } : {}),
        ...(dto.poPrefix !== undefined ? { poPrefix: dto.poPrefix } : {}),
        ...(dto.poFormat !== undefined ? { poFormat: dto.poFormat } : {}),
        ...(dto.costCentre !== undefined ? { costCentre: dto.costCentre } : {}),
      },
      include: { addresses: { where: { deletedAt: null, isOneOff: false } } },
    })
    return { existing, updated }
  })

  await recordAudit({
    action: AuditAction.SITE_UPDATED,
    entityType: 'SITE',
    entityId: siteId,
    entityName: `${updated.code} — ${updated.name}`,
    accountId,
    changes: changesBetween(existing, updated, SITE_AUDIT_FIELDS),
  })

  return updated
}

/**
 * Soft delete. A site is referenced by historical orders and invoices, so the
 * row has to survive; deactivating it is what stops new orders being placed
 * against it.
 */
export async function deactivateSite(
  accountId: string,
  siteId: string
): Promise<void> {
  const site = await findSiteById(accountId, siteId)

  const deactivatedAt = new Date()
  const revoked = await withTenantScope(accountId, async (tx) => {
    const result = await tx.site.updateMany({
      where: { id: siteId, accountId, deletedAt: null },
      data: { status: 'INACTIVE', deletedAt: deactivatedAt },
    })
    if (result.count === 0) throw new NotFoundError('Site')

    // The extra-branch grants go with it, in the same commit.
    //
    // They are grants, not history: unlike the orders and invoices that keep the
    // site row alive, a row saying "this person may also order for Midtown" has
    // no meaning once Midtown takes no orders. Leaving them was worse than
    // untidy — a user carrying one could no longer be saved at all, because
    // `updateUser` re-validates every site in the set and the deactivated one
    // answers "Site not found". The frontend had grown a workaround for it.
    const cleared = await tx.userSiteAccess.deleteMany({ where: { siteId } })
    return cleared.count
  })

  await recordAudit({
    action: AuditAction.SITE_DEACTIVATED,
    entityType: 'SITE',
    entityId: siteId,
    entityName: `${site.code} — ${site.name}`,
    accountId,
    changes: changesBetween(
      site,
      { ...site, status: 'INACTIVE', deletedAt: deactivatedAt },
      ['status', 'deletedAt']
    ),
    // The other rows this touched: extra-branch grants that went with it.
    details: { revokedSiteAccessRows: revoked },
  })
}

export async function addSiteAddress(
  accountId: string,
  siteId: string,
  dto: AddSiteAddressDto,
  /** NZ Post's record for `dto.nzPostAddressId`, fetched by the caller. */
  verified: ReadonlyMap<string, ValidatedAddress> = new Map()
): Promise<SiteWithAddresses> {
  const { nzPostAddressId, ...fields } = dto
  const withAddress = await withTenantScope(accountId, async (tx) => {
    const existingSite = await tx.site.findFirst({
      where: { id: siteId, accountId, deletedAt: null },
      select: { id: true },
    })
    if (!existingSite) throw new NotFoundError('Site')

    // Exactly one default per site and kind. Cleared first so the pair can never
    // both be default, which would make the checkout picker's pre-selection
    // non-deterministic.
    const clearedDefaults = fields.isDefault
      ? (
          await tx.address.updateMany({
            where: {
              siteId,
              kind: fields.kind,
              deletedAt: null,
              isDefault: true,
            },
            data: { isDefault: false },
          })
        ).count
      : 0

    const address = await tx.address.create({
      data: {
        id: createId('adr'),
        accountId,
        siteId,
        ...fields,
        label: fields.label ?? null,
        recipientName: fields.recipientName ?? null,
        line2: fields.line2 ?? null,
        region: fields.region ?? null,
        phone: fields.phone ?? null,
        ...validatedColumns(verified, nzPostAddressId, fields.line2),
      },
    })

    const site = await tx.site.findFirstOrThrow({
      where: { id: siteId },
      include: { addresses: { where: { deletedAt: null, isOneOff: false } } },
    })
    return { site, address, clearedDefaults }
  })

  await recordAudit({
    action: AuditAction.SITE_ADDRESS_ADDED,
    entityType: 'SITE',
    entityId: siteId,
    entityName: `${withAddress.site.code} — ${withAddress.site.name}`,
    accountId,
    changes: createdValues(withAddress.address, ADDRESS_AUDIT_FIELDS),
    details: {
      addressId: withAddress.address.id,
      // A new default demotes the old one; that row changed too.
      previousDefaultsCleared: withAddress.clearedDefaults,
    },
  })

  return withAddress.site
}

/**
 * Validates a saved address through NZ Post after it was entered (SOW F-16), so
 * the address checkout defaults to carries the DPID and rural flag a label is
 * sent with. The lines become NZ Post's; a typed second line is kept.
 */
export async function validateSiteAddress(
  accountId: string,
  siteId: string,
  addressId: string,
  verified: ValidatedAddress
): Promise<SiteWithAddresses> {
  const result = await withTenantScope(accountId, async (tx) => {
    const before = await tx.address.findFirst({
      where: {
        id: addressId,
        siteId,
        accountId,
        deletedAt: null,
        isOneOff: false,
      },
    })
    if (!before) throw new NotFoundError('Address')

    const after = await tx.address.update({
      where: { id: addressId },
      data: nzPostAddressColumns(verified, before.line2),
    })
    const site = await tx.site.findFirstOrThrow({
      where: { id: siteId },
      include: { addresses: { where: { deletedAt: null, isOneOff: false } } },
    })
    return { before, after, site }
  })

  await recordAudit({
    action: AuditAction.SITE_ADDRESS_VALIDATED,
    entityType: 'SITE',
    entityId: siteId,
    entityName: `${result.site.code} — ${result.site.name}`,
    accountId,
    changes: changesBetween(result.before, result.after, ADDRESS_AUDIT_FIELDS),
    details: { addressId },
  })

  return result.site
}

/**
 * The NZ Post columns for an address being written, or nothing when it was not
 * validated. A validated id with no fetched record is a caller bug, and stops.
 */
function validatedColumns(
  verified: ReadonlyMap<string, ValidatedAddress>,
  nzPostAddressId: string | undefined,
  typedLine2: string | undefined
) {
  if (!nzPostAddressId) return {}
  const record = verified.get(nzPostAddressId)
  if (!record) {
    throw new Error(
      `NZ Post address ${nzPostAddressId} was not fetched before writing.`
    )
  }
  return nzPostAddressColumns(record, typedLine2)
}

/**
 * Resolves a site by its legacy `Outlets.Id`, creating nothing.
 *
 * Used during user provisioning to attach a replicated legacy user to their
 * branch when that branch has already been set up here. Returns null rather than
 * creating a placeholder site: a site carries budget and purchase-order rules
 * that only a human can supply, and inventing one with defaults would silently
 * give a branch an uncapped budget.
 */
export async function findSiteIdByLegacyOutletId(
  accountId: string,
  legacyOutletId: number
): Promise<string | null> {
  const site = await prisma.site.findFirst({
    where: { legacyOutletId, accountId, deletedAt: null },
    select: { id: true },
  })
  return site?.id ?? null
}

async function assertCodeIsFree(
  tx: TransactionClient,
  accountId: string,
  code: string
): Promise<void> {
  const clash = await tx.site.findFirst({
    where: { accountId, code },
    select: { id: true, deletedAt: true },
  })

  if (clash) {
    // A soft-deleted site still holds the code, because the unique index covers
    // every row. Say so, rather than letting the caller retry against a
    // constraint error they cannot interpret.
    throw new ConflictError(
      clash.deletedAt
        ? `Site code "${code}" belongs to a deactivated site and cannot be reused`
        : `Site code "${code}" is already in use in this account`,
      { details: { code } }
    )
  }
}
