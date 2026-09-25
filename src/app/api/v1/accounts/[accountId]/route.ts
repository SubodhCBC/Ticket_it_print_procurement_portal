import { Permission } from '@/server/auth/permissions'
import {
  deactivateAccount,
  findAccountById,
  updateAccount,
} from '@/server/accounts/accounts.service'
import { toAccountView } from '@/server/accounts/account.types'
import { UpdateAccountSchema } from '@/server/accounts/account.validation'
import { route } from '@/server/middleware/auth.middleware'
import { noContent, ok } from '@/server/utils/response'
import { parseJsonBody } from '@/server/utils/validation'

export const runtime = 'nodejs'

type Params = { accountId: string }

/** GET /api/v1/accounts/:accountId */
export const GET = route<Params>(
  { permissions: [Permission.ACCOUNT_MANAGE] },
  async ({ params, requestId }) => {
    return ok(toAccountView(await findAccountById(params.accountId)), {
      requestId,
    })
  }
)

/**
 * PATCH /api/v1/accounts/:accountId
 *
 * A status change is additionally logged as its own audit action rather than
 * folded into the diff — "who suspended this customer and when" is a question
 * people ask, and it should not require reading a field-level diff to answer.
 */
export const PATCH = route<Params>(
  { permissions: [Permission.ACCOUNT_MANAGE] },
  async ({ request, params, requestId }) => {
    const body = await parseJsonBody(request, UpdateAccountSchema)
    return ok(toAccountView(await updateAccount(params.accountId, body)), {
      requestId,
    })
  }
)

/**
 * DELETE /api/v1/accounts/:accountId
 *
 * Soft: invoices, orders and audit entries reference the account. The users are
 * deliberately left alone rather than cascaded — a mistaken deactivation must
 * not have rewritten hundreds of rows on the way.
 */
export const DELETE = route<Params>(
  { permissions: [Permission.ACCOUNT_MANAGE] },
  async ({ params, requestId }) => {
    await deactivateAccount(params.accountId)
    return noContent(requestId)
  }
)
