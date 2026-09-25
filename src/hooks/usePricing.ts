// src/hooks/usePricing.ts
'use client'

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getRateCards,
  createRateCard as createRateCardService,
  updateRateCard as updateRateCardService,
  updateRateCardDetails,
  changeRateCardStatus,
  deleteRateCard,
  getRateCardItems,
  removeRateCardItem,
  calculateItemPrice,
  type RateCardDetailsPatch,
} from '@/services/pricing.service'
import { queryKeys } from '@/lib/query/queryKeys'
import type { RateCard } from '@/types'

/**
 * Under the `rate-cards` prefix on purpose, so every invalidation of the card
 * list (a status change, an edit) also refreshes the open item table.
 */
const rateCardItemsKey = (rateCardId: string, params?: unknown) =>
  ['rate-cards', 'items', rateCardId, params ?? {}] as const

export function useRateCardItems(
  rateCardId: string | null | undefined,
  params?: { search?: string; page?: number; pageSize?: number }
) {
  const query = useQuery({
    queryKey: rateCardItemsKey(rateCardId ?? '', params),
    queryFn: () => getRateCardItems(rateCardId as string, params),
    enabled: Boolean(rateCardId),
    staleTime: 60_000,
  })

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * Card administration: edit terms, change status, delete, remove a line.
 *
 * Returns the mutation objects rather than bare functions, so a dialog can
 * read `isPending` and `error` for the one action it owns.
 */
export function useRateCardAdminMutations() {
  const client = useQueryClient()

  // Same reach as `useRateCardMutations`: a contract change moves quoted
  // prices on product tiles and in reports, not just the card list.
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['rate-cards'] })
    void client.invalidateQueries({ queryKey: ['products'] })
    void client.invalidateQueries({ queryKey: ['reports'] })
  }

  const updateDetails = useMutation({
    mutationFn: (vars: { id: string; patch: RateCardDetailsPatch }) =>
      updateRateCardDetails(vars.id, vars.patch),
    onSuccess: invalidate,
  })

  const changeStatus = useMutation({
    mutationFn: (vars: {
      id: string
      status: RateCard['status']
      reason?: string
    }) => changeRateCardStatus(vars.id, vars.status, vars.reason),
    onSuccess: invalidate,
  })

  const deleteCard = useMutation({
    mutationFn: (id: string) => deleteRateCard(id),
    onSuccess: invalidate,
  })

  const removeItem = useMutation({
    mutationFn: (vars: { rateCardId: string; productId: string }) =>
      removeRateCardItem(vars.rateCardId, vars.productId),
    onSuccess: invalidate,
  })

  return { updateDetails, changeStatus, deleteCard, removeItem }
}

export function useRateCards(params?: Parameters<typeof getRateCards>[0]) {
  const query = useQuery({
    queryKey: queryKeys.rateCards(params),
    queryFn: () => getRateCards(params),
    // Contracts are negotiated, not edited hourly.
    staleTime: 2 * 60_000,
    // The page on screen stays while the next one loads, rather than the list
    // collapsing to a loading panel on every page turn.
    placeholderData: keepPreviousData,
  })

  return {
    data: query.data ?? null,
    isLoading: query.isPending,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useRateCardMutations() {
  const client = useQueryClient()

  /**
   * Rate cards, and every price derived from them.
   *
   * Products carry a quoted price, and the catalogue and cart both show it, so
   * a contract change has to invalidate more than the card list — otherwise a
   * buyer keeps seeing yesterday's price on a product tile.
   */
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['rate-cards'] })
    void client.invalidateQueries({ queryKey: ['products'] })
    void client.invalidateQueries({ queryKey: ['reports'] })
  }

  const create = useMutation({
    mutationFn: (input: Omit<RateCard, 'id' | 'itemCount'>) =>
      createRateCardService(input),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: (vars: { id: string; input: Partial<RateCard> }) =>
      updateRateCardService(vars.id, vars.input),
    onSuccess: invalidate,
  })

  return {
    isPending: create.isPending || update.isPending,
    createRateCard: (input: Omit<RateCard, 'id' | 'itemCount'>) =>
      create.mutateAsync(input),
    updateRateCard: (id: string, input: Partial<RateCard>) =>
      update.mutateAsync({ id, input }),
    calculateItemPrice,
  }
}
