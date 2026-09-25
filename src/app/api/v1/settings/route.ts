import { Permission } from '@/server/auth/permissions'
import { route } from '@/server/middleware/auth.middleware'
import {
  settingsForAccount,
  updateSettings,
} from '@/server/settings/settings.service'
import { toSettingsView } from '@/server/settings/settings.types'
import { UpdateSettingsSchema } from '@/server/settings/settings.validation'
import { ok } from '@/server/utils/response'
import { resolveAccountId } from '@/server/utils/tenant'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

function requestedAccount(request: Request): string | undefined {
  return new URL(request.url).searchParams.get('accountId') ?? undefined
}

/**
 * GET /api/v1/settings
 *
 * One form over two tables. The settings row is created on first read rather
 * than seeded when the account is, so accounts predating the table behave
 * identically to new ones with no backfill to keep in step.
 */
export const GET = route(
  { permissions: [Permission.ACCOUNT_MANAGE] },
  async ({ request, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    const { account, settings } = await settingsForAccount(accountId)

    return ok(toSettingsView(account, settings), { requestId })
  }
)

/**
 * PATCH /api/v1/settings
 *
 * Both tables are written in one transaction: the approval threshold and the
 * ordering rules are read together on every checkout, and a form that saved one
 * but not the other would leave orders judged against a rule nobody chose.
 *
 * The audit entry names the fields that moved and what they moved to — a line
 * reading only "settings updated" cannot answer who turned approvals off.
 */
export const PATCH = route(
  { permissions: [Permission.ACCOUNT_MANAGE] },
  async ({ request, actor, requestId }) => {
    const accountId = resolveAccountId(actor, requestedAccount(request))
    const body = await parseJsonBody(request, UpdateSettingsSchema)

    const { account, settings } = await updateSettings(
      accountId,
      body,
      actor.email
    )
    return ok(toSettingsView(account, settings), { requestId })
  }
)
