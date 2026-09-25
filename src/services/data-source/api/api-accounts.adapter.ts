import { apiClient } from '@/services/api.service'
import { StorageUtil } from '@/utils/storage.util'
import type {
  Account,
  Address,
  PaginatedResult,
  PortalUser,
  Site,
} from '@/types'
import type {
  CreateInvitationInput,
  Invitation,
  InvitationStatus,
  ManagedUser,
  NewSiteAddressInput,
  SiteRecord,
  SiteStatus,
  UpdateAccountInput,
  UpdateSiteInput,
  UpdateUserInput,
} from '@/types/customers-admin'
import type {
  ApiAccount,
  ApiAddress,
  ApiCursorPage,
  ApiInvitation,
  ApiSite,
  ApiUserSummary,
} from './accounts.types'
import type { ApiOffsetPage } from './catalog.types'

/**
 * Accounts, branches and portal users, served by `/accounts`, `/sites` and
 * `/users`.
 *
 * Same function signatures as the mock adapter it replaces, so the service
 * layer and the screens above it are unchanged.
 *
 * Reading accounts needs `ACCOUNT_MANAGE`, which only an ADMIN holds. A
 * head-office user reaching an admin screen that lists accounts gets a 403,
 * and the callers below turn that into an empty page rather than an error —
 * they may not see the customer directory, which is not a fault.
 */

const ACCOUNTS = '/accounts'
const SITES = '/sites'
const USERS = '/users'

// --- Accounts -----------------------------------------------------------------

export async function listAccounts(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: Account['status']
}): Promise<PaginatedResult<Account>> {
  const query: Record<string, unknown> = {
    page: params?.page ?? 1,
    pageSize: params?.pageSize ?? 25,
  }
  if (params?.search?.trim()) query.search = params.search.trim()
  if (params?.status) query.status = params.status

  try {
    const page: ApiOffsetPage<ApiAccount> = await apiClient.get(ACCOUNTS, {
      params: query,
    })
    return {
      items: page.items.map(toAccount),
      total: page.total,
      page: page.page,
      pageSize: page.pageSize,
      totalPages: page.totalPages,
    }
  } catch (error) {
    if (isForbidden(error))
      return emptyPage(query.page as number, query.pageSize as number)
    throw error
  }
}

export async function getAccountById(id: string): Promise<Account | null> {
  try {
    const account: ApiAccount = await apiClient.get(
      `${ACCOUNTS}/${encodeURIComponent(id)}`
    )
    return toAccount(account)
  } catch (error) {
    if (isNotFound(error) || isForbidden(error)) return null
    throw error
  }
}

export async function createAccount(
  input: Omit<Account, 'id'>
): Promise<Account> {
  const created: ApiAccount = await apiClient.post(ACCOUNTS, {
    accountCode: input.accountCode,
    name: input.name,
    ...(input.contactEmail ? { contactEmail: input.contactEmail } : {}),
    ...(input.contactPhone ? { contactPhone: input.contactPhone } : {}),
    ...(input.approvalThreshold != null
      ? { approvalThreshold: input.approvalThreshold.toFixed(2) }
      : {}),
    requirePoNumber: input.requirePoNumber ?? false,
    ...(input.poPrefix ? { poPrefix: input.poPrefix } : {}),
  })
  return toAccount(created)
}

// --- Sites ---------------------------------------------------------------------

/**
 * A page of a cursor-paginated endpoint, as a numbered page.
 *
 * The sites and users endpoints are cursor-paginated because both grow without
 * bound per tenant; the admin tables are numbered pagers. Bridging that means
 * walking the cursor *to* the requested page and stopping — not draining the
 * endpoint and slicing, which is what this used to do: up to twenty sequential
 * requests and two thousand rows to display twenty of them.
 *
 * Walking forward is still O(page number) round trips, which is the honest cost
 * of putting a numbered pager on a cursor API. It is bounded, it fetches only
 * `pageSize` rows per hop, and page one — the case that actually matters — is a
 * single request. A table that needs to jump deep into a large set should move
 * to "load more" and drop the page numbers.
 */
async function cursorPage<T>(
  path: string,
  query: Record<string, unknown>,
  page: number,
  pageSize: number
): Promise<{ items: T[]; hasMore: boolean }> {
  let cursor: string | null = null

  for (let current = 1; current <= page; current += 1) {
    const result: ApiCursorPage<T> = await apiClient.get(path, {
      params: { ...query, limit: pageSize, ...(cursor ? { cursor } : {}) },
    })

    if (current === page) {
      return { items: result.items, hasMore: result.pageInfo.hasMore }
    }

    if (!result.pageInfo.hasMore || !result.pageInfo.nextCursor) {
      return { items: [], hasMore: false }
    }
    cursor = result.pageInfo.nextCursor
  }

  return { items: [], hasMore: false }
}

/**
 * A cursor endpoint has no total, so neither does this.
 *
 * `total` is reported as what is known — everything up to and including this
 * page, plus one if there is more — rather than invented. A pager that claims
 * a total it cannot know is worse than one that simply offers "next".
 */
function toPage<T>(
  items: T[],
  page: number,
  pageSize: number,
  hasMore: boolean
): PaginatedResult<T> {
  const seen = (page - 1) * pageSize + items.length

  return {
    items,
    total: hasMore ? seen + 1 : seen,
    page,
    pageSize,
    totalPages: hasMore ? page + 1 : Math.max(1, page),
  }
}

export async function listSites(params?: {
  page?: number
  pageSize?: number
  accountId?: string
  search?: string
}): Promise<PaginatedResult<Site>> {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 20

  const query: Record<string, unknown> = {}
  if (params?.accountId) query.accountId = params.accountId
  if (params?.search?.trim()) query.search = params.search.trim()

  try {
    const result = await cursorPage<ApiSite>(SITES, query, page, pageSize)
    const accountNames = await accountNamesFor(
      result.items.map((site) => site.accountId)
    )

    return toPage(
      result.items.map((site) =>
        toSite(site, accountNames.get(site.accountId))
      ),
      page,
      pageSize,
      result.hasMore
    )
  } catch (error) {
    if (isForbidden(error)) return emptyPage(page, pageSize)
    throw error
  }
}

export async function getSiteById(id: string): Promise<Site | null> {
  try {
    const site: ApiSite = await apiClient.get(
      `${SITES}/${encodeURIComponent(id)}`
    )
    const names = await accountNamesFor([site.accountId])
    return toSite(site, names.get(site.accountId))
  } catch (error) {
    if (isNotFound(error) || isForbidden(error)) return null
    throw error
  }
}

export async function createSite(input: Omit<Site, 'id'>): Promise<Site> {
  const addresses = [
    toAddressInput(input.billToAddress, 'BILLING', 'Bill to'),
    toAddressInput(input.shipToAddress, 'SHIPPING', 'Ship to'),
  ].filter(
    (address): address is NonNullable<typeof address> => address !== null
  )

  const created: ApiSite = await apiClient.post(SITES, {
    ...(input.accountId ? { accountId: input.accountId } : {}),
    code: input.code,
    name: input.name,
    ...(input.monthlyBudget != null
      ? { monthlyBudget: input.monthlyBudget.toFixed(2) }
      : {}),
    poRequired: input.poRequired ?? false,
    ...(input.poPrefix ? { poPrefix: input.poPrefix } : {}),
    ...(input.costCentre ? { costCentre: input.costCentre } : {}),
    ...(addresses.length > 0 ? { addresses } : {}),
  })

  return toSite(created, input.accountName)
}

// --- Users ----------------------------------------------------------------------

export async function listUsers(params?: {
  page?: number
  pageSize?: number
  accountId?: string
  siteId?: string
  role?: PortalUser['role']
  search?: string
}): Promise<PaginatedResult<PortalUser>> {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 20

  const query: Record<string, unknown> = {}
  if (params?.accountId) query.accountId = params.accountId
  if (params?.siteId) query.siteId = params.siteId
  if (params?.role) query.role = params.role
  if (params?.search?.trim()) query.search = params.search.trim()

  try {
    const result = await cursorPage<ApiUserSummary>(
      USERS,
      query,
      page,
      pageSize
    )
    const accountNames = await accountNamesFor(
      result.items.map((user) => user.accountId)
    )

    return toPage(
      result.items.map((user) =>
        toPortalUser(user, accountNames.get(user.accountId))
      ),
      page,
      pageSize,
      result.hasMore
    )
  } catch (error) {
    if (isForbidden(error)) return emptyPage(page, pageSize)
    throw error
  }
}

/**
 * Creating a portal user means inviting one.
 *
 * There is no endpoint that conjures an account with a password already set,
 * deliberately: the invitee chooses their own credential when they accept. The
 * row comes back as `INVITED` and becomes `ACTIVE` on acceptance, which is what
 * the returned status reports rather than the optimistic `ACTIVE` the mock used
 * to hand back.
 */
export async function createUser(
  input: Omit<PortalUser, 'id' | 'createdAt'>
): Promise<PortalUser> {
  const [firstName, ...rest] = (input.name ?? '').trim().split(/\s+/)

  // POST /invitations — there is no `/users/invitations`; this used to 404.
  const invitation: ApiInvitation = await apiClient.post(INVITATIONS, {
    ...(input.accountId ? { accountId: input.accountId } : {}),
    email: input.email,
    firstName: firstName || input.email.split('@')[0],
    lastName: rest.join(' ') || '—',
    role: input.role,
    userType: 'NEW',
    ...(input.siteId ? { siteId: input.siteId } : {}),
  })

  return {
    id: invitation.id,
    email: invitation.email,
    name: `${invitation.firstName} ${invitation.lastName}`.trim(),
    role: invitation.role,
    status: 'INVITED',
    ...(invitation.siteId ? { siteId: invitation.siteId } : {}),
    ...(input.siteCode ? { siteCode: input.siteCode } : {}),
    ...(input.siteName ? { siteName: input.siteName } : {}),
    accountId: invitation.accountId,
    ...(input.accountName ? { accountName: input.accountName } : {}),
    ...(input.department ? { department: input.department } : {}),
    createdAt: invitation.createdAt,
  }
}

// --- Customer administration ------------------------------------------------------
//
// The edit side of the directory. Unlike the reads above, nothing here turns a
// 403 into an empty result: these back edit screens, and "you may not do this"
// has to reach the person who tried.
//
// Sites, users and invitations are tenant-scoped. The API acts on the caller's
// own account unless `accountId` names another — which only an administrator
// may do — so every call about a specific row passes that row's own account.

const INVITATIONS = '/invitations'

function accountParams(accountId?: string) {
  return accountId ? { params: { accountId } } : {}
}

/** PATCH /accounts/:id. `accountCode` is immutable and not accepted. */
export async function updateAccount(
  id: string,
  input: UpdateAccountInput
): Promise<Account> {
  const updated: ApiAccount = await apiClient.patch(
    `${ACCOUNTS}/${encodeURIComponent(id)}`,
    input
  )
  // Site and user rows are labelled from this cache; a rename must reach them.
  accountNameCache.set(updated.id, updated.name)
  return toAccount(updated)
}

/** DELETE /accounts/:id — soft; users and sites are not cascaded. */
export async function deactivateAccount(id: string): Promise<void> {
  await apiClient.delete(`${ACCOUNTS}/${encodeURIComponent(id)}`)
}

/** GET /sites, with status, budget and addresses the directory `Site` omits. */
export async function listSiteRecords(params?: {
  page?: number
  pageSize?: number
  accountId?: string
  search?: string
  status?: SiteStatus
}): Promise<PaginatedResult<SiteRecord>> {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 20

  const query: Record<string, unknown> = {}
  if (params?.accountId) query.accountId = params.accountId
  if (params?.status) query.status = params.status
  if (params?.search?.trim()) query.search = params.search.trim()

  const result = await cursorPage<ApiSite>(SITES, query, page, pageSize)
  const accountNames = await accountNamesFor(
    result.items.map((site) => site.accountId)
  )

  return toPage(
    result.items.map((site) =>
      toSiteRecord(site, accountNames.get(site.accountId))
    ),
    page,
    pageSize,
    result.hasMore
  )
}

/** GET /sites/:id?accountId */
export async function getSiteRecord(
  id: string,
  accountId?: string
): Promise<SiteRecord> {
  const site: ApiSite = await apiClient.get(
    `${SITES}/${encodeURIComponent(id)}`,
    accountParams(accountId)
  )
  const names = await accountNamesFor([site.accountId])
  return toSiteRecord(site, names.get(site.accountId))
}

/** PATCH /sites/:id?accountId. `code` is immutable and not accepted. */
export async function updateSite(
  id: string,
  accountId: string,
  input: UpdateSiteInput
): Promise<SiteRecord> {
  const site: ApiSite = await apiClient.patch(
    `${SITES}/${encodeURIComponent(id)}`,
    input,
    accountParams(accountId)
  )
  return toSiteRecord(site, accountNameCache.get(site.accountId) ?? undefined)
}

/** DELETE /sites/:id?accountId — soft. */
export async function deactivateSite(
  id: string,
  accountId: string
): Promise<void> {
  await apiClient.delete(
    `${SITES}/${encodeURIComponent(id)}`,
    accountParams(accountId)
  )
}

/** POST /sites/:id/addresses?accountId — returns the whole branch. */
export async function addSiteAddress(
  siteId: string,
  accountId: string,
  input: NewSiteAddressInput
): Promise<SiteRecord> {
  const site: ApiSite = await apiClient.post(
    `${SITES}/${encodeURIComponent(siteId)}/addresses`,
    input,
    accountParams(accountId)
  )
  return toSiteRecord(site, accountNameCache.get(site.accountId) ?? undefined)
}

/**
 * POST /sites/:id/addresses/:addressId/nzpost?accountId — checks a saved branch
 * address against NZ Post (SOW F-16). The address takes NZ Post's lines, DPID
 * and rural flag; the answer is the whole branch.
 */
export async function validateSiteAddress(
  siteId: string,
  accountId: string,
  addressId: string,
  nzPostAddressId: string
): Promise<SiteRecord> {
  const site: ApiSite = await apiClient.post(
    `${SITES}/${encodeURIComponent(siteId)}/addresses/${encodeURIComponent(addressId)}/nzpost`,
    { nzPostAddressId },
    accountParams(accountId)
  )
  return toSiteRecord(site, accountNameCache.get(site.accountId) ?? undefined)
}

/** GET /users/:id?accountId */
export async function getUserById(
  id: string,
  accountId?: string
): Promise<ManagedUser> {
  const user: ApiUserSummary = await apiClient.get(
    `${USERS}/${encodeURIComponent(id)}`,
    accountParams(accountId)
  )
  return toManagedUser(user)
}

/**
 * PATCH /users/:id?accountId.
 *
 * The API refuses a change to your own role and disabling yourself; the screen
 * prevents both too, but the API's refusal is what is authoritative.
 */
export async function updateUser(
  id: string,
  accountId: string,
  input: UpdateUserInput
): Promise<ManagedUser> {
  const user: ApiUserSummary = await apiClient.patch(
    `${USERS}/${encodeURIComponent(id)}`,
    input,
    accountParams(accountId)
  )
  return toManagedUser(user)
}

/** DELETE /users/:id?accountId — soft, and ends every session. */
export async function deactivateUser(
  id: string,
  accountId: string
): Promise<void> {
  await apiClient.delete(
    `${USERS}/${encodeURIComponent(id)}`,
    accountParams(accountId)
  )
}

/** GET /invitations — cursor-paginated, filterable by status. */
export async function listInvitations(params?: {
  page?: number
  pageSize?: number
  accountId?: string
  status?: InvitationStatus
}): Promise<PaginatedResult<Invitation>> {
  const page = params?.page ?? 1
  const pageSize = params?.pageSize ?? 20

  const query: Record<string, unknown> = {}
  if (params?.accountId) query.accountId = params.accountId
  if (params?.status) query.status = params.status

  const result = await cursorPage<ApiInvitation>(
    INVITATIONS,
    query,
    page,
    pageSize
  )

  return toPage(result.items.map(toInvitation), page, pageSize, result.hasMore)
}

/** POST /invitations. The user row is created when the invitee accepts. */
export async function createInvitation(
  input: CreateInvitationInput
): Promise<Invitation> {
  const created: ApiInvitation = await apiClient.post(INVITATIONS, {
    ...(input.accountId ? { accountId: input.accountId } : {}),
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    role: input.role,
    userType: input.userType,
    ...(input.siteId ? { siteId: input.siteId } : {}),
  })
  return toInvitation(created)
}

/** POST /invitations/:id/revoke?accountId — only a pending invitation. */
export async function revokeInvitation(
  id: string,
  accountId?: string
): Promise<void> {
  await apiClient.post(
    `${INVITATIONS}/${encodeURIComponent(id)}/revoke`,
    undefined,
    accountParams(accountId)
  )
}

function toSiteRecord(api: ApiSite, accountName?: string): SiteRecord {
  return {
    id: api.id,
    accountId: api.accountId,
    ...(accountName ? { accountName } : {}),
    code: api.code,
    name: api.name,
    status: api.status,
    monthlyBudget: api.monthlyBudget,
    poRequired: api.poRequired,
    poPrefix: api.poPrefix,
    // An API build from before F-14 does not send it.
    poFormat: api.poFormat ?? null,
    costCentre: api.costCentre,
    addresses: api.addresses.map((address) => ({ ...address })),
    createdAt: api.createdAt,
    updatedAt: api.updatedAt,
  }
}

function toManagedUser(api: ApiUserSummary): ManagedUser {
  const name = `${api.firstName} ${api.lastName}`.trim()

  return {
    id: api.id,
    accountId: api.accountId,
    login: api.login,
    email: api.email,
    firstName: api.firstName,
    lastName: api.lastName,
    name: name.length > 0 ? name : api.login,
    phone: api.phone,
    role: api.role,
    userType: api.userType,
    status: api.status,
    site: api.site ? { ...api.site } : null,
    additionalSiteIds: [...api.additionalSiteIds],
    isHeadOfficeAdmin: api.isHeadOfficeAdmin,
    monthlyBudgetCap: api.monthlyBudgetCap ?? null,
    poPrefix: api.poPrefix ?? null,
    lastLoginAt: api.lastLoginAt,
    activatedAt: api.activatedAt,
    createdAt: api.createdAt,
  }
}

function toInvitation(api: ApiInvitation): Invitation {
  const name = `${api.firstName} ${api.lastName}`.trim()

  return {
    id: api.id,
    accountId: api.accountId,
    siteId: api.siteId,
    email: api.email,
    firstName: api.firstName,
    lastName: api.lastName,
    name: name.length > 0 ? name : api.email,
    role: api.role,
    userType: api.userType,
    status: api.status,
    expiresAt: api.expiresAt,
    // Worked out here, at fetch time, rather than while rendering.
    hasLapsed:
      api.status === 'PENDING' && Date.parse(api.expiresAt) < Date.now(),
    acceptedAt: api.acceptedAt,
    invitedById: api.invitedById,
    createdAt: api.createdAt,
  }
}

// --- Derived reads ---------------------------------------------------------------

export async function getSiteAddresses(siteId: string): Promise<{
  siteId: string
  siteName: string
  siteCode: string
  billToAddress: Address
  shipToAddress: Address
  /** Null when the branch has no address of that kind on file. */
  billToAddressId: string | null
  shipToAddressId: string | null
  /** Every address on the branch, so checkout can offer a choice. */
  addresses: SiteAddressOption[]
} | null> {
  let site: ApiSite
  try {
    site = await apiClient.get(`${SITES}/${encodeURIComponent(siteId)}`)
  } catch (error) {
    if (isNotFound(error) || isForbidden(error)) return null
    throw error
  }

  const billTo = pickAddress(site.addresses, 'BILLING')
  const shipTo = pickAddress(site.addresses, 'SHIPPING')

  return {
    siteId: site.id,
    siteName: site.name,
    siteCode: site.code,
    billToAddress: toAddress(billTo),
    shipToAddress: toAddress(shipTo),
    billToAddressId: billTo?.id ?? null,
    shipToAddressId: shipTo?.id ?? null,
    // Shipping only: nobody chooses a billing address at checkout, and offering
    // one would invite an order to be delivered to the finance department.
    addresses: site.addresses
      .filter((address) => address.kind === 'SHIPPING')
      .map((address) => ({
        id: address.id,
        label: address.label ?? address.line1,
        isDefault: address.isDefault,
        address: toAddress(address),
      })),
  }
}

/** One deliverable address on a branch, as the checkout picker renders it. */
export interface SiteAddressOption {
  id: string
  label: string
  isDefault: boolean
  address: Address
}

// --- Mapping ---------------------------------------------------------------------

const EMPTY_ADDRESS: Address = {
  street: '',
  city: '',
  state: '',
  postalCode: '',
  country: '',
}

function toAddress(address: ApiAddress | undefined): Address {
  if (!address) return EMPTY_ADDRESS

  return {
    street: address.line1,
    ...(address.line2 ? { suite: address.line2 } : {}),
    city: address.city,
    state: address.region ?? '',
    postalCode: address.postcode,
    country: address.country,
  }
}

function toAddressInput(
  address: Address | undefined,
  kind: 'BILLING' | 'SHIPPING',
  label: string
) {
  if (!address?.street || !address.city || !address.postalCode) return null

  return {
    kind,
    label,
    line1: address.street,
    ...(address.suite ? { line2: address.suite } : {}),
    city: address.city,
    ...(address.state ? { region: address.state } : {}),
    postcode: address.postalCode,
    country: address.country || 'GB',
    isDefault: true,
  }
}

/** The default of a kind, else the first of that kind, else nothing. */
function pickAddress(
  addresses: ApiAddress[],
  kind: 'BILLING' | 'SHIPPING'
): ApiAddress | undefined {
  const ofKind = addresses.filter((address) => address.kind === kind)
  return ofKind.find((address) => address.isDefault) ?? ofKind[0]
}

function toAccount(api: ApiAccount): Account {
  return {
    id: api.id,
    name: api.name,
    accountCode: api.accountCode,
    status: api.status,
    contactEmail: api.contactEmail ?? '',
    ...(api.contactPhone ? { contactPhone: api.contactPhone } : {}),
    sitesCount: api.sitesCount,
    ...(api.approvalThreshold !== null
      ? { approvalThreshold: Number(api.approvalThreshold) }
      : {}),
    requirePoNumber: api.requirePoNumber,
    ...(api.poPrefix ? { poPrefix: api.poPrefix } : {}),
    ...(api.poFormat ? { poFormat: api.poFormat } : {}),
    createdAt: api.createdAt,
  }
}

function toSite(api: ApiSite, accountName?: string): Site {
  return {
    id: api.id,
    accountId: api.accountId,
    ...(accountName ? { accountName } : {}),
    name: api.name,
    code: api.code,
    billToAddress: toAddress(pickAddress(api.addresses, 'BILLING')),
    shipToAddress: toAddress(pickAddress(api.addresses, 'SHIPPING')),
    ...(api.monthlyBudget !== null
      ? {
          monthlySpend: Number(api.monthlyBudget),
          monthlyBudget: Number(api.monthlyBudget),
        }
      : {}),
    poRequired: api.poRequired,
    ...(api.poPrefix ? { poPrefix: api.poPrefix } : {}),
    ...(api.costCentre ? { costCentre: api.costCentre } : {}),
    createdAt: api.createdAt,
  }
}

function toPortalUser(api: ApiUserSummary, accountName?: string): PortalUser {
  const name = `${api.firstName} ${api.lastName}`.trim()

  return {
    id: api.id,
    email: api.email,
    name: name.length > 0 ? name : api.login,
    role: api.role,
    ...(api.site
      ? {
          siteId: api.site.id,
          siteCode: api.site.code,
          siteName: api.site.name,
        }
      : {}),
    accountId: api.accountId,
    ...(accountName ? { accountName } : {}),
    // PENDING upstream is an invitation that has not been accepted; the UI
    // calls that INVITED.
    status: api.status === 'PENDING' ? 'INVITED' : api.status,
    createdAt: api.createdAt,
  }
}

/**
 * Account names for a set of ids.
 *
 * Cached for the life of the page. This used to fetch a hundred accounts on
 * every list render just to put a name beside a row — a second request per
 * table, every time, for a label that changes about never.
 *
 * The single-account case is the common one (everybody except an administrator
 * sees only their own tenant), and it is answered from the cache after the
 * first hit. Only an administrator's cross-tenant list reaches the directory.
 */
// A null entry is a lookup the API refused (403 for anyone but an
// administrator) or could not find. Remembered too, so a head-office user's
// every sites or users fetch does not ask GET /accounts/:id again for a 403.
const accountNameCache = new Map<string, string | null>()

/**
 * Lookups already in flight, so two lists loading at once ask once.
 *
 * The sites table and the users table both label rows with an account name and
 * both render together, so each was firing its own request for the same account
 * before either had populated the cache.
 */
const accountNameRequests = new Map<string, Promise<void>>()

function fetchAccountName(id: string): Promise<void> {
  const existing = accountNameRequests.get(id)
  if (existing) return existing

  const pending = (
    apiClient.get(
      `${ACCOUNTS}/${encodeURIComponent(id)}`
    ) as Promise<ApiAccount>
  )
    .then((account) => {
      accountNameCache.set(account.id, account.name)
    })
    .catch((error: unknown) => {
      // Forbidden for anyone but an administrator. The name is a label, not
      // data the screen depends on. A refusal will not change for the life of
      // the page, so it is cached; a network blip is not, and is retried.
      if (isForbidden(error) || isNotFound(error))
        accountNameCache.set(id, null)
    })
    .finally(() => {
      accountNameRequests.delete(id)
    })

  accountNameRequests.set(id, pending)
  return pending
}

async function accountNamesFor(
  accountIds: string[]
): Promise<Map<string, string>> {
  // The signed-in user's own account is named by their session. For anyone
  // but an administrator every row is in that account, so this answers the
  // question without the GET /accounts/:id the API would refuse them.
  const own = StorageUtil.getUser()
  if (own?.accountId && own.accountName && !accountNameCache.get(own.accountId))
    accountNameCache.set(own.accountId, own.accountName)

  const unique = [...new Set(accountIds)]
  const missing = unique.filter((id) => !accountNameCache.has(id))

  if (missing.length === 1) {
    // One unknown account: ask for that one rather than for the directory.
    await fetchAccountName(missing[0])
  } else if (missing.length > 1) {
    try {
      const page: ApiOffsetPage<ApiAccount> = await apiClient.get(ACCOUNTS, {
        params: { page: 1, pageSize: 100 },
      })
      for (const account of page.items)
        accountNameCache.set(account.id, account.name)
    } catch (error) {
      // As above.
      if (isForbidden(error))
        for (const id of missing) accountNameCache.set(id, null)
    }
  }

  return new Map(
    unique.flatMap((id) => {
      const name = accountNameCache.get(id)
      return name ? [[id, name] as const] : []
    })
  )
}

function emptyPage<T>(page: number, pageSize: number): PaginatedResult<T> {
  return { items: [], total: 0, page, pageSize, totalPages: 1 }
}

function hasStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === status
  )
}

const isNotFound = (error: unknown) => hasStatus(error, 404)
const isForbidden = (error: unknown) => hasStatus(error, 403)
