'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  archiveTemplate,
  createTemplate as createTemplateService,
  customiseTemplate,
  deleteTemplate as deleteTemplateService,
  getCustomisableTemplate,
  getTemplateById,
  getTemplates,
  publishTemplate,
  restoreTemplateVersion,
  setTemplateVisibility,
  snapshotTemplate,
  unpublishTemplate,
  updateTemplate as updateTemplateService,
} from '@/services/templates.service'
import { queryKeys } from '@/lib/query/queryKeys'
import type { PrintTemplate } from '@/types'

/**
 * A template detail already in the cache, without fetching one.
 *
 * `enabled: false` subscribes to the cache entry and never requests it, so a
 * gallery tile can show a grant count once the detail has been loaded (by the
 * visibility dialog, say) without one detail request per tile.
 */
export function useCachedTemplate(id: string) {
  const query = useQuery({
    queryKey: queryKeys.template(id),
    queryFn: () => getTemplateById(id),
    enabled: false,
  })
  return query.data ?? null
}

/**
 * Sets who can see an operator template. Admin only (TEMPLATE_MANAGE).
 *
 * Returned as the mutation object so the dialog can read `isPending` and the
 * server's error message.
 */
export function useSetTemplateVisibility() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (vars: {
      id: string
      visibility: 'ALL_ACCOUNTS' | 'RESTRICTED'
      accountIds: string[]
    }) => setTemplateVisibility(vars.id, vars.visibility, vars.accountIds),
    onSuccess: (template) => {
      // The response is a full detail, so the dialog and the tile badge update
      // at once rather than after a refetch.
      queryClient.setQueryData(queryKeys.template(template.id), template)
      void queryClient.invalidateQueries({ queryKey: ['templates'] })
    },
  })
}

/**
 * Template reads and writes, cached.
 *
 * The shapes these return are unchanged from the fixture-backed versions —
 * `{ data, total, isLoading, error, refetch }` for the list, and a bag of
 * async functions for the mutations — so the gallery and the 8,000-line builder
 * above them are untouched by the move to the API.
 *
 * Every mutation invalidates the list and the row it touched. A designer who
 * publishes and lands back on the gallery has to see it published; a cache that
 * needed a manual refresh to tell them so would read as a failed publish.
 */

export function useTemplates(params?: {
  page?: number
  pageSize?: number
  category?: string
  productId?: string
  status?: PrintTemplate['status'] | 'ALL'
  theme?: string
  search?: string
}) {
  const query = useQuery({
    queryKey: queryKeys.templates(params),
    queryFn: () => getTemplates(params),
  })

  return {
    data: query.data?.items ?? [],
    total: query.data?.total ?? 0,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * The working copy: what the builder opens.
 *
 * `fresh` is for the builder. It keeps the version it opened with and sends it
 * back with every save, so opening on a cached copy — the one left behind when
 * a save finished after you had already navigated away — meant the very first
 * save was refused as a collision with a designer who was really you. With
 * `fresh`, the page waits for this visit's own read of the template.
 */
export function useTemplate(
  id: string | undefined,
  options: { fresh?: boolean } = {}
) {
  const query = useQuery({
    queryKey: queryKeys.template(id ?? ''),
    queryFn: () => getTemplateById(id!),
    enabled: Boolean(id),
    ...(options.fresh
      ? { staleTime: 0, refetchOnMount: 'always' as const }
      : {}),
  })

  return {
    template: query.data ?? null,
    isLoading:
      query.isPending || (options.fresh === true && !query.isFetchedAfterMount),
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * The published snapshot a buyer personalises.
 *
 * A different query key from `useTemplate` on purpose, because it is a
 * different thing: the same template id can be at draft version 9 for a
 * designer and published version 6 for a buyer, and one cache entry holding
 * both is how the customiser starts drawing unpublished work.
 */
export function useCustomisableTemplate(id: string | undefined) {
  const query = useQuery({
    queryKey: queryKeys.customisableTemplate(id ?? ''),
    queryFn: () => getCustomisableTemplate(id!),
    enabled: Boolean(id),
  })

  return {
    template: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useTemplateMutations() {
  const queryClient = useQueryClient()

  /**
   * Publishing and restoring change the version history as well as the row, so
   * they clear all three keys. Cheaper to over-invalidate three small queries
   * than to reason about which of them a given call moved.
   */
  const invalidate = (id?: string) => {
    void queryClient.invalidateQueries({ queryKey: ['templates'] })
    if (id) {
      void queryClient.invalidateQueries({ queryKey: queryKeys.template(id) })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.templateVersions(id),
      })
      void queryClient.invalidateQueries({
        queryKey: queryKeys.customisableTemplate(id),
      })
    }
  }

  const create = useMutation({
    mutationFn: (
      data: Omit<PrintTemplate, 'id' | 'createdAt' | 'updatedAt' | 'version'>
    ) => createTemplateService(data),
    onSuccess: (template) => invalidate(template.id),
  })

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PrintTemplate> }) =>
      updateTemplateService(id, data),
    onSuccess: (template) => invalidate(template.id),
  })

  const remove = useMutation({
    mutationFn: (id: string) => deleteTemplateService(id),
    onSuccess: (_result, id) => invalidate(id),
  })

  const publish = useMutation({
    mutationFn: (id: string) => publishTemplate(id),
    onSuccess: (template) => invalidate(template.id),
  })

  const unpublish = useMutation({
    mutationFn: (id: string) => unpublishTemplate(id),
    onSuccess: (template) => invalidate(template.id),
  })

  const archive = useMutation({
    mutationFn: (id: string) => archiveTemplate(id),
    onSuccess: (template) => invalidate(template.id),
  })

  const snapshot = useMutation({
    mutationFn: ({ id, label }: { id: string; label?: string }) =>
      snapshotTemplate(id, label),
    onSuccess: (_versions, { id }) => invalidate(id),
  })

  const restore = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      restoreTemplateVersion(id, version),
    onSuccess: (template) => invalidate(template.id),
  })

  const customise = useMutation({
    mutationFn: ({
      id,
      fields,
    }: {
      id: string
      fields: Record<string, string>
    }) => customiseTemplate(id, fields),
  })

  return {
    // Kept as plain async functions rather than exposing the mutation objects:
    // the builder awaits these and reads their return value, and `mutateAsync`
    // is the form that both throws on failure and resolves with the row.
    createTemplate: create.mutateAsync,
    updateTemplate: (id: string, data: Partial<PrintTemplate>) =>
      update.mutateAsync({ id, data }),
    deleteTemplate: remove.mutateAsync,
    publishTemplate: publish.mutateAsync,
    unpublishTemplate: unpublish.mutateAsync,
    archiveTemplate: archive.mutateAsync,
    snapshotTemplate: (id: string, label?: string) =>
      snapshot.mutateAsync({ id, label }),
    restoreTemplateVersion: (id: string, version: number) =>
      restore.mutateAsync({ id, version }),
    customiseTemplate: (id: string, fields: Record<string, string>) =>
      customise.mutateAsync({ id, fields }),
    isPending:
      create.isPending ||
      update.isPending ||
      remove.isPending ||
      publish.isPending ||
      unpublish.isPending ||
      archive.isPending ||
      snapshot.isPending ||
      restore.isPending,
  }
}
