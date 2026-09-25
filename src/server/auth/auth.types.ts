import type { Account, Prisma, Site, User } from '@prisma/client'
import { resolvePurchaseOrderPolicy } from '../cart/purchase-order'
import type { Role, UserType } from '../context/request-context'
import type { Permission } from './permissions'
import type { IssuedTokens } from './token.service'
import { asEnum } from '../db/column-types'

/**
 * The user row together with the two rows the portal always renders beside it.
 *
 * Loaded in one query rather than fetched by the client afterwards: every
 * screen shows the account name and the branch a user is ordering for, so a
 * session that reported only ids would force a second round trip before the
 * first frame could be drawn.
 */
export interface AuthenticatedUserRecord {
  readonly user: User
  readonly account: Pick<
    Account,
    'id' | 'name' | 'accountCode' | 'poPrefix' | 'requirePoNumber' | 'poFormat'
  >
  readonly site: Pick<
    Site,
    | 'id'
    | 'code'
    | 'name'
    | 'poPrefix'
    | 'poRequired'
    | 'poFormat'
    | 'monthlyBudget'
  > | null
  /** Account-wide effective permissions — the role baseline plus per-user grants. */
  readonly permissions: readonly Permission[]
}

/**
 * The user as the API exposes them.
 *
 * Built by an explicit whitelist rather than by spreading the row and deleting
 * fields: a column added to the model later — a password hash, an internal flag
 * — must not appear in an API response because someone forgot to exclude it.
 * Adding a field here is a deliberate act.
 *
 * The client's mirror of this shape is `ApiUser` in `src/types/auth.ts`; the
 * two must stay in step.
 */
export interface AuthenticatedUserView {
  readonly id: string
  readonly login: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  /** `firstName lastName`, falling back to the login when both are blank. */
  readonly fullName: string
  readonly role: Role
  readonly userType: UserType
  readonly accountId: string
  readonly accountName: string
  readonly accountCode: string
  /** Null for ADMIN and for account-wide HEAD_OFFICE users. */
  readonly siteId: string | null
  readonly siteCode: string | null
  readonly siteName: string | null
  readonly phone: string | null
  readonly department: string | null
  /**
   * The user's own ceiling, else the site's, else null for uncapped.
   *
   * A single number, kept for the screens that render one. It cannot express
   * what checkout actually enforces: both caps apply at once, and a buyer with
   * a 250 ceiling inside a branch capped at 8,500 is limited by whichever runs
   * out first. The two below say which is which, and the authority is the cart
   * validation (`budget` and `userBudget`), re-checked at placement.
   */
  readonly monthlyBudgetCap: number | null
  /** This buyer's own cap across every branch (AD-4). Null when they have none. */
  readonly userMonthlyBudgetCap: number | null
  /** Their branch's cap, which every buyer at that branch shares. */
  readonly siteMonthlyBudgetCap: number | null
  /** The user's override, else the site's, else the account default. */
  readonly poPrefix: string | null
  readonly poRequired: boolean
  /**
   * The PO format in force for this user's branch (SOW F-14): the site's, else
   * the account's, else null. Checkout does not read this — it takes the rule
   * from cart validation, which is re-checked at placement — so it is for other
   * clients that render a PO field from the session alone.
   */
  readonly poFormat: string | null
  /** A reference that fits `poFormat`, for a placeholder. Null with no format. */
  readonly poFormatExample: string | null
  readonly mustChangePassword: boolean
  readonly isHeadOfficeAdmin: boolean
  readonly lastLoginAt: string | null
  /**
   * What this user may do, so the client can hide what it must not offer.
   * Advisory only — every route re-checks server side.
   */
  readonly permissions: readonly Permission[]
}

export interface LoginResponse {
  readonly accessToken: string
  readonly refreshToken: string
  readonly tokenType: 'Bearer'
  readonly expiresIn: number
  readonly user: AuthenticatedUserView
}

export function toUserView(
  record: AuthenticatedUserRecord
): AuthenticatedUserView {
  const { user, account, site, permissions } = record

  const fullName = `${user.firstName} ${user.lastName}`.trim()

  // Resolved by the same function checkout uses, so the session can never name
  // a different format from the one the basket is then refused against.
  const poPolicy = resolvePurchaseOrderPolicy({
    site: site
      ? {
          poRequired: site.poRequired,
          poPrefix: site.poPrefix,
          poFormat: site.poFormat,
        }
      : null,
    account,
  })

  return {
    id: user.id,
    login: user.loginDisplay,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    fullName: fullName.length > 0 ? fullName : user.loginDisplay,
    role: asEnum<Role>(user.role),
    userType: asEnum<UserType>(user.userType),
    accountId: user.accountId,
    accountName: account.name,
    accountCode: account.accountCode,
    siteId: site?.id ?? null,
    siteCode: site?.code ?? null,
    siteName: site?.name ?? null,
    phone: user.phone,
    department: user.department,
    // The user's own cap wins when set — a branch budget is not a per-buyer
    // limit.
    monthlyBudgetCap:
      toNumber(user.monthlyBudgetCap) ?? toNumber(site?.monthlyBudget),
    // Both, separately, because both are enforced: the combined number above
    // cannot say that a buyer is inside their own cap but their branch is not.
    userMonthlyBudgetCap: toNumber(user.monthlyBudgetCap),
    siteMonthlyBudgetCap: toNumber(site?.monthlyBudget),
    // Most specific wins: user override, then the site's contractual prefix,
    // then the account default.
    poPrefix: user.poPrefix ?? site?.poPrefix ?? account.poPrefix ?? null,
    poRequired: site?.poRequired ?? account.requirePoNumber,
    poFormat: poPolicy.format,
    poFormatExample: poPolicy.formatExample,
    mustChangePassword: user.mustChangePassword,
    isHeadOfficeAdmin: user.isHeadOfficeAdmin,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    permissions,
  }
}

export function toLoginResponse(
  tokens: IssuedTokens,
  record: AuthenticatedUserRecord
): LoginResponse {
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    tokenType: 'Bearer',
    expiresIn: tokens.expiresIn,
    user: toUserView(record),
  }
}

/**
 * Prisma returns `Decimal` for money columns. JSON.stringify would emit it as
 * an object, so it is converted here rather than left for the serialiser to
 * mangle into `{"s":1,"e":3,"d":[8500]}`.
 */
function toNumber(value: Prisma.Decimal | null | undefined): number | null {
  if (value === null || value === undefined) return null
  const parsed = value.toNumber()
  return Number.isFinite(parsed) ? parsed : null
}
