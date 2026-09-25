import { Permission } from '@/server/auth/permissions'
import { createAccount, listAccounts } from '@/server/accounts/accounts.service'
import { toAccountView } from '@/server/accounts/account.types'
import {
  CreateAccountSchema,
  ListAccountsQuerySchema,
} from '@/server/accounts/account.validation'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'
import { parseJsonBody, parseQuery } from '@/server/utils/validation'

export const runtime = 'nodejs'

/**
 * GET /api/v1/accounts
 *
 * Cross-tenant by definition, so it runs outside any tenant scope and RLS does
 * not bound it. ACCOUNT_MANAGE is the whole protection — it is ADMIN-only in the
 * role baseline, and no customer role holds it.
 */
export const GET = route(
  { permissions: [Permission.ACCOUNT_MANAGE] },
  async ({ request, requestId }) => {
    const query = parseQuery(request, ListAccountsQuerySchema)
    const page = await listAccounts(query)

    return ok({ ...page, items: page.items.map(toAccountView) }, { requestId })
  }
)

/**
 * POST /api/v1/accounts
 *
 * Refuses a code whose slug collides with an existing account: the slug is how a
 * legacy login finds its account, so a collision would silently attach that
 * customer's users to this new row.
 */
export const POST = route(
  { permissions: [Permission.ACCOUNT_MANAGE] },
  async ({ request, actor, requestId }) => {
    const body = await parseJsonBody(request, CreateAccountSchema)
    return ok(toAccountView(await createAccount(body, actor)), {
      status: 201,
      requestId,
    })
  }
)
