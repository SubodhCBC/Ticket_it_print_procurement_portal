import { Permission } from '@/server/auth/permissions'
import { getDamStatus } from '@/server/dam/dam.service'
import { route } from '@/server/middleware/auth.middleware'
import { ok } from '@/server/utils/response'

export const runtime = 'nodejs'

/**
 * GET /api/v1/dam/status
 *
 * Whether the image library can be offered to this user, answered without
 * calling Ticket-IT. `connected` means the portal holds a Ticket-IT session for
 * them, not that Ticket-IT will still accept it — the first library call finds
 * that out, and answers TICKETIT_SESSION_REQUIRED if not.
 */
export const GET = route(
  { permissions: [Permission.DAM_VIEW] },
  async ({ actor, requestId }) => ok(await getDamStatus(actor), { requestId })
)
