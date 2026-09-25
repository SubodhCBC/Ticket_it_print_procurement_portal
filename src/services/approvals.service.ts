// src/services/approvals.service.ts
import { getDataSource } from '@/services/data-source'
import type {
  ApprovalRequestView,
  ApprovalRuleView,
  CreateApprovalRuleInput,
  DecideApprovalInput,
  ListApprovalsParams,
  UpdateApprovalRuleInput,
} from '@/services/data-source/api/approval.types'
import type { PaginatedResult } from '@/types'

/**
 * Approvals: the queue, one order's approval, decisions, and the rules that
 * decide which orders need one.
 *
 * Thin over the API on purpose. Who may decide a step — not the requester, and
 * only the named person or role — is enforced by the server, and the screens
 * surface its refusal verbatim rather than guessing at it here.
 */

export async function getApprovals(
  params?: ListApprovalsParams
): Promise<PaginatedResult<ApprovalRequestView>> {
  return getDataSource().approvals.list(params)
}

/** `null` when the order has no approval request. */
export async function getOrderApproval(
  orderId: string
): Promise<ApprovalRequestView | null> {
  return getDataSource().approvals.getByOrder(orderId)
}

export async function decideApprovalStep(
  stepId: string,
  input: DecideApprovalInput
): Promise<ApprovalRequestView> {
  return getDataSource().approvals.decide(stepId, input)
}

export async function getApprovalRules(
  accountId?: string
): Promise<ApprovalRuleView[]> {
  return getDataSource().approvals.listRules(accountId)
}

export async function createApprovalRule(
  input: CreateApprovalRuleInput
): Promise<ApprovalRuleView> {
  return getDataSource().approvals.createRule(input)
}

export async function updateApprovalRule(
  ruleId: string,
  input: UpdateApprovalRuleInput
): Promise<ApprovalRuleView> {
  return getDataSource().approvals.updateRule(ruleId, input)
}

export async function removeApprovalRule(ruleId: string): Promise<void> {
  return getDataSource().approvals.removeRule(ruleId)
}
