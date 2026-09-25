// src/hooks/useShipping.ts
'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query/queryKeys'
import {
  bookPickup,
  createShipment,
  getLabelLink,
  getOrderTracking,
  getShippingStatus,
  listOrderShipments,
  listPickups,
  listShipmentQueue,
  refreshOrderTracking,
  retryShipment,
  voidShipment,
  type ShipmentQueueParams,
} from '@/services/data-source/api/api-shipping.adapter'
import type {
  ApiShipment,
  BookPickupInput,
  CreateShipmentInput,
} from '@/services/data-source/api/shipping.types'

/**
 * NZ Post fulfilment: labels, pickups and tracking.
 *
 * Every mutation invalidates both `shipping` and `orders`. A label decides
 * whether an order can be dispatched, a dispatch moves it between board lanes,
 * and a pickup takes parcels off the waiting list — the same reasoning as
 * `useOrderMutations`: refetching what is on screen beats a cache edit that has
 * to know every screen.
 */

/** A label still being made in the background. */
export function isLabelInProgress(shipment: ApiShipment): boolean {
  return shipment.status === 'PENDING' || shipment.status === 'SUBMITTED'
}

/** The label dispatch would use: labelled and not voided. */
export function isLiveLabel(shipment: ApiShipment): boolean {
  return shipment.status === 'LABELLED' && shipment.voidedAt === null
}

/** How often a screen asks again while a label is being made. */
const LABEL_POLL_MS = 3_000

export function useOrderShipments(orderId: string, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.orderShipments(orderId),
    queryFn: () => listOrderShipments(orderId),
    enabled: enabled && Boolean(orderId),
    staleTime: 5_000,
    // Poll only while the worker is still making a label; stop once it settles.
    refetchInterval: (current) =>
      current.state.data?.some(isLabelInProgress) ? LABEL_POLL_MS : false,
  })

  return {
    shipments: query.data ?? [],
    isLoading: query.isPending && enabled,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useOrderTracking(orderId: string, enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.orderTracking(orderId),
    queryFn: () => getOrderTracking(orderId),
    enabled: enabled && Boolean(orderId),
    staleTime: 60_000,
  })

  return {
    tracking: query.data ?? null,
    isLoading: query.isPending && enabled,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useShipmentQueue(params: ShipmentQueueParams) {
  const query = useQuery({
    queryKey: queryKeys.shipmentQueue(params),
    queryFn: () => listShipmentQueue(params),
    staleTime: 10_000,
  })

  return {
    page: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function usePickups(page = 1) {
  const query = useQuery({
    queryKey: queryKeys.pickups(page),
    queryFn: () => listPickups(page),
    staleTime: 10_000,
  })

  return {
    overview: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useShippingStatus(enabled = true) {
  const query = useQuery({
    queryKey: queryKeys.shippingStatus(),
    queryFn: () => getShippingStatus(false),
    enabled,
    staleTime: 30_000,
  })

  return {
    status: query.data ?? null,
    isLoading: query.isPending && enabled,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useShippingMutations() {
  const client = useQueryClient()

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['shipping'] })
    void client.invalidateQueries({ queryKey: ['orders'] })
  }

  const create = useMutation({
    mutationFn: (vars: { orderId: string; input: CreateShipmentInput }) =>
      createShipment(vars.orderId, vars.input),
    onSuccess: invalidate,
  })

  const cancel = useMutation({
    mutationFn: (vars: {
      orderId: string
      shipmentId: string
      reason: string
    }) => voidShipment(vars.orderId, vars.shipmentId, vars.reason),
    onSuccess: invalidate,
  })

  const retry = useMutation({
    mutationFn: (vars: { orderId: string; shipmentId: string }) =>
      retryShipment(vars.orderId, vars.shipmentId),
    onSuccess: invalidate,
  })

  const book = useMutation({
    mutationFn: (input: BookPickupInput) => bookPickup(input),
    onSuccess: invalidate,
  })

  const refresh = useMutation({
    mutationFn: (orderId: string) => refreshOrderTracking(orderId),
    onSuccess: invalidate,
  })

  return {
    createLabel: (orderId: string, input: CreateShipmentInput) =>
      create.mutateAsync({ orderId, input }),
    voidLabel: (orderId: string, shipmentId: string, reason: string) =>
      cancel.mutateAsync({ orderId, shipmentId, reason }),
    retryLabel: (orderId: string, shipmentId: string) =>
      retry.mutateAsync({ orderId, shipmentId }),
    bookPickup: (input: BookPickupInput) => book.mutateAsync(input),
    refreshTracking: (orderId: string) => refresh.mutateAsync(orderId),
    /**
     * Opens the label PDF in a new tab. The link is fetched on click because it
     * expires within minutes, and every download is audited server-side.
     */
    openLabel: async (orderId: string, shipmentId: string) => {
      // Opened before the request, while the click still counts as the user's:
      // a tab opened after an await is what popup blockers stop.
      const tab = window.open('', '_blank')
      if (tab) tab.opener = null
      try {
        const link = await getLabelLink(orderId, shipmentId)
        if (tab) tab.location.href = link.url
        else window.location.assign(link.url)
        return link
      } catch (error) {
        tab?.close()
        throw error
      }
    },
    isCreating: create.isPending,
    isVoiding: cancel.isPending,
    isRetrying: retry.isPending,
    isBooking: book.isPending,
    isRefreshing: refresh.isPending,
  }
}
