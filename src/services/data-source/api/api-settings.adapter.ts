import { apiClient } from '@/services/api.service'

/**
 * Account settings and the signed-in user's own credentials.
 *
 * `GET /settings` answers with one flat record even though two tables sit
 * behind it — the store name, purchase-order rule and approval threshold live
 * on `accounts`, the rest on `account_settings`. The screen is a single form
 * and does not need to know which is which.
 */

export interface ApiSettings {
  accountId: string
  accountCode: string
  /** Shown as the store name. */
  accountName: string

  currency: string
  timezone: string

  orderNumberPrefix: string | null
  enforceMoq: boolean
  allowBackorders: boolean
  requireDeliveryNotes: boolean
  /** Buyers may type a one-off delivery address at checkout. */
  allowCustomDeliveryAddress: boolean

  requirePoNumber: boolean
  poPrefix: string | null
  poFormat: string | null
  /** A string, like every money value from this API. Null means nothing needs approval. */
  approvalThreshold: string | null

  /** Prices are stated including GST (true) or have it added on the invoice. Absent from older builds. */
  pricesIncludeGst?: boolean
  /** A percentage as a string, e.g. "15.00". */
  gstRatePercent?: string

  sendOrderConfirmations: boolean
  /** Already resolved against the account contact — never re-derive the fallback here. */
  notificationEmail: string | null
  notificationEmailInherited: boolean
  sendLowStockAlerts: boolean
  lowStockAlertThreshold: number
  sendMonthlyBillingDigest: boolean

  sessionTimeoutMinutes: number
  enforceTwoFactor: boolean
  /** False until there is second-factor enrolment. The toggle is recorded, not obeyed. */
  twoFactorEnforceable: boolean

  updatedAt: string
}

/**
 * Only what changed.
 *
 * The screen saves one tab at a time, and the API patches exactly the fields it
 * is sent — a whole-record PUT would have two tabs saved in either order
 * overwrite each other.
 */
export type SettingsPatch = Partial<
  Pick<
    ApiSettings,
    | 'accountName'
    | 'currency'
    | 'timezone'
    | 'orderNumberPrefix'
    | 'enforceMoq'
    | 'allowBackorders'
    | 'requireDeliveryNotes'
    | 'allowCustomDeliveryAddress'
    | 'requirePoNumber'
    | 'poPrefix'
    | 'poFormat'
    | 'sendOrderConfirmations'
    | 'notificationEmail'
    | 'sendLowStockAlerts'
    | 'lowStockAlertThreshold'
    | 'sendMonthlyBillingDigest'
    | 'sessionTimeoutMinutes'
    | 'enforceTwoFactor'
    | 'pricesIncludeGst'
  >
> & {
  /** Number here, string on the way back. */
  gstRatePercent?: number
  /** Number here, string on the way back: the API takes either and stores NUMERIC. */
  approvalThreshold?: number | null
}

/** Needs `ACCOUNT_MANAGE`. */
export async function getSettings(): Promise<ApiSettings> {
  return apiClient.get('/settings')
}

export async function updateSettings(
  patch: SettingsPatch
): Promise<ApiSettings> {
  return apiClient.patch('/settings', patch)
}

export interface ProfilePatch {
  firstName?: string
  lastName?: string
  email?: string
  phone?: string | null
  department?: string | null
}

/**
 * Update a user, including yourself.
 *
 * There is no `/users/me` on the API: the same route serves an administrator
 * editing somebody else, and the caller's own id comes from the session.
 */
export async function updateUserProfile(
  userId: string,
  patch: ProfilePatch
): Promise<unknown> {
  return apiClient.patch(`/users/${userId}`, patch)
}

/**
 * Change your own password.
 *
 * Succeeds with no content and revokes every **refresh** token, so no session
 * can be renewed. Access tokens are stateless and are not revoked: this one
 * keeps working until it expires, up to fifteen minutes later. Sign the user
 * out rather than relying on the next request to fail.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  await apiClient.post('/password/change', { currentPassword, newPassword })
}
