// src/lib/services/accounts.service.ts
import { getDataSource } from '@/services/data-source'
import type {
  listInvitations as listInvitationsFn,
  listSiteRecords as listSiteRecordsFn,
} from '@/services/data-source/api/api-accounts.adapter'
import type { Account, Site, PortalUser, PaginatedResult } from '@/types'
import type {
  CreateInvitationInput,
  Invitation,
  ManagedUser,
  NewSiteAddressInput,
  SiteRecord,
  UpdateAccountInput,
  UpdateSiteInput,
  UpdateUserInput,
} from '@/types/customers-admin'

/**
 * These functions are thin: every write goes straight to the API, which
 * validates it, applies the tenant scope and writes its own audit entry
 * against the authenticated actor. There is deliberately no client-side
 * audit call — one would invent an actor and record a second, fictional
 * entry beside the real one.
 */

export async function getAccounts(params?: {
  page?: number
  pageSize?: number
  search?: string
  status?: Account['status']
}): Promise<PaginatedResult<Account>> {
  const ds = getDataSource()
  return ds.accounts.listAccounts(params)
}

export async function getAccountById(id: string): Promise<Account | null> {
  const ds = getDataSource()
  return ds.accounts.getAccountById(id)
}

export async function createAccount(
  input: Omit<Account, 'id'>
): Promise<Account> {
  const ds = getDataSource()
  const created = await ds.accounts.createAccount(input)

  return created
}

export async function getSites(params?: {
  accountId?: string
  search?: string
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<Site>> {
  const ds = getDataSource()
  return ds.accounts.listSites(params)
}

export async function getSiteById(id: string): Promise<Site | null> {
  const ds = getDataSource()
  return ds.accounts.getSiteById(id)
}

export async function createSite(input: Omit<Site, 'id'>): Promise<Site> {
  const ds = getDataSource()
  const created = await ds.accounts.createSite(input)

  return created
}

export async function getUsers(params?: {
  role?: PortalUser['role']
  siteId?: string
  accountId?: string
  search?: string
  page?: number
  pageSize?: number
}): Promise<PaginatedResult<PortalUser>> {
  const ds = getDataSource()
  return ds.accounts.listUsers(params)
}

export async function createUser(
  input: Omit<PortalUser, 'id' | 'createdAt'>
): Promise<PortalUser> {
  const ds = getDataSource()
  const created = await ds.accounts.createUser(input)

  return created
}

// --- Customer administration -------------------------------------------------
//
// The edit side of the directory: status changes, soft deactivation, branch
// addresses, user access and invitations. Errors are not swallowed here — the
// admin screens show the API's message beside the action that failed.

export async function updateCustomerAccount(
  id: string,
  input: UpdateAccountInput
): Promise<Account> {
  return getDataSource().accounts.updateAccount(id, input)
}

export async function deactivateCustomerAccount(id: string): Promise<void> {
  return getDataSource().accounts.deactivateAccount(id)
}

export async function getSiteRecords(
  params?: Parameters<typeof listSiteRecordsFn>[0]
): Promise<PaginatedResult<SiteRecord>> {
  return getDataSource().accounts.listSiteRecords(params)
}

export async function getSiteRecord(
  id: string,
  accountId?: string
): Promise<SiteRecord> {
  return getDataSource().accounts.getSiteRecord(id, accountId)
}

export async function updateSite(
  id: string,
  accountId: string,
  input: UpdateSiteInput
): Promise<SiteRecord> {
  return getDataSource().accounts.updateSite(id, accountId, input)
}

export async function deactivateSite(
  id: string,
  accountId: string
): Promise<void> {
  return getDataSource().accounts.deactivateSite(id, accountId)
}

export async function addSiteAddress(
  siteId: string,
  accountId: string,
  input: NewSiteAddressInput
): Promise<SiteRecord> {
  return getDataSource().accounts.addSiteAddress(siteId, accountId, input)
}

export async function validateSiteAddress(
  siteId: string,
  accountId: string,
  addressId: string,
  nzPostAddressId: string
): Promise<SiteRecord> {
  return getDataSource().accounts.validateSiteAddress(
    siteId,
    accountId,
    addressId,
    nzPostAddressId
  )
}

export async function getManagedUser(
  id: string,
  accountId?: string
): Promise<ManagedUser> {
  return getDataSource().accounts.getUserById(id, accountId)
}

export async function updateManagedUser(
  id: string,
  accountId: string,
  input: UpdateUserInput
): Promise<ManagedUser> {
  return getDataSource().accounts.updateUser(id, accountId, input)
}

export async function deactivateManagedUser(
  id: string,
  accountId: string
): Promise<void> {
  return getDataSource().accounts.deactivateUser(id, accountId)
}

export async function getInvitations(
  params?: Parameters<typeof listInvitationsFn>[0]
): Promise<PaginatedResult<Invitation>> {
  return getDataSource().accounts.listInvitations(params)
}

export async function createInvitation(
  input: CreateInvitationInput
): Promise<Invitation> {
  return getDataSource().accounts.createInvitation(input)
}

export async function revokeInvitation(
  id: string,
  accountId?: string
): Promise<void> {
  return getDataSource().accounts.revokeInvitation(id, accountId)
}

export async function getSiteAddresses(siteId: string) {
  const ds = getDataSource()
  return ds.accounts.getSiteAddresses(siteId)
}
