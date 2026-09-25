import { Role, type AuthenticatedActor } from '../context/request-context'
import { asEnum } from '../db/column-types'
import { ForbiddenError } from '../utils/errors'

/**
 * Who may hand out which role.
 *
 * ---------------------------------------------------------------------------
 * Why a permission was not enough
 * ---------------------------------------------------------------------------
 * USER_INVITE and USER_MANAGE say *that* someone administers people. They say
 * nothing about how far up that reach goes, and until this file existed it went
 * all the way: head office could invite a platform ADMIN, or promote one of
 * their own users into one, and an ADMIN acts across every account rather than
 * inside the one that granted it. One tenant could mint themselves an operator.
 *
 * The admin screens never offered the choice. That is not a control — the API
 * is the boundary, and a field the UI hides is a field a client can still send.
 *
 * ---------------------------------------------------------------------------
 * The rule
 * ---------------------------------------------------------------------------
 * Nobody grants a role above their own, and nobody rewrites the role of someone
 * who already outranks them. Equal rank is deliberately allowed: head office
 * appointing a peer is ordinary administration, and an account that cannot
 * appoint its own second administrator turns every staffing change into a
 * support ticket.
 *
 * Kept beside the user services rather than inside either one because both the
 * invitation path and the update path are the same hole, and a rule enforced in
 * one place is a rule the other path forgets.
 */
const RANK: Readonly<Record<Role, number>> = {
  [Role.SITE_USER]: 0,
  [Role.HEAD_OFFICE]: 1,
  [Role.ADMIN]: 2,
}

function outranks(role: Role, actor: AuthenticatedActor): boolean {
  return RANK[role] > RANK[actor.role]
}

/**
 * Refuses granting a role the actor does not hold themselves.
 *
 * Called before anything is written or emailed: an invitation that will be
 * refused must not first revoke the invitee's outstanding one.
 */
export function assertMayGrantRole(
  actor: AuthenticatedActor,
  role: Role
): void {
  if (!outranks(role, actor)) return

  throw new ForbiddenError(
    `Granting the ${role} role needs that role yourself.`,
    { details: { role, actorRole: actor.role } }
  )
}

/**
 * Refuses rewriting the role of someone who outranks the actor.
 *
 * The other half of the same hole. Blocking only the grant would still let head
 * office demote an administrator to a site user and take the account that way —
 * a privilege change is a privilege change in either direction.
 */
export function assertMayChangeRoleOf(
  actor: AuthenticatedActor,
  currentRole: string
): void {
  const role = asEnum<Role>(currentRole)
  if (!outranks(role, actor)) return

  throw new ForbiddenError(
    `Changing the role of ${role === Role.ADMIN ? 'an' : 'a'} ${role} needs that role yourself.`,
    { details: { targetRole: role, actorRole: actor.role } }
  )
}
