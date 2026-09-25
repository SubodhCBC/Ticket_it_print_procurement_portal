/**
 * A user as the upstream Ticket-IT system describes them, flattened into
 * everything the portal needs to replicate them.
 *
 * This is the shape `user-provisioning.service.ts` consumes. It is stated here,
 * away from the Ticket-IT client, so the provisioning code does not depend on
 * the vendor's field names — the same reason the old `LegacyUserRecord` hid the
 * fact that the role lived in a join table.
 *
 * ---------------------------------------------------------------------------
 * Why three fields are optional and the old record's were not
 * ---------------------------------------------------------------------------
 * The legacy database was read row by row, so every column was either present
 * or genuinely null. The API returns a `UserViewModel` that simply has no field
 * for `OutletId` or `IsPasswordChangeRequired`, and no active flag either.
 *
 * `undefined` therefore means "upstream did not say", and provisioning must
 * leave the stored value alone — not overwrite it with null. Writing null would
 * detach every replicated user from their branch on their next sign-in.
 */
export interface UpstreamUserRecord {
  /**
   * `UserViewModel.userId` — the same integer as the legacy `Users.Id`, and the
   * key the local replica is upserted on.
   */
  readonly upstreamUserId: number
  readonly login: string
  readonly email: string
  readonly firstName: string
  readonly lastName: string
  readonly phone: string | null
  /** `UserViewModel.clientName` — the only tenant discriminator upstream has. */
  readonly client: string
  readonly regionName: string | null
  readonly groupName: string | null
  /** Undefined when upstream did not report one; see the note above. */
  readonly outletId?: number | null
  /**
   * Whether the account is usable. Always true when it comes from a successful
   * login: the API will not authenticate a disabled account, and its
   * `UserViewModel` carries no flag to read instead.
   */
  readonly isActive: boolean
  readonly isHeadOfficeAdmin: boolean
  /** Undefined when upstream did not report one; see the note above. */
  readonly mustChangePassword?: boolean
  /** One of Admin / HeadOffice / RegionalManager / Franchisee, or null. */
  readonly upstreamRoleName: string | null
}
