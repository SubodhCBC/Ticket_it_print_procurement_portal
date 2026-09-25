import type { Account, AccountSettings, Prisma } from '@prisma/client'
import { AuditAction } from '../audit/audit.actions'
import {
  changesBetween,
  mergeChanges,
  type AuditChanges,
} from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import { withTenantScope } from '../db/client'
import { NotFoundError } from '../utils/errors'
import { createId } from '../utils/ids'
import type { UpdateSettingsDto } from './settings.validation'

export interface AccountWithSettings {
  account: Account
  settings: AccountSettings
}

/**
 * An account's operational preferences.
 *
 * The screen behind this is one form over two tables. `accounts` already owned
 * the purchase-order rule, the approval threshold and the customer-facing name
 * long before there was a settings page, and moving them would have broken every
 * reader; the rest lives in `account_settings`. Both are written in one
 * transaction so a half-saved form cannot leave the two disagreeing.
 */

/**
 * Reads the settings, creating the row the first time anyone asks.
 *
 * Upserting on read rather than seeding on account creation means accounts that
 * predate this table behave identically to new ones, with no backfill migration
 * to keep in step with the defaults declared in the schema.
 */
export async function settingsForAccount(
  accountId: string
): Promise<AccountWithSettings> {
  return withTenantScope(accountId, async (tx) => {
    const account = await tx.account.findFirst({
      where: { id: accountId, deletedAt: null },
    })
    if (!account) throw new NotFoundError('Account not found')

    const settings = await tx.accountSettings.upsert({
      where: { accountId },
      create: { id: createId('ast'), accountId },
      update: {},
    })

    return { account, settings }
  })
}

export async function updateSettings(
  accountId: string,
  dto: UpdateSettingsDto,
  actorLabel: string
): Promise<AccountWithSettings> {
  const before = await settingsForAccount(accountId)

  const accountData: Prisma.AccountUpdateInput = {}
  if (dto.accountName !== undefined) accountData.name = dto.accountName
  if (dto.requirePoNumber !== undefined)
    accountData.requirePoNumber = dto.requirePoNumber
  if (dto.poPrefix !== undefined)
    accountData.poPrefix = emptyToNull(dto.poPrefix)
  // Already trimmed, parsed and blank-to-null by `PoFormatField`.
  if (dto.poFormat !== undefined) accountData.poFormat = dto.poFormat
  if (dto.approvalThreshold !== undefined)
    accountData.approvalThreshold = dto.approvalThreshold

  const settingsData: Prisma.AccountSettingsUpdateInput = {}
  assign(settingsData, 'currency', dto.currency)
  assign(settingsData, 'timezone', dto.timezone)
  assign(settingsData, 'enforceMoq', dto.enforceMoq)
  assign(settingsData, 'allowBackorders', dto.allowBackorders)
  assign(settingsData, 'requireDeliveryNotes', dto.requireDeliveryNotes)
  assign(
    settingsData,
    'allowCustomDeliveryAddress',
    dto.allowCustomDeliveryAddress
  )
  assign(settingsData, 'pricesIncludeGst', dto.pricesIncludeGst)
  assign(settingsData, 'gstRatePercent', dto.gstRatePercent)
  assign(settingsData, 'sendOrderConfirmations', dto.sendOrderConfirmations)
  assign(settingsData, 'sendLowStockAlerts', dto.sendLowStockAlerts)
  assign(settingsData, 'lowStockAlertThreshold', dto.lowStockAlertThreshold)
  assign(settingsData, 'sendMonthlyBillingDigest', dto.sendMonthlyBillingDigest)
  assign(settingsData, 'sessionTimeoutMinutes', dto.sessionTimeoutMinutes)
  assign(settingsData, 'enforceTwoFactor', dto.enforceTwoFactor)
  if (dto.orderNumberPrefix !== undefined)
    settingsData.orderNumberPrefix = emptyToNull(dto.orderNumberPrefix)
  if (dto.notificationEmail !== undefined)
    settingsData.notificationEmail = emptyToNull(dto.notificationEmail)

  const after = await withTenantScope(accountId, async (tx) => {
    // One transaction: the approval threshold and the ordering rules are read
    // together on every checkout, and a form that saved one but not the other
    // would leave orders being judged against a rule nobody chose.
    const account =
      Object.keys(accountData).length > 0
        ? await tx.account.update({
            where: { id: accountId },
            data: accountData,
          })
        : before.account

    const settings =
      Object.keys(settingsData).length > 0
        ? await tx.accountSettings.update({
            where: { accountId },
            data: settingsData,
          })
        : before.settings

    return { account, settings }
  })

  const changes = settingsChanges(before, after)
  const changed = Object.keys(changes.after)
  if (changed.length > 0) {
    await recordAudit({
      action: AuditAction.ACCOUNT_SETTINGS_UPDATED,
      entityType: 'ACCOUNT',
      entityId: accountId,
      entityName: after.account.name,
      accountId,
      // The fields that moved, from what and to what — an audit line reading
      // only "settings updated" cannot answer who turned approvals off.
      changes,
    })
    console.info(
      `Settings updated for account ${accountId} by ${actorLabel}: ${changed.join(', ')}.`
    )
  }

  return after
}

/** Copy a value across only when the caller actually sent it. */
function assign<T extends object, K extends keyof T>(
  target: T,
  key: K,
  value: T[K] | undefined
) {
  if (value !== undefined) target[key] = value
}

/** A cleared text input arrives as '' and means "unset", not "the empty string". */
function emptyToNull(value: string | null): string | null {
  if (value === null) return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** Only the fields that actually moved, as `{ field: { from, to } }`. */
/**
 * What a settings save changed, across both rows it writes.
 *
 * Field names do not collide between the two tables, so one flat map reads the
 * way the settings screen does — one form, one list of changes.
 */
function settingsChanges(
  before: AccountWithSettings,
  after: AccountWithSettings
): AuditChanges {
  return mergeChanges(
    changesBetween(before.account, after.account, [
      'name',
      'requirePoNumber',
      'poPrefix',
      'poFormat',
      'approvalThreshold',
    ]),
    changesBetween(before.settings, after.settings, [
      'currency',
      'timezone',
      'orderNumberPrefix',
      'enforceMoq',
      'allowBackorders',
      'requireDeliveryNotes',
      'allowCustomDeliveryAddress',
      'pricesIncludeGst',
      'gstRatePercent',
      'sendOrderConfirmations',
      'notificationEmail',
      'sendLowStockAlerts',
      'lowStockAlertThreshold',
      'sendMonthlyBillingDigest',
      'sessionTimeoutMinutes',
      'enforceTwoFactor',
    ])
  )
}
