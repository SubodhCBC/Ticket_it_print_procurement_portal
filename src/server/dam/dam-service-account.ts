import { authenticateTicketItServiceAccount } from '../auth/ticketit/ticketit-auth.repository'
import { getConfig } from '../config'
import { DependencyUnavailableError } from '../utils/errors'

/**
 * The portal's own Ticket-IT login, used for the operator's files and nothing
 * else.
 *
 * ---------------------------------------------------------------------------
 * Why this exists at all
 * ---------------------------------------------------------------------------
 * Everything else in `dam/` runs on the signed-in user's own token, and
 * `ticketit-token.store.ts` spells out why: Ticket-IT decides whose library to
 * return from the bearer token alone, so a service account browsing on a user's
 * behalf would show every tenant the same client's images. That argument holds
 * for *browsing* and it still does.
 *
 * It does not hold for artwork that is genuinely the operator's. The catalogue
 * is global — `CATALOG_MANAGE` is withheld from every customer role — so the
 * file behind a product image belongs to the portal, and reading it with the
 * portal's own credential is correct rather than a shortcut. The same goes for
 * templates in the operator's own library.
 *
 * It also fixes something the user token cannot: an admin who signed in as a
 * portal-native user (invited, seeded) has no Ticket-IT account and no token at
 * all, and could otherwise never attach an image to a product.
 *
 * ---------------------------------------------------------------------------
 * The boundary
 * ---------------------------------------------------------------------------
 * Two rules, and the second is easy to get wrong:
 *
 * 1. Every route under `/api/v1/dam` stays on the caller's own token. The moment
 *    a browsing endpoint uses this credential, one tenant is looking at
 *    another's artwork. `dam.service.ts` takes an actor for exactly that reason
 *    and this module takes none.
 *
 * 2. **Templates are not all the operator's.** `canManage` in
 *    `template-ownership.ts` lets any user edit a template they own, and
 *    `isCustomerOwned` marks the customer library. Attaching to one of those
 *    must use the customer's own token — `readDamFileAsActor` — or the portal
 *    would copy the operator's file of that name into a customer's template.
 *    Which credential to use follows from who owns the record, never from which
 *    table it is in.
 */

/**
 * Cached in the process rather than in Redis.
 *
 * It is one credential shared by every request, re-obtainable at any time by
 * logging in again, and worth nothing to an attacker who already has the
 * process. The Redis store exists because a *user's* token cannot be re-obtained
 * without that user's password; this one can.
 */
const globalForServiceToken = globalThis as unknown as {
  damServiceToken?: { token: string; expiresAt: number }
  damServiceTokenPending?: Promise<string>
}

/**
 * Re-obtained this long before the JWT's own expiry, so a call cannot straddle
 * the moment Ticket-IT starts refusing it.
 */
const EXPIRY_SKEW_SECONDS = 60

/** Used when the token carries no readable expiry: short enough to stay fresh. */
const FALLBACK_TTL_SECONDS = 15 * 60

export function isDamServiceAccountConfigured(): boolean {
  const { serviceAccount } = getConfig().dam
  return Boolean(serviceAccount.login && serviceAccount.password)
}

/**
 * A live token for the portal's own Ticket-IT account.
 *
 * Concurrent callers share one login: without the pending-promise latch, ten
 * parallel attaches on a cold process would each sign in, and Ticket-IT would
 * see a burst of logins for one account every time the cache lapsed.
 */
export async function recallDamServiceToken(): Promise<string> {
  const cached = globalForServiceToken.damServiceToken
  if (cached && cached.expiresAt > Date.now()) return cached.token

  if (globalForServiceToken.damServiceTokenPending) {
    return globalForServiceToken.damServiceTokenPending
  }

  const pending = signIn().finally(() => {
    globalForServiceToken.damServiceTokenPending = undefined
  })
  globalForServiceToken.damServiceTokenPending = pending
  return pending
}

/** Drops the cached token, so the next call signs in again. */
export function forgetDamServiceToken(): void {
  globalForServiceToken.damServiceToken = undefined
}

async function signIn(): Promise<string> {
  const { serviceAccount } = getConfig().dam
  if (!serviceAccount.login || !serviceAccount.password) {
    // Names the variables in the log, never in the response: which integration
    // credentials a deployment is missing is not the caller's business.
    console.warn(
      'A template or product asset needed the document library, but ' +
        'DAM_SERVICE_LOGIN and DAM_SERVICE_PASSWORD are not set.'
    )
    throw new DependencyUnavailableError('The image library')
  }

  const token = await authenticateTicketItServiceAccount(
    serviceAccount.login,
    serviceAccount.password
  )

  globalForServiceToken.damServiceToken = {
    token,
    expiresAt: Date.now() + ttlSeconds(token) * 1000,
  }
  return token
}

/** The JWT's own `exp`, read without verifying — Ticket-IT verifies its own. */
function ttlSeconds(token: string): number {
  const payload = token.split('.')[1]
  if (!payload) return FALLBACK_TTL_SECONDS

  try {
    const claims: unknown = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8')
    )
    const exp =
      typeof claims === 'object' && claims !== null
        ? (claims as Record<string, unknown>).exp
        : undefined
    if (typeof exp !== 'number' || !Number.isFinite(exp)) {
      return FALLBACK_TTL_SECONDS
    }

    const remaining = Math.floor(exp - Date.now() / 1000) - EXPIRY_SKEW_SECONDS
    return remaining > 0 ? remaining : FALLBACK_TTL_SECONDS
  } catch {
    return FALLBACK_TTL_SECONDS
  }
}
