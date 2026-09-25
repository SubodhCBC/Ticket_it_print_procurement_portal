import { createHash } from 'node:crypto'
import type { User } from '@prisma/client'
import { prisma } from '../db/client'
import { createId } from '../utils/ids'
import type { UpstreamUserRecord } from './upstream-user'
import { mapLegacyRole, toAccountSlug } from './role-mapping'

/**
 * Fields that, when they change upstream, must be reflected locally. Used to
 * build the fingerprint stored on `User.legacyFingerprint`, so a re-sync can
 * skip the write when the upstream record has not moved.
 *
 * Deliberately excludes the password: the portal never stores one for a
 * Ticket-IT user, and the credential is re-verified upstream on every sign-in.
 *
 * A field upstream did not report is folded in as the literal `?`, distinct
 * from a reported empty value — so a response that stops carrying `outletId`
 * changes the fingerprint once and then settles, rather than alternating.
 */
function fingerprint(record: UpstreamUserRecord): string {
  const material = [
    record.login,
    record.email,
    record.firstName,
    record.lastName,
    record.phone ?? '',
    record.client,
    record.regionName ?? '',
    record.groupName ?? '',
    record.outletId === undefined ? '?' : String(record.outletId ?? ''),
    String(record.isActive),
    String(record.isHeadOfficeAdmin),
    record.mustChangePassword === undefined
      ? '?'
      : String(record.mustChangePassword),
    record.upstreamRoleName ?? '',
  ].join(' ')

  return createHash('sha256').update(material).digest('hex')
}

/**
 * Creates or refreshes the local replica of a Ticket-IT user.
 *
 * Runs in a transaction with the account upsert: a user row pointing at an
 * account that failed to commit would break every subsequent login for that
 * user with a foreign-key error.
 *
 * No password is stored. Ticket-IT is the sole authority for these credentials,
 * so `passwordHash` is actively cleared below rather than merely left unset — a
 * user replicated before this change still carries the Argon2id hash of
 * whatever their password was then, and leaving it behind would keep a stale
 * credential on disk that nothing can ever invalidate.
 */
export async function syncFromUpstream(
  record: UpstreamUserRecord
): Promise<User> {
  const role = mapLegacyRole(record.upstreamRoleName)
  const slug = toAccountSlug(record.client)
  const now = new Date()
  const legacyFingerprint = fingerprint(record)

  return prisma.$transaction(async (tx) => {
    const account = await tx.account.upsert({
      where: { slug },
      create: {
        id: createId('acc'),
        slug,
        // Seeded from the slug, exactly as the 20260104000000 migration
        // back-filled the accounts that predate this column. An administrator
        // renames it in the admin portal; nothing here can know the
        // customer-facing code, because the legacy schema has no accounts table
        // to read one from.
        accountCode: slug.toUpperCase(),
        legacyClient: record.client,
        name: record.client.trim() || slug,
      },
      // The raw client string can be re-cased upstream without changing the
      // slug; keep the display copy current, but never rename the account.
      update: { legacyClient: record.client },
    })

    // Attach the user to their branch when that branch has already been set up
    // here. Nothing is created if it has not: a site carries a budget and
    // purchase-order rules that only a human can supply, and inventing one with
    // defaults would quietly give a branch an uncapped budget. The user simply
    // has no site until an administrator creates it, and the next re-sync picks
    // it up.
    // `undefined` means the API did not report a branch at all — distinct from
    // `null`, which means it reported the user has none. Only a real id is
    // worth a lookup.
    const site =
      typeof record.outletId !== 'number'
        ? null
        : await tx.site.findFirst({
            where: {
              legacyOutletId: record.outletId,
              accountId: account.id,
              deletedAt: null,
            },
            select: { id: true },
          })

    const shared = {
      accountId: account.id,
      // Only set when a match exists, so a re-sync never clears a branch an
      // administrator attached by hand.
      ...(site ? { siteId: site.id } : {}),
      // A user who exists upstream is EXISTING by definition. Stated rather
      // than left to the column default so a re-sync repairs the row if it was
      // ever changed by hand.
      userType: 'EXISTING' as const,
      login: record.login.trim().toLowerCase(),
      loginDisplay: record.login.trim(),
      email: record.email.trim(),
      firstName: record.firstName,
      lastName: record.lastName,
      phone: record.phone,
      // `Role` and the Prisma `PortalRole` enum are the same three string
      // literals.
      role,
      status: record.isActive ? ('ACTIVE' as const) : ('DISABLED' as const),
      legacyRoleName: record.upstreamRoleName,
      legacyRegionName: record.regionName,
      legacyGroupName: record.groupName,
      // The two fields `UserViewModel` has no place for. Written only when the
      // response actually carried one: overwriting a stored branch id with null
      // because the API never mentions branches would detach every replicated
      // user from their site on their next sign-in.
      ...(record.outletId === undefined
        ? {}
        : { legacyOutletId: record.outletId }),
      ...(record.mustChangePassword === undefined
        ? {}
        : { mustChangePassword: record.mustChangePassword }),
      isHeadOfficeAdmin: record.isHeadOfficeAdmin,
      legacySyncedAt: now,
      legacyFingerprint,
      // See the note above: never a local credential for a Ticket-IT user.
      passwordHash: null,
    }

    return tx.user.upsert({
      // legacyUserId, not login: a login can be renamed upstream, and matching
      // on the renamed value would create a duplicate user instead of updating
      // the existing one. The column keeps its name — `UserViewModel.userId` is
      // the same integer the legacy `Users.Id` held, so the stored values are
      // unchanged and renaming it would only cost a migration.
      where: { legacyUserId: record.upstreamUserId },
      create: {
        id: createId('usr'),
        legacyUserId: record.upstreamUserId,
        ...shared,
      },
      update: shared,
    })
  })
}

/*
 * `isStale` and `hasChanged` used to live here, to bound how long a role change
 * or deactivation upstream could go unnoticed while logins were being served
 * from the local password hash.
 *
 * Neither has anything left to do. Every Ticket-IT login now calls the API and
 * re-syncs from the profile it returns, so the replica is never more than one
 * sign-in old and there is no staleness window to measure.
 */
