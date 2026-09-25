import type { UserRole } from './index'

/**
 * Customer administration: accounts, branches, portal users and invitations as
 * the admin screens edit them.
 *
 * Separate from the directory types in `@/types` (`Account`, `Site`,
 * `PortalUser`), which checkout, settings and the catalogue pickers read and
 * which predate the edit screens. These carry the fields only an administrator
 * changes — status, budgets, addresses, extra site access — and keep money as
 * the API's decimal string, so an edit round-trips without float rounding.
 */

export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
export type SiteStatus = 'ACTIVE' | 'INACTIVE'
export type ManagedUserStatus = 'ACTIVE' | 'PENDING' | 'DISABLED'
export type ManagedUserType = 'EXISTING' | 'NEW' | 'EXTERNAL'
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
export type InvitationUserType = 'NEW' | 'EXTERNAL'
export type AddressKind = 'BILLING' | 'SHIPPING'

export interface SiteAddressRecord {
  id: string
  kind: AddressKind
  label: string | null
  recipientName: string | null
  line1: string
  line2: string | null
  city: string
  region: string | null
  postcode: string
  /** ISO 3166-1 alpha-2. */
  country: string
  phone: string | null
  isDefault: boolean
  /** NZ Post's resolution of it (SOW F-16). Null until checked; absent from older API builds. */
  nzPostAddressId?: string | null
  dpid?: string | null
  isRural?: boolean | null
  nzPostValidatedAt?: string | null
}

export interface SiteRecord {
  id: string
  accountId: string
  /** Absent when the caller cannot read the account directory. */
  accountName?: string
  code: string
  name: string
  status: SiteStatus
  /** Decimal string; null means uncapped. */
  monthlyBudget: string | null
  poRequired: boolean
  poPrefix: string | null
  poFormat: string | null
  costCentre: string | null
  addresses: SiteAddressRecord[]
  createdAt: string
  updatedAt: string
}

export interface ManagedUser {
  id: string
  accountId: string
  login: string
  email: string
  firstName: string
  lastName: string
  /** First and last name, else the login. */
  name: string
  phone: string | null
  role: UserRole
  userType: ManagedUserType
  status: ManagedUserStatus
  site: { id: string; code: string; name: string } | null
  additionalSiteIds: string[]
  isHeadOfficeAdmin: boolean
  /** The user's own spend ceiling per billing period, e.g. "500.00"; null for none. */
  monthlyBudgetCap: string | null
  /** Overrides the branch's PO prefix for this buyer; null for none. */
  poPrefix: string | null
  lastLoginAt: string | null
  activatedAt: string | null
  createdAt: string
}

export interface Invitation {
  id: string
  accountId: string
  siteId: string | null
  email: string
  firstName: string
  lastName: string
  name: string
  role: UserRole
  userType: InvitationUserType
  status: InvitationStatus
  expiresAt: string
  /**
   * Still PENDING but past `expiresAt` when fetched: the link no longer works
   * even though nothing has marked the row EXPIRED yet.
   */
  hasLapsed: boolean
  acceptedAt: string | null
  invitedById: string | null
  createdAt: string
}

/*
 * Update inputs. A field left `undefined` is not sent and stays as it is; `null`
 * is sent and clears the value, where the API allows that. The distinction is
 * the API's: an uncapped budget or "no approval threshold" is only reachable
 * through an explicit null.
 */

export interface UpdateAccountInput {
  name?: string
  status?: AccountStatus
  contactEmail?: string | null
  contactPhone?: string | null
  /** Decimal string such as "1500.00"; null removes the threshold. */
  approvalThreshold?: string | null
  requirePoNumber?: boolean
  poPrefix?: string | null
  poFormat?: string | null
}

export interface UpdateSiteInput {
  name?: string
  status?: SiteStatus
  /** Decimal string; null removes the cap. */
  monthlyBudget?: string | null
  poRequired?: boolean
  poPrefix?: string | null
  poFormat?: string | null
  costCentre?: string | null
}

export interface NewSiteAddressInput {
  kind: AddressKind
  label?: string
  recipientName?: string
  line1: string
  line2?: string
  city: string
  region?: string
  postcode: string
  country: string
  phone?: string
  isDefault: boolean
  /**
   * A result from NZ Post's address search. When sent, the server stores NZ
   * Post's lines, DPID and rural flag instead of the typed lines (SOW F-16).
   */
  nzPostAddressId?: string
}

export interface UpdateUserInput {
  role?: UserRole
  status?: 'ACTIVE' | 'DISABLED'
  /** Null detaches the user from their branch. */
  siteId?: string | null
  /** Replaces the whole set. */
  additionalSiteIds?: string[]
  /** "500.00"; null removes the limit. "0.00" stops the user ordering. */
  monthlyBudgetCap?: string | null
  /** Null removes it. */
  poPrefix?: string | null
}

export interface CreateInvitationInput {
  /** Honoured for an administrator only; everyone else invites into their own account. */
  accountId?: string
  email: string
  firstName: string
  lastName: string
  role: UserRole
  userType: InvitationUserType
  /** Required for a site user and for an external user. */
  siteId?: string
}
