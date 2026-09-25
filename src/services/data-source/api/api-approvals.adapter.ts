import { apiClient } from '@/services/api.service'
import type { PaginatedResult } from '@/types'
import type { ApiOffsetPage } from './catalog.types'
import type {
  ApprovalRequestView,
  ApprovalRuleView,
  CreateApprovalRuleInput,
  DecideApprovalInput,
  ListApprovalsParams,
  UpdateApprovalRuleInput,
} from './approval.types'

/**
 * Approvals, served by `/approvals`.
 *
 * The payloads are passed through unmapped: the API's views were written for
 * the approvals hub and already carry what a screen prints, so a UI-side copy
 * would only be a second place for a field to go missing.
 *
 * There is no mock counterpart. Every other domain has left its fixtures, and
 * this one never had any.
 */

const APPROVALS = '/approvals'
const RULES = `${APPROVALS}/rules`

/** The API caps a page at 100 rows and refuses anything larger. */
const MAX_PAGE_SIZE = 100

export async function list(
  params?: ListApprovalsParams
): Promise<PaginatedResult<ApprovalRequestView>> {
  const query: Record<string, unknown> = {
    page: params?.page ?? 1,
    pageSize: Math.min(params?.pageSize ?? 25, MAX_PAGE_SIZE),
  }
  if (params?.status) query.status = params.status
  if (params?.accountId) query.accountId = params.accountId
  if (params?.mine) query.mine = true

  const page: ApiOffsetPage<ApprovalRequestView> = await apiClient.get(
    APPROVALS,
    { params: query }
  )

  return {
    items: page.items,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
  }
}

/**
 * The approval an order is waiting on, or `null` when it has none.
 *
 * Most orders never need approving, so a 404 here is the common answer rather
 * than a fault — and it is also what an order from another account returns.
 */
export async function getByOrder(
  orderId: string
): Promise<ApprovalRequestView | null> {
  try {
    const request: ApprovalRequestView = await apiClient.get(
      `${APPROVALS}/orders/${encodeURIComponent(orderId)}`
    )
    return request
  } catch (error) {
    if (hasStatus(error, 404)) return null
    throw error
  }
}

/**
 * Records one decision on one step.
 *
 * A blank comment is left out rather than sent empty: the API reads an empty
 * string as a comment that says nothing, and refuses it on a rejection.
 */
export async function decide(
  stepId: string,
  input: DecideApprovalInput
): Promise<ApprovalRequestView> {
  const comment = input.comment?.trim()

  const decided: ApprovalRequestView = await apiClient.post(
    `${APPROVALS}/steps/${encodeURIComponent(stepId)}`,
    {
      decision: input.decision,
      ...(comment ? { comment } : {}),
    }
  )
  return decided
}

export async function listRules(
  accountId?: string
): Promise<ApprovalRuleView[]> {
  const rules: ApprovalRuleView[] = await apiClient.get(RULES, {
    params: accountId ? { accountId } : {},
  })
  return rules
}

export async function createRule(
  input: CreateApprovalRuleInput
): Promise<ApprovalRuleView> {
  const { accountId, ...fields } = input

  const created: ApprovalRuleView = await apiClient.post(RULES, {
    ...(accountId ? { accountId } : {}),
    ...fields,
  })
  return created
}

export async function updateRule(
  ruleId: string,
  input: UpdateApprovalRuleInput
): Promise<ApprovalRuleView> {
  const updated: ApprovalRuleView = await apiClient.patch(
    `${RULES}/${encodeURIComponent(ruleId)}`,
    input
  )
  return updated
}

/**
 * Soft. Requests already in flight keep their steps, so retiring a rule never
 * strands an order halfway through it.
 */
export async function removeRule(ruleId: string): Promise<void> {
  await apiClient.delete(`${RULES}/${encodeURIComponent(ruleId)}`)
}

function hasStatus(error: unknown, status: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === status
  )
}
