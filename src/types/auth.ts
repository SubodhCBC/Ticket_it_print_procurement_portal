/**
 * The authenticated session, as the API describes it.
 *
 * The shapes here mirror `AuthenticatedUserView` and `LoginResponse` in the
 * backend (`src/modules/auth/dto/auth-response.ts`). Nothing in this file is
 * demo data: every value a component reads comes from `/auth/login`,
 * `/auth/refresh` or `/auth/me`.
 */

/** The role vocabulary the API speaks. */
export type ApiRole = 'ADMIN' | 'HEAD_OFFICE' | 'SITE_USER'

/**
 * The role vocabulary the UI speaks. Kept lowercase because routes, guards and
 * theming across the app are keyed on it; `toUserRole` is the only crossing
 * point between the two.
 */
export type UserRole = 'site_user' | 'head_office' | 'admin'

export type UserType = 'EXISTING' | 'NEW' | 'EXTERNAL'

/**
 * The permission vocabulary, taken verbatim from the backend
 * (`src/common/authorization/permissions.ts`). Advisory in the client: the
 * server re-checks every request, so hiding an action here is a courtesy, not
 * a control.
 */
export type Permission =
  | 'APPLICATION_VIEW'
  | 'APPLICATION_CREATE'
  | 'APPLICATION_EDIT'
  | 'APPLICATION_DELETE'
  | 'DAM_VIEW'
  | 'DAM_UPLOAD'
  | 'DAM_DOWNLOAD'
  | 'DAM_DELETE'
  | 'EXTERNAL_DOCUMENT_ACCESS'
  | 'CATALOG_VIEW'
  | 'CATALOG_MANAGE'
  | 'PRICING_VIEW'
  | 'PRICING_MANAGE'
  | 'ORDER_CREATE'
  | 'ORDER_VIEW_OWN'
  | 'ORDER_VIEW_SITE'
  | 'ORDER_VIEW_ACCOUNT'
  | 'ORDER_CANCEL'
  | 'ORDER_CUSTOM_DELIVERY_ADDRESS'
  | 'ORDER_MANAGE'
  | 'APPROVAL_ACT'
  | 'TEMPLATE_USE'
  | 'TEMPLATE_MANAGE'
  | 'BILLING_VIEW'
  | 'BILLING_MANAGE'
  | 'INVENTORY_VIEW'
  | 'INVENTORY_MANAGE'
  | 'REPORT_VIEW'
  | 'AUDIT_VIEW'
  | 'USER_INVITE'
  | 'USER_MANAGE'
  | 'SITE_MANAGE'
  | 'ACCOUNT_MANAGE'
  | 'INTEGRATION_MANAGE'

/** `/auth/me`, and the `user` half of a login or refresh response. */
export interface ApiUser {
  id: string
  login: string
  email: string
  firstName: string
  lastName: string
  fullName: string
  role: ApiRole
  userType: UserType
  accountId: string
  accountName: string
  accountCode: string
  siteId: string | null
  siteCode: string | null
  siteName: string | null
  phone: string | null
  department: string | null
  monthlyBudgetCap: number | null
  poPrefix: string | null
  poRequired: boolean
  mustChangePassword: boolean
  isHeadOfficeAdmin: boolean
  lastLoginAt: string | null
  permissions: Permission[]
}

export interface LoginResponse {
  accessToken: string
  refreshToken: string
  tokenType: 'Bearer'
  expiresIn: number
  user: ApiUser
}

/**
 * The session user as components consume it: the API payload plus the two
 * derived fields the UI has always rendered (`name`, `organization`), so a
 * screen never has to reassemble them.
 */
export interface User extends ApiUser {
  /** `fullName`, under the name the components already use. */
  name: string
  /** The account the user belongs to — the label shown beside their name. */
  organization: string
  /** The UI-side role. */
  uiRole: UserRole
}

export const API_ROLE_TO_UI: Record<ApiRole, UserRole> = {
  ADMIN: 'admin',
  HEAD_OFFICE: 'head_office',
  SITE_USER: 'site_user',
}

export function toUserRole(role: ApiRole): UserRole {
  return API_ROLE_TO_UI[role] ?? 'site_user'
}

export function toSessionUser(user: ApiUser): User {
  return {
    ...user,
    name: user.fullName,
    organization: user.accountName,
    uiRole: toUserRole(user.role),
  }
}

/**
 * Which portals a role may open.
 *
 * Mirrors the `allowedRoles` each portal layout declares, so the portal
 * switcher offers exactly the portals the guard would let the user through to
 * — an entry here that the guard rejects would be a dead end.
 */
export const PORTALS_FOR_ROLE: Record<UserRole, UserRole[]> = {
  admin: ['admin', 'head_office', 'site_user'],
  head_office: ['head_office', 'admin'],
  site_user: ['site_user'],
}

export const ROLE_DETAILS: Record<
  UserRole,
  {
    title: string
    subtitle: string
    description: string
    defaultRedirect: string
    themeColor: string
    badgeText: string
    buttonColor: string
    buttonText: string
  }
> = {
  admin: {
    title: 'Admin',
    subtitle: 'Full Operations HQ',
    description:
      'Central platform administration, carrying the full operational workload to see and action every order in full detail and update statuses.',
    defaultRedirect: '/admin/dashboard',
    themeColor: '#059669',
    buttonColor: '#059669',
    buttonText: 'Enter Admin Portal',
    badgeText: 'Admin • Operations HQ',
  },
  head_office: {
    title: 'Head Office',
    subtitle: 'Consolidated Billing',
    description:
      'Inheriting a read-only status view across all sites, feeding the monthly consolidated billing report and transaction-level spreadsheet backing.',
    defaultRedirect: '/head-office/dashboard',
    themeColor: '#2563eb',
    buttonColor: '#2563eb',
    buttonText: 'Enter Head Office Portal',
    badgeText: 'Head Office • All Sites',
  },
  site_user: {
    title: 'Site User',
    subtitle: 'Branch Asset Orders',
    description:
      'Self-service marketing asset library and checkout with a read-only status view strictly limited to their own branch orders.',
    defaultRedirect: '/shop/catalogue',
    themeColor: '#f73582',
    buttonColor: '#f73582',
    buttonText: 'Enter Shop / Ordering Hub',
    badgeText: 'Site User • Branch Ordering',
  },
}
