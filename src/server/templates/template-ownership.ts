import type { Prisma, Template } from '@prisma/client'
import { categoryVisibilityFilter } from '../catalog/category-visibility'
import { Role, type AuthenticatedActor } from '../context/request-context'
import { ForbiddenError } from '../utils/errors'
import { CUSTOMER_VISIBLE_STATUSES } from './template-status'

/**
 * Who a template belongs to, who may see it, and who may change it.
 *
 * ---------------------------------------------------------------------------
 * Why this is a rule about the row
 * ---------------------------------------------------------------------------
 * Templates began as the operator's library alone: `TEMPLATE_MANAGE` is in no
 * customer role, and the route permission was the whole of the authorisation.
 * Customers build now too, and the obvious way to allow that — grant
 * `TEMPLATE_MANAGE` to head office and site users — would also let them edit,
 * publish and delete the operator's originals. There is no permission that says
 * "manage, but only your own".
 *
 * So the question moved from the person to the row: you may change a template if
 * you hold the permission *or* you own it. `TEMPLATE_MANAGE` keeps meaning
 * exactly what it meant, and nobody gains reach over anyone else's work.
 *
 * ---------------------------------------------------------------------------
 * The four scopes
 * ---------------------------------------------------------------------------
 *   ALL_ACCOUNTS  the operator's library, visible to every customer
 *   RESTRICTED    the operator's, granted to named accounts
 *   ACCOUNT       a head office's, visible to that account's users
 *   PRIVATE       a site user's own, visible to nobody else
 *
 * A customer's scope follows from their role rather than being chosen: a site
 * user cannot decide to publish to the whole account, and a head office cannot
 * publish into the operator's library. Making it a field they could set would
 * make it a field they could set wrongly.
 */

export const TemplateVisibility = {
  ALL_ACCOUNTS: 'ALL_ACCOUNTS',
  RESTRICTED: 'RESTRICTED',
  ACCOUNT: 'ACCOUNT',
  PRIVATE: 'PRIVATE',
} as const

export type TemplateVisibility =
  (typeof TemplateVisibility)[keyof typeof TemplateVisibility]

/** Just enough of a template row to decide anything here. */
export interface OwnedTemplate {
  readonly visibility: string
  readonly ownerUserId: string | null
  readonly ownerAccountId: string | null
}

/**
 * The ownership a new template takes from whoever is creating it.
 *
 * Not a choice the caller makes. An administrator builds the operator's
 * library; a head office builds for its branches; a site user builds for itself.
 */
export function ownershipForCreator(actor: AuthenticatedActor): {
  visibility: TemplateVisibility
  ownerUserId: string | null
  ownerAccountId: string | null
} {
  if (actor.role === Role.ADMIN) {
    return {
      visibility: TemplateVisibility.ALL_ACCOUNTS,
      ownerUserId: null,
      ownerAccountId: null,
    }
  }

  if (actor.role === Role.HEAD_OFFICE) {
    return {
      visibility: TemplateVisibility.ACCOUNT,
      // Recorded even though the account is what scopes it: "who built this"
      // is the first question asked when a branch queries a template, and
      // ACCOUNT templates outlive the person who made them.
      ownerUserId: actor.userId,
      ownerAccountId: actor.accountId,
    }
  }

  return {
    visibility: TemplateVisibility.PRIVATE,
    ownerUserId: actor.userId,
    ownerAccountId: actor.accountId,
  }
}

/**
 * Which templates this actor may see.
 *
 * An administrator sees everything, including drafts, because building the
 * library is their job. Everyone else sees three things: the operator's
 * published library, whatever their head office has published to the account,
 * and their own work at any status — a draft nobody else can see is still one
 * its author has to be able to open.
 *
 * The one asymmetry is deliberate. A head office sees its account's drafts
 * because it is the author of them; a site user sees only what the head office
 * has published, for the same reason a customer does not see the operator's
 * half-finished designs.
 *
 * ---------------------------------------------------------------------------
 * Restricted categories (SOW AD-5)
 * ---------------------------------------------------------------------------
 * The operator's library also has to respect the category's audience. A design
 * published to all accounts but filed under a category restricted to one
 * customer used to appear in every other customer's gallery, where it could
 * neither be ordered — its product was hidden — nor explained, and where its
 * name advertised a contract line to people who do not hold it.
 *
 * Only the operator's library. A customer's own copy (ACCOUNT, PRIVATE, or
 * anything they own) stays visible to them whatever happens to the category
 * later: it is their work, and hiding it from its author would look like it had
 * been deleted. A template with no category is not narrowed at all.
 */
export function visibilityFilter(
  actor: AuthenticatedActor
): Prisma.TemplateWhereInput {
  if (actor.role === Role.ADMIN) return {}

  const published = {
    status: { in: [...CUSTOMER_VISIBLE_STATUSES] as string[] },
  }

  const categoryVisible: Prisma.TemplateWhereInput = {
    OR: [{ categoryId: null }, { category: categoryVisibilityFilter(actor) }],
  }

  const operatorLibrary: Prisma.TemplateWhereInput[] = [
    {
      ...published,
      ...categoryVisible,
      visibility: TemplateVisibility.ALL_ACCOUNTS,
    },
    {
      ...published,
      ...categoryVisible,
      visibility: TemplateVisibility.RESTRICTED,
      visibleTo: { some: { accountId: actor.accountId } },
    },
  ]

  const accountLibrary: Prisma.TemplateWhereInput =
    actor.role === Role.HEAD_OFFICE
      ? {
          visibility: TemplateVisibility.ACCOUNT,
          ownerAccountId: actor.accountId,
        }
      : {
          ...published,
          visibility: TemplateVisibility.ACCOUNT,
          ownerAccountId: actor.accountId,
        }

  return {
    OR: [...operatorLibrary, accountLibrary, { ownerUserId: actor.userId }],
  }
}

/**
 * Whether this actor may change this template.
 *
 * `TEMPLATE_MANAGE` is checked at the route and means the operator's library.
 * This is the other half: your own work, whatever role you hold.
 */
export function canManage(
  actor: AuthenticatedActor,
  template: OwnedTemplate
): boolean {
  if (actor.role === Role.ADMIN) return true

  // Your own, whoever you are.
  if (template.ownerUserId !== null && template.ownerUserId === actor.userId) {
    return true
  }

  // A head office owns its account's library, including templates a colleague
  // in the same head office created — the account is the author, not the person.
  return (
    actor.role === Role.HEAD_OFFICE &&
    template.visibility === TemplateVisibility.ACCOUNT &&
    template.ownerAccountId === actor.accountId
  )
}

/**
 * Whether this actor may publish this template.
 *
 * Narrower than managing, and the difference is the point: publishing is what
 * makes a design visible to other people. A site user may build and edit
 * endlessly in private; making something everyone in the branch will print is a
 * head office decision.
 */
export function canPublish(
  actor: AuthenticatedActor,
  template: OwnedTemplate
): boolean {
  if (actor.role === Role.SITE_USER) return false
  return canManage(actor, template)
}

export function assertCanManage(
  actor: AuthenticatedActor,
  template: OwnedTemplate
): void {
  if (canManage(actor, template)) return

  // Deliberately the same message whether the template belongs to someone else
  // or to the operator. Which it is, is not the caller's business.
  throw new ForbiddenError('This template is not yours to change.')
}

export function assertCanPublish(
  actor: AuthenticatedActor,
  template: OwnedTemplate
): void {
  if (canPublish(actor, template)) return

  if (actor.role === Role.SITE_USER) {
    throw new ForbiddenError(
      'Publishing a template is a head office decision. Yours stays private, ' +
        'and you can go on editing it.'
    )
  }
  throw new ForbiddenError('This template is not yours to publish.')
}

/** True when the row belongs to a customer rather than to the operator. */
export function isCustomerOwned(
  template: Pick<Template, 'visibility'>
): boolean {
  return (
    template.visibility === TemplateVisibility.ACCOUNT ||
    template.visibility === TemplateVisibility.PRIVATE
  )
}
