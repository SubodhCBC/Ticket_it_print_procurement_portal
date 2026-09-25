// src/hooks/useSettings.ts
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  changePassword as changePasswordService,
  getSettings,
  updateSettings,
  updateUserProfile,
  type ApiSettings,
  type ProfilePatch,
  type SettingsPatch,
} from '@/services/data-source/api/api-settings.adapter'
import { queryKeys } from '@/lib/query/queryKeys'

/**
 * The account's settings.
 *
 * Five minutes, not thirty seconds: this record changes a handful of times a
 * year and every save writes the fresh copy straight back into the cache, so
 * there is nothing a shorter window would catch.
 */
export function useSettings() {
  const query = useQuery({
    queryKey: queryKeys.settings(),
    queryFn: getSettings,
    staleTime: 5 * 60_000,
  })

  return {
    settings: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useSettingsMutations() {
  const client = useQueryClient()

  const save = useMutation({
    mutationFn: (patch: SettingsPatch) => updateSettings(patch),
    // The PATCH answers with the whole record, so seeding the cache with it
    // avoids a refetch that would only return what we are already holding.
    onSuccess: (fresh: ApiSettings) => {
      client.setQueryData(queryKeys.settings(), fresh)
      // The approval threshold and the purchase-order rule are read during
      // checkout and reported on, so anything derived from them is now stale.
      void client.invalidateQueries({ queryKey: ['orders'] })
      void client.invalidateQueries({ queryKey: ['reports'] })
    },
  })

  const saveProfile = useMutation({
    mutationFn: (vars: { userId: string; patch: ProfilePatch }) =>
      updateUserProfile(vars.userId, vars.patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['users'] })
    },
  })

  const changePassword = useMutation({
    mutationFn: (vars: { currentPassword: string; newPassword: string }) =>
      changePasswordService(vars.currentPassword, vars.newPassword),
  })

  return {
    saveSettings: (patch: SettingsPatch) => save.mutateAsync(patch),
    isSaving: save.isPending,
    saveProfile: (userId: string, patch: ProfilePatch) =>
      saveProfile.mutateAsync({ userId, patch }),
    isSavingProfile: saveProfile.isPending,
    changePassword: (currentPassword: string, newPassword: string) =>
      changePassword.mutateAsync({ currentPassword, newPassword }),
    isChangingPassword: changePassword.isPending,
  }
}
