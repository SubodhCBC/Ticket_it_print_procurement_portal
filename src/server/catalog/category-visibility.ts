import type { Prisma } from '@prisma/client'
import { Role, type AuthenticatedActor } from '../context/request-context'

/**
 * Which categories this actor may see (SOW AD-5: per-account visibility "at
 * category and product level").
 *
 * An administrator sees every category. Everyone else sees ALL_ACCOUNTS ones and
 * RESTRICTED ones their account is on — an EXISTS on
 * `category_account_visibility`, indexed on accountId like its product twin.
 *
 * Its own module, with nothing but types for imports, because three readers need
 * it and one of them cannot reach `products.service`: the template ownership
 * rules are imported by the DAM service account, which `products.service`
 * already imports, so pulling the product service in from there would close a
 * cycle. `products.service` re-exports it, so callers that already use the
 * catalogue service need not know it moved.
 */
export function categoryVisibilityFilter(
  actor: AuthenticatedActor
): Prisma.ProductCategoryWhereInput {
  if (actor.role === Role.ADMIN) return {}

  return {
    OR: [
      { visibility: 'ALL_ACCOUNTS' },
      {
        visibility: 'RESTRICTED',
        visibleTo: { some: { accountId: actor.accountId } },
      },
    ],
  }
}
