import { createHash } from 'node:crypto'
import type { User } from '@prisma/client'
import { AuditAction } from '../audit/audit.actions'
import { changesBetween } from '../audit/audit-changes'
import { recordAudit } from '../audit/audit.service'
import { revokeAllForUser } from '../auth/token.service'
import {
  completeTicketItPasswordReset,
  requestTicketItPasswordReset,
} from '../auth/ticketit/ticketit-auth.repository'
import { getConfig } from '../config'
import { prisma } from '../db/client'
import { sendPasswordResetEmail } from '../mail/mail.dispatcher'
import { BusinessRuleError, UnauthenticatedError } from '../utils/errors'
import { createId, createSecretToken } from '../utils/ids'
import { hashPassword, verifyPassword } from '../utils/password'

export interface ResetContext {
  readonly ip?: string
  readonly userAgent?: string
}

/**
 * Password reset, routed to whichever system owns the credential.
 *
 * ---------------------------------------------------------------------------
 * Two flows behind one pair of endpoints
 * ---------------------------------------------------------------------------
 * A Ticket-IT user has no password here at all — the login verifies against the
 * API on every sign-in and stores no hash — so there is nothing local to reset.
 * Their request is forwarded to `Account/SendForgotPasswordEmail`, and Ticket-IT
 * sends the mail and mints the token. A portal-native user, invited here and
 * unknown upstream, keeps the flow below: the portal's own token table, its own
 * email, its own expiry.
 *
 * Two consequences worth stating, because neither is obvious from the code:
 *
 *  - the mail a Ticket-IT user receives is Ticket-IT's, not the portal's. It
 *    carries their branding and their link, and `PORTAL_BASE_URL` has no say in
 *    it. `PASSWORD_RESET_TTL_MINUTES` does not apply to it either.
 *  - the completion step tells the two token formats apart by shape. Ticket-IT
 *    types its `passwordResetToken` as a uuid; the portal's is 43 characters of
 *    base64url with no dashes. They cannot be confused for one another.
 */

function digest(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Whether this user's password lives here rather than in Ticket-IT.
 *
 * `legacyUserId` is the column that records an upstream counterpart, and it is
 * the same discriminator `auth.service.ts` branches the login on — the two must
 * agree, or a user could reset a password that is never the one checked.
 */
function isPortalNative(user: User): boolean {
  return user.legacyUserId === null
}

/**
 * A Ticket-IT reset token: the uuid its `UserViewModel.passwordResetToken` is
 * typed as. The portal's own token is base64url and never contains a dash.
 */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Starts a reset. Always resolves, whatever the identifier was.
 *
 * The route answers 204 unconditionally: an endpoint that behaved differently
 * for a known and an unknown address would let anyone test whether a given
 * person has an account here.
 */
export async function requestPasswordReset(
  identifier: string,
  context: ResetContext = {}
): Promise<void> {
  const normalised = identifier.trim().toLowerCase()

  const user = await prisma.user.findFirst({
    // Login first: it is unique. Email is not — 159 groups of legacy users share
    // an address — so an email match takes the oldest row, and a user in that
    // situation has to use their login.
    where: {
      OR: [{ login: normalised }, { email: normalised }],
      deletedAt: null,
    },
    orderBy: { createdAt: 'asc' },
  })

  // No local row is not the same as no account. A Ticket-IT user who has never
  // signed in here has nothing to match, and they are exactly the person most
  // likely to be resetting a forgotten password — so the request is forwarded
  // upstream rather than dropped.
  if (!user) {
    console.debug(
      'Password reset requested for an identifier with no local user; forwarding to Ticket-IT.'
    )
    await requestTicketItPasswordReset(identifier)
    return
  }

  if (!isPortalNative(user)) {
    console.info(
      `Password reset for ${user.id} belongs to Ticket-IT; forwarding to it.`
    )
    // The display login, not the normalised one: it is the value Ticket-IT
    // stores, and the portal lowercases its own copy.
    await requestTicketItPasswordReset(user.loginDisplay)
    return
  }

  const token = createSecretToken(32)
  const expiresAt = new Date(
    Date.now() + getConfig().auth.passwordResetTtlMinutes * 60_000
  )

  await prisma.$transaction(async (tx) => {
    // Invalidate any outstanding token first. Two live reset links for one
    // account means the older one still works after the newer has been used.
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    })

    await tx.passwordResetToken.create({
      data: {
        id: createId('prt'),
        userId: user.id,
        tokenHash: digest(token),
        expiresAt,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    })
  })

  sendPasswordResetEmail({
    to: user.email,
    firstName: user.firstName,
    token,
    expiresAt,
  })

  // The requester is unauthenticated, so the actor is the account holder
  // themselves — this records that a reset was *asked for*, which is the signal
  // worth having when an account is later found compromised.
  await recordAudit({
    action: AuditAction.PASSWORD_RESET_REQUESTED,
    entityType: 'USER',
    entityId: user.id,
    entityName: `${user.firstName} ${user.lastName}`.trim() || user.login,
    accountId: user.accountId,
    actor: selfActor(user),
    details: { expiresAt: expiresAt.toISOString() },
  })

  console.info(`Password reset email sent for user ${user.id}.`)
}

/**
 * Completes a reset.
 *
 * Every existing session is revoked on success. A password is usually reset
 * because the old one may be known to someone else, and leaving their refresh
 * token live for another thirty days would make the reset cosmetic.
 */
export async function completePasswordReset(
  token: string,
  password: string
): Promise<void> {
  // Ticket-IT's own token, from Ticket-IT's own email. Nothing local can
  // resolve it, and the portal is only relaying the new password.
  if (UUID_PATTERN.test(token.trim())) {
    await completeTicketItPasswordReset(token.trim(), password)
    console.info('Password reset completed against Ticket-IT.')
    return
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: digest(token) },
    include: { user: true },
  })

  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new UnauthenticatedError(
      'This reset link is not valid or has already been used'
    )
  }

  if (record.user.deletedAt || record.user.status === 'DISABLED') {
    throw new BusinessRuleError('This account is not active')
  }

  // Re-checked at completion, not only at request: the user could have been
  // linked to a Ticket-IT account between the two, and this is the step that
  // actually writes. A portal token issued before that link is no longer a
  // credential for anything.
  if (!isPortalNative(record.user)) {
    throw new BusinessRuleError(
      'This account is managed in Ticket-IT. Request a new reset link and use the one Ticket-IT sends.'
    )
  }

  const passwordHash = await hashPassword(password)

  const resetUser = await prisma.$transaction(async (tx) => {
    const updatedUser = await tx.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        // An invited user who never signed in but did reset their password is
        // active from this moment.
        status: 'ACTIVE',
        activatedAt: record.user.activatedAt ?? new Date(),
      },
    })

    await tx.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    })
    return updatedUser
  })

  await revokeAllForUser(record.userId)

  await recordAudit({
    action: AuditAction.PASSWORD_RESET_COMPLETED,
    entityType: 'USER',
    entityId: record.userId,
    entityName:
      `${record.user.firstName} ${record.user.lastName}`.trim() ||
      record.user.login,
    accountId: record.user.accountId,
    actor: selfActor(record.user),
    // `passwordHash` is listed as changed and both values are redacted by
    // recordAudit — the log proves the credential moved without holding it.
    changes: changesBetween(record.user, resetUser, CREDENTIAL_AUDIT_FIELDS),
    details: { sessionsRevoked: true },
  })

  console.info(
    `Password reset completed for user ${record.userId}; sessions revoked.`
  )
}

/**
 * Changes a signed-in user's own password.
 *
 * Unlike the reset this proves the old credential first, so a token lifted from
 * an unlocked machine cannot be used to take the account over. Failure is
 * deliberately one message for both "no local password" and "wrong password":
 * distinguishing them tells an attacker holding a stolen token which accounts
 * are Ticket-IT-backed and therefore not worth attacking here.
 *
 * A Ticket-IT user cannot change their password from the portal at all — there
 * is no local hash to prove the old one against, and the API exposes no endpoint
 * that accepts a change on a token the portal holds. They use the reset flow
 * above, which Ticket-IT owns end to end.
 *
 * Every refresh token is revoked afterwards, so no session anywhere can be
 * renewed — if the reason for the change was that somebody else held the old
 * password, their session dies at its next refresh.
 *
 * Access tokens are stateless and are *not* revoked: one already issued keeps
 * working until it expires, up to fifteen minutes later. Saying this outright
 * matters, because "signs you out everywhere" is what a user will assume and it
 * is not quite true. Killing the window entirely needs a denylist checked on
 * every request, which is a different design decision from this one.
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user)
    throw new UnauthenticatedError('Sign in again to change your password')

  const wrong = new BusinessRuleError('That is not your current password')

  // A Ticket-IT user's password lives upstream, so there is no local hash to
  // check against and nothing here to change.
  if (!user.passwordHash) throw wrong
  if (!(await verifyPassword(currentPassword, user.passwordHash))) throw wrong

  const passwordHash = await hashPassword(newPassword)

  const changedUser = await prisma.user.update({
    where: { id: userId },
    data: { passwordHash, mustChangePassword: false },
  })

  await revokeAllForUser(userId)

  await recordAudit({
    action: AuditAction.PASSWORD_CHANGED,
    entityType: 'USER',
    entityId: userId,
    entityName: `${user.firstName} ${user.lastName}`.trim() || user.login,
    accountId: user.accountId,
    actor: selfActor(user),
    changes: changesBetween(user, changedUser, CREDENTIAL_AUDIT_FIELDS),
    details: { sessionsRevoked: true },
  })

  console.info(`Password changed by user ${userId}; sessions revoked.`)
}

/**
 * What a password change can move. `passwordHash` is here so the change is
 * recorded at all; its values never reach the log — see REDACTED_FIELDS.
 */
const CREDENTIAL_AUDIT_FIELDS = [
  'passwordHash',
  'mustChangePassword',
  'status',
  'activatedAt',
] as const

/** The user acting on their own credential, for the two unauthenticated steps. */
function selfActor(user: User) {
  return {
    userId: user.id,
    name: `${user.firstName} ${user.lastName}`.trim() || user.login,
    email: user.email,
    role: user.role as string,
    accountId: user.accountId,
  }
}
