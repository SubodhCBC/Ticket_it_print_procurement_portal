// src/hooks/useApprovals.ts
'use client'

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  createApprovalRule,
  decideApprovalStep,
  getApprovalRules,
  getApprovals,
  getOrderApproval,
  removeApprovalRule,
  updateApprovalRule,
} from '@/services/approvals.service'
import type {
  ApprovalDecision,
  CreateApprovalRuleInput,
  ListApprovalsParams,
  UpdateApprovalRuleInput,
} from '@/services/data-source/api/approval.types'

/**
 * Approvals.
 *
 * The keys live here rather than in `QueryProvider` so this module stays
 * self-contained; everything sits under `['approvals']`, which is what a
 * decision invalidates.
 */
export const approvalKeys = {
  all: ['approvals'] as const,
  list: (params: ListApprovalsParams) => ['approvals', 'list', params] as const,
  order: (orderId: string) => ['approvals', 'order', orderId] as const,
  rules: (accountId: string) => ['approvals', 'rules', accountId] as const,
  allRules: ['approvals', 'rules'] as const,
}

/** A queue is worked by several people at once; keep it fresher than default. */
const QUEUE_STALE_TIME = 10_000

export function useApprovals(
  params: ListApprovalsParams,
  options?: { enabled?: boolean }
) {
  const query = useQuery({
    queryKey: approvalKeys.list(params),
    queryFn: () => getApprovals(params),
    enabled: options?.enabled ?? true,
    staleTime: QUEUE_STALE_TIME,
    // Paging and switching tabs keep the old rows on screen until the new ones
    // land, rather than flashing the loading state.
    placeholderData: keepPreviousData,
  })

  return {
    data: query.data ?? null,
    /** First load only; `isFetching` covers a page or filter change. */
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

/** One order's approval. `approval` is `null` when the order has none. */
export function useOrderApproval(
  orderId: string,
  options?: { enabled?: boolean }
) {
  const query = useQuery({
    queryKey: approvalKeys.order(orderId),
    queryFn: () => getOrderApproval(orderId),
    enabled: Boolean(orderId) && (options?.enabled ?? true),
    staleTime: QUEUE_STALE_TIME,
  })

  return {
    approval: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

/**
 * A decision on one step.
 *
 * One instance per form, so two open steps on the same screen do not share a
 * pending flag or an error.
 */
export function useApprovalDecision() {
  const client = useQueryClient()

  const mutation = useMutation({
    mutationFn: (vars: {
      stepId: string
      decision: ApprovalDecision
      comment?: string
    }) =>
      decideApprovalStep(vars.stepId, {
        decision: vars.decision,
        ...(vars.comment ? { comment: vars.comment } : {}),
      }),
    onSuccess: (updated) => {
      // The answer is the request as it now stands; show it before the refetch.
      client.setQueryData(approvalKeys.order(updated.orderId), updated)

      // The queue, and every approval view.
      void client.invalidateQueries({ queryKey: approvalKeys.all })
      // A decision that completes a round moves the order's status, which
      // changes the order detail (`['orders', 'detail', id]`), the pending
      // approvals list (`['orders', 'awaiting-approval', …]`) and every order
      // list — all of them under `['orders']`.
      void client.invalidateQueries({ queryKey: ['orders'] })
      // Spend and billing figures count orders by status.
      void client.invalidateQueries({ queryKey: ['reports'] })
    },
  })

  return {
    decide: (vars: {
      stepId: string
      decision: ApprovalDecision
      comment?: string
    }) => mutation.mutateAsync(vars),
    isPending: mutation.isPending,
    reset: mutation.reset,
  }
}

export function useApprovalRules(
  accountId: string,
  options?: { enabled?: boolean }
) {
  const query = useQuery({
    queryKey: approvalKeys.rules(accountId),
    queryFn: () => getApprovalRules(accountId || undefined),
    enabled: options?.enabled ?? true,
  })

  return {
    rules: query.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useApprovalRuleMutations() {
  const client = useQueryClient()

  const invalidate = () => {
    void client.invalidateQueries({ queryKey: approvalKeys.allRules })
  }

  const create = useMutation({
    mutationFn: (input: CreateApprovalRuleInput) => createApprovalRule(input),
    onSuccess: invalidate,
  })

  const update = useMutation({
    mutationFn: (vars: { ruleId: string; input: UpdateApprovalRuleInput }) =>
      updateApprovalRule(vars.ruleId, vars.input),
    onSuccess: invalidate,
  })

  const remove = useMutation({
    mutationFn: (ruleId: string) => removeApprovalRule(ruleId),
    onSuccess: invalidate,
  })

  return {
    isSaving: create.isPending || update.isPending,
    isRemoving: remove.isPending,
    createRule: (input: CreateApprovalRuleInput) => create.mutateAsync(input),
    updateRule: (ruleId: string, input: UpdateApprovalRuleInput) =>
      update.mutateAsync({ ruleId, input }),
    removeRule: (ruleId: string) => remove.mutateAsync(ruleId),
  }
}
