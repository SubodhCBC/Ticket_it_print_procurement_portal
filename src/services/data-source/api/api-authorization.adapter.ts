import { apiClient } from '@/services/api.service'
import type { Permission } from '@/types/auth'

/**
 * The permission vocabulary and each role's baseline, from
 * `GET /authorization/permissions`.
 *
 * Read-only, and it will stay that way. The baseline is compiled into the API
 * — see its `permissions.ts` — so there is nothing here to PUT. Departures from
 * it are per-user grants on `/users/:userId/permissions`.
 *
 * This replaced a hand-maintained copy of the matrix in `constants/rbac.ts`,
 * now deleted. It had drifted into a different vocabulary entirely
 * (`MANAGE_CATALOGUE` against the API's `CATALOG_MANAGE`) and so described a
 * permission model the server had never enforced — the worst kind of
 * documentation, the kind that looks authoritative.
 */

export interface PermissionDescriptor {
  key: Permission
  /** The heading the settings screen groups this permission under. */
  group: string
  /**
   * What the permission lets somebody do, in the words they would use.
   *
   * Rendered under the key in the matrix and searched over, so "invoice" finds
   * `BILLING_MANAGE` without the reader having to already know that.
   */
  description: string
}

export interface RoleBaseline {
  role: 'ADMIN' | 'HEAD_OFFICE' | 'SITE_USER' | 'EXTERNAL'
  label: string
  description: string
  permissions: Permission[]
}

export interface PermissionCatalog {
  permissions: PermissionDescriptor[]
  roles: RoleBaseline[]
}

/** Needs `USER_MANAGE`, which only an administrator holds. */
export async function getPermissionCatalog(): Promise<PermissionCatalog> {
  return apiClient.get('/authorization/permissions')
}

/**
 * A single user's departures from their role baseline.
 *
 * `effect` is ALLOW or DENY, and DENY always wins — a revocation that could be
 * defeated by row ordering is not one. `resourceId` scopes a grant to one
 * object; null means account-wide.
 */
export interface PermissionGrant {
  id: string
  permission: string
  effect: 'ALLOW' | 'DENY'
  resourceId: string | null
  reason: string | null
  expiresAt: string | null
  grantedById: string | null
  createdAt: string
}

/** The user's account travels as `accountId`: an administrator's own account is not theirs. */
function accountQuery(accountId?: string) {
  return accountId ? { accountId } : undefined
}

export async function listUserGrants(
  userId: string,
  accountId?: string
): Promise<PermissionGrant[]> {
  return apiClient.get(`/users/${encodeURIComponent(userId)}/permissions`, {
    params: accountQuery(accountId),
  })
}

export async function grantPermission(
  userId: string,
  input: {
    permission: Permission
    effect?: 'ALLOW' | 'DENY'
    resourceId?: string | null
    reason?: string
    expiresAt?: string | null
  },
  accountId?: string
): Promise<PermissionGrant> {
  return apiClient.post(
    `/users/${encodeURIComponent(userId)}/permissions`,
    {
      permission: input.permission,
      effect: input.effect ?? 'ALLOW',
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      ...(input.reason ? { reason: input.reason } : {}),
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    },
    { params: accountQuery(accountId) }
  )
}

/**
 * The revoke names the grant in a *body*, not a query string — a permission and
 * an optional resource id are the identity of the row being removed, and the
 * API models them as one payload. Axios sends a DELETE body through `data`.
 */
export async function revokeGrant(
  userId: string,
  permission: Permission,
  resourceId?: string | null,
  accountId?: string
): Promise<void> {
  await apiClient.delete(`/users/${encodeURIComponent(userId)}/permissions`, {
    params: accountQuery(accountId),
    data: { permission, ...(resourceId ? { resourceId } : {}) },
    headers: { 'Content-Type': 'application/json' },
  })
}
