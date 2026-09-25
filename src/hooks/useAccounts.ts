// src/hooks/useAccounts.ts
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getAccounts,
  createAccount as createAccountService,
  getSites,
  createSite as createSiteService,
  getUsers,
  createUser as createUserService,
  updateCustomerAccount,
  deactivateCustomerAccount,
  getSiteRecords,
  getSiteRecord,
  updateSite as updateSiteService,
  deactivateSite as deactivateSiteService,
  addSiteAddress as addSiteAddressService,
  validateSiteAddress as validateSiteAddressService,
  getManagedUser,
  updateManagedUser as updateManagedUserService,
  deactivateManagedUser as deactivateManagedUserService,
  getInvitations,
  createInvitation as createInvitationService,
  revokeInvitation as revokeInvitationService,
} from '@/services/accounts.service'
import { queryKeys } from '@/lib/query/queryKeys'
import type { Account, PortalUser, Site } from '@/types'
import type {
  CreateInvitationInput,
  NewSiteAddressInput,
  UpdateAccountInput,
  UpdateSiteInput,
  UpdateUserInput,
} from '@/types/customers-admin'

/**
 * Accounts, branches and portal users.
 *
 * These are the slowest-moving data in the system — a customer directory
 * changes when somebody signs a contract — and the most re-read, because every
 * admin screen labels rows with them. A longer stale window than the default.
 */
const DIRECTORY_STALE_TIME = 2 * 60_000

/**
 * Keys for the customer-administration reads.
 *
 * Each sits under the same root as the directory key it belongs to
 * (`['sites', …]`, `['users', …]`), so invalidating a root after a write clears
 * the directory lists other screens read *and* these detail views together.
 * Invitations are their own root: nothing else reads them.
 */
const customerKeys = {
  siteRecords: (params?: unknown) =>
    ['sites', 'records', params ?? {}] as const,
  siteRecord: (id: string, accountId?: string) =>
    ['sites', 'record', id, accountId ?? ''] as const,
  managedUser: (id: string, accountId?: string) =>
    ['users', 'detail', id, accountId ?? ''] as const,
  invitations: (params?: unknown) => ['invitations', params ?? {}] as const,
}

export function useAccounts(
  params?: Parameters<typeof getAccounts>[0],
  /**
   * `enabled: false` skips the request — for an account picker only an
   * administrator sees. Listing accounts is refused for everyone else, so
   * asking anyway only earns a 403 on every visit.
   */
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true
  const query = useQuery({
    queryKey: queryKeys.accounts(params),
    queryFn: () => getAccounts(params),
    staleTime: DIRECTORY_STALE_TIME,
    enabled,
  })

  return {
    data: query.data ?? null,
    // A skipped query stays "pending" forever; it is not loading.
    isLoading: enabled && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useSites(params?: Parameters<typeof getSites>[0]) {
  const query = useQuery({
    queryKey: queryKeys.sites(params),
    queryFn: () => getSites(params),
    staleTime: DIRECTORY_STALE_TIME,
  })

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useUsers(
  params?: Parameters<typeof getUsers>[0],
  /** `enabled: false` skips the request, e.g. for a tab that is not showing. */
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true
  const query = useQuery({
    queryKey: queryKeys.users(params),
    queryFn: () => getUsers(params),
    staleTime: DIRECTORY_STALE_TIME,
    enabled,
  })

  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useAccountMutations() {
  const client = useQueryClient()

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['accounts'] })
    void client.invalidateQueries({ queryKey: ['sites'] })
    void client.invalidateQueries({ queryKey: ['users'] })
  }

  const account = useMutation({
    mutationFn: (input: Omit<Account, 'id'>) => createAccountService(input),
    onSuccess: invalidate,
  })

  const site = useMutation({
    mutationFn: (input: Omit<Site, 'id'>) => createSiteService(input),
    onSuccess: invalidate,
  })

  const user = useMutation({
    mutationFn: (input: Omit<PortalUser, 'id' | 'createdAt'>) =>
      createUserService(input),
    onSuccess: () => {
      invalidate()
      void client.invalidateQueries({ queryKey: ['invitations'] })
    },
  })

  return {
    isPending: account.isPending || site.isPending || user.isPending,
    createAccount: (input: Omit<Account, 'id'>) => account.mutateAsync(input),
    createSite: (input: Omit<Site, 'id'>) => site.mutateAsync(input),
    createUser: (input: Omit<PortalUser, 'id' | 'createdAt'>) =>
      user.mutateAsync(input),
  }
}

// --- Customer administration: reads ------------------------------------------
//
// Unlike the directory reads above, these surface errors (a 403 included)
// rather than turning them into an empty page: they back edit screens, where
// "you may not do this" has to be said, not implied by a blank table.

export function useSiteRecords(
  params?: Parameters<typeof getSiteRecords>[0],
  /** `enabled: false` skips the request, e.g. for a tab that is not showing. */
  options?: { enabled?: boolean }
) {
  const enabled = options?.enabled ?? true
  const query = useQuery({
    queryKey: customerKeys.siteRecords(params),
    queryFn: () => getSiteRecords(params),
    staleTime: DIRECTORY_STALE_TIME,
    enabled,
  })

  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

/** One branch with its addresses. Idle until `id` is given. */
export function useSiteRecord(id: string | null, accountId?: string) {
  const query = useQuery({
    queryKey: customerKeys.siteRecord(id ?? '', accountId),
    queryFn: () => getSiteRecord(id as string, accountId),
    enabled: Boolean(id),
  })

  return {
    data: query.data ?? null,
    isLoading: Boolean(id) && query.isPending,
    /**
     * Whether this id's data has been (re)fetched since it was asked for. Cached
     * data is shown first and refreshed behind it; an edit form must wait for
     * the refresh, or it starts from values that may no longer be current.
     */
    isFetchedAfterMount: query.isFetchedAfterMount,
    error: query.error,
    refetch: query.refetch,
  }
}

/** One user with their role, status and site access. Idle until `id` is given. */
export function useManagedUser(id: string | null, accountId?: string) {
  const query = useQuery({
    queryKey: customerKeys.managedUser(id ?? '', accountId),
    queryFn: () => getManagedUser(id as string, accountId),
    enabled: Boolean(id),
  })

  return {
    data: query.data ?? null,
    isLoading: Boolean(id) && query.isPending,
    /** As for `useSiteRecord`: an edit form waits for this. */
    isFetchedAfterMount: query.isFetchedAfterMount,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useInvitations(params?: Parameters<typeof getInvitations>[0]) {
  const query = useQuery({
    queryKey: customerKeys.invitations(params),
    queryFn: () => getInvitations(params),
  })

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

// --- Customer administration: writes -----------------------------------------
//
// One hook per action, returning the mutation itself, so each button owns its
// own pending flag and error rather than sharing one across the screen.
// `onSuccess` returns the invalidation promise: the mutation stays pending until
// the lists it changed have been asked to refetch, so a row does not flash its
// old state after the dialog closes.

function useInvalidateRoots() {
  const client = useQueryClient()
  return (...roots: string[]) =>
    Promise.all(
      roots.map((root) => client.invalidateQueries({ queryKey: [root] }))
    )
}

export function useUpdateAccount() {
  const invalidate = useInvalidateRoots()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateAccountInput }) =>
      updateCustomerAccount(id, input),
    // Sites and users carry the account name as a label.
    onSuccess: () => invalidate('accounts', 'sites', 'users'),
  })
}

export function useDeactivateAccount() {
  const invalidate = useInvalidateRoots()
  return useMutation({
    mutationFn: (id: string) => deactivateCustomerAccount(id),
    onSuccess: () => invalidate('accounts', 'sites', 'users'),
  })
}

export function useUpdateSite() {
  const invalidate = useInvalidateRoots()
  return useMutation({
    mutationFn: ({
      id,
      accountId,
      input,
    }: {
      id: string
      accountId: string
      input: UpdateSiteInput
    }) => updateSiteService(id, accountId, input),
    // Users carry their primary site's name.
    onSuccess: () => invalidate('sites', 'users'),
  })
}

export function useDeactivateSite() {
  const invalidate = useInvalidateRoots()
  return useMutation({
    mutationFn: ({ id, accountId }: { id: string; accountId: string }) =>
      deactivateSiteService(id, accountId),
    // The account's site count changes.
    onSuccess: () => invalidate('sites', 'accounts', 'users'),
  })
}

/** Checks a saved branch address against NZ Post and stores its version. */
export function useValidateSiteAddress() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      siteId,
      accountId,
      addressId,
      nzPostAddressId,
    }: {
      siteId: string
      accountId: string
      addressId: string
      nzPostAddressId: string
    }) =>
      validateSiteAddressService(siteId, accountId, addressId, nzPostAddressId),
    onSuccess: (site, { accountId }) => {
      client.setQueryData(customerKeys.siteRecord(site.id, accountId), site)
      return client.invalidateQueries({ queryKey: ['sites'] })
    },
  })
}

export function useAddSiteAddress() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({
      siteId,
      accountId,
      input,
    }: {
      siteId: string
      accountId: string
      input: NewSiteAddressInput
    }) => addSiteAddressService(siteId, accountId, input),
    onSuccess: (site, { accountId }) => {
      // The response is the whole branch, addresses included: put it straight
      // into the open drawer rather than waiting for a refetch.
      client.setQueryData(customerKeys.siteRecord(site.id, accountId), site)
      return client.invalidateQueries({ queryKey: ['sites'] })
    },
  })
}

export function useUpdateManagedUser() {
  const invalidate = useInvalidateRoots()
  return useMutation({
    mutationFn: ({
      id,
      accountId,
      input,
    }: {
      id: string
      accountId: string
      input: UpdateUserInput
    }) => updateManagedUserService(id, accountId, input),
    onSuccess: () => invalidate('users'),
  })
}

export function useDeactivateManagedUser() {
  const invalidate = useInvalidateRoots()
  return useMutation({
    mutationFn: ({ id, accountId }: { id: string; accountId: string }) =>
      deactivateManagedUserService(id, accountId),
    onSuccess: () => invalidate('users'),
  })
}

export function useCreateInvitation() {
  const invalidate = useInvalidateRoots()
  return useMutation({
    mutationFn: (input: CreateInvitationInput) =>
      createInvitationService(input),
    onSuccess: () => invalidate('invitations'),
  })
}

export function useRevokeInvitation() {
  const invalidate = useInvalidateRoots()
  return useMutation({
    mutationFn: ({ id, accountId }: { id: string; accountId?: string }) =>
      revokeInvitationService(id, accountId),
    onSuccess: () => invalidate('invitations'),
  })
}
