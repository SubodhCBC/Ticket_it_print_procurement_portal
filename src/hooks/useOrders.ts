// src/hooks/useOrders.ts
'use client'

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  getOrders,
  getOrderById,
  createOrder as createOrderService,
  updateOrderStatus as updateOrderStatusService,
  updateOrderDetails as updateOrderDetailsService,
  approveOrder as approveOrderService,
  rejectOrder as rejectOrderService,
  requestChanges as requestChangesService,
  payOrder as payOrderService,
  getPendingApprovals,
  getFulfilmentQueue,
} from '@/services/orders.service'
import { queryKeys } from '@/lib/query/queryKeys'
import type { StatusChangeExtra } from '@/services/data-source/api/api-orders.adapter'
import type { Order, OrderStatus } from '@/types'

/**
 * Orders.
 *
 * Every mutation below invalidates the whole `orders` key rather than patching
 * a cached row. A status change moves an order between queues, alters the
 * approvals list and changes what billing will pick up — a surgical cache edit
 * would have to know all of that, and would be wrong the first time somebody
 * added a screen. Refetching what is on screen is cheap; a stale fulfilment
 * board is not.
 */
export function useOrders(params?: Parameters<typeof getOrders>[0]) {
  const query = useQuery({
    queryKey: queryKeys.orders(params),
    queryFn: () => getOrders(params),
    // A paged list keeps the rows it has while the next page loads, rather
    // than flashing back to its loading state.
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

export function useOrder(id: string) {
  const query = useQuery({
    queryKey: queryKeys.order(id),
    queryFn: () => getOrderById(id),
    enabled: Boolean(id),
  })

  return {
    order: query.data ?? null,
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useFulfilmentQueue() {
  const query = useQuery({
    queryKey: queryKeys.fulfilmentQueue(),
    queryFn: getFulfilmentQueue,
    // A warehouse board is worked by several people at once, so it goes stale
    // faster than the default: someone else moving an order should show up
    // without a manual refresh.
    staleTime: 10_000,
  })

  return {
    queue: query.data ?? {
      received: [],
      processing: [],
      dispatched: [],
      delivered: [],
    },
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function usePendingApprovals(accountId?: string) {
  const query = useQuery({
    queryKey: queryKeys.pendingApprovals(accountId),
    queryFn: () => getPendingApprovals(accountId),
    staleTime: 10_000,
  })

  return {
    orders: query.data ?? ([] as Order[]),
    isLoading: query.isPending,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useOrderMutations() {
  const client = useQueryClient()

  /** Orders, and everything downstream of them: reports and billing totals. */
  const invalidate = () => {
    void client.invalidateQueries({ queryKey: ['orders'] })
    void client.invalidateQueries({ queryKey: ['reports'] })
  }

  const createOrder = useMutation({
    mutationFn: (input: Partial<Order>) => createOrderService(input),
    onSuccess: invalidate,
  })

  const updateStatus = useMutation({
    mutationFn: (vars: {
      id: string
      status: OrderStatus
      extra?: StatusChangeExtra
    }) => updateOrderStatusService(vars.id, vars.status, vars.extra),
    onSuccess: invalidate,
  })

  const pay = useMutation({
    mutationFn: (vars: {
      id: string
      paymentMethod?: Order['paymentMethod']
      paymentRef?: string
    }) => payOrderService(vars.id, vars.paymentMethod, vars.paymentRef),
    onSuccess: invalidate,
  })

  const isPending =
    createOrder.isPending || updateStatus.isPending || pay.isPending

  return {
    isPending,
    createOrder: (input: Partial<Order>) => createOrder.mutateAsync(input),
    updateOrderStatus: (
      id: string,
      status: OrderStatus,
      extra?: StatusChangeExtra
    ) => updateStatus.mutateAsync({ id, status, extra }),

    /**
     * A placed order is a snapshot an invoice is drawn from, so the API has no
     * edit endpoint. Kept so the screens referencing it still compile; it
     * throws with an explanation of what to do instead.
     */
    updateOrderDetails: () => updateOrderDetailsService(),

    // The approver's name is accepted and ignored on all three: who decided is
    // the bearer token's answer, not the browser's.
    approveOrder: (id: string, _approverName?: string, notes?: string) =>
      approveOrderService(id, _approverName, notes).then((order) => {
        invalidate()
        return order
      }),
    rejectOrder: (id: string, _approverName: string, reason: string) =>
      rejectOrderService(id, _approverName, reason).then((order) => {
        invalidate()
        return order
      }),
    requestChanges: (id: string, _approverName: string, notes: string) =>
      requestChangesService(id, _approverName, notes).then((order) => {
        invalidate()
        return order
      }),
    payOrder: (
      id: string,
      paymentMethod?: Order['paymentMethod'],
      paymentRef?: string
    ) => pay.mutateAsync({ id, paymentMethod, paymentRef }),
  }
}
