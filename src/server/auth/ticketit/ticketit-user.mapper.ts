import { TicketItApiError } from './ticketit.client'
import type { UpstreamUserRecord } from '../upstream-user'

/**
 * Turns Ticket-IT's `UserViewModel` into the record the portal replicates.
 *
 * ---------------------------------------------------------------------------
 * What the view model does and does not carry
 * ---------------------------------------------------------------------------
 * The published `UserViewModel` has `userId`, `login`, `email`, `clientName`,
 * `firstName`, `lastName`, `phone`, `regionName`, `groupName`, `userRoles[]` and
 * `isHeadOfficeAdmin` — which covers most of what the legacy row gave us.
 *
 * It has **no** `outletId`, **no** `isPasswordChangeRequired` and **no** active
 * flag. Those three were read straight off `Users` before. The first two are
 * looked for anyway, in both this payload and the login response, because the
 * OpenAPI document types no response at all and the live service may well
 * return more than the schema admits to. When neither has them the field is
 * left `undefined` and provisioning keeps whatever is already stored — see the
 * note on `UpstreamUserRecord`.
 *
 * Nothing here trusts a type. Every field is read through a coercion that
 * answers null for anything unexpected, so a renamed or retyped field upstream
 * degrades one column rather than throwing mid-login. The single exception is
 * `userId`: without it there is no key to upsert on, and guessing one would
 * create a duplicate user on every sign-in.
 */
export function toUpstreamUserRecord(
  profile: unknown,
  loginPayload?: unknown
): UpstreamUserRecord {
  const view = unwrap(profile)
  const login = unwrap(loginPayload)

  const upstreamUserId =
    readInt(view.userId) ??
    readInt(view.UserId) ??
    readInt(login.userId) ??
    readInt(login.UserId)
  if (upstreamUserId === null) {
    throw new TicketItApiError(
      502,
      'Ticket-IT returned a profile with no userId; there is no key to replicate it on.'
    )
  }

  const names = splitName(view, login)

  return {
    upstreamUserId,
    // `login` is the column the portal keys its own uniqueness on. Falling back
    // to `userName` and then the email keeps a user signable-in rather than
    // failing provisioning outright, since all three are the same string for
    // most of the estate.
    login:
      readText(view.login) ??
      readText(view.Login) ??
      readText(view.userName) ??
      readText(view.UserName) ??
      readText(login.login) ??
      readText(login.Login) ??
      readText(view.email) ??
      readText(view.Email) ??
      String(upstreamUserId),
    email:
      readText(view.email) ??
      readText(view.Email) ??
      readText(login.email) ??
      readText(login.Email) ??
      '',
    firstName: names.firstName,
    lastName: names.lastName,
    phone: readText(view.phone) ?? readText(view.Phone) ?? null,
    client:
      readText(view.clientName) ??
      readText(view.ClientName) ??
      readText(login.clientName) ??
      readText(login.ClientName) ??
      '',
    regionName: readText(view.regionName) ?? readText(view.RegionName) ?? null,
    groupName: readText(view.groupName) ?? readText(view.GroupName) ?? null,
    outletId: readOutletId(view, login),
    // A successful login is the only evidence of activity the API offers: it
    // refuses to authenticate a disabled account and exposes no flag to read.
    isActive: true,
    isHeadOfficeAdmin:
      readBool(view.isHeadOfficeAdmin) ??
      readBool(view.IsHeadOfficeAdmin) ??
      readBool(login.isHeadOfficeAdmin) ??
      readBool(login.IsHeadOfficeAdmin) ??
      (view.role === 'Admin' || login.role === 'Admin' || false),
    mustChangePassword: readMustChangePassword(view, login),
    upstreamRoleName: readRoleName(view) ?? readRoleName(login),
  }
}

// --- Role -------------------------------------------------------------------

/**
 * The user's role name, for `mapLegacyRole` to fold onto a portal role.
 *
 * `userRoles` is the authority — the four `has*Role` booleans are `readOnly` in
 * the schema, meaning the service derives them from the same list. They are read
 * only when the list is absent, which is what a trimmed-down response would look
 * like.
 *
 * Exactly one role per user held across all 4402 legacy assignments, so taking
 * the first entry is safe; `mapLegacyRole` falls back to the least privileged
 * portal role when this returns null.
 */
function readRoleName(source: Record<string, unknown>): string | null {
  const roles = source.userRoles ?? source.UserRoles
  if (Array.isArray(roles)) {
    for (const entry of roles) {
      if (!isRecord(entry)) continue
      const name =
        readText(entry.roleName) ??
        readText(entry.RoleName) ??
        readText(entry.name) ??
        readText(entry.Name)
      if (name) return name
    }
  }

  const directRole =
    readText(source.role) ??
    readText(source.Role) ??
    readText(source.roleName) ??
    readText(source.RoleName)
  if (directRole) return directRole

  // Derived flags, checked most-privileged first. They cannot over-grant: each
  // is true only when the user actually holds that role upstream.
  if (readBool(source.hasAdminRole)) return 'Admin'
  if (readBool(source.hasHeadOfficeRole)) return 'HeadOffice'
  if (readBool(source.hasRegionalManagerRole)) return 'RegionalManager'
  if (readBool(source.hasFranchiseRole)) return 'Franchisee'

  return null
}

// --- Fields the view model does not publish ---------------------------------

/**
 * The branch id, if either payload happens to carry one.
 *
 * `Site.legacyOutletId` is how a replicated user is attached to their branch,
 * and losing it would quietly detach everyone. Returning `undefined` rather than
 * `null` when nothing is found is the whole point: provisioning treats undefined
 * as "leave the stored value alone".
 */
function readOutletId(
  view: Record<string, unknown>,
  login: Record<string, unknown>
): number | null | undefined {
  for (const source of [view, login]) {
    for (const key of ['outletId', 'OutletId', 'storeId', 'outlet_id']) {
      if (!(key in source)) continue
      const value = source[key]
      if (value === null) return null
      const parsed = readInt(value)
      if (parsed !== null) return parsed
    }
  }
  return undefined
}

function readMustChangePassword(
  view: Record<string, unknown>,
  login: Record<string, unknown>
): boolean | undefined {
  for (const source of [view, login]) {
    for (const key of [
      'mustChangePassword',
      'isPasswordChangeRequired',
      'passwordChangeRequired',
    ]) {
      const parsed = readBool(source[key])
      if (parsed !== null) return parsed
    }
  }
  return undefined
}

// --- Names ------------------------------------------------------------------

/**
 * First and last name, falling back to splitting `fullName`.
 *
 * The portal's `User.firstName`/`lastName` are non-null, and a blank greeting is
 * better than a failed login — so both default to empty strings rather than
 * refusing the record.
 */
function splitName(
  view: Record<string, unknown>,
  login: Record<string, unknown>
): { firstName: string; lastName: string } {
  const first = readText(view.firstName) ?? readText(login.firstName)
  const last = readText(view.lastName) ?? readText(login.lastName)
  if (first || last) return { firstName: first ?? '', lastName: last ?? '' }

  const full = readText(view.fullName) ?? readText(login.fullName)
  if (!full) return { firstName: '', lastName: '' }

  // Everything before the last space is the given name: "Mary Anne O'Brien"
  // should not lose "Anne".
  const cut = full.lastIndexOf(' ')
  if (cut === -1) return { firstName: full, lastName: '' }
  return {
    firstName: full.slice(0, cut).trim(),
    lastName: full.slice(cut + 1).trim(),
  }
}

// --- Coercions --------------------------------------------------------------

/**
 * Unwraps a payload that may be nested, wrapped in an array, or absent.
 *
 * `GetCurrentLoginUserDetails` is documented as returning nothing in particular,
 * and .NET controllers wrap results in `data`/`result` about as often as not.
 */
function unwrap(payload: unknown): Record<string, unknown> {
  let current = payload

  for (let depth = 0; depth < 3; depth += 1) {
    if (Array.isArray(current)) {
      current = current[0]
      continue
    }
    if (!isRecord(current)) return {}

    // A wrapper is a record whose only interesting key is the envelope one.
    for (const key of ['data', 'result', 'response', 'payload', 'user']) {
      const nested = current[key]
      if (isRecord(nested) || Array.isArray(nested)) {
        if (!('userId' in current)) {
          current = nested
          break
        }
      }
    }

    if (isRecord(current)) return current
  }

  return isRecord(current) ? current : {}
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A non-empty trimmed string, or null for anything else — including "". */
function readText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/** An integer, accepting the numeric strings a loosely typed API may send. */
function readInt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isInteger(value) ? value : null
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.trim(), 10)
    return Number.isInteger(parsed) ? parsed : null
  }
  return null
}

/** A boolean, accepting the "true"/"false" strings and 0/1 seen in the wild. */
function readBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number')
    return value === 1 ? true : value === 0 ? false : null
  if (typeof value === 'string') {
    const normalised = value.trim().toLowerCase()
    if (normalised === 'true' || normalised === '1') return true
    if (normalised === 'false' || normalised === '0') return false
  }
  return null
}
