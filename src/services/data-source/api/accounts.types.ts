/**
 * Accounts, sites and users exactly as the API returns them.
 *
 * Mirrors `modules/accounts/dto/account-response.ts`,
 * `modules/sites/dto/site-response.ts` and
 * `modules/users/dto/user-response.ts` in the backend. Money is a string
 * throughout for the reason it is everywhere in this API: these are
 * NUMERIC(12,2) columns, and a JSON number would be rounded by the parser
 * before the client ever saw it.
 */

export interface ApiAccount {
  id: string
  accountCode: string
  slug: string
  name: string
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED'
  contactEmail: string | null
  contactPhone: string | null
  approvalThreshold: string | null
  requirePoNumber: boolean
  poPrefix: string | null
  poFormat: string | null
  legacyClient: string | null
  sitesCount: number
  usersCount: number
  createdAt: string
  updatedAt: string
}

export interface ApiAddress {
  id: string
  kind: 'BILLING' | 'SHIPPING'
  label: string | null
  recipientName: string | null
  line1: string
  line2: string | null
  city: string
  region: string | null
  postcode: string
  country: string
  phone: string | null
  isDefault: boolean
  /** NZ Post's resolution of it (SOW F-16). Null until checked; absent from older API builds. */
  nzPostAddressId?: string | null
  dpid?: string | null
  isRural?: boolean | null
  nzPostValidatedAt?: string | null
}

export interface ApiSite {
  id: string
  accountId: string
  code: string
  name: string
  status: 'ACTIVE' | 'INACTIVE'
  monthlyBudget: string | null
  poRequired: boolean
  poPrefix: string | null
  poFormat: string | null
  costCentre: string | null
  legacyOutletId: number | null
  addresses: ApiAddress[]
  createdAt: string
  updatedAt: string
}

export interface ApiUserSummary {
  id: string
  identityUserId: string
  accountId: string
  login: string
  email: string
  firstName: string
  lastName: string
  phone: string | null
  role: 'ADMIN' | 'HEAD_OFFICE' | 'SITE_USER'
  userType: 'EXISTING' | 'NEW' | 'EXTERNAL'
  status: 'ACTIVE' | 'PENDING' | 'DISABLED'
  site: { id: string; code: string; name: string } | null
  additionalSiteIds: string[]
  isHeadOfficeAdmin: boolean
  mustChangePassword: boolean
  /** Absent from an API build before AD-4/AD-8. */
  monthlyBudgetCap?: string | null
  poPrefix?: string | null
  legacyUserId: number | null
  lastLoginAt: string | null
  activatedAt: string | null
  createdAt: string
}

export interface ApiInvitation {
  id: string
  accountId: string
  siteId: string | null
  email: string
  firstName: string
  lastName: string
  role: 'ADMIN' | 'HEAD_OFFICE' | 'SITE_USER'
  userType: 'NEW' | 'EXTERNAL'
  status: 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
  expiresAt: string
  acceptedAt: string | null
  invitedById: string | null
  createdAt: string
}

/**
 * Sites and users are cursor-paginated, not offset-paginated: both grow without
 * a natural bound per tenant, and `OFFSET 40000` is a table scan. The adapter
 * walks the cursor and presents the offset-shaped page the UI expects.
 */
export interface ApiCursorPage<T> {
  items: T[]
  pageInfo: { nextCursor: string | null; hasMore: boolean; limit: number }
}
