// src/hooks/useDam.ts
'use client'

import { useCallback } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createDamFolder,
  DAM_SESSION_REQUIRED_CODE,
  deleteDamFile,
  getDamFileNotes,
  getDamStatus,
  listDamFolderContents,
  searchDam,
  uploadDamFiles,
  type DamFolderContentsParams,
  type DamListParams,
} from '@/services/dam.service'
import { useAuth } from '@/hooks/useAuth'

/**
 * The document library (DAM).
 *
 * Every key sits under `['dam']`, so an upload invalidates every listing at
 * once. Listings keep the previous page on screen while the next loads.
 */
export const damKeys = {
  status: ['dam', 'status'] as const,
  contents: (params?: DamFolderContentsParams) =>
    ['dam', 'contents', params ?? {}] as const,
  search: (params?: DamListParams) => ['dam', 'search', params ?? {}] as const,
  notes: (fileName: string, folderPath?: string | null) =>
    ['dam', 'notes', folderPath ?? '', fileName] as const,
}

type Options = { enabled?: boolean }

/**
 * What this user may do with the library, and whether it can be opened now.
 *
 * `canBrowse` / `canUpload` / `canDelete` are false until the status has
 * loaded, and false whenever the library is switched off or the user has no
 * Ticket-IT session — `reason` then says why, in words meant for the user.
 */
export function useDamAccess() {
  const { hasPermission } = useAuth()
  const mayView = hasPermission('DAM_VIEW')
  const mayUpload = hasPermission('DAM_UPLOAD')
  const mayDelete = hasPermission('DAM_DELETE')
  const status = useDamStatus({ enabled: mayView })

  const open = Boolean(status.data?.enabled && status.data?.connected)
  return {
    status: status.data,
    isLoading: mayView && status.isLoading,
    error: status.error,
    refetch: status.refetch,
    canBrowse: mayView && open,
    canUpload: mayView && mayUpload && open,
    canDelete: mayView && mayDelete && open,
    reason: !mayView
      ? 'Your role cannot open the image library.'
      : (status.data?.reason ?? null),
  }
}

/**
 * Call with an API error code; true when it means the Ticket-IT session is gone.
 *
 * `/dam/status` answers "connected" whenever the portal holds a token, without
 * asking Ticket-IT, so it keeps saying so after Ticket-IT has refused that
 * token and the server has dropped it. Refetching it then is what turns
 * `canUpload` off, so the next picture is kept in the design straight away
 * instead of being uploaded in full to be refused again.
 */
export function useDamSessionLost() {
  const client = useQueryClient()
  return useCallback(
    (code: string | undefined): boolean => {
      if (code !== DAM_SESSION_REQUIRED_CODE) return false
      void client.invalidateQueries({ queryKey: damKeys.status })
      return true
    },
    [client]
  )
}

export function useDamStatus(options?: Options) {
  const enabled = options?.enabled ?? true
  const query = useQuery({
    queryKey: damKeys.status,
    queryFn: getDamStatus,
    enabled,
    staleTime: 60_000,
  })
  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useDamFolderContents(
  params?: DamFolderContentsParams,
  options?: Options
) {
  const enabled = options?.enabled ?? true
  const query = useQuery({
    queryKey: damKeys.contents(params),
    queryFn: () => listDamFolderContents(params),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    isFetching: query.isFetching,
    isPlaceholderData: query.isPlaceholderData,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useDamSearch(params?: DamListParams, options?: Options) {
  const enabled = (options?.enabled ?? true) && Boolean(params?.search?.trim())
  const query = useQuery({
    queryKey: damKeys.search(params),
    queryFn: () => searchDam(params),
    enabled,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  })
  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useDamFileNotes(
  file: { fileName: string; folderPath?: string | null } | null,
  options?: Options
) {
  const enabled = (options?.enabled ?? true) && Boolean(file)
  const query = useQuery({
    queryKey: damKeys.notes(file?.fileName ?? '', file?.folderPath),
    queryFn: () =>
      getDamFileNotes(file?.fileName as string, file?.folderPath ?? null),
    enabled,
  })
  return {
    data: query.data ?? null,
    isLoading: enabled && query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/** Uploads files into a folder; every listing refreshes afterwards. */
export function useDamUpload() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: {
      files: readonly File[]
      folderPath?: string | null
    }) => uploadDamFiles(vars.files, vars.folderPath),
    onSuccess: () => client.invalidateQueries({ queryKey: ['dam'] }),
  })
}

/**
 * Removes one file. Permanent — there is no undo upstream — so the caller asks
 * first. Every listing refreshes afterwards, since a search page may hold the
 * same file as the folder does.
 */
export function useDamDeleteFile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars: {
      fileName: string
      folderPath?: string | null
      mimeType?: string | null
    }) => deleteDamFile(vars),
    onSuccess: () => client.invalidateQueries({ queryKey: ['dam'] }),
  })
}

/** Makes a folder; the folder lists refresh so the new one appears. */
export function useDamCreateFolder() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (folderPath: string) => createDamFolder(folderPath),
    onSuccess: () => client.invalidateQueries({ queryKey: ['dam'] }),
  })
}
