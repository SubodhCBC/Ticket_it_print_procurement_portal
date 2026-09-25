import { Role, type AuthenticatedActor } from '../context/request-context'
import { ForbiddenError } from './errors'

/**
 * Resolves which account a request is acting on.
 *
 * Refuses rather than silently rewriting: a head-office user who passes another
 * tenant's `accountId` has either been handed a bad link or is probing, and
 * answering with their *own* account's data would look like the request
 * succeeded. Only ADMIN — the platform operator — may name an account other
 * than their own.
 */
export function resolveAccountId(
  actor: AuthenticatedActor,
  requested?: string
): string {
  if (!requested || requested === actor.accountId) return actor.accountId

  if (actor.role !== Role.ADMIN) {
    throw new ForbiddenError('You may only act on your own account', {
      details: { requestedAccountId: requested },
    })
  }
  return requested
}
